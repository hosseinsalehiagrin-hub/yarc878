// Zen browser (Firefox-based) data that needs no file access, so it can be unit-tested: Firefox's
// mozLz4 compression, profiles.ini, prefs.js, containers.json, and the session's spaces, essentials,
// pinned tabs and folders turned into YARC's model. zen.ts reads the files.
import { randomUUID } from 'node:crypto'
import type { PinnedFolder, PinnedNode, TabItem } from '../../shared/types'

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const objects = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(isObj) : [])
const isWebUrl = (url: string | undefined): url is string => !!url && /^(https?|file):/i.test(url)

// ---------------------------------------------------------------- mozLz4

/** Firefox's .jsonlz4 files: "mozLz40\0", the decompressed size (u32 LE), then one raw LZ4 block. */
export function readMozLz4(file: Uint8Array): Buffer {
  const buf = Buffer.from(file.buffer, file.byteOffset, file.byteLength)
  if (buf.length < 12 || buf.toString('latin1', 0, 8) !== 'mozLz40\0') throw new Error('Not a mozLz4 file')
  return lz4Block(buf.subarray(12), buf.readUInt32LE(8))
}

function lz4Block(src: Buffer, size: number): Buffer {
  const corrupt = (): Error => new Error('Corrupt mozLz4 data')
  const out = Buffer.alloc(size)
  let i = 0
  let o = 0
  // A 4-bit length of 15 continues in the next bytes, each added, until one is below 255.
  const length = (n: number): number => {
    if (n < 15) return n
    let b: number
    do {
      if (i >= src.length) throw corrupt()
      b = src[i++]
      n += b
    } while (b === 255)
    return n
  }
  while (i < src.length) {
    const token = src[i++]
    const literals = length(token >> 4)
    if (i + literals > src.length || o + literals > size) throw corrupt()
    src.copy(out, o, i, i + literals)
    i += literals
    o += literals
    if (i === src.length) break // the last sequence is literals only
    if (i + 2 > src.length) throw corrupt()
    const offset = src[i] | (src[i + 1] << 8)
    i += 2
    const match = length(token & 15) + 4
    if (offset === 0 || offset > o || o + match > size) throw corrupt()
    for (let k = 0; k < match; k++) out[o + k] = out[o - offset + k] // byte by byte: the copy may overlap itself
    o += match
  }
  return out.subarray(0, o)
}

// ---------------------------------------------------------------- profiles.ini, prefs.js, containers.json

export interface IniProfile {
  name: string
  path: string
  /** `path` is relative to the folder holding profiles.ini. */
  relative: boolean
}

/** The [ProfileN] entries of profiles.ini, the one Zen opens by default first. */
export function parseProfilesIni(text: string): IniProfile[] {
  const sections: { name: string; values: Map<string, string> }[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    const header = /^\[(.+)\]$/.exec(line)
    if (header) sections.push({ name: header[1], values: new Map() })
    else if (sections.length && line.includes('=') && !line.startsWith(';') && !line.startsWith('#')) {
      const at = line.indexOf('=')
      sections[sections.length - 1].values.set(line.slice(0, at).trim(), line.slice(at + 1).trim())
    }
  }
  // Firefox 67+ keeps a default per installation ([Install<hash>] Default=<path>); older files mark one with Default=1.
  const installDefault = sections.find((s) => s.name.startsWith('Install'))?.values.get('Default')
  const profiles = sections
    .filter((s) => /^Profile\d+$/.test(s.name) && s.values.get('Path'))
    .map((s) => ({
      name: s.values.get('Name') || s.values.get('Path')!,
      path: s.values.get('Path')!,
      relative: s.values.get('IsRelative') !== '0',
      rank: s.values.get('Path') === installDefault ? 0 : s.values.get('Default') === '1' ? 1 : 2
    }))
  return profiles.sort((a, b) => a.rank - b.rank).map(({ name, path, relative }) => ({ name, path, relative }))
}

