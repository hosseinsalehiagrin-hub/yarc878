// The transparent overlay above web pages: command bar, find bar, tab switcher, the
// floating sidebar and the settings/library/space panels.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { bindingLabel, type CommandId } from '../../shared/keymap'
import { findItem } from '../../shared/tree'
import type { AppState, OverlayMode, Rect, SearchResult } from '../../shared/types'
import { activeSpace, arc, dispatch, displayHost, isMac, useAppState, useOverlayMode, useSpaceTheme } from './api'
import { Favicon, Icon, type IconName } from './icons'
import { Library } from './panels/Library'
import { Settings } from './panels/Settings'
import { SpaceEditor } from './panels/SpaceEditor'
import { Sidebar } from './Sidebar'
import './styles.css'

const close = () => dispatch({ type: 'overlay', mode: { kind: 'none' } })

function App() {
  const state = useAppState()
  const mode = useOverlayMode()
  const space = state ? activeSpace(state) : undefined
  // The command bar and panels follow the system, like Arc; only the peeking sidebar takes the space's appearance.
  useSpaceTheme(space?.color, mode.kind === 'sidebar' ? space?.appearance : undefined)
  // Remount panels each time they open so inputs start fresh.
  const [generation, setGeneration] = useState(0)
  const last = useRef<OverlayMode['kind']>('none')
  useEffect(() => {
    if (mode.kind !== last.current) setGeneration((g) => g + 1)
    last.current = mode.kind
  }, [mode])

  if (!state || mode.kind === 'none') return null
  const key = `${mode.kind}-${generation}`
  switch (mode.kind) {
    case 'sidebar':
      return (
        <div className={`${isMac ? 'mac' : 'win'}${state.fullscreen ? ' fullscreen' : ''}`} style={{ height: '100%' }}>
          <Sidebar state={state} floating />
        </div>
      )
    case 'find':
      return <FindBar key={key} />
    case 'switcher':
      return <Switcher state={state} order={mode.order} index={mode.index} />
    case 'command':
      return (
        <>
          <div className="scrim clear" onMouseDown={close} />
          <CommandBar key={key} state={state} mode={mode} />
        </>
      )
    case 'settings':
      return (
        <>
          <div className="scrim" onMouseDown={close} />
          <Settings key={key} state={state} close={close} />
        </>
      )
    case 'library':
      return (
        <>
          <div className="scrim" onMouseDown={close} />
          <Library key={`${key}-${mode.tab}`} state={state} close={close} initialTab={mode.tab} />
        </>
      )
    case 'space-editor':
      return (
        <>
          <div className="scrim" onMouseDown={close} />
          <SpaceEditor key={`${key}-${mode.spaceId}`} state={state} close={close} spaceId={mode.spaceId} />
        </>
      )
    case 'peek':
      return <PeekFrame card={mode.card} />
  }
}

// ------------------------------------------------------------------ peek

/** The dimmed page behind a Peek card and Arc's buttons beside it; the card itself is a web view on top. */
function PeekFrame({ card }: { card: Rect }) {
  const peek = (op: 'close' | 'expand' | 'split') => () => dispatch({ type: 'peek', op })
  return (
    <>
      <div className="scrim" onMouseDown={peek('close')} />
      <div className="peek-buttons" style={{ left: card.x + card.width, top: card.y, width: card.x }}>
        <button title="Close (Esc)" onClick={peek('close')}>
          <Icon name="x" />
        </button>
        <button title={`Open as a tab (${isMac ? '⌘O' : 'Ctrl+O'})`} onClick={peek('expand')}>
          <Icon name="expand" />
        </button>
        <button title="Open in split view" onClick={peek('split')}>
          <Icon name="split" />
        </button>
      </div>
    </>
  )
}

// ------------------------------------------------------------------ command bar

/** Arc shows five rows: the top hit, the search for what was typed, then the rest. */
const MAX_RESULTS = 5

/** What Arc's inline completion shows for a URL: no scheme, no www., no trailing slash. */
const completionText = (url: string) => url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')

const KIND_ICON: Partial<Record<SearchResult['kind'], IconName>> = {
  suggestion: 'search',
  history: 'clock',
  command: 'command',
  url: 'globe',
  archive: 'archive'
}

