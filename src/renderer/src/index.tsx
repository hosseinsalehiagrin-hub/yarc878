// The main window UI: docked sidebar plus what sits around the web page views.
import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { dividers, dragBorder, type Divider } from '../../shared/split'
import type { AppState, UpdateStatus } from '../../shared/types'
import { activeSpace, arc, dispatch, isMac, useAppState, useSpaceTheme } from './api'
import { Icon } from './icons'
import { Sidebar } from './Sidebar'
import './styles.css'

// The window has vibrancy on macOS; the theme is drawn translucent over it.
if (isMac) document.body.classList.add('vibrant')

function App() {
  const state = useAppState()
  const space = state ? activeSpace(state) : undefined
  useSpaceTheme(space?.color, space?.appearance)
  const toast = useToast()
  if (!state || !space) return null
  const s = state.settings
  const hidden = !s.sidebarVisible
  const fullscreenPage = state.layout.views.length === 1 && state.layout.content.x === 0 && state.layout.content.y === 0

  return (
    <div className={`${isMac ? 'mac' : 'win'}${hidden ? ' sidebar-hidden' : ''}${state.fullscreen ? ' fullscreen' : ''}`} style={{ height: '100%' }}>
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
      <div className="notices">
        {toast ? <div className="toast">{toast}</div> : null}
        <UpdateNotice update={state.update} />
      </div>
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

/** Stays above the sidebar footer while an update waits, until dismissed for that version. */
function UpdateNotice({ update }: { update: UpdateStatus }) {
  const [dismissed, setDismissed] = useState('')
  if (update.state !== 'ready' && update.state !== 'available') return null
  if (dismissed === update.version) return null
  const ready = update.state === 'ready'
  return (
    <div className="toast update-notice">
      <span>
        YARC {update.version} is {ready ? 'ready' : 'available'}
      </span>
      <button className="btn primary" onClick={() => dispatch({ type: 'command', id: 'installUpdate' })}>
        {ready ? 'Restart to Update' : 'Download…'}
      </button>
      <button className="icon-btn" title="Dismiss" onClick={() => setDismissed(update.version)}>
        <Icon name="x" />
      </button>
    </div>
  )
}

/** Empty state, split view handles and the focus ring around the active split pane. */
function ContentDecor({ state }: { state: AppState }) {
  const { content, views, splitId } = state.layout
  const space = activeSpace(state)
  const drag = useRef<{ splitId: string; divider: Divider; start: number } | undefined>(undefined)

  if (views.length === 0) {
    return (
      // An empty space is a blank card, as in Arc.
      <div className="content-empty" style={{ left: content.x, top: content.y, width: content.width, height: content.height }} />
    )
  }
  const split = splitId ? space.splits.find((sp) => sp.id === splitId) : undefined
  if (!split || views.length < 2) return null
  const active = views.find((v) => v.id === space.activeItemId)
  const along = (d: Divider, e: { clientX: number; clientY: number }) => (d.dir === 'row' ? e.clientX : e.clientY)

  return (
    <>
      {active ? (
        <div className="focus-ring" style={{ left: active.rect.x - 3, top: active.rect.y - 3, width: active.rect.width + 6, height: active.rect.height + 6 }} />
      ) : null}
      {dividers(split.root, content).map((d) => {
        // A handle a little wider than the gap, so it's easy to grab.
        const rect = d.dir === 'row' ? { ...d.rect, x: d.rect.x - 2, width: d.rect.width + 4 } : { ...d.rect, y: d.rect.y - 2, height: d.rect.height + 4 }
        return (
          <div
            key={`${d.path.join('.')}-${d.index}`}
            className={`split-handle ${d.dir}`}
            style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              drag.current = { splitId: split.id, divider: d, start: along(d, e) }
            }}
            onPointerMove={(e) => {
              const g = drag.current
              if (!g) return
              const length = g.divider.dir === 'row' ? g.divider.group.width : g.divider.group.height
              const sizes = dragBorder(g.divider.sizes, g.divider.index, along(g.divider, e) - g.start, length)
              dispatch({ type: 'resizeSplit', splitId: g.splitId, path: g.divider.path, sizes })
            }}
            onPointerUp={() => (drag.current = undefined)}
            onDoubleClick={() => dispatch({ type: 'resizeSplit', splitId: split.id, path: d.path, sizes: d.sizes.map(() => 1) })}
          />
        )
      })}
    </>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
