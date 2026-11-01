// The main browser window: the UI (sidebar + frame) underneath, web page views in the
// content area, and a transparent overlay view on top for the command bar and panels.
import { BrowserWindow, WebContentsView, nativeTheme, screen, type BrowserWindowConstructorOptions, type Rectangle, type WebContents } from 'electron'
import { join } from 'node:path'
import type { OverlayMode } from '../shared/types'

export const PAD = 8
const SPLIT_GAP = 6

export interface ViewSlot {
  view: WebContentsView
  rect: Rectangle
}

export function rendererUrl(page: 'index' | 'overlay' | 'little'): { url?: string; file?: string } {
  const dev = process.env.ELECTRON_RENDERER_URL
  if (dev) return { url: `${dev}/${page}.html` }
  return { file: join(__dirname, `../renderer/${page}.html`) }
}

export function loadRenderer(wc: WebContents, page: 'index' | 'overlay' | 'little'): void {
  const target = rendererUrl(page)
  void (target.url ? wc.loadURL(target.url) : wc.loadFile(target.file!))
}

export const preloadPath = (): string => join(__dirname, '../preload/ui.js')

export function uiWebPreferences() {
  return { preload: preloadPath(), sandbox: false, contextIsolation: true, nodeIntegration: false, spellcheck: false }
}

function onSomeDisplay(r: Rectangle): boolean {
  return screen.getAllDisplays().some(({ workArea: a }) => {
    const w = Math.min(r.x + (r.width ?? 0), a.x + a.width) - Math.max(r.x, a.x)
    const h = Math.min(r.y + (r.height ?? 0), a.y + a.height) - Math.max(r.y, a.y)
    return w >= 100 && h >= 50
  })
}

export class MainWindow {
  readonly win: BrowserWindow
  readonly overlay: WebContentsView
  overlayMode: OverlayMode = { kind: 'none' }
  private shown: WebContentsView[] = []
  private overlayAttached = false

  constructor(bounds: Partial<Rectangle> | undefined) {
    const mac = process.platform === 'darwin'
    const area = screen.getPrimaryDisplay().workArea
    // Ignore saved positions on a monitor that's no longer connected.
    if (bounds?.x !== undefined && bounds.y !== undefined && !onSomeDisplay(bounds as Rectangle)) bounds = { width: bounds.width, height: bounds.height }
    const options: BrowserWindowConstructorOptions = {
      width: bounds?.width ?? Math.min(1440, area.width - 80),
      height: bounds?.height ?? Math.min(920, area.height - 80),
      x: bounds?.x,
      y: bounds?.y,
      minWidth: 520,
      minHeight: 360,
      show: false,
      titleBarStyle: mac ? 'hiddenInset' : 'hidden',
      // Same spot as Arc's traffic lights.
      trafficLightPosition: { x: 13, y: 16 },
      webPreferences: uiWebPreferences()
    }
    if (mac) {
      // The theme is painted translucent over the desktop, like Arc's vibrant themes.
      options.vibrancy = 'under-window'
      options.visualEffectState = 'active'
      options.backgroundColor = '#00000000'
    } else {
      options.backgroundColor = nativeTheme.shouldUseDarkColors ? '#1f1e24' : '#e9e7f3'
    }
    this.win = new BrowserWindow(options)
    this.win.setMenuBarVisibility(false)
    loadRenderer(this.win.webContents, 'index')
    this.win.once('ready-to-show', () => this.win.show())

    this.overlay = new WebContentsView({ webPreferences: uiWebPreferences() })
    this.overlay.setBackgroundColor('#00000000')
    loadRenderer(this.overlay.webContents, 'overlay')
  }

  get ui(): WebContents {
    return this.win.webContents
  }

  size(): { width: number; height: number } {
    const [width, height] = this.win.getContentSize()
    return { width, height }
  }

  /** The area web pages occupy, given the sidebar configuration. */
  contentRect(sidebarVisible: boolean, sidebarWidth: number, right: boolean, fullscreenPage: boolean): Rectangle {
    const { width, height } = this.size()
    if (fullscreenPage) return { x: 0, y: 0, width, height }
    const side = sidebarVisible ? sidebarWidth : PAD
    const w = Math.max(100, width - side - PAD)
    return { x: right ? PAD : side, y: PAD, width: w, height: Math.max(100, height - 2 * PAD) }
  }

  /** Splits a rect into side-by-side columns with the given relative sizes. */
  static splitRect(rect: Rectangle, sizes: number[]): Rectangle[] {
    const total = rect.width - SPLIT_GAP * (sizes.length - 1)
    let x = rect.x
    return sizes.map((s, i) => {
      const w = i === sizes.length - 1 ? rect.x + rect.width - x : Math.round(total * s)
      const r = { x, y: rect.y, width: w, height: rect.height }
      x += w + SPLIT_GAP
      return r
    })
  }

  /** Shows exactly these views (in order), detaching any others. */
  show(slots: ViewSlot[]): void {
    const next = slots.map((s) => s.view)
    for (const v of this.shown) if (!next.includes(v)) this.win.contentView.removeChildView(v)
    for (const s of slots) {
      if (!this.shown.includes(s.view)) this.win.contentView.addChildView(s.view)
      s.view.setBounds(s.rect)
    }
    this.shown = next
    if (this.overlayAttached) this.raiseOverlay()
  }

  detach(view: WebContentsView): void {
    if (this.shown.includes(view)) {
      this.win.contentView.removeChildView(view)
      this.shown = this.shown.filter((v) => v !== view)
    }
  }

  isShown(view: WebContentsView): boolean {
    return this.shown.includes(view)
  }

  setOverlay(mode: OverlayMode, rect: Rectangle | undefined): void {
    this.overlayMode = mode
    this.overlay.webContents.send('arc:overlay', mode)
    if (mode.kind === 'none' || !rect) {
      if (this.overlayAttached) {
        this.win.contentView.removeChildView(this.overlay)
        this.overlayAttached = false
      }
      return
    }
    this.overlay.setBounds(rect)
    if (!this.overlayAttached) {
      this.win.contentView.addChildView(this.overlay)
      this.overlayAttached = true
    } else this.raiseOverlay()
    if (mode.kind !== 'sidebar') this.overlay.webContents.focus()
  }

  private raiseOverlay(): void {
    // Re-adding an existing child moves it to the top of the z-order.
    this.win.contentView.addChildView(this.overlay)
  }
}
