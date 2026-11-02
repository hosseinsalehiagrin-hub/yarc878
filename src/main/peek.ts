// Peek: a page floating over the current tab, like Arc's. Links from pinned tabs and favorites to
// other sites open here, so the pinned page stays put. Close it to go back, or expand it into a tab.
import type { BrowserWindowConstructorOptions, ContextMenuParams, Event, Input, Result, WebContents } from 'electron'
import { getDomain } from 'tldts-experimental'
import { matches } from '../shared/keymap'
import type { Browser } from './browser'
import { buildContextMenu } from './menus'
import type { ProfileRuntime } from './profiles'
import { LiveTab, type OpenDisposition, type TabHost } from './tab'

export class Peek implements TabHost {
  readonly tab: LiveTab
  private done = false

  constructor(
    private browser: Browser,
    profile: ProfileRuntime,
    url: string
  ) {
    this.tab = new LiveTab(this, 'peek', profile.id, profile.session, url)
    browser.extensions.addTab(this.tab, browser.window.win)
  }

  /** Hands the page to the browser, which gives it a place in the sidebar. */
  release(): LiveTab {
    this.done = true
    this.tab.host = this.browser
    return this.tab
  }

  destroy(): void {
    this.done = true
    this.tab.destroy()
  }

  // TabHost
  onTabChanged(tab: LiveTab, change: { url?: string; navigated?: boolean }): void {
    this.browser.onPeekChanged(tab, change)
  }

  onTabInput(_tab: LiveTab, e: Event, input: Input): void {
    if (input.type === 'keyDown' && matches(input, process.platform === 'darwin' ? 'Cmd+O' : 'Ctrl+O')) {
      e.preventDefault()
      return this.browser.expandPeek()
    }
    this.browser.handleInput(e, input)
  }

  onTabDestroyed(): void {
    // The page closed itself.
    if (!this.done) this.browser.closePeek()
  }

  onTabFocus(): void {}

  onTabFullscreen(tab: LiveTab, on: boolean): void {
    // A full-screen video gets a real tab, which owns the full-screen layout.
    if (!on) return
    this.browser.expandPeek()
    this.browser.onTabFullscreen(tab, on)
  }

  onFoundInPage(tab: LiveTab, result: Result): void {
    this.browser.onFoundInPage(tab, result)
  }

  adoptOpenedPage(opener: LiveTab, options: BrowserWindowConstructorOptions, disposition: OpenDisposition, url: string): WebContents {
    return this.browser.adoptOpenedPage(opener, options, disposition, url)
  }

  showContextMenu(tab: LiveTab, params: ContextMenuParams): void {
    buildContextMenu(this.browser, tab, params).popup({ window: this.browser.window.win })
  }
}

/** Same registrable domain (mail.google.com and calendar.google.com are one site). */
export function sameSite(a: string, b: string): boolean {
  const site = (url: string) => {
    try {
      return getDomain(url) ?? new URL(url).hostname
    } catch {
      return url
    }
  }
  return site(a) === site(b)
}
