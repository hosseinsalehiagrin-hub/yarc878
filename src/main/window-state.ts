// What each main window shows, kept free of Electron so unit tests can import it.
//
// All windows share the sidebar's contents. What differs per window (its space, the tab each space
// shows, split views, sidebar visibility) is a WindowView. The state's own `activeSpaceId`,
// `space.activeItemId`, `space.splits` and `settings.sidebarVisible` always hold the *current*
// window's values: switching windows captures them into the old window's view and applies the new one.
import { paneIds, removePane } from '../shared/split.ts'
import { spaceItems } from '../shared/tree.ts'
import type { ID, PersistedState, Rect, Space, Split, WindowView } from '../shared/types'

/** A view with the state's current values: the first window of a profile that has no saved windows. */
export function viewFromState(state: PersistedState, id: ID): WindowView {
  const view: WindowView = { id, activeSpaceId: state.activeSpaceId, selected: {}, splits: {}, sidebarVisible: state.settings.sidebarVisible }
  captureView(state, view)
  return view
}

/** A new window's view, like Arc's ⌘N: the given space, no tab selected, no splits, the sidebar shown. */
export function newView(id: ID, spaceId: ID, bounds?: Rect): WindowView {
  return { id, activeSpaceId: spaceId, selected: {}, splits: {}, sidebarVisible: true, bounds }
}

/** Copies the current window's values from the state into its view. */
export function captureView(state: PersistedState, view: WindowView): void {
  view.activeSpaceId = state.activeSpaceId
  view.selected = {}
  view.splits = {}
  for (const s of state.spaces) {
    if (s.activeItemId) view.selected[s.id] = s.activeItemId
    if (s.splits.length) view.splits[s.id] = s.splits
  }
  view.sidebarVisible = state.settings.sidebarVisible
}

/** Puts a window's values into the state, making it the current window. */
export function applyView(state: PersistedState, view: WindowView): void {
  state.activeSpaceId = spaceOf(state, view)
  for (const s of state.spaces) {
    s.activeItemId = selectedIn(state, s, view)
    s.splits = splitsIn(state, s, view)
  }
  state.settings.sidebarVisible = view.sidebarVisible
}

/** The state as a window other than the current one shows it (for its UI), without changing the state. */
export function stateForView<T extends PersistedState>(state: T, view: WindowView): T {
  return {
    ...state,
    activeSpaceId: spaceOf(state, view),
    spaces: state.spaces.map((s) => ({ ...s, activeItemId: selectedIn(state, s, view), splits: splitsIn(state, s, view) })),
    settings: { ...state.settings, sidebarVisible: view.sidebarVisible }
  }
}

/** Whether a tab is selected, or in a split, in any of these windows. */
export function inAnyView(views: WindowView[], id: ID): boolean {
  return views.some(
    (v) => Object.values(v.selected).includes(id) || Object.values(v.splits).some((list) => list.some((sp) => paneIds(sp.root).includes(id)))
  )
}

/**
 * Where a new window goes: offset down and right from `from`, like macOS cascades windows, and
 * back to the work area's top-left corner when that would leave the work area.
 */
export function cascade(from: Rect, area: Rect, step = 22): Rect {
  const width = Math.min(from.width, area.width)
  const height = Math.min(from.height, area.height)
  let x = from.x + step
  let y = from.y + step
  if (x + width > area.x + area.width) x = area.x
  if (y + height > area.y + area.height) y = area.y
  return { x, y, width, height }
}

/** The window's space; a deleted one falls back to the first space. */
function spaceOf(state: PersistedState, view: WindowView): ID {
  return state.spaces.some((s) => s.id === view.activeSpaceId) ? view.activeSpaceId : state.spaces[0].id
}

/** The tab the window shows in a space, if it's still in that space (another window may have moved or closed it). */
function selectedIn(state: PersistedState, space: Space, view: WindowView): ID | undefined {
  const id = view.selected[space.id]
  return id && spaceItems(state, space).some((i) => i.id === id) ? id : undefined
}

/** The window's splits in a space, without tabs that have left the space since. */
function splitsIn(state: PersistedState, space: Space, view: WindowView): Split[] {
  const list = view.splits[space.id]
  if (!list?.length) return []
  const here = new Set(spaceItems(state, space).map((i) => i.id))
  return list.flatMap((sp) => {
    let root: Split['root'] | undefined = sp.root
    for (const id of paneIds(sp.root)) if (root && !here.has(id)) root = removePane(root, id)
    if (!root || paneIds(root).length < 2) return []
    return root === sp.root ? [sp] : [{ ...sp, root }]
  })
}
