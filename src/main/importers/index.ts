// Importers for Arc (spaces, pinned tabs, favorites, archive, history) and Chromium browsers (history, bookmarks).
import { dialog, type BrowserWindow, type MessageBoxOptions, type OpenDialogOptions } from 'electron'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import type { Browser } from '../browser'
import { newId, SPACE_COLORS } from '../store'
import { SIDEBAR_WIDTH, type ArchivedTab, type PersistedState, type Profile, type Space } from '../../shared/types'
import { parseArcSidebar, readArcJson } from './arc-sidebar'
import { countTabs, findArcRoot, findChromiumBrowsers, listProfiles, readBookmarks, readHistory, readProfileNames } from './chromium'

export type ImportSource = 'arc' | 'chrome'

const MAX_ARCHIVE = 1000

export async function runImport(browser: Browser, source: ImportSource, path?: string): Promise<string | undefined> {
  return source === 'arc' ? importArc(browser, path) : importChromium(browser, path)
}

// ---------------------------------------------------------------- dialogs

function parentWindow(browser: Browser): BrowserWindow | undefined {
  const win = browser.window?.win
  return win && !win.isDestroyed() ? win : undefined
}

async function ask(browser: Browser, opts: MessageBoxOptions): Promise<number> {
  const win = parentWindow(browser)
  return (await (win ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts))).response
}

async function pick(browser: Browser, opts: OpenDialogOptions): Promise<string | undefined> {
  const win = parentWindow(browser)
  const res = await (win ? dialog.showOpenDialog(win, opts) : dialog.showOpenDialog(opts))
  return res.canceled ? undefined : res.filePaths[0]
}

/** Let the user pick StorableSidebar.json or an Arc folder (e.g. copied from a Mac). */
async function pickArcSource(browser: Browser, defaultPath?: string): Promise<string | undefined> {
  const title = 'Choose your Arc data'
  const filters = [{ name: 'Arc sidebar (StorableSidebar.json)', extensions: ['json'] }]
  // Only macOS lets one dialog pick either a file or a folder.
  if (process.platform === 'darwin') {
    return pick(browser, { title, defaultPath, filters, properties: ['openFile', 'openDirectory', 'showHiddenFiles'] })
  }
  const choice = await ask(browser, {
    type: 'question',
    message: 'Where is your Arc data?',
    detail:
      'Choose the Arc folder (it contains StorableSidebar.json and "User Data"), for example one copied from another computer, or the StorableSidebar.json file itself.',
    buttons: ['Choose Folder…', 'Choose File…', 'Cancel'],
    defaultId: 0,
    cancelId: 2
  })
  if (choice === 2) return undefined
  return pick(browser, choice === 0 ? { title, defaultPath, properties: ['openDirectory'] } : { title, defaultPath, filters, properties: ['openFile'] })
}

// ---------------------------------------------------------------- Arc

interface ArcSource {
  sidebarFile: string
  /** Folder holding StorableSidebar.json. */
  root: string
  userData?: string
}

/** Accepts StorableSidebar.json, the Arc folder, its `User Data`, or a parent such as "Application Support" / the MSIX package dir. */
function resolveArcSource(p: string): ArcSource {
  let st
  try {
    st = statSync(p)
  } catch {
    throw new Error(`${p} does not exist`)
  }
  let sidebarFile: string | undefined
  if (st.isFile()) sidebarFile = p
  else {
    const candidates = [p, dirname(p), join(p, 'Arc'), join(p, 'LocalCache', 'Local', 'Arc')].map((d) => join(d, 'StorableSidebar.json'))
    sidebarFile = candidates.find((f) => existsSync(f))
  }
  if (!sidebarFile) throw new Error(`No StorableSidebar.json found in ${p}`)
  const root = dirname(sidebarFile)
  const userData = join(root, 'User Data')
  return { sidebarFile, root, userData: existsSync(userData) ? userData : undefined }
}

async function readJson(file: string): Promise<unknown> {
  try {
    return readArcJson(await readFile(file, 'utf8'))
  } catch {
    // Arc may be rewriting the file right now.
    await new Promise((r) => setTimeout(r, 250))
    return readArcJson(await readFile(file, 'utf8'))
  }
}

