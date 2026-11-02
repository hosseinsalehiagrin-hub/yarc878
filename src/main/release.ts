// GitHub release lookup for the macOS self-updater and the Linux notice. No Electron imports, so it unit-tests.

/** Published releases only: drafts are invisible here, so a release goes out once it's published. */
export const LATEST_RELEASE_API = 'https://api.github.com/repos/yenebeb/arc-shell/releases/latest'

/** The fields we use from GitHub's "get the latest release" response. */
export interface GithubRelease {
  tag_name: string
  html_url: string
  assets: { name: string; browser_download_url: string }[]
}

interface Version {
  parts: number[]
  /** "beta.1" in "1.2.0-beta.1"; empty for a normal release. */
  pre: string
}

function parseVersion(text: string): Version {
  const v = text.trim().replace(/^v/i, '').split('+')[0]
  const dash = v.indexOf('-')
  const core = dash < 0 ? v : v.slice(0, dash)
  const pre = dash < 0 ? '' : v.slice(dash + 1)
  return { parts: core.split('.').map((n) => Number.parseInt(n, 10) || 0), pre }
}

/** Semver-style comparison of "1.2.3" / "v1.2.3" / "1.2.3-beta.1". Pre-releases sort before their release. */
export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a)
  const y = parseVersion(b)
  for (let i = 0; i < Math.max(x.parts.length, y.parts.length); i++) {
    const d = (x.parts[i] ?? 0) - (y.parts[i] ?? 0)
    if (d !== 0) return Math.sign(d)
  }
  if (x.pre === y.pre) return 0
  if (!x.pre) return 1
  if (!y.pre) return -1
  return Math.sign(x.pre.localeCompare(y.pre, 'en', { numeric: true }))
}

export function isNewer(latest: string, current: string): boolean {
  return compareVersions(latest, current) > 0
}

/** electron-builder names them YARC-<version>-<arch>.dmg / .AppImage (see electron-builder.yml). */
const INSTALLER_EXT: Record<string, string> = { darwin: 'dmg', linux: 'AppImage' }

/** The installer for this platform and CPU, or the release page when there isn't one. */
export function pickDownload(release: GithubRelease, platform: string, arch: string): string {
  const ext = INSTALLER_EXT[platform]
  const asset = ext ? release.assets.find((a) => a.name.endsWith(`-${arch}.${ext}`)) : undefined
  return asset ? asset.browser_download_url : release.html_url
}

/** The self-update zip for a Mac (electron-builder.yml names it YARC-<version>-<arch>-mac.zip) and its signature. */
export interface MacUpdate {
  name: string
  url: string
  signatureUrl: string
}

export function pickMacUpdate(release: GithubRelease, arch: string): MacUpdate | undefined {
  const zip = release.assets.find((a) => a.name.endsWith(`-${arch}-mac.zip`))
  const signature = zip && release.assets.find((a) => a.name === `${zip.name}.sig`)
  if (!zip || !signature) return undefined
  return { name: zip.name, url: zip.browser_download_url, signatureUrl: signature.browser_download_url }
}
