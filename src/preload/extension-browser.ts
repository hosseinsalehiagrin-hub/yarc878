// Preload for extension pages and service workers, run after electron-chrome-extensions' own.
// That library adds its APIs (windows, contextMenus, cookies, webNavigation, …) to `chrome` only,
// but Chromium also gives extensions a separate `browser` object with just the native APIs.
// Extensions written against `browser.*` (1Password reads browser.windows at startup) would crash,
// so `browser` gets every API `chrome` has.
import { contextBridge } from 'electron'

function shareChromeApis(): void {
  const { chrome, browser } = globalThis as unknown as { chrome?: Record<string, unknown>; browser?: Record<string, unknown> }
  if (!chrome || !browser || browser === chrome) return
  for (const key of Object.keys(chrome)) {
    if (browser[key] === chrome[key]) continue
    try {
      Object.defineProperty(browser, key, { value: chrome[key], enumerable: true, configurable: true })
    } catch {
      // A native API that can't be replaced keeps working as it is.
    }
  }
}

if (process.type === 'service-worker' || location.href.startsWith('chrome-extension://')) {
  contextBridge.executeInMainWorld({ func: shareChromeApis })
}
