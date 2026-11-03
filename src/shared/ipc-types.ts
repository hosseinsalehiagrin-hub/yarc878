export interface HistoryRow {
  url: string
  title: string
  time: number
  visitCount: number
}

export interface LittleState {
  url: string
  title: string
  favicon?: string
  loading: boolean
  /** The toolbar's (and window's) background: the space color mixed into near-black. */
  barColor: string
  /** The profile the page is signed in with, shown on the profile chip. */
  profileName: string
  /** The space "Open in" moves the page to. */
  spaceName: string
  /** Other spaces with this profile exist, so the "Open in…" menu has something to offer. */
  moreSpaces: boolean
}
