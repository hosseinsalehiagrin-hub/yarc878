// When a downloaded update may interrupt with the relaunch card. Like Arc and Chrome, a ready
// update only shows a "Restart to Update" pill in the sidebar and installs on quit; the card opens
// once it has waited a week, or a day when it changes Electron (Chromium and V8 security fixes).
// No Electron imports, so it unit-tests.
import type { WaitingUpdate } from '../shared/types'

const HOUR = 60 * 60_000
const DAY = 24 * HOUR

/** A normal update waits this long without a restart before the card asks (Chrome's "high" level is 7 days). */
export const ESCALATE_AFTER = 7 * DAY
/** An update with a newer Electron waits a day: most people restart some time in a day, and then it just installs. */
export const ESCALATE_SECURITY_AFTER = DAY
/** After "Later", the card stays away this long. */
export const REMIND_AFTER = DAY

/**
 * The record for an update that just became ready. The wait started with the first update that was
 * ready while this version runs, so a newer release that replaces it doesn't restart the clock.
 */
export function startWaiting(saved: WaitingUpdate | undefined, running: string, now: number): WaitingUpdate {
  return saved?.from === running ? saved : { from: running, since: now }
}

/** Whether the relaunch card should open by itself now. */
export function shouldAsk(waiting: WaitingUpdate, security: boolean, now: number): boolean {
  const wait = security ? ESCALATE_SECURITY_AFTER : ESCALATE_AFTER
  if (now - waiting.since < wait) return false
  return waiting.askedAt === undefined || now - waiting.askedAt >= REMIND_AFTER
}

/** What each release publishes about itself, as `release.json` (written by release.yml). */
export interface ReleaseInfo {
  /** The Electron version the release was built with. */
  electron: string
}

/** The release.json asset of a release, next to its installers. */
export function releaseInfoUrl(version: string): string {
  return `https://github.com/yenebeb/yarc/releases/download/v${version}/release.json`
}

/**
 * Whether an update carries security fixes we know of: it was built with a different Electron than
 * the one running. Electron releases carry Chromium and V8 security fixes, and they reach YARC no
 * other way. A release without release.json (older ones), or one we couldn't read, counts as normal.
 */
export function isSecurityUpdate(runningElectron: string, info: unknown): boolean {
  if (!info || typeof info !== 'object') return false
  const electron = (info as Partial<ReleaseInfo>).electron
  return typeof electron === 'string' && electron !== '' && electron !== runningElectron
}
