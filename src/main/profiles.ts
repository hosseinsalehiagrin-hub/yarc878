// One Electron session per profile: separate cookies, storage, cache, extensions and history.
import { app, BrowserWindow, dialog, session, type Session } from 'electron'
import { join } from 'node:path'
import { History } from './history'
import { CHROME_UA_HOSTS, userAgentFor } from './useragent'
import type { ID } from '../shared/types'

export interface ProfileRuntime {
  id: ID
  session: Session
  history: History
}

/** Permissions granted without asking. Everything else prompts once per origin per run. */
const AUTO_GRANT = new Set(['fullscreen', 'clipboard-sanitized-write', 'pointerLock', 'window-management', 'speaker-selection'])
const PROMPT = new Set(['media', 'geolocation', 'notifications', 'midi', 'midiSysex', 'clipboard-read', 'display-capture', 'idle-detection', 'hid', 'serial', 'usb'])

/**
 * Prompted permissions that report "granted" until the user blocks them. Electron's check handler
 * can only say granted or denied, not "ask". Sites like Google Meet read "denied" as blocked and
 * never request access. Each request still goes through the prompt below.
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
  private decisions = new Map<string, boolean>()

  constructor(private onCreated: (rt: ProfileRuntime) => void) {}

  static partition(id: ID): string {
    return `persist:profile-${id}`
  }

  dir(id: ID): string {
    return join(app.getPath('userData'), 'Profiles', id)
  }

  get(id: ID): ProfileRuntime {
    let rt = this.runtimes.get(id)
    if (rt) return rt
    const ses = session.fromPartition(Profiles.partition(id))
    ses.setUserAgent(app.userAgentFallback)
    ses.webRequest.onBeforeSendHeaders({ urls: CHROME_UA_HOSTS.map((host) => `*://${host}/*`) }, (details, callback) => {
      callback({ requestHeaders: { ...details.requestHeaders, 'User-Agent': userAgentFor(details.url, app.userAgentFallback) } })
    })
    ses.setSpellCheckerLanguages(app.getPreferredSystemLanguages().slice(0, 3).filter((l) => ses.availableSpellCheckerLanguages.includes(l)))
    this.permissions(ses)
    rt = { id, session: ses, history: new History(this.dir(id)) }
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
    ses.setPermissionCheckHandler((_wc, permission, origin) => {
      if (AUTO_GRANT.has(permission)) return true
      return this.decisions.get(`${originOf(origin)}|${permission}`) ?? ASK_ON_REQUEST.has(permission)
    })
    ses.setPermissionRequestHandler((wc, permission, callback, details) => {
      if (AUTO_GRANT.has(permission)) return callback(true)
      if (!PROMPT.has(permission)) return callback(false)
      const origin = originOf(details.requestingUrl)
      const key = `${origin}|${permission}`
      const known = this.decisions.get(key)
      if (known !== undefined) return callback(known)
      const what =
        permission === 'media'
          ? `use your ${(details as { mediaTypes?: string[] }).mediaTypes?.join(' and ') || 'camera/microphone'}`
          : permission === 'notifications'
            ? 'show notifications'
            : permission === 'geolocation'
              ? 'know your location'
              : `use ${permission}`
      const win = (wc && BrowserWindow.fromWebContents(wc)) || BrowserWindow.getFocusedWindow() || undefined
      const opts = { type: 'question' as const, buttons: ['Allow', 'Block'], defaultId: 0, cancelId: 1, message: `${origin || 'This site'} wants to ${what}.` }
      void (win ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts)).then(({ response }) => {
        const allowed = response === 0
        this.decisions.set(key, allowed)
        callback(allowed)
      })
    })
  }
}
