// A live web page attached to a sidebar item (favorite, pinned or Today tab).
import {
  WebContentsView,
  shell,
  type BrowserWindowConstructorOptions,
  type ContextMenuParams,
  type Event,
  type Input,
  type Result,
  type Session,
  type WebContents
} from 'electron'
import type { ID, LiveInfo } from '../shared/types'

export type OpenDisposition = 'foreground-tab' | 'background-tab' | 'new-window' | 'other'

export interface TabHost {
  onTabChanged(tab: LiveTab, change: { url?: string; title?: string; favicon?: string; navigated?: boolean }): void
  onTabInput(tab: LiveTab, event: Event, input: Input): void
  onTabDestroyed(tab: LiveTab): void
  onTabFocus(tab: LiveTab): void
  onTabFullscreen(tab: LiveTab, on: boolean): void
  onFoundInPage(tab: LiveTab, result: Result): void
  adoptOpenedPage(opener: LiveTab, options: BrowserWindowConstructorOptions, disposition: OpenDisposition, url: string): WebContents
  showContextMenu(tab: LiveTab, params: ContextMenuParams): void
}

const WEB_SCHEMES = /^(https?|file|about|data|blob|chrome-extension|view-source|devtools|chrome):/i

export function createTabView(session: Session): WebContentsView {
  const view = new WebContentsView({
    webPreferences: { session, sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: true, scrollBounce: true }
  })
  view.setBackgroundColor('#ffffff')
  view.setBorderRadius(8)
  return view
}

const IGNORE_APP_REGIONS = '*, *::before, *::after { -webkit-app-region: no-drag !important; app-region: no-drag !important; }'

export class LiveTab {
  readonly view: WebContentsView
  /** Kept separately: a view drops its webContents reference once the page is destroyed. */
  readonly wc: WebContents
  fullscreen = false
  crashed = false

  constructor(
    public host: TabHost,
    public itemId: ID,
    readonly profileId: ID,
    readonly session: Session,
    url?: string,
    adopt?: WebContentsView
  ) {
    this.view = adopt ?? createTabView(session)
    this.wc = this.view.webContents
    this.view.setBorderRadius(8)
    this.wire()
    if (url) void this.load(url)
  }

  get destroyed(): boolean {
    return this.wc.isDestroyed()
  }

  async load(url: string): Promise<void> {
    try {
      await this.wc.loadURL(url)
    } catch (err) {
      // ERR_ABORTED (-3) happens on redirects and user navigation; the page handles the rest.
      const code = (err as { errno?: number }).errno
      if (code !== -3) console.warn('[tab] load failed', url, (err as Error).message)
    }
  }

  info(): LiveInfo {
    const wc = this.wc
    return {
      wcId: wc.id,
      url: wc.getURL(),
      title: wc.getTitle(),
      favicon: this.favicon,
      loading: wc.isLoading(),
      audible: wc.isCurrentlyAudible(),
      muted: wc.isAudioMuted(),
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
      zoom: wc.getZoomLevel(),
      blocked: 0,
      shielded: false
    }
  }

  favicon?: string

  destroy(): void {
    if (!this.wc.isDestroyed()) this.wc.close()
  }

  private wire(): void {
    const wc = this.wc
    // Websites can mark areas as window-drag regions (`-webkit-app-region`, meant for their own
    // desktop apps, e.g. Linear covers its whole page). Electron would apply them to our window,
    // above the overlay, swallowing clicks; browsers ignore them, so cancel them as the user.
    wc.on('dom-ready', () => void wc.insertCSS(IGNORE_APP_REGIONS, { cssOrigin: 'user' }).catch(() => {}))
    wc.on('page-title-updated', (_e, title) => this.host.onTabChanged(this, { title }))
    wc.on('page-favicon-updated', (_e, icons) => {
      this.favicon = icons[0]
      this.host.onTabChanged(this, { favicon: icons[0] })
    })
    wc.on('did-start-loading', () => this.host.onTabChanged(this, {}))
    wc.on('did-stop-loading', () => this.host.onTabChanged(this, {}))
    wc.on('did-navigate', (_e, url) => this.host.onTabChanged(this, { url, navigated: true }))
    wc.on('did-navigate-in-page', (_e, url, isMainFrame) => {
      if (isMainFrame) this.host.onTabChanged(this, { url })
    })
    wc.on('audio-state-changed', () => this.host.onTabChanged(this, {}))
    wc.on('before-input-event', (e, input) => this.host.onTabInput(this, e, input))
    wc.on('focus', () => this.host.onTabFocus(this))
    wc.on('context-menu', (_e, params) => this.host.showContextMenu(this, params))
    wc.on('found-in-page', (_e, result) => this.host.onFoundInPage(this, result))
    wc.on('enter-html-full-screen', () => {
      this.fullscreen = true
      this.host.onTabFullscreen(this, true)
    })
    wc.on('leave-html-full-screen', () => {
      this.fullscreen = false
      this.host.onTabFullscreen(this, false)
    })
    // Pages can close themselves (window.close()) — drop them like a closed tab.
    wc.once('destroyed', () => this.host.onTabDestroyed(this))
    wc.on('render-process-gone', (_e, details) => {
      if (details.reason === 'clean-exit') return
      console.warn('[tab] renderer gone', details.reason)
      this.crashed = true
      this.host.onTabChanged(this, {})
    })
    wc.on('will-navigate', (e, url) => {
      if (!WEB_SCHEMES.test(url)) {
        e.preventDefault()
        void shell.openExternal(url)
      }
    })
    wc.setWindowOpenHandler(({ url, disposition, features }) => {
      if (!WEB_SCHEMES.test(url)) {
        void shell.openExternal(url)
        return { action: 'deny' }
      }
      // Real popups (OAuth/SSO windows opened with size features) stay popups so window.opener works.
      if (disposition === 'new-window' && features) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            autoHideMenuBar: true,
            width: 520,
            height: 680,
            webPreferences: { session: this.session, sandbox: true, contextIsolation: true }
          }
        }
      }
      return {
        action: 'allow',
        createWindow: (options) => this.host.adoptOpenedPage(this, options, disposition as OpenDisposition, url)
      }
    })
  }
}
