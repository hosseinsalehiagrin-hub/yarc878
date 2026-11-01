import { useEffect, useState } from 'react'
import type { Action } from '../../shared/actions'
import type { ArcApi } from '../../shared/ipc'
import type { AppState, OverlayMode, Space } from '../../shared/types'

declare global {
  interface Window {
    arc: ArcApi
  }
}

export const arc = window.arc
export const isMac = arc.platform === 'darwin'
export const dispatch = (a: Action) => void arc.dispatch(a)

export function useAppState(): AppState | undefined {
  const [state, setState] = useState<AppState>()
  useEffect(() => {
    let alive = true
    void arc.getState().then((s) => alive && setState(s))
    const off = arc.onState(setState)
    return () => {
      alive = false
      off()
    }
  }, [])
  return state
}

export function useOverlayMode(): OverlayMode {
  const [mode, setMode] = useState<OverlayMode>({ kind: 'none' })
  useEffect(() => {
    void arc.getOverlay().then(setMode)
    return arc.onOverlay(setMode)
  }, [])
  return mode
}

export function activeSpace(state: AppState): Space {
  return state.spaces.find((s) => s.id === state.activeSpaceId) ?? state.spaces[0]
}

/** Applies the space theme color (and, for the sidebar, its light/dark appearance) to the document. */
export function useSpaceTheme(color: string | undefined, appearance?: 'light' | 'dark'): void {
  useEffect(() => {
    if (!color) return
    const root = document.documentElement
    root.style.setProperty('--space', color)
  }, [color])
  useEffect(() => {
    const root = document.documentElement
    if (appearance) root.dataset.appearance = appearance
    else delete root.dataset.appearance
  }, [appearance])
}

export function faviconFor(favicon?: string): string | undefined {
  return favicon && !favicon.startsWith('chrome://') ? favicon : undefined
}

export function displayHost(url: string): string {
  try {
    const u = new URL(url)
    if (u.protocol === 'about:') return url
    return u.hostname.replace(/^www\./, '') || url
  } catch {
    return url
  }
}
