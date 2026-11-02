// State shared between the main process and the UI renderers.
// The main process owns the truth; renderers receive full snapshots.

export type ID = string

/** A tab-like sidebar entry. Favorites and pinned tabs keep `savedUrl` as their "home". */
export interface TabItem {
  id: ID
  url: string
  title: string
  favicon?: string
  /** Home URL for favorites and pinned tabs. Undefined for unpinned (Today) tabs. */
  savedUrl?: string
  savedTitle?: string
  /** Epoch ms of last activation, used for auto-archive and MRU. */
  lastActive: number
}

export interface PinnedTab extends TabItem {
  kind: 'tab'
}

export interface PinnedFolder {
  kind: 'folder'
  id: ID
  name: string
  open: boolean
  children: PinnedNode[]
}

export type PinnedNode = PinnedTab | PinnedFolder

export interface Profile {
  id: ID
  name: string
  /** Favorites belong to a profile, so every space using this profile shares them. */
  favorites: TabItem[]
}

export interface Split {
  id: ID
  /** 2-4 item ids shown side by side, in order. */
  itemIds: ID[]
  /** Relative widths, sums to 1. */
  sizes: number[]
}

export interface Space {
  id: ID
  name: string
  emoji?: string
  /** Theme color (hex). */
  color: string
  /** Sidebar text appearance over the theme color, from Arc; unset follows the system. */
  appearance?: 'light' | 'dark'
  profileId: ID
  pinned: PinnedNode[]
  /** Unpinned ("Today") tabs, newest first. */
  today: TabItem[]
  splits: Split[]
  activeItemId?: ID
}

export interface ArchivedTab {
  id: ID
  url: string
  title: string
  favicon?: string
  spaceId: ID
  archivedAt: number
}

export type SearchEngine = 'google' | 'duckduckgo' | 'bing' | 'kagi' | 'brave'

/** Sidebar width limits in px: dragging its edge, the Settings slider and the Arc import. */
export const SIDEBAR_WIDTH = { min: 200, max: 480 }

export interface Settings {
  sidebarVisible: boolean
  sidebarWidth: number
  sidebarRight: boolean
  /** Hours of inactivity before an unpinned tab is archived. 0 = never. */
  archiveAfterHours: number
  searchEngine: SearchEngine
  /** Open links from other apps in Little Arc (true) or as a new tab in the current space (false). */
  littleArcForExternalLinks: boolean
  /** Profile used by Little Arc windows; empty = profile of the active space. */
  littleArcProfileId: ID | ''
  /** Links from pinned tabs and favorites to other sites open in Peek instead of replacing the page. */
  peekPinnedLinks: boolean
  theme: 'system' | 'light' | 'dark'
  /** Built-in ad & tracker blocking. */
  adblock: boolean
  /** Hostnames where blocking is turned off. */
  adblockAllowlist: string[]
  /** Check for new versions at startup and every few hours (installed app only). */
  autoUpdate: boolean
}

export interface PersistedState {
  version: 1
  profiles: Profile[]
  spaces: Space[]
  activeSpaceId: ID
  settings: Settings
  archive: ArchivedTab[]
}

/** Live (runtime-only) info for an item that currently has a web page attached. */
export interface LiveInfo {
  /** webContents id, used by <browser-action-list tab=…>. */
  wcId: number
  url: string
  title: string
  favicon?: string
  loading: boolean
  audible: boolean
  muted: boolean
  canGoBack: boolean
  canGoForward: boolean
  zoom: number
  /** Ads/trackers blocked on the current page. */
  blocked: number
  /** Blocking is on for this page (globally enabled and the site isn't allowlisted). */
  shielded: boolean
}

export interface DownloadItemInfo {
  id: ID
  filename: string
  path: string
  url: string
  state: 'progressing' | 'completed' | 'cancelled' | 'interrupted'
  received: number
  total: number
  startedAt: number
}

export interface ExtensionInfo {
  id: string
  name: string
  icon?: string
}

export interface AppState extends PersistedState {
  live: Record<ID, LiveInfo>
  downloads: DownloadItemInfo[]
  extensions: Record<ID, ExtensionInfo[]>
  platform: NodeJS.Platform
  maximized: boolean
  fullscreen: boolean
  /** True while the collapsed sidebar is temporarily shown over the page. */
  sidebarPeek: boolean
  /** The command bar is open to make a new tab (the sidebar highlights "New Tab", like Arc). */
  newTabOpen: boolean
  /** The page shown in Peek, if one is open. */
  peek?: LiveInfo
  /** Where web pages currently sit in the window, so the UI can draw split handles and focus rings. */
  layout: { content: Rect; views: { id: ID; rect: Rect }[]; splitId?: ID }
  update: UpdateStatus
}

/**
 * A newer Arc Shell. Windows and macOS download it in the background ('downloading', then 'ready'
 * to restart into); Linux, and a Mac that can't replace its app, only learn it exists ('available')
 * and download it by hand.
 */
export type UpdateStatus =
  | { state: 'none' }
  | { state: 'downloading'; version: string }
  | { state: 'ready'; version: string }
  | { state: 'available'; version: string }

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export type OverlayMode =
  | { kind: 'none' }
  | { kind: 'command'; initial?: string; editCurrent?: boolean; target?: 'tab' | 'split' | 'current' }
  | { kind: 'find' }
  | { kind: 'settings' }
  | { kind: 'library'; tab?: 'archive' | 'history' | 'downloads' | 'spaces' }
  | { kind: 'space-editor'; spaceId?: ID }
  | { kind: 'sidebar' }
  | { kind: 'switcher'; order: ID[]; index: number }
  /** A Peek page floats over the content; the overlay draws the dimmed backdrop and its buttons beside `card`. */
  | { kind: 'peek'; card: Rect }

export interface SearchResult {
  kind: 'tab' | 'favorite' | 'pinned' | 'history' | 'suggestion' | 'url' | 'command' | 'archive'
  id: string
  title: string
  subtitle?: string
  url?: string
  favicon?: string
  /** For tabs: the item to activate. For commands: the command id. */
  target?: string
  spaceId?: ID
}
