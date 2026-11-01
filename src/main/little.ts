// Little Arc: a small, minimal window for quick links (and links opened from other apps).
import {
  BrowserWindow,
  clipboard,
  screen,
  type BrowserWindowConstructorOptions,
  type ContextMenuParams,
  type Event,
  type Input,
  type WebContents
} from 'electron'
import { IPC, type LittleOp, type LittleState } from '../shared/ipc'
import { matches } from '../shared/keymap'
import type { Browser } from './browser'
import { buildContextMenu } from './menus'
import type { ProfileRuntime } from './profiles'
import { LiveTab, type OpenDisposition, type TabHost } from './tab'
import { loadRenderer, uiWebPreferences } from './window'

const TOOLBAR = 40
const PAD = 6
const isMac = process.platform === 'darwin'

export class LittleWindow implements TabHost {
  readonly win: BrowserWindow
  private tab: LiveTab | undefined
  private released = false

  constructor(
    private browser: Browser,
    readonly profile: ProfileRuntime,
    url = 'https://www.google.com/'
  ) {
    const cursor = screen.getCursorScreenPoint()
    const area = screen.getDisplayNearestPoint(cursor).workArea
    const width = Math.min(900, area.width - 40)
    const height = Math.min(680, area.height - 40)
    this.win = new BrowserWindow({
      width,
      height,
      x: Math.round(area.x + (area.width - width) / 2),
      y: Math.round(area.y + (area.height - height) / 3),
      minWidth: 360,
      minHeight: 240,
      titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
      trafficLightPosition: { x: 12, y: 13 },
      backgroundColor: browser.store.activeSpace.color,
      show: false,
      webPreferences: uiWebPreferences()
    })
    this.win.setMenuBarVisibility(false)
    loadRenderer(this.win.webContents, 'little')
    this.win.webContents.on('before-input-event', (e, input) => this.onTabInput(undefined, e, input))
    this.win.webContents.once('did-finish-load', () => this.push())
    this.win.once('ready-to-show', () => this.win.show())

    this.tab = new LiveTab(this, 'little', profile.id, profile.session, url)
    this.browser.extensions.addTab(this.tab, this.win)
    this.win.contentView.addChildView(this.tab.view)
    this.layout()
    this.win.on('resize', () => this.layout())
    this.win.on('closed', () => {
      if (!this.released) this.tab?.destroy()
    })
    this.tab.wc.focus()
  }

  private layout(): void {
    if (!this.tab || this.released) return
    const [w, h] = this.win.getContentSize()
    this.tab.view.setBounds({ x: PAD, y: TOOLBAR, width: w - 2 * PAD, height: h - TOOLBAR - PAD })
  }

  private push(): void {
    if (!this.tab || this.tab.destroyed || this.win.isDestroyed()) return
    const info = this.tab.info()
    const state: LittleState = { ...info, color: this.browser.store.activeSpace.color }
    this.win.webContents.send(IPC.little, state)
  }

  /** Hands the page over to the main window and closes this one. */
  release(): LiveTab {
    const tab = this.tab!
    this.released = true
    this.win.contentView.removeChildView(tab.view)
    this.tab = undefined
    this.win.close()
    return tab
  }

  op(op: LittleOp): void {
    const wc = this.tab?.wc
    switch (op) {
      case 'openInMain':
        return this.browser.adoptLittle(this)
      case 'close':
        return this.win.close()
      case 'copyUrl':
        if (wc) clipboard.writeText(wc.getURL())
        return
      case 'back':
        return void (wc?.navigationHistory.canGoBack() && wc.navigationHistory.goBack())
      case 'forward':
        return void (wc?.navigationHistory.canGoForward() && wc.navigationHistory.goForward())
      case 'reload':
        return wc?.reload()
    }
  }

  // TabHost
  onTabChanged(): void {
    this.push()
  }

  onTabInput(_tab: LiveTab | undefined, e: Event, input: Input): void {
    if (input.type !== 'keyDown') return
    const mod = isMac ? 'Cmd' : 'Ctrl'
    const run = (op: LittleOp) => {
      e.preventDefault()
      this.op(op)
    }
    if (matches(input, `${mod}+W`)) return run('close')
    if (matches(input, `${mod}+O`)) return run('openInMain')
    if (matches(input, `${mod}+Shift+C`)) return run('copyUrl')
    if (matches(input, `${mod}+R`)) return run('reload')
    if (matches(input, isMac ? 'Cmd+BracketLeft' : 'Alt+Left')) return run('back')
    if (matches(input, isMac ? 'Cmd+BracketRight' : 'Alt+Right')) return run('forward')
  }

  onTabFocus(): void {}

  onTabDestroyed(): void {
    if (!this.released && !this.win.isDestroyed()) this.win.close()
  }

  onTabFullscreen(_tab: LiveTab, on: boolean): void {
    this.win.setFullScreen(on)
    if (on && this.tab) this.tab.view.setBounds({ x: 0, y: 0, ...sizeOf(this.win) })
    else this.layout()
  }

  onFoundInPage(): void {}

  adoptOpenedPage(opener: LiveTab, options: BrowserWindowConstructorOptions, disposition: OpenDisposition, url: string): WebContents {
    // New tabs from a Little Arc page go to the main window, like Arc.
    return this.browser.adoptOpenedPage(opener, options, disposition, url)
  }

  showContextMenu(tab: LiveTab, params: ContextMenuParams): void {
    buildContextMenu(this.browser, tab, params).popup({ window: this.win })
  }
}

function sizeOf(win: BrowserWindow): { width: number; height: number } {
  const [width, height] = win.getContentSize()
  return { width, height }
}
