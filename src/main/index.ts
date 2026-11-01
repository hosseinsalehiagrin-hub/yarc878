import { app, BrowserWindow } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Browser } from './browser'
import { Extensions } from './extensions'
import { installAppMenu } from './menus'
import { browserUserAgent } from './useragent'

// Tests and portable setups can point the profile somewhere else.
if (process.env.ARC_SHELL_USER_DATA) app.setPath('userData', process.env.ARC_SHELL_USER_DATA)
else if (!app.isPackaged) app.setPath('userData', join(app.getPath('appData'), 'Arc Shell (dev)'))

app.userAgentFallback = browserUserAgent()
// Windows groups taskbar buttons and routes notifications by this id (matches electron-builder's appId).
if (process.platform === 'win32') app.setAppUserModelId('org.arcshell.browser')

/** Taskbar jump-list tasks arrive as flags, in a fresh launch or a second instance. */
type LaunchTask = 'newTab' | 'littleArc'
function taskArg(argv: string[]): LaunchTask | undefined {
  if (argv.includes('--new-tab')) return 'newTab'
  if (argv.includes('--little-arc')) return 'littleArc'
  return undefined
}

function runTask(browser: Browser, task: LaunchTask): void {
  if (task === 'littleArc') return void browser.openLittle()
  browser.focusWindow()
  browser.runCommand('newTab')
}

function installJumpList(): void {
  if (process.platform !== 'win32' || !app.isPackaged) return
  const task = (args: string, title: string, description: string) => ({
    program: process.execPath,
    arguments: args,
    iconPath: process.execPath,
    iconIndex: 0,
    title,
    description
  })
  app.setUserTasks([
    task('--new-tab', 'New Tab', 'Open the command bar in Arc Shell'),
    task('--little-arc', 'New Little Arc Window', 'Open a small window for a quick lookup')
  ])
}

// Links arrive as URLs; double-clicked .html files (Windows) arrive as plain paths.
function urlArg(argv: string[]): string | undefined {
  for (const a of argv.slice(1)) {
    if (/^(https?|file):/i.test(a)) return a
    if (/\.(html?|xhtml|svg|pdf)$/i.test(a) && existsSync(a)) return pathToFileURL(a).href
  }
  return undefined
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  let browser: Browser | undefined
  let pendingUrl: string | undefined = urlArg(process.argv)
  let pendingTask: LaunchTask | undefined = taskArg(process.argv)

  app.on('second-instance', (_e, argv) => {
    const url = urlArg(argv)
    const task = taskArg(argv)
    if (!browser) {
      pendingUrl = url
      pendingTask = task
      return
    }
    if (url) browser.openExternalUrl(url)
    else if (task) runTask(browser, task)
    else browser.focusWindow()
  })

  // macOS delivers links (as the default browser) through open-url, possibly before ready.
  app.on('open-url', (e, url) => {
    e.preventDefault()
    if (browser) browser.openExternalUrl(url)
    else pendingUrl = url
  })

  app.on('open-file', (e, path) => {
    e.preventDefault()
    const url = pathToFileURL(path).href
    if (browser) browser.openExternalUrl(url)
    else pendingUrl = url
  })

  app.whenReady().then(() => {
    Extensions.prepareUiSession()
    browser = new Browser()
    // End-to-end tests drive the controller directly.
    if (process.env.ARC_SHELL_TEST) Object.assign(globalThis, { arcBrowser: browser })
    installAppMenu(browser)
    browser.start()
    installJumpList()
    if (pendingUrl) browser.openExternalUrl(pendingUrl)
    else if (pendingTask) runTask(browser, pendingTask)
    pendingUrl = undefined
    pendingTask = undefined

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) browser?.openWindow()
      else browser?.focusWindow()
    })
  })

  app.on('before-quit', () => browser?.shutdown())
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