async function chooseArcSource(browser: Browser, path?: string): Promise<ArcSource | undefined> {
  if (path) return resolveArcSource(path)
  const root = findArcRoot()
  if (root && existsSync(join(root, 'StorableSidebar.json'))) {
    const choice = await ask(browser, {
      type: 'question',
      message: 'Import your spaces, pinned tabs, favorites and history from Arc?',
      detail: `Found Arc data in ${root}. Quitting Arc first gives the most complete result.`,
      buttons: ['Import', 'Use a Different Copy…', 'Cancel'],
      defaultId: 0,
      cancelId: 2
    })
    if (choice === 2) return undefined
    if (choice === 0) return resolveArcSource(root)
  }
  const picked = await pickArcSource(browser, root)
  return picked ? resolveArcSource(picked) : undefined
}

/** Arc caches sidebar icons as PNGs named md5(sidebar item id). */
function arcFavicons(root: string): (arcItemId: string) => string | undefined {
  const dir = join(root, 'SidebarItemsFaviconCache')
  return (id) => {
    const file = join(dir, createHash('md5').update(id).digest('hex'))
    try {
      return `data:image/png;base64,${readFileSync(file).toString('base64')}`
    } catch {
      return undefined
    }
  }
}

/** A fresh install: one empty 'Personal' space and nothing else worth keeping. */
function isUntouchedDefault(state: PersistedState): boolean {
  const [space] = state.spaces
  return (
    state.spaces.length === 1 &&
    state.profiles.length === 1 &&
    space.name === 'Personal' &&
    !space.pinned.length &&
    !space.today.length &&
    state.profiles.every((p) => !p.favorites.length) &&
    !state.archive.length
  )
}

async function importArc(browser: Browser, path?: string): Promise<string | undefined> {
  const src = await chooseArcSource(browser, path)
  if (!src) return undefined

  const json = await readJson(src.sidebarFile)
  const archiveFile = join(src.root, 'StorableArchiveItems.json')
  let archive: unknown
  if (existsSync(archiveFile)) {
    try {
      archive = await readJson(archiveFile)
    } catch (err) {
      console.warn('[import] could not read Arc archive', err)
    }
  }
  const parsed = parseArcSidebar(json, { archive, palette: SPACE_COLORS, favicon: arcFavicons(src.root) })
  if (parsed.warnings.length) console.warn(`[import] Arc: ${parsed.warnings.length} warnings\n  ${parsed.warnings.slice(0, 50).join('\n  ')}`)
  if (!parsed.spaces.length) throw new Error(`No spaces found in ${src.sidebarFile}`)

  const state = browser.state
  const names = src.userData ? readProfileNames(src.userData) : new Map<string, string>()
  const replace = isUntouchedDefault(state)
  const replacedActive = replace && state.spaces.some((s) => s.id === state.activeSpaceId)
  if (replace) {
    const old = new Set(state.profiles.map((p) => p.id))
    state.spaces = []
    state.profiles = []
    if (old.has(state.settings.littleArcProfileId)) state.settings.littleArcProfileId = ''
  }

  // One app profile per Arc profile that a space uses.
  const used = new Set(parsed.spaces.map((s) => s.profileKey))
  const profileIds = new Map<string, string>()
  const taken = new Set(state.profiles.map((p) => p.name))
  for (const p of parsed.profiles) {
    if (!used.has(p.key)) continue
    let name = names.get(p.key) || p.key
    if (taken.has(name)) name = `${name} (Arc)`
    taken.add(name)
    const profile: Profile = { id: newId(), name, favorites: p.favorites }
    state.profiles.push(profile)
    profileIds.set(p.key, profile.id)
  }

  const spaceIds = new Map<string, string>()
  const added: Space[] = parsed.spaces.map((s) => {
    const space: Space = {
      id: newId(),
      name: s.name,
      emoji: s.emoji,
      color: s.color,
      appearance: s.appearance,
      profileId: profileIds.get(s.profileKey)!,
      pinned: s.pinned,
      today: s.today,
      splits: []
    }
    spaceIds.set(s.arcId, space.id)
    return space
  })
  state.spaces.push(...added)

  const archived: ArchivedTab[] = (parsed.archive ?? []).map((a) => ({
    id: newId(),
    url: a.url,
    title: a.title,
    spaceId: (a.spaceArcId && spaceIds.get(a.spaceArcId)) || added[0].id,
    archivedAt: a.archivedAt
  }))
  if (archived.length) {
    state.archive = [...state.archive, ...archived].sort((a, b) => b.archivedAt - a.archivedAt).slice(0, MAX_ARCHIVE)
  }

  if (replace) {
    // Open where Arc was: its last focused space and sidebar width.
    const windows = await readJson(join(src.root, 'StorableWindows.json')).catch(() => undefined)
    const prefs = windows as { lastFocusedSpaceID?: unknown; sidebarViewPreferences?: { sidebarWidth?: unknown } } | undefined
    const focused = typeof prefs?.lastFocusedSpaceID === 'string' ? spaceIds.get(prefs.lastFocusedSpaceID) : undefined
    state.activeSpaceId = focused ?? added[0].id
    const width = prefs?.sidebarViewPreferences?.sidebarWidth
    if (typeof width === 'number') state.settings.sidebarWidth = Math.round(Math.min(SIDEBAR_WIDTH.max, Math.max(SIDEBAR_WIDTH.min, width)))
  }
  browser.store.save()
  browser.emit()
  if (replacedActive) browser.switchSpace(state.activeSpaceId)

  // History per Arc profile, from `User Data/<dir>/History` next to the sidebar file.
  let visits = 0
  const failed: string[] = []
  if (src.userData) {
    for (const [key, id] of profileIds) {
      const dir = join(src.userData, key)
      if (!existsSync(join(dir, 'History'))) continue
      try {
        visits += browser.profiles.get(id).history.import(await readHistory(dir))
      } catch (err) {
        console.warn(`[import] Arc history for ${key}`, err)
        failed.push(names.get(key) || key)
      }
    }
  }

  const pinned = added.reduce((n, s) => n + countTabs(s.pinned), 0)
  const favorites = parsed.profiles.filter((p) => used.has(p.key)).reduce((n, p) => n + p.favorites.length, 0)
  const parts = [plural(added.length, 'space'), plural(pinned, 'pinned tab'), plural(favorites, 'favorite')]
  if (src.userData) parts.push(plural(visits, 'history entry', 'history entries'))
  let summary = `Imported ${list(parts)} from Arc`
  if (failed.length) summary += ` (couldn't read history of ${list(failed)}; quit Arc and import again)`
  return summary
}

