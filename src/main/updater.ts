// In-app updates. Windows installs them in place (electron-updater with the NSIS installer).
// macOS builds are only ad-hoc signed, which Squirrel.Mac refuses, so there (and on Linux) we
// only tell the user about a new release and open its download.
import { app, clipboard, dialog, net, shell, type MessageBoxOptions } from 'electron'
import type { NsisUpdater } from 'electron-updater'
import type { UpdateStatus } from '../shared/types'
import type { Browser } from './browser'
import { installAppMenu } from './menus'
import { isNewer, LATEST_RELEASE_API, pickDownload, type GithubRelease } from './release'

const CHECK_EVERY = 4 * 60 * 60_000
const XATTR = 'xattr -dr com.apple.quarantine "/Applications/Arc Shell.app"'

export class Updater {
  status: UpdateStatus = { state: 'none' }
  /** For a notify-only update: the installer to open, and the release page. */
  private download = { installer: '', page: '' }
  private nsis: NsisUpdater | undefined
  private timer: NodeJS.Timeout | undefined
  private checking = false

  constructor(private browser: Browser) {}

  /** Start or stop the automatic checks (at startup, then every few hours) to match Settings. */
  sync(): void {
    clearInterval(this.timer)
    this.timer = undefined
    if (!app.isPackaged || !this.browser.state.settings.autoUpdate) return
    this.timer = setInterval(() => void this.check(false), CHECK_EVERY)
    void this.check(false)
  }

  /** `manual` checks report "up to date" and errors; automatic ones stay quiet. */
  async check(manual: boolean): Promise<void> {
    if (!app.isPackaged) {
      if (manual) this.browser.toast('Updates only work in the installed app')
      return
    }
    if (this.status.state === 'ready') {
      if (manual) this.browser.toast(`Arc Shell ${this.status.version} is ready. Restart to update.`)
      return
    }
    if (this.status.state === 'downloading') {
      if (manual) this.browser.toast(`Downloading Arc Shell ${this.status.version}…`)
      return
    }
    if (this.checking) return
    this.checking = true
    if (manual) this.browser.toast('Checking for updates…')
    try {
      const found = process.platform === 'win32' ? await this.checkWindows() : await this.checkGithub()
      if (manual && !found) this.browser.toast(`Arc Shell ${app.getVersion()} is up to date`)
      if (manual && found && this.status.state === 'available') await this.apply()
    } catch (err) {
      console.error('[updater] check failed', err)
      if (manual) this.browser.toast(`Couldn't check for updates: ${(err as Error).message}`)
    } finally {
      this.checking = false
    }
  }

  /** "Restart to Update" on Windows; on macOS and Linux, explain the manual install and open the download. */
  async apply(): Promise<void> {
    if (this.status.state === 'ready') return this.nsis?.quitAndInstall(true, true)
    if (this.status.state !== 'available') return this.check(true)
    const mac = process.platform === 'darwin'
    const options: MessageBoxOptions = {
      type: 'info',
      buttons: ['Download', 'Release Notes', 'Later'],
      defaultId: 0,
      cancelId: 2,
      message: `Arc Shell ${this.status.version} is available`,
      detail: mac
        ? 'Arc Shell can’t update itself on macOS yet, because it isn’t signed with an Apple Developer ID.\n\n' +
          'Download the new version, quit Arc Shell, and drag Arc Shell from the disk image into Applications to replace this one. ' +
          `Then run this in Terminal before opening it (Download copies it to your clipboard):\n\n${XATTR}`
        : 'Download the new AppImage and use it in place of this one.'
    }
    const win = this.browser.window?.win
    const { response } = win && !win.isDestroyed() ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options)
    if (response === 0) {
      if (mac) clipboard.writeText(XATTR)
      void shell.openExternal(this.download.installer)
    } else if (response === 1) {
      void shell.openExternal(this.download.page)
    }
  }

  /** Command-bar title for applying the update, or undefined when there's nothing to apply. */
  actionTitle(): string | undefined {
    if (this.status.state === 'ready') return 'Restart to Update'
    if (this.status.state === 'available') return `Download Arc Shell ${this.status.version}…`
    return undefined
  }

  private set(status: UpdateStatus): void {
    this.status = status
    this.browser.emitSoon()
    installAppMenu(this.browser)
  }

  private async checkWindows(): Promise<boolean> {
    const result = await (await this.nsisUpdater()).checkForUpdates()
    return !!result?.isUpdateAvailable
  }

  private async nsisUpdater(): Promise<NsisUpdater> {
    if (this.nsis) return this.nsis
    // Reads the feed (GitHub, from electron-builder.yml "publish") from resources/app-update.yml.
    const { NsisUpdater } = await import('electron-updater')
    const updater = new NsisUpdater()
    updater.autoDownload = true
    updater.autoInstallOnAppQuit = true
    updater.on('update-available', (info) => this.set({ state: 'downloading', version: info.version }))
    updater.on('update-downloaded', (info) => {
      this.set({ state: 'ready', version: info.version })
      this.browser.toast(`Arc Shell ${info.version} is ready. Restart to update.`)
    })
    updater.on('error', (err) => {
      console.error('[updater]', err)
      if (this.status.state === 'downloading') this.set({ state: 'none' })
    })
    this.nsis = updater
    return updater
  }

  private async checkGithub(): Promise<boolean> {
    const res = await net.fetch(LATEST_RELEASE_API, { headers: { accept: 'application/vnd.github+json' } })
    // 404: nothing published yet.
    if (res.status === 404) return false
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
    const release = (await res.json()) as GithubRelease
    const version = release.tag_name.replace(/^v/i, '')
    if (!isNewer(version, app.getVersion())) return false
    this.download = { installer: pickDownload(release, process.platform, process.arch), page: release.html_url }
    const known = this.status.state === 'available' && this.status.version === version
    if (!known) {
      this.set({ state: 'available', version })
      this.browser.toast(`Arc Shell ${version} is available`)
    }
    return true
  }
}
