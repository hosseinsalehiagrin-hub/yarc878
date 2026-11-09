// The welcome screen (first run) and What's New (first launch after an update, or from the menu
// and command bar). Both are cards over the dimmed window, closed with Esc or their buttons.
import logo from '../../../../build/icon.svg'
import { bindingLabel, type CommandId } from '../../../shared/keymap'
import type { ReleaseNotes } from '../../../shared/types'
import { dispatch, isMac } from '../api'
import './panels.css'

const SHORTCUTS: { id: CommandId; label: string }[] = [
  { id: 'newTab', label: 'New tab, search or command' },
  { id: 'toggleSidebar', label: 'Show or hide the sidebar' },
  { id: 'togglePin', label: 'Pin or unpin a tab' },
  { id: 'newIncognitoWindow', label: 'New incognito window' },
  { id: 'switcherNext', label: 'Switch to a recent tab' }
]

const importFrom = (source: 'arc' | 'chrome' | 'zen') => () => dispatch({ type: 'import', source, keepOverlay: true })

export function Welcome({ close }: { close: () => void }) {
  return (
    <div className="panel intro welcome" onMouseDown={(e) => e.stopPropagation()}>
      <div className="intro-hero">
        <img className="logo" src={logo} alt="" />
        <h1>Welcome to YARC</h1>
        <p>Your spaces, pinned tabs and command bar, after Arc.</p>
      </div>
      <div className="intro-body">
        <section className="intro-step">
          <div className="intro-step-text">
            <h2>Bring your tabs</h2>
            <p>Spaces, pinned tabs, favorites and history. From Chrome: history and bookmarks.</p>
          </div>
          <div className="intro-buttons">
            <button className="btn primary" onClick={importFrom('arc')}>
              Arc
            </button>
            <button className="btn" onClick={importFrom('chrome')}>
              Chrome
            </button>
            <button className="btn" onClick={importFrom('zen')}>
              Zen
            </button>
          </div>
        </section>
        <section className="intro-step">
          <div className="intro-step-text">
            <h2>Make YARC your default browser</h2>
            <p>Links from other apps open in Little Arc.</p>
          </div>
          <div className="intro-buttons">
            <button className="btn" onClick={() => dispatch({ type: 'command', id: 'setDefaultBrowser', keepOverlay: true })}>
              Set as Default
            </button>
          </div>
        </section>
        <section className="intro-shortcuts">
          <h2>Shortcuts to know</h2>
          <ul>
            {SHORTCUTS.map((s) => (
              <li key={s.id}>
                <kbd className="kbd">{bindingLabel(s.id, isMac)}</kbd>
                <span>{s.label}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <footer className="intro-footer">
        <button className="btn ghost" onClick={close}>
          Skip
        </button>
        <span className="spacer" />
        <button className="btn primary" onClick={close}>
          Start Browsing
        </button>
      </footer>
    </div>
  )
}

export function WhatsNew({ releases, close }: { releases: ReleaseNotes[]; close: () => void }) {
  return (
    <div className="panel intro whats-new" onMouseDown={(e) => e.stopPropagation()}>
      <div className="intro-hero compact">
        <img className="logo" src={logo} alt="" />
        <h1>What's New</h1>
        {releases.length ? <p>YARC {releases[0].version}</p> : null}
      </div>
      <div className="intro-body">
        {releases.length ? (
          releases.map((r) => (
            <section key={r.version} className="release">
              {releases.length > 1 ? <h2>Version {r.version}</h2> : null}
              <ul>
                {r.changes.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </section>
          ))
        ) : (
          <p className="muted">This build has no release notes. Releases from GitHub list their changes here.</p>
        )}
      </div>
      <footer className="intro-footer">
        <span className="spacer" />
        <button className="btn primary" onClick={close}>
          Continue
        </button>
      </footer>
    </div>
  )
}
