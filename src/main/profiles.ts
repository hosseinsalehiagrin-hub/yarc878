// One Electron session per profile: separate cookies, storage, cache, extensions and history.
import { app, session, type Session, type WebContents } from 'electron'
import { join } from 'node:path'
import { History } from './history'
import { PermissionQueue, type MediaType } from './permission-queue'
import { CHROME_UA_HOSTS, userAgentFor } from './useragent'
import type { ID } from '../shared/types'

export interface ProfileRuntime {
  id: ID
  session: Session
  history: History
}

/** Permissions granted without asking. Those in PROMPT ask once per site per run (see PermissionQueue). */
const AUTO_GRANT = new Set(['fullscreen', 'clipboard-sanitized-write', 'pointerLock', 'window-management', 'speaker-selection'])
const PROMPT = new Set(['media', 'geolocation', 'notifications', 'midi', 'midiSysex', 'clipboard-read', 'display-capture', 'idle-detection', 'hid', 'serial', 'usb'])

/**
 * Prompted permissions that report "granted" until the user blocks them. Electron's check handler
 * can only say granted or denied, not "ask". Sites like Google Meet read "denied" as blocked and
 * never request access. Each request still goes through the prompt.
 */
const ASK_ON_REQUEST = new Set(['media'])

/** "https://meet.google.com", whether Electron hands over an origin ("…/") or a URL. */
function originOf(url: string): string {
  try {
    return new URL(url).origin
  } catch {
    return ''
  }
}

export class Profiles {
  private runtimes = new Map<ID, ProfileRuntime>()
  /** Requests waiting for the user, and the answers given this run. The browser draws the prompt. */
  readonly permissionQueue: PermissionQueue
  private watched = new WeakSet<WebContents>()

  /** Incognito profiles keep nothing on disk: an in-memory session and history. */
  constructor(
    private onCreated: (rt: ProfileRuntime) => void,
    private incognito = false,
    onPermissionsChanged: () => void = () => {}
  ) {
    this.permissionQueue = new PermissionQueue(onPermissionsChanged)
  }

  static partition(id: ID): string {
    return `persist:profile-${id}`
  }

  dir(id: ID): string {
    return join(app.getPath('userData'), 'Profiles', id)
  }

  get(id: ID): ProfileRuntime {
    let rt = this.runtimes.get(id)
    if (rt) return rt
    // A partition without "persist:" stays in memory.
    const ses = session.fromPartition(this.incognito ? `incognito-${id}` : Profiles.partition(id))
    ses.setUserAgent(app.userAgentFallback)
    ses.webRequest.onBeforeSendHeaders({ urls: CHROME_UA_HOSTS.map((host) => `*://${host}/*`) }, (details, callback) => {
      callback({ requestHeaders: { ...details.requestHeaders, 'User-Agent': userAgentFor(details.url, app.userAgentFallback) } })
    })
    ses.setSpellCheckerLanguages(app.getPreferredSystemLanguages().slice(0, 3).filter((l) => ses.availableSpellCheckerLanguages.includes(l)))
    this.permissions(ses)
    rt = { id, session: ses, history: new History(this.incognito ? undefined : this.dir(id)) }
    this.runtimes.set(id, rt)
    this.onCreated(rt)
    return rt
  }

  all(): ProfileRuntime[] {
    return [...this.runtimes.values()]
  }

  async remove(id: ID): Promise<void> {
    const rt = this.runtimes.get(id)
    if (!rt) return
    rt.history.close()
    await rt.session.clearData()
    this.runtimes.delete(id)
  }

  closeAll(): void {
    for (const rt of this.runtimes.values()) rt.history.close()
  }

  private permissions(ses: Session): void {
    ses.setPermissionCheckHandler((_wc, permission, origin, details) => {
      if (AUTO_GRANT.has(permission)) return true
      const type = (details as { mediaType?: string }).mediaType
      const media = type === 'video' || type === 'audio' ? [type as MediaType] : undefined
      return this.permissionQueue.decided(originOf(origin), permission, media) ?? ASK_ON_REQUEST.has(permission)
    })
    ses.setPermissionRequestHandler((wc, permission, callback, details) => {
      if (AUTO_GRANT.has(permission)) return callback(true)
      if (!PROMPT.has(permission) || !wc) return callback(false)
      const requested = (details as { mediaTypes?: string[] }).mediaTypes ?? []
      const mediaTypes = requested.filter((t): t is MediaType => t === 'video' || t === 'audio')
      this.watch(wc)
      this.permissionQueue.request(
        { wcId: wc.id, origin: originOf(details.requestingUrl), permission, mediaTypes: permission === 'media' ? mediaTypes : undefined },
        callback
      )
    })
  }

  /** A page's open questions end when it goes to another page or closes. */
  private watch(wc: WebContents): void {
    if (this.watched.has(wc)) return
    this.watched.add(wc)
    const id = wc.id
    wc.on('did-start-navigation', (details) => {
      if (details.isMainFrame && !details.isSameDocument) this.permissionQueue.cancel(id)
    })
    wc.once('destroyed', () => this.permissionQueue.cancel(id))
  }
}
