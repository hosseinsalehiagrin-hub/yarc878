// What a downloaded update brings, and when to say so. No Electron imports, so it unit-tests.
// Every merge to main is a release, so several updates can arrive in one day: the relaunch card
// shows at most once a day and lists every version since the one running.
import type { ReleaseNotes } from '../shared/types'
import { compareVersions } from './release.ts'

/** Published releases, newest first (drafts are left out for anonymous requests). */
export const RELEASES_API = 'https://api.github.com/repos/yenebeb/yarc/releases?per_page=50'

/** The fields we use from GitHub's "list releases" response. */
export interface GithubReleaseNotes {
  tag_name: string
  body?: string | null
  draft?: boolean
}

/**
 * The changes in a release body written by `gh release create --generate-notes`:
 * "* <PR title> by @<author> in https://…/pull/<n>". Dependabot bumps and the old manual
 * "Release 0.1.2" PRs are left out, like the built-in changelog (scripts/changelog.mjs).
 */
export function changesFromBody(body: string | null | undefined): string[] {
  const changes: string[] = []
  for (const line of (body ?? '').split(/\r?\n/)) {
    const m = /^\s*[*-]\s+(.+?)\s+by\s+@(\S+)\s+in\s+https?:\/\/\S+\s*$/.exec(line)
    if (!m || m[2].includes('dependabot') || /^release v?\d+\.\d+/i.test(m[1])) continue
    changes.push(m[1])
  }
  return changes
}

/**
 * The versions after `current` up to and including `target`, newest first, each with its changes.
 * Versions without notable changes stay in the list (so the count of updates is honest) with none.
 */
export function pendingReleases(releases: GithubReleaseNotes[], current: string, target: string): ReleaseNotes[] {
  return releases
    .filter((r) => !r.draft)
    .map((r) => ({ version: r.tag_name.replace(/^v/i, ''), changes: changesFromBody(r.body) }))
    .filter((r) => compareVersions(r.version, current) > 0 && compareVersions(r.version, target) <= 0)
    .sort((a, b) => compareVersions(b.version, a.version))
}

/** The local calendar day, "2026-11-09", which the once-a-day relaunch card is keyed on. */
export function dayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** True when the relaunch card hasn't been shown yet today. */
export function promptDue(lastPromptDay: string | undefined, now: Date): boolean {
  return lastPromptDay !== dayKey(now)
}
