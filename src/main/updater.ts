// In-app updates. Windows installs them in place with electron-updater (NSIS installer). macOS
// builds are only ad-hoc signed, which Squirrel.Mac refuses, so macOS replaces its own bundle
// with a signed zip from the release (mac-update.ts). Linux, and a Mac that can't write to the
// app's folder, only hear about a new release and open its download.
// Updates are how Chromium security fixes arrive, so checks are hourly. A downloaded update offers a
// relaunch in YARC's own card, listing every version since the running one, at most once a day
// (every merge to main is a release, so several can land in a day); it also installs on quit.
import { app, dialog, net, shell, type MessageBoxOptions } from 'electron'
import type { NsisUpdater } from 'electron-updater'
import type { ReleaseNotes, UpdateStatus } from '../shared/types'
import type { Browser } from './browser'
import { cleanUpStaging, installStaged, stageUpdate, updatableBundle } from './mac-update'
import { installAppMenu } from './menus'
import { isNewer, LATEST_RELEASE_API, pickDownload, pickMacUpdate, type GithubRelease, type MacUpdate } from './release'
import { dayKey, pendingReleases, promptDue, RELEASES_API, type GithubReleaseNotes } from './update-notes'

const CHECK_EVERY = 60 * 60_000

export class Updater {
  status: UpdateStatus = { state: 'none' }
  /** For a notify-only update: the installer to open, and the release page. */
  private download = { installer: '', page: '' }
  private nsis: NsisUpdater | undefined
  private timer: NodeJS.Timeout | undefined
  private checking = false
  /** macOS: a version that failed to update in place, offered as a download instead of retried every hour. */
  private failedVersion = ''
  /** macOS: the downloaded update's executable, to relaunch into once it's swapped in. */
  private relaunchPath = ''
  /** macOS: removing the app the last update replaced; a new download waits for it. */
  private cleanup: Promise<void>

