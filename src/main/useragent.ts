// Google sign-in (2026) rejects Chrome-shaped user agents that come without Chrome's client
// hints, but accepts Electron's own UA. We only drop the app-name token Electron inserts
// ("YARC/0.1.0"), keeping "Chrome/x Electron/y" so the UA stays internally consistent.
// See docs/electron-notes.md.
export function browserUserAgent(fallback: string): string {
  return fallback.replace(/\(KHTML, like Gecko\) .*?Chrome\//, '(KHTML, like Gecko) Chrome/')
}

/**
 * Hosts that get the UA without "Electron/". Microsoft Teams reads that token as its own desktop
 * app: meeting links redirect to a path only the app serves (an empty 404 in a browser), and the
 * web app never finishes loading. See docs/electron-notes.md.
 */
export const CHROME_UA_HOSTS = ['teams.microsoft.com', 'teams.live.com', 'teams.cloud.microsoft']

/** The UA for a page at `url`: the browser UA `ua`, minus the Electron token on CHROME_UA_HOSTS. */
export function userAgentFor(url: string, ua: string): string {
  let host = ''
  try {
    host = new URL(url).hostname
  } catch {
    return ua
  }
  return CHROME_UA_HOSTS.includes(host) ? ua.replace(/ Electron\/\S+/, '') : ua
}
