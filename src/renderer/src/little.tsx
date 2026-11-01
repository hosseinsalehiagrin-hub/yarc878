// Little Arc toolbar.
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { LittleState } from '../../shared/ipc'
import { arc, displayHost, isMac, useSpaceTheme } from './api'
import { Icon } from './icons'
import './styles.css'

function App() {
  const [s, setS] = useState<LittleState>()
  useEffect(() => arc.onLittle(setS), [])
  useSpaceTheme(s?.color)
  useEffect(() => {
    if (s?.title) document.title = s.title
  }, [s?.title])

  return (
    <div className={isMac ? 'mac' : 'win'}>
      <div className="little-bar">
        <button className="icon-btn" disabled={!s?.canGoBack} onClick={() => void arc.little('back')} title="Back">
          <Icon name="back" />
        </button>
        <button className="icon-btn" disabled={!s?.canGoForward} onClick={() => void arc.little('forward')} title="Forward">
          <Icon name="forward" />
        </button>
        <button className="icon-btn" onClick={() => void arc.little('reload')} title="Reload">
          <Icon name="reload" />
        </button>
        <span className="title" title={s?.url}>
          {s ? s.title || displayHost(s.url) : ''}
        </span>
        <button className="icon-btn" onClick={() => void arc.little('copyUrl')} title="Copy URL">
          <Icon name="copy" />
        </button>
        <button className="open-main" onClick={() => void arc.little('openInMain')} title={`Open in Arc Shell (${isMac ? '⌘O' : 'Ctrl+O'})`}>
          Open in Arc Shell
        </button>
        {!isMac ? (
          <button className="icon-btn" onClick={() => void arc.little('close')} title="Close">
            <Icon name="x" />
          </button>
        ) : null}
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
