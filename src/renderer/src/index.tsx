// The main window UI: docked sidebar plus what sits around the web page views.
import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { AppState } from '../../shared/types'
import { activeSpace, arc, dispatch, isMac, useAppState, useSpaceTheme } from './api'
import { Sidebar } from './Sidebar'
import './styles.css'

function App() {
  const state = useAppState()
  const space = state ? activeSpace(state) : undefined
  useSpaceTheme(space?.color)
  const toast = useToast()
  if (!state || !space) return null
  const s = state.settings
  const hidden = !s.sidebarVisible
  const fullscreenPage = state.layout.views.length === 1 && state.layout.content.x === 0 && state.layout.content.y === 0

  return (
    <div className={`${isMac ? 'mac' : 'win'}${hidden ? ' sidebar-hidden' : ''}`} style={{ height: '100%' }}>
      {!hidden && !fullscreenPage ? <Sidebar state={state} /> : null}
      {hidden ? (
        <>
          <div className="drag-strip" />
          <div
            className="peek-strip"
            style={s.sidebarRight ? { right: 0 } : { left: 0 }}
            onMouseEnter={() => dispatch({ type: 'sidebarPeek', show: true })}
          />
        </>
      ) : null}
      <ContentDecor state={state} />
      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  )
}

function useToast(): string | undefined {
  const [text, setText] = useState<string>()
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(
    () =>
      arc.onToast((t) => {
        setText(t)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setText(undefined), 2200)
      }),
    []
  )
  return text
}

/** Empty state, split view handles and the focus ring around the active split pane. */
function ContentDecor({ state }: { state: AppState }) {
  const { content, views, splitId } = state.layout
  const space = activeSpace(state)
  const drag = useRef<{ splitId: string; index: number; startX: number; sizes: number[] } | undefined>(undefined)

  if (views.length === 0) {
    return (
      <div className="content-empty" style={{ left: content.x, top: content.y, width: content.width, height: content.height }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
            {space.emoji} {space.name}
          </div>
          Press <kbd>{isMac ? '⌘T' : 'Ctrl+T'}</kbd> to open a tab
          <br />
          <kbd>{isMac ? '⌘S' : 'Ctrl+S'}</kbd> toggles the sidebar · <kbd>{isMac ? '⌃⇧=' : 'Ctrl+Shift+='}</kbd> splits the view
        </div>
      </div>
    )
  }
  if (!splitId || views.length < 2) return null
  const split = space.splits.find((sp) => sp.id === splitId)
  const active = views.find((v) => v.id === space.activeItemId)

  return (
    <>
      {active ? (
        <div className="focus-ring" style={{ left: active.rect.x - 3, top: active.rect.y - 3, width: active.rect.width + 6, height: active.rect.height + 6 }} />
      ) : null}
      {views.slice(0, -1).map((v, i) => (
        <div
          key={v.id}
          className="split-handle"
          style={{ left: v.rect.x + v.rect.width - 2, top: v.rect.y, width: 10, height: v.rect.height }}
          onPointerDown={(e) => {
            if (!split) return
            e.currentTarget.setPointerCapture(e.pointerId)
            drag.current = { splitId: split.id, index: i, startX: e.clientX, sizes: [...split.sizes] }
          }}
          onPointerMove={(e) => {
            const d = drag.current
            if (!d) return
            const delta = (e.clientX - d.startX) / content.width
            const sizes = [...d.sizes]
            const a = Math.max(0.15, sizes[d.index] + delta)
            const b = Math.max(0.15, sizes[d.index + 1] - (a - sizes[d.index]))
            sizes[d.index] = sizes[d.index] + sizes[d.index + 1] - b
            sizes[d.index + 1] = b
            dispatch({ type: 'resizeSplit', splitId: d.splitId, sizes })
          }}
          onPointerUp={() => (drag.current = undefined)}
          onDoubleClick={() => split && dispatch({ type: 'resizeSplit', splitId: split.id, sizes: split.sizes.map(() => 1) })}
        />
      ))}
    </>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