/** The `user_pref("name", value);` lines of prefs.js. */
export function parsePrefs(text: string): Map<string, string | number | boolean> {
  const prefs = new Map<string, string | number | boolean>()
  for (const m of text.matchAll(/^user_pref\(("(?:[^"\\]|\\.)*"),\s*(.*)\);\s*$/gm)) {
    try {
      const value: unknown = JSON.parse(m[2])
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') prefs.set(JSON.parse(m[1]), value)
    } catch {}
  }
  return prefs
}

const DEFAULT_CONTAINERS: Record<number, string> = { 1: 'Personal', 2: 'Work', 3: 'Banking', 4: 'Shopping' }

/** Container (userContextId) names from containers.json; the built-in four have no name stored. */
export function parseContainers(json: unknown): Map<number, string> {
  const names = new Map<number, string>()
  for (const c of objects(isObj(json) ? json.identities : undefined)) {
    const id = num(c.userContextId)
    const name = str(c.name) ?? (id === undefined ? undefined : DEFAULT_CONTAINERS[id])
    if (id !== undefined && name && c.public !== false) names.set(id, name)
  }
  return names
}

// ---------------------------------------------------------------- the session

export interface ParsedZenProfile {
  /** The container (userContextId) of its spaces, as a string. */
  key: string
  name: string
  favorites: TabItem[]
}

export interface ParsedZenSpace {
  zenId: string
  name: string
  emoji?: string
  /** Hex, e.g. '#336699'. */
  color: string
  profileKey: string
  pinned: PinnedNode[]
  today: TabItem[]
}

export interface ParsedZen {
  profiles: ParsedZenProfile[]
  spaces: ParsedZenSpace[]
  /** Distinct essentials (each profile may get its own copy). */
  essentials: number
  /** Zen id of the space that was open, if it was imported. */
  activeSpaceId?: string
}

export interface ParseZenOptions {
  /** Colors for spaces without a theme color. */
  palette?: string[]
  containers?: Map<number, string>
  /** zen.workspaces.container-specific-essentials-enabled: essentials only show in spaces of their container. */
  containerEssentials?: boolean
  /** zen.workspaces.active. */
  activeSpace?: string
  now?: number
}

/**
 * A Zen session ({ tabs, folders, spaces }, from zen-sessions.jsonlz4 or a session-store window) in
 * YARC's model. Spaces get one profile per container they use, since containers keep cookies apart
 * like profiles do. Essentials become favorites, pinned tabs and folders stay pinned, and other web
 * tabs become Today tabs. Glance and placeholder tabs are left out.
 */
export function parseZenSession(session: unknown, opts: ParseZenOptions = {}): ParsedZen {
  const s = isObj(session) ? session : {}
  const now = opts.now ?? Date.now()
  const palette = opts.palette?.length ? opts.palette : ['#7c3aed']
  const tabs = objects(s.tabs).filter((t) => t.zenIsEmpty !== true && t.zenIsGlance !== true)
  const folders = objects(s.folders)
  const zenSpaces = objects(s.spaces).filter((sp) => str(sp.uuid))

  const containerOf = (space: Obj): number => num(space.containerTabId) ?? 0
  const containers = [...new Set(zenSpaces.map(containerOf))]
  const profiles: ParsedZenProfile[] = containers.map((c) => ({
    key: String(c),
    name: containers.length === 1 || c === 0 ? 'Zen' : (opts.containers?.get(c) ?? `Container ${c}`),
    favorites: []
  }))

  const spaces = zenSpaces.map((space, i): ParsedZenSpace => {
    const zenId = str(space.uuid)!
    const out: ParsedZenSpace = {
      zenId,
      name: str(space.name) ?? `Space ${i + 1}`,
      color: themeColor(space.theme) ?? palette[i % palette.length],
      profileKey: String(containerOf(space)),
      ...spaceTabs(zenId, tabs, folders, now)
    }
    const emoji = iconEmoji(space.icon)
    if (emoji) out.emoji = emoji
    return out
  })

  let essentials = 0
  for (const tab of tabs) {
    if (tab.zenEssential !== true) continue
    const item = toTab(tab, true, now)
    if (!item) continue
    essentials++
    const owner = profiles.find((p) => p.key === String(num(tab.userContextId) ?? 0)) ?? profiles[0]
    for (const p of opts.containerEssentials ? [owner] : profiles) p?.favorites.push({ ...item, id: randomUUID() })
  }

  const active = opts.activeSpace ?? str(s.activeZenSpace)
  return { profiles, spaces, essentials, activeSpaceId: spaces.some((sp) => sp.zenId === active) ? active : undefined }
}

/** A space's pinned tree (folders keep their nesting, at the place of their first tab) and its Today tabs, newest first. */
function spaceTabs(spaceId: string, tabs: Obj[], folders: Obj[], now: number): { pinned: PinnedNode[]; today: TabItem[] } {
  const pinned: PinnedNode[] = []
  const today: TabItem[] = []
  const own = new Map<string, Obj>()
  for (const f of folders) {
    const id = str(f.id)
    if (id && f.workspaceId === spaceId) own.set(id, f)
  }
  const placed = new Map<string, PinnedFolder>()
  const place = (id: string, seen = new Set<string>()): PinnedFolder | undefined => {
    const done = placed.get(id)
    if (done) return done
    const folder = own.get(id)
    if (!folder) return undefined
    seen.add(id)
    const parentId = str(folder.parentId)
    const parent = parentId && !seen.has(parentId) ? place(parentId, seen) : undefined
    const node: PinnedFolder = { kind: 'folder', id: randomUUID(), name: str(folder.name) ?? 'Untitled folder', open: folder.collapsed !== true, children: [] }
    placed.set(id, node)
    const siblings = parent ? parent.children : pinned
    siblings.push(node)
    return node
  }

  for (const tab of tabs) {
    if (tab.zenWorkspace !== spaceId || tab.zenEssential === true) continue
    if (tab.pinned === true) {
      const item = toTab(tab, true, now)
      if (!item) continue
      const folder = typeof tab.groupId === 'string' ? place(tab.groupId) : undefined
      const siblings = folder ? folder.children : pinned
      siblings.push({ kind: 'tab', ...item })
    } else {
      const item = toTab(tab, false, now)
      if (item) today.push(item)
    }
  }
  for (const id of own.keys()) place(id) // folders with no tabs in them
  today.sort((a, b) => b.lastActive - a.lastActive)
  return { pinned, today }
}

/**
 * A pinned tab or essential opens at the URL it was pinned with (`_zenPinnedInitialState`), under the
 * name it was given (`zenStaticLabel`); other tabs at the page they show now.
 */
function toTab(tab: Obj, saved: boolean, now: number): TabItem | undefined {
  const entries = objects(tab.entries)
  const current = entries[Math.min(Math.max((num(tab.index) ?? entries.length) - 1, 0), entries.length - 1)]
  const initial = isObj(tab._zenPinnedInitialState) && isObj(tab._zenPinnedInitialState.entry) ? tab._zenPinnedInitialState.entry : undefined
  const url = saved ? (str(initial?.url) ?? str(current?.url)) : str(current?.url)
  if (!isWebUrl(url)) return undefined
  const label = str(tab.zenStaticLabel)
  const item: TabItem = {
    id: randomUUID(),
    url,
    title: label ?? (saved ? str(initial?.title) : undefined) ?? str(current?.title) ?? url,
    lastActive: num(tab.lastAccessed) ?? now
  }
  const favicon = str(tab.image)
  if (favicon && /^(data:image\/|https:)/.test(favicon)) item.favicon = favicon
  if (saved) {
    item.savedUrl = url
    if (label) item.savedTitle = label
  }
  return item
}

/** The space's primary gradient color ({ c: [r, g, b] }, 0-255), as hex. */
function themeColor(theme: unknown): string | undefined {
  const colors = objects(isObj(theme) ? theme.gradientColors : undefined)
  const c = (colors.find((x) => x.isPrimary === true) ?? colors[0])?.c
  if (!Array.isArray(c) || c.length < 3) return undefined
  const rgb = c.slice(0, 3).map(num)
  if (rgb.some((v) => v === undefined)) return undefined
  return '#' + rgb.map((v) => Math.round(Math.min(255, Math.max(0, v!))).toString(16).padStart(2, '0')).join('')
}

/** Zen stores a space's icon as an emoji, or as an icon file path/URL that YARC can't show. */
function iconEmoji(icon: unknown): string | undefined {
  const s = str(icon)
  if (!s || /^([a-z-]+:|\/)/i.test(s) || [...s].length > 4) return undefined
  return s
}