// ---------------------------------------------------------------- Chrome / Edge / Brave

interface ChromiumCandidate {
  browserName: string
  profileName: string
  dir: string
}

function chromiumCandidates(path?: string): ChromiumCandidate[] {
  if (path) {
    // A profile dir (has History/Bookmarks) or a whole user-data dir (has Local State).
    if (existsSync(join(path, 'History')) || existsSync(join(path, 'Bookmarks'))) {
      return [{ browserName: 'Chrome', profileName: basename(path), dir: path }]
    }
    return listProfiles(path).map((p) => ({ browserName: 'Chrome', profileName: p.name, dir: p.path }))
  }
  return findChromiumBrowsers().flatMap((b) => listProfiles(b.userDataDir).map((p) => ({ browserName: b.name, profileName: p.name, dir: p.path })))
}

async function importChromium(browser: Browser, path?: string): Promise<string | undefined> {
  const candidates = chromiumCandidates(path)
  if (!candidates.length) throw new Error(path ? `No browser profile found in ${path}` : 'No Chrome, Edge or Brave profile found')
  let chosen = candidates[0]
  if (candidates.length > 1) {
    const choice = await ask(browser, {
      type: 'question',
      message: 'Which browser profile do you want to import?',
      detail: 'History and bookmarks are added to the profile of the current space.',
      buttons: [...candidates.map((c) => `${c.browserName} — ${c.profileName}`), 'Cancel'],
      defaultId: 0,
      cancelId: candidates.length
    })
    if (choice < 0 || choice >= candidates.length) return undefined
    chosen = candidates[choice]
  }

  const space = browser.store.activeSpace
  const bookmarks = readBookmarks(chosen.dir)
  const bookmarkCount = countTabs(bookmarks)
  if (bookmarks.length) {
    space.pinned.push({ kind: 'folder', id: newId(), name: `Bookmarks from ${chosen.browserName}`, open: false, children: bookmarks })
    browser.store.save()
    browser.emit()
  }

  let visits = 0
  try {
    visits = browser.profiles.get(space.profileId).history.import(await readHistory(chosen.dir))
  } catch (err) {
    if (!bookmarkCount) throw err
    console.warn('[import] history', err)
    return `Imported ${plural(bookmarkCount, 'bookmark')} from ${chosen.browserName}; couldn't read its history (quit ${chosen.browserName} and import again)`
  }
  if (!visits && !bookmarkCount) return `Nothing to import from ${chosen.browserName} — ${chosen.profileName}`
  return `Imported ${list([plural(visits, 'history entry', 'history entries'), plural(bookmarkCount, 'bookmark')])} from ${chosen.browserName}`
}

// ---------------------------------------------------------------- text

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`
}

function list(parts: string[]): string {
  return parts.length < 2 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}
