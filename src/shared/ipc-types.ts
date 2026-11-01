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
  canGoBack: boolean
  canGoForward: boolean
  color: string
}
