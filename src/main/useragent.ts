import { app } from 'electron'

// Google sign-in (2026) rejects Chrome-shaped user agents that come without Chrome's client
// hints, but accepts Electron's own UA. We only drop the app-name token Electron inserts
// ("YARC/0.1.0"), keeping "Chrome/x Electron/y" so the UA stays internally consistent.
// See docs/electron-notes.md.
export function browserUserAgent(): string {
  return app.userAgentFallback.replace(/\(KHTML, like Gecko\) .*?Chrome\//, '(KHTML, like Gecko) Chrome/')
}
