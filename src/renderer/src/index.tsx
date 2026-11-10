// The main window UI: docked sidebar plus what sits around the web page views.
import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { dividers, dragBorder, type Divider } from '../../shared/split'
import type { AppState } from '../../shared/types'
import { activeSpace, arc, dispatch, isMac, useAppState, useSpaceTheme } from './api'
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
      {!isMac && !state.fullscreen && !fullscreenPage ? <CaptionStrip state={state} /> : null}
      {hidden ? (
        <>
          {isMac ? <div className="drag-strip" /> : null}
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
      </div>
    </div>
  )
}

/** The title bar strip above the page, beside the native caption buttons (Windows, Linux): drags the window. */
function CaptionStrip({ state }: { state: AppState }) {
  const { content } = state.layout
  const s = state.settings
  // Over the sidebar too where nothing of it is up there: when it's hidden or on the right (styles.css).
  const left = s.sidebarVisible && !s.sidebarRight ? content.x : 0
  return <div className="caption-strip" style={{ left, right: 0, height: content.y }} />
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

/** Still images of pages another window shows live (IPC.snapshot), by item id. */
function useStills(): Record<string, string> {
  const [stills, setStills] = useState<Record<string, string>>({})
  useEffect(() => arc.onSnapshot(({ id, image }) => setStills((s) => ({ ...s, [id]: image }))), [])
  return stills
}

/** Empty state, pages shown in another window, split view handles and the focus ring around the active split pane. */
function ContentDecor({ state }: { state: AppState }) {
  const { content, views, splitId } = state.layout
  const space = activeSpace(state)
  const drag = useRef<{ splitId: string; divider: Divider; start: number } | undefined>(undefined)
  const stills = useStills()

  if (views.length === 0) {
    return (
      // An empty space is a blank card, as in Arc.
      <div className="content-empty" style={{ left: content.x, top: content.y, width: content.width, height: content.height }} />
    )
  }
  // A page can be live in one window only; here it shows as it last looked. A click brings it back.
  const elsewhere = views
    .filter((v) => v.elsewhere)
    .map((v) => (
      <button
        key={`still-${v.id}`}
        className="content-elsewhere"
        style={{ left: v.rect.x, top: v.rect.y, width: v.rect.width, height: v.rect.height }}
        title="Open in another window. Click to show it here."
        onClick={() => dispatch({ type: 'activate', id: v.id })}
      >
        {stills[v.id] ? <img src={stills[v.id]} alt="" /> : null}
      </button>
    ))
  const split = splitId ? space.splits.find((sp) => sp.id === splitId) : undefined
  if (!split || views.length < 2) return <>{elsewhere}</>
  const active = views.find((v) => v.id === space.activeItemId)
  const along = (d: Divider, e: { clientX: number; clientY: number }) => (d.dir === 'row' ? e.clientX : e.clientY)

  return (
    <>
      {elsewhere}
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
