// What to tell the user about a link to another app. Kept free of Electron so unit tests can import it.

/** Schemes web pages must never launch: Windows handlers that have been used to run code (Follina et al.). */
const BLOCKED = new Set(['ms-msdt', 'search-ms', 'search', 'ms-cxh', 'ms-cxh-full', 'ms-officecmd', 'ms-appinstaller'])

const APPS: Record<string, string> = {
  mailto: 'your email app',
  tel: 'your phone app',
  sms: 'your messages app',
  msteams: 'Microsoft Teams',
  zoommtg: 'Zoom',
  zoomus: 'Zoom',
  slack: 'Slack',
  spotify: 'Spotify',
  discord: 'Discord',
  vscode: 'Visual Studio Code',
  steam: 'Steam',
  figma: 'Figma',
  notion: 'Notion',
  webex: 'Webex',
  facetime: 'FaceTime',
  'ms-settings': 'Windows Settings'
}

export interface ExternalLinkInfo {
  scheme: string
  /** How the app is named in the prompt. */
  app: string
  /** The page's origin, for remembering "Always allow". */
  origin: string
  /** The page's host, as shown to the user ('' for pages without one). */
  site: string
  blocked: boolean
}

export function externalLinkInfo(url: string, pageUrl: string): ExternalLinkInfo {
  const scheme = (/^([a-z][a-z0-9+.-]*):/i.exec(url)?.[1] ?? '').toLowerCase()
  let origin = ''
  let site = ''
  try {
    const page = new URL(pageUrl)
    if (/^https?:$/.test(page.protocol)) {
      origin = page.origin
      site = page.host
    }
  } catch {}
  return { scheme, app: APPS[scheme] ?? `the ${scheme}: app`, origin, site, blocked: !scheme || BLOCKED.has(scheme) }
}