function CommandBar({ state, mode }: { state: AppState; mode: Extract<OverlayMode, { kind: 'command' }> }) {
  const [query, setQuery] = useState(mode.initial ?? '')
  const [local, setLocal] = useState<SearchResult[]>([])
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [sel, setSel] = useState(0)
  /** Arc-style inline completion after the typed text, shown selected. */
  const [suffix, setSuffix] = useState('')
  const typing = useRef(false)
  const input = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const target = mode.target ?? 'tab'

  useEffect(() => {
    input.current?.focus()
    if (mode.editCurrent) input.current?.select()
  }, [mode.editCurrent])

  useEffect(() => {
    let alive = true
    void arc.search(query).then((r) => {
      if (!alive) return
      setLocal(r)
      setSel(0)
    })
    const t = setTimeout(() => void arc.suggest(query).then((s) => alive && setSuggestions(s)), 120)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [query])

  const results = useMemo(() => {
    const seen = new Set(local.map((r) => r.title.toLowerCase()))
    const extra: SearchResult[] = suggestions
      .filter((s) => !seen.has(s.toLowerCase()))
      .map((s) => ({ kind: 'suggestion', id: `sug:${s}`, title: s, url: s, subtitle: '' }))
    // The top hit first, then the search for the query, then tabs/commands/history and the other suggestions.
    const all = [...local, ...extra]
    const search = all.findIndex((r, i) => i > 0 && r.kind === 'suggestion')
    if (search > 1) all.splice(1, 0, ...all.splice(search, 1))
    return all.slice(0, MAX_RESULTS)
  }, [local, suggestions])

  // Complete the top hit's URL inline while typing forward (not after deleting).
  useEffect(() => {
    const top = results[0]
    if (!typing.current || !query || !top?.url || !/^https?:/i.test(top.url)) return setSuffix('')
    const shown = completionText(top.url)
    setSuffix(shown.toLowerCase().startsWith(query.toLowerCase()) ? shown.slice(query.length) : '')
  }, [results, query])

  useLayoutEffect(() => {
    if (suffix) input.current?.setSelectionRange(query.length, query.length + suffix.length)
  }, [suffix, query])

  useEffect(() => {
    listRef.current?.querySelector('.result.sel')?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  const run = (r: SearchResult | undefined, alt = false) => {
    if (!r) {
      if (query.trim()) dispatch({ type: 'open', url: query, where: target === 'split' ? 'split' : target === 'current' ? 'current' : 'tab' })
      return
    }
    if ((r.kind === 'tab' || r.kind === 'favorite' || r.kind === 'pinned') && r.target) {
      close()
      dispatch(target === 'split' || alt ? { type: 'splitWith', id: r.target } : { type: 'activate', id: r.target })
      return
    }
    if (r.kind === 'command' && r.target) {
      if (r.target.startsWith('space:')) {
        close()
        dispatch({ type: 'switchSpace', id: r.target.slice(6) })
      } else dispatch({ type: 'command', id: r.target })
      return
    }
    if (r.kind === 'archive' && r.target) return dispatch({ type: 'archiveRestore', id: r.target })
    const where = alt || target === 'split' ? 'split' : target === 'current' ? 'current' : 'tab'
    dispatch({ type: 'open', url: r.url ?? r.title, where })
  }

  const placeholder = target === 'split' ? 'Open in split view…' : target === 'current' ? 'Edit URL or search…' : 'Search or Enter URL…'

  return (
    <div className="panel command" onMouseDown={(e) => e.stopPropagation()}>
      <div className="field">
        <Icon name="search" size={18} />
        <input
          ref={input}
          value={query + suffix}
          placeholder={placeholder}
          spellCheck={false}
          onChange={(e) => {
            const value = e.target.value
            typing.current = (e.nativeEvent as InputEvent).inputType?.startsWith('insert') ?? false
            // Typing through the completion keeps the rest of it until new results arrive.
            const shown = query + suffix
            setSuffix(typing.current && suffix && shown.toLowerCase().startsWith(value.toLowerCase()) ? shown.slice(value.length) : '')
            setQuery(value)
          }}
          onKeyDown={(e) => {
            if (suffix && (e.key === 'ArrowRight' || e.key === 'End')) {
              // Accept the completion.
              typing.current = false
              setQuery(query + suffix)
              setSuffix('')
            } else if (e.key === 'ArrowDown') {
              e.preventDefault()
              setSel((s) => Math.min(results.length - 1, s + 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setSel((s) => Math.max(0, s - 1))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              run(results[sel], e.shiftKey)
            }
          }}
        />
        {target === 'split' ? <span className="target">Split View</span> : null}
      </div>
      {results.length > 0 ? (
        <div className="results" ref={listRef}>
          {results.map((r, i) => (
            <ResultRow key={r.id} r={r} sel={i === sel} activeSpaceId={state.activeSpaceId} onHover={() => setSel(i)} onClick={(e) => run(r, e.shiftKey)} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function ResultRow({
  r,
  sel,
  activeSpaceId,
  onHover,
  onClick
}: {
  r: SearchResult
  sel: boolean
  activeSpaceId: string
  onHover: () => void
  onClick: (e: React.MouseEvent) => void
}) {
  const icon = KIND_ICON[r.kind]
  let hint = ''
  if (r.kind === 'tab' || r.kind === 'pinned' || r.kind === 'favorite') hint = r.spaceId && r.spaceId !== activeSpaceId ? 'Switch to Space & Tab' : 'Switch to Tab'
  else if (r.kind === 'command' && r.target && !r.target.startsWith('space:')) hint = bindingLabel(r.target as CommandId, isMac)
  else if (r.kind === 'archive') hint = 'Restore'
  const isTab = r.kind === 'tab' || r.kind === 'pinned' || r.kind === 'favorite'
  // Arc shows tabs by title only, and history as "Title — host".
  const subtitle = isTab ? '' : r.kind === 'history' && r.url ? `— ${displayHost(r.url)}` : r.subtitle
  return (
    <div className={`result${sel ? ' sel' : ''}`} onMouseMove={sel ? undefined : onHover} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      <span className="ico">{icon ? <Icon name={icon} /> : <Favicon url={r.url ?? ''} favicon={r.favicon} />}</span>
      <span className="text">
        <span className="t">{r.title}</span>
        {subtitle ? <span className="s">{subtitle}</span> : null}
      </span>
      {hint ? <span className="hint">{hint}</span> : null}
      {isTab ? (
        <span className="go">
          <Icon name="forward" size={14} />
        </span>
      ) : null}
    </div>
  )
}

// ------------------------------------------------------------------ find bar

function FindBar() {
  const [query, setQuery] = useState('')
  const [count, setCount] = useState<{ active: number; matches: number }>()
  const input = useRef<HTMLInputElement>(null)
  const queryRef = useRef('')
  queryRef.current = query

  useEffect(() => {
    input.current?.focus()
    return arc.onFind((f) => {
      if (f.step) {
        if (queryRef.current) dispatch({ type: 'find', query: queryRef.current, forward: f.step > 0, findNext: true })
        input.current?.focus()
      } else if (f.matches !== undefined) setCount({ active: f.active ?? 0, matches: f.matches })
    })
  }, [])

  return (
    <div className="findbar">
      <Icon name="search" size={15} />
      <input
        ref={input}
        value={query}
        placeholder="Find in page"
        spellCheck={false}
        onChange={(e) => {
          setQuery(e.target.value)
          if (!e.target.value) setCount(undefined)
          dispatch({ type: 'find', query: e.target.value })
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && query) dispatch({ type: 'find', query, forward: !e.shiftKey, findNext: true })
        }}
      />
      {count && query ? (
        <span className="count">
          {count.matches ? count.active : 0}/{count.matches}
        </span>
      ) : null}
      <button className="icon-btn" title="Previous" onClick={() => query && dispatch({ type: 'find', query, forward: false, findNext: true })}>
        <Icon name="up" />
      </button>
      <button className="icon-btn" title="Next" onClick={() => query && dispatch({ type: 'find', query, forward: true, findNext: true })}>
        <Icon name="down" />
      </button>
      <button className="icon-btn" title="Close" onClick={() => dispatch({ type: 'stopFind' })}>
        <Icon name="x" />
      </button>
    </div>
  )
}

// ------------------------------------------------------------------ ctrl+tab switcher

function Switcher({ state, order, index }: { state: AppState; order: string[]; index: number }) {
  const visible = order.slice(0, 8)
  return (
    <>
      <div className="scrim" style={{ background: 'transparent' }} />
      <div className="panel switcher">
        {visible.map((id, i) => {
          const item = findItem(state, id)?.item
          if (!item) return null
          const live = state.live[id]
          return (
            <div key={id} className={`switch-card${i === index % visible.length ? ' sel' : ''}`}>
              <Favicon url={item.url} favicon={live?.favicon ?? item.favicon} />
              <span className="t">{item.savedTitle || live?.title || item.title}</span>
            </div>
          )
        })}
      </div>
    </>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
