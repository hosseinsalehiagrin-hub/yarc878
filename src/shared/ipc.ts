import type { Action } from './actions'
import type { AppState, OverlayMode, SearchResult } from './types'
import type { HistoryRow, LittleState } from './ipc-types'

export type { HistoryRow, LittleState } from './ipc-types'

export const IPC = {
  state: 'arc:state',
  overlay: 'arc:overlay',
  toast: 'arc:toast',
  find: 'arc:find',
  little: 'arc:little-state',
  edit: 'arc:edit',
  action: 'arc:action',
  getState: 'arc:get-state',
  getOverlay: 'arc:get-overlay',
  search: 'arc:search',
  suggest: 'arc:suggest',
  history: 'arc:history',
  historyDelete: 'arc:history-delete',
  littleOp: 'arc:little-op'
} as const

/** Main asks the sidebar to start inline editing (after a native context menu choice). */
export interface EditRequest {
  kind: 'rename' | 'renameFolder'
  id: string
}

/** Find-in-page results, or a request to step to the next/previous match (Cmd+G). */
export interface FindEvent {
  matches?: number
  active?: number
  step?: 1 | -1
}

/** Toolbar requests; 'sync' asks for the current state once the toolbar listens. */
export type LittleOp =
  | 'sync'
  | 'openInMain'
  | 'close'
  | 'copyUrl'
  | 'back'
  | 'forward'
  | 'reload'
  | 'profileMenu'
  | 'spaceMenu'

/** Where a Little Arc toolbar menu opens, in window coordinates. */
export interface LittleAnchor {
  x: number
  y: number
}

/** The API the preload exposes to UI renderers as `window.arc`. */
export interface ArcApi {
  platform: NodeJS.Platform
  getState(): Promise<AppState>
  getOverlay(): Promise<OverlayMode>
  onState(cb: (s: AppState) => void): () => void
  onOverlay(cb: (m: OverlayMode) => void): () => void
  onToast(cb: (text: string) => void): () => void
  onFind(cb: (f: FindEvent) => void): () => void
  onLittle(cb: (s: LittleState) => void): () => void
  onEdit(cb: (e: EditRequest) => void): () => void
  dispatch(action: Action): Promise<void>
  search(query: string): Promise<SearchResult[]>
  suggest(query: string): Promise<string[]>
  history(query: string, offset: number): Promise<HistoryRow[]>
  deleteHistory(url: string): Promise<void>
  little(op: LittleOp, at?: LittleAnchor): Promise<void>
}
