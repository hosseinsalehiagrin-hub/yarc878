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

  app.on('second-instance', (_e, argv) => {
    const url = urlArg(argv)
    if (!browser) return void (pendingUrl = url)
    if (url) browser.openExternalUrl(url)
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
    if (pendingUrl) browser.openExternalUrl(pendingUrl)
    pendingUrl = undefined

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
