// Built-in ad & tracker blocking (Ghostery's engine with uBlock Origin/EasyList-compatible lists).
// Electron has no declarativeNetRequest, so MV3 blockers like uBlock Origin Lite can't block;
// this does it in the main process instead, for every profile.
//
// We don't use the library's enableBlockingInSession(): it registers global IPC handlers per
// session (a second profile throws) and disabling one profile would unregister them for all.
import { ElectronBlocker } from '@ghostery/adblocker-electron'
import { ipcMain, type IpcMainInvokeEvent, type OnBeforeRequestListenerDetails, type OnHeadersReceivedListenerDetails, type Session, type WebContents } from 'electron'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'

const PRELOAD = createRequire(__filename).resolve('@ghostery/adblocker-electron-preload')
const MAX_AGE = 24 * 3600_000

export class AdBlock {
  private engine: ElectronBlocker | undefined
  private sessions = new WeakSet<Session>()
  private blocked = new Map<number, number>()
  enabled = true
  allowlist = new Set<string>()

  constructor(
    private cacheFile: string,
    private onChange: () => void
  ) {
    ipcMain.handle('@ghostery/adblocker/inject-cosmetic-filters', (e: IpcMainInvokeEvent, url: string, msg?: unknown) => {
      if (!this.engine || !this.activeFor(e.sender, url)) return
      return this.engine.onInjectCosmeticFilters(e, url, msg as never)
    })
    ipcMain.handle('@ghostery/adblocker/is-mutation-observer-enabled', (e: IpcMainInvokeEvent) =>
      this.engine ? this.engine.onIsMutationObserverEnabled(e) : false
    )
  }

  /** Loads the filter engine from cache (refreshed daily). Pages load unfiltered until it's ready. */
  async load(): Promise<void> {
    let cached: Buffer | undefined
    let fresh = false
    try {
      const info = await stat(this.cacheFile)
      cached = await readFile(this.cacheFile)
      fresh = Date.now() - info.mtimeMs < MAX_AGE
    } catch {}
    if (cached && fresh) return this.use(ElectronBlocker.deserialize(new Uint8Array(cached)))
    try {
      const engine = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch)
      this.use(engine)
      await mkdir(dirname(this.cacheFile), { recursive: true })
      await writeFile(this.cacheFile, engine.serialize())
    } catch (err) {
      console.warn('[adblock] could not download filter lists', err)
      if (cached) this.use(ElectronBlocker.deserialize(new Uint8Array(cached)))
    }
  }

  private use(engine: ElectronBlocker): void {
    this.engine = engine
    // Redirects swap an ad script for a harmless stub; they count as blocked too.
    const count = (request: { tabId?: number | string }) => {
      const id = request.tabId
      if (typeof id !== 'number') return
      this.blocked.set(id, (this.blocked.get(id) ?? 0) + 1)
      this.onChange()
    }
    engine.on('request-blocked', count)
    engine.on('request-redirected', count)
  }

  attach(session: Session): void {
    if (this.sessions.has(session)) return
    this.sessions.add(session)
    session.registerPreloadScript({ type: 'frame', filePath: PRELOAD })
    session.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
      if (!this.engine || !this.activeForRequest(details)) return callback({})
      this.engine.onBeforeRequest(details, callback)
    })
    session.webRequest.onHeadersReceived({ urls: ['<all_urls>'] }, (details, callback) => {
      if (!this.engine || !this.activeForRequest(details)) return callback({})
      this.engine.onHeadersReceived(details, callback)
    })
  }

  /** Number of requests blocked on the page currently shown in a tab. */
  count(wc: WebContents): number {
    return this.blocked.get(wc.id) ?? 0
  }

  /** Call on main-frame navigation so the counter is per page. */
  resetCount(wc: WebContents): void {
    if (this.blocked.delete(wc.id)) this.onChange()
  }

  isAllowed(url: string): boolean {
    const host = hostOf(url)
    return !!host && this.allowlist.has(host)
  }

  private activeFor(wc: WebContents | null | undefined, fallbackUrl?: string): boolean {
    if (!this.enabled) return false
    const page = wc && !wc.isDestroyed() ? wc.getURL() : ''
    return !this.isAllowed(page || fallbackUrl || '')
  }

  private activeForRequest(details: OnBeforeRequestListenerDetails | OnHeadersReceivedListenerDetails): boolean {
    if (!this.enabled) return false
    // For the page itself use the URL being loaded; for subresources, the page that asked.
    if (details.resourceType === 'mainFrame') return !this.isAllowed(details.url)
    return this.activeFor(details.webContents, details.referrer)
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}