  constructor(private browser: Browser) {
    this.cleanup = process.platform === 'darwin' ? cleanUpStaging().catch((err) => console.error('[updater]', err)) : Promise.resolve()
  }

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
      // The hourly check is also what brings the card back on a new day.
      if (manual) this.browser.toast(`YARC ${this.status.version} is ready. Restart to update.`)
      else this.offerRelaunch()
      return
    }
    if (this.status.state === 'downloading') {
      if (manual) this.browser.toast(`Downloading YARC ${this.status.version}…`)
      return
    }
    if (this.checking) return
    this.checking = true
    if (manual) this.browser.toast('Checking for updates…')
    try {
      const found = process.platform === 'win32' ? await this.checkWindows() : await this.checkGithub()
      if (manual && !found) this.browser.toast(`YARC ${app.getVersion()} is up to date`)
      if (manual && found && this.status.state === 'available') await this.apply()
    } catch (err) {
      console.error('[updater] check failed', err)
      if (manual) this.browser.toast(`Couldn't check for updates: ${(err as Error).message}`)
    } finally {
      this.checking = false
    }
  }

  /**
   * "Restart to Update" on Windows and macOS; otherwise explain the manual install and open the download.
   * `notesRead`: relaunched from the card, which already listed the changes, so skip What's New after.
   */
  async apply(notesRead = false): Promise<void> {
    if (this.status.state === 'ready') {
      if (notesRead) {
        this.browser.state.lastSeenVersion = this.status.version
        this.browser.store.save()
      }
      if (this.nsis) return this.nsis.quitAndInstall(true, true)
      // macOS: the will-quit handler from updateMac swaps the new app in before the relaunch.
      app.relaunch({ execPath: this.relaunchPath })
      return app.quit()
    }
    if (this.status.state !== 'available') return this.check(true)
    const mac = process.platform === 'darwin'
    const options: MessageBoxOptions = {
      type: 'info',
      buttons: ['Download', 'Release Notes', 'Later'],
      defaultId: 0,
      cancelId: 2,
      message: `YARC ${this.status.version} is available`,
      detail: mac
        ? 'YARC couldn’t update itself, for example because it can’t write to the folder it’s in.\n\n' +
          'Download the new version, quit YARC, and drag YARC from the disk image into Applications to replace this one. ' +
          'The first time you open it, macOS blocks it once: allow it in System Settings → Privacy & Security → Open Anyway.'
        : 'Download the new AppImage and use it in place of this one.'
    }
    const response = await this.ask(options)
    if (response === 0) {
      void shell.openExternal(this.download.installer)
    } else if (response === 1) {
      void shell.openExternal(this.download.page)
    }
  }

  /** Command-bar title for applying the update, or undefined when there's nothing to apply. */
  actionTitle(): string | undefined {
    if (this.status.state === 'ready') return 'Restart to Update'
    if (this.status.state === 'available') return `Download YARC ${this.status.version}…`
    return undefined
  }

  /**
   * The update is downloaded: fetch what's new in every version since the running one (the card lists
   * them all), then offer the relaunch.
   */
  async ready(version: string): Promise<void> {
    this.set({ state: 'ready', version, notes: await this.notesUpTo(version) })
    this.offerRelaunch()
  }

  /**
   * Shows the relaunch card, unless it already showed today or now is a bad moment (another panel is
   * open, or the window is hidden): the hourly check tries again.
   */
  offerRelaunch(now = new Date()): void {
    if (this.status.state !== 'ready' || !promptDue(this.browser.state.updatePromptDay, now)) return
    const w = this.browser.window
    if (!w || w.win.isDestroyed() || !w.win.isVisible() || w.win.isMinimized() || w.overlayMode.kind !== 'none') return
    this.browser.state.updatePromptDay = dayKey(now)
    this.browser.store.save()
    this.browser.setOverlay({ kind: 'update' })
  }

  private async notesUpTo(version: string): Promise<ReleaseNotes[]> {
    try {
      const res = await net.fetch(RELEASES_API, { headers: { accept: 'application/vnd.github+json' } })
      if (!res.ok) throw new Error(`GitHub answered ${res.status}`)
      return pendingReleases((await res.json()) as GithubReleaseNotes[], app.getVersion(), version)
    } catch (err) {
      // The card still offers the relaunch, just without the list.
      console.warn('[updater] release notes unavailable', err)
      return []
    }
  }

  /** A message box on the main window, or a free-standing one when that's closed. */
  private async ask(options: MessageBoxOptions): Promise<number> {
    const win = this.browser.window?.win
    const { response } = win && !win.isDestroyed() ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options)
    return response
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
    updater.on('update-downloaded', (info) => void this.ready(info.version))
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
    if (process.platform === 'darwin' && version !== this.failedVersion) {
      const update = pickMacUpdate(release, process.arch)
      const bundle = updatableBundle()
      if (update && bundle) {
        void this.updateMac(update, version, bundle)
        return true
      }
    }
    const known = this.status.state === 'available' && this.status.version === version
    if (!known) {
      this.set({ state: 'available', version })
      this.browser.toast(`YARC ${version} is available`)
    }
    return true
  }

  /** Downloads and unpacks the update in the background, then asks to relaunch; it installs as the app quits. */
  private async updateMac(update: MacUpdate, version: string, bundle: string): Promise<void> {
    this.set({ state: 'downloading', version })
    try {
      await this.cleanup
      const staged = await stageUpdate(update, version, bundle)
      this.relaunchPath = staged.executable
      app.once('will-quit', () => {
        try {
          installStaged(staged.app, bundle)
        } catch (err) {
          console.error('[updater] installing the update failed', err)
        }
      })
      await this.ready(version)
    } catch (err) {
      console.error('[updater] macOS update failed; offering the download instead', err)
      this.failedVersion = version
      this.set({ state: 'available', version })
      this.browser.toast(`YARC ${version} is available`)
    }
  }
}
