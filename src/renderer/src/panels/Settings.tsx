// Settings sheet: general options, profiles, import, extensions, shortcuts, about.
import { useState, type ReactNode } from 'react'
import logo from '../../../../build/icon.svg'
import { BINDINGS, bindingLabel } from '../../../shared/keymap'
import { SIDEBAR_WIDTH, type AppState, type Profile, type SearchEngine, type Settings as SettingsT } from '../../../shared/types'
import { SEARCH_ENGINES } from '../../../shared/url'
import { activeSpace, dispatch, isMac } from '../api'
import { Icon } from '../icons'
import './panels.css'

type Section = 'general' | 'profiles' | 'import' | 'extensions' | 'shortcuts' | 'about'

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'profiles', label: 'Profiles' },
  { id: 'import', label: 'Import' },
  { id: 'extensions', label: 'Extensions' },
  { id: 'shortcuts', label: 'Keyboard Shortcuts' },
  { id: 'about', label: 'About' }
]

const ARCHIVE_OPTIONS: { hours: number; label: string }[] = [
  { hours: 0, label: 'Never' },
  { hours: 12, label: 'After 12 hours' },
  { hours: 24, label: 'After 24 hours' },
  { hours: 168, label: 'After 7 days' },
  { hours: 720, label: 'After 30 days' }
]

const patch = (p: Partial<SettingsT>) => dispatch({ type: 'settings', patch: p })

export function Settings({ state, close }: { state: AppState; close: () => void }) {
  const [section, setSection] = useState<Section>('general')
  return (
    <div className="panel sheet">
      <header>
        <span>Settings</span>
        <span className="spacer" />
        <button className="icon-btn" title="Close" onClick={close}>
          <Icon name="x" />
        </button>
      </header>
      <div className="tabs" role="tablist">
        {SECTIONS.map((s) => (
          <button key={s.id} role="tab" aria-selected={section === s.id} className={section === s.id ? 'on' : ''} onClick={() => setSection(s.id)}>
            {s.label}
          </button>
        ))}
      </div>
      <div className="body">
        {section === 'general' && <General state={state} />}
        {section === 'profiles' && <Profiles state={state} />}
        {section === 'import' && <Import />}
        {section === 'extensions' && <Extensions state={state} />}
        {section === 'shortcuts' && <Shortcuts />}
        {section === 'about' && <About />}
      </div>
    </div>
  )
}

function Row({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="field-row">
      <label>
        <span>{title}</span>
        {hint && <small>{hint}</small>}
      </label>
      {children}
    </div>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <input type="checkbox" role="switch" aria-label={label} className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
}

function General({ state }: { state: AppState }) {
  const s = state.settings
  // Local value so the slider stays smooth while main catches up.
  const [width, setWidth] = useState(s.sidebarWidth)
  const space = activeSpace(state)
  const spaceProfile = state.profiles.find((p) => p.id === space.profileId)
  const archiveKnown = ARCHIVE_OPTIONS.some((o) => o.hours === s.archiveAfterHours)
  return (
    <>
      <Row title="Search engine" hint="Used for searches typed in the command bar.">
        <select value={s.searchEngine} onChange={(e) => dispatch({ type: 'searchEngine', engine: e.target.value as SearchEngine })}>
          {(Object.keys(SEARCH_ENGINES) as SearchEngine[]).map((k) => (
            <option key={k} value={k}>
              {SEARCH_ENGINES[k].name}
            </option>
          ))}
        </select>
      </Row>
      <Row title="Appearance">
        <select value={s.theme} onChange={(e) => patch({ theme: e.target.value as SettingsT['theme'] })}>
          <option value="system">Match system</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </Row>
      <Row title="Archive unpinned tabs" hint="Tabs in Today that you haven't used for a while move to the Archive.">
        <select value={s.archiveAfterHours} onChange={(e) => patch({ archiveAfterHours: Number(e.target.value) })}>
          {!archiveKnown && <option value={s.archiveAfterHours}>After {s.archiveAfterHours} hours</option>}
          {ARCHIVE_OPTIONS.map((o) => (
            <option key={o.hours} value={o.hours}>
              {o.label}
            </option>
          ))}
        </select>
      </Row>
      <Row title="Sidebar width">
        <span>
          <input
            type="range"
            min={SIDEBAR_WIDTH.min}
            max={SIDEBAR_WIDTH.max}
            step={2}
            value={width}
            onChange={(e) => {
              const v = Number(e.target.value)
              setWidth(v)
              patch({ sidebarWidth: v })
            }}
          />
          <span className="range-value">{width}px</span>
        </span>
      </Row>
      <Row title="Block ads and trackers" hint="Built in, using uBlock Origin / EasyList-compatible lists. Turn it off per site from the shield in the URL bar.">
        <Toggle label="Block ads and trackers" checked={s.adblock} onChange={(v) => patch({ adblock: v })} />
      </Row>
      <Row
        title="Check for updates automatically"
        hint={
          state.platform === 'win32'
            ? 'New versions download in the background and install when you restart YARC.'
            : 'You’re told when a new version is out, and install it yourself.'
        }
      >
        <Toggle label="Check for updates automatically" checked={s.autoUpdate} onChange={(v) => patch({ autoUpdate: v })} />
      </Row>
      <Row title="Sidebar on the right" hint="Arc never had this.">
        <Toggle label="Sidebar on the right" checked={s.sidebarRight} onChange={(v) => patch({ sidebarRight: v })} />
      </Row>
      <Row title="Open links from other apps in Little Arc" hint="When off, they open as a new tab in the current space.">
        <Toggle label="Open links from other apps in Little Arc" checked={s.littleArcForExternalLinks} onChange={(v) => patch({ littleArcForExternalLinks: v })} />
        <Toggle label="Open other sites from pinned tabs and favorites in Peek" checked={s.peekPinnedLinks} onChange={(v) => patch({ peekPinnedLinks: v })} />
      </Row>
      <Row title="Little Arc profile" hint="Which logins and history Little Arc windows use.">
        <select value={s.littleArcProfileId} onChange={(e) => patch({ littleArcProfileId: e.target.value })}>
          <option value="">Current space's profile{spaceProfile ? ` (now: ${spaceProfile.name})` : ''}</option>
          {state.profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Row>
    </>
  )
}

function Profiles({ state }: { state: AppState }) {
  return (
    <>
      <p className="note">
        A profile keeps its own logins, cookies, history, favorites and extensions. Each space uses one profile; several spaces can share one. Change a
        space's profile from its Edit sheet.
      </p>
      {state.profiles.map((p) => (
        <ProfileRow key={p.id} profile={p} state={state} />
      ))}
    </>
  )
}

function ProfileRow({ profile, state }: { profile: Profile; state: AppState }) {
  const [draft, setDraft] = useState(profile.name)
  const spaces = state.spaces.filter((s) => s.profileId === profile.id)
  const commit = () => {
    const name = draft.trim()
    if (!name) return setDraft(profile.name)
    if (name !== profile.name) dispatch({ type: 'renameProfile', id: profile.id, name })
  }
  return (
    <div className="profile-row">
      <input
        className="text-input"
        aria-label="Profile name"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
      />
      <div className="used-by">
        {spaces.length === 0 && <span className="muted">Not used by any space</span>}
        {spaces.map((s) => (
          <span key={s.id} className="chip">
            {s.emoji ? <span>{s.emoji}</span> : <span className="swatch" style={{ background: s.color, width: 8, height: 8 }} />}
            {s.name}
          </span>
        ))}
      </div>
    </div>
  )
}

function Import() {
  return (
    <>
      <p className="note">
        Arc shuts down on 22 Dec 2026. Bring your spaces, pinned tabs, favorites and history over now. You can also pick an Arc folder copied from a Mac
        (<code>~/Library/Application Support/Arc</code>).
      </p>
      <Row title="Arc" hint="Spaces, pinned tabs, folders, favorites and history.">
        <button className="btn primary" onClick={() => dispatch({ type: 'import', source: 'arc' })}>
          Import from Arc…
        </button>
      </Row>
      <Row title="Chromium browsers" hint="History and bookmarks.">
        <button className="btn" onClick={() => dispatch({ type: 'import', source: 'chrome' })}>
          Import from Chrome / Edge / Brave…
        </button>
      </Row>
    </>
  )
}

function Extensions({ state }: { state: AppState }) {
  const space = activeSpace(state)
  const profile = state.profiles.find((p) => p.id === space.profileId)
  const list = state.extensions[space.profileId] ?? []
  return (
    <>
      <div className="toolbar">
        <button className="btn primary" onClick={() => dispatch({ type: 'extensionsStore' })}>
          Get extensions from the Chrome Web Store
        </button>
      </div>
      <p className="note">
        Extensions are installed per profile, so they only show up in spaces that use the same profile. Showing{' '}
        <strong>{profile?.name ?? 'this profile'}</strong> (used by {space.emoji ? `${space.emoji} ` : ''}
        {space.name}).
      </p>
      {list.length === 0 && <div className="empty-state">No extensions installed in this profile yet.</div>}
      {list.map((x) => (
        <div key={x.id} className="list-row">
          {x.icon ? <img className="fav-img" src={x.icon} alt="" /> : <Icon name="puzzle" />}
          <span className="t">{x.name}</span>
          <span className="s">{x.id}</span>
        </div>
      ))}
    </>
  )
}

function Shortcuts() {
  const rows: { title: string; keys: string }[] = []
  for (const b of BINDINGS) {
    const m = /^(space|tab)(\d)$/.exec(b.id)
    if (m && m[2] !== '1') continue
    const keys = bindingLabel(b.id, isMac)
    if (!keys) continue
    if (m) rows.push({ title: m[1] === 'space' ? 'Switch to Space 1–9' : 'Go to Tab 1–9', keys: `${keys}–9` })
    else rows.push({ title: b.title, keys })
  }
  return (
    <>
      <p className="note">Shortcuts follow Arc's defaults{isMac ? '' : ' on Windows'}. They can't be changed yet.</p>
      <table className="shortcuts">
        <tbody>
          {rows.map((r) => (
            <tr key={r.title}>
              <td>{r.title}</td>
              <td>
                <span className="kbd">{r.keys}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

function About() {
  return (
    <div className="about">
      <img className="logo" src={logo} alt="" />
      <h2>YARC</h2>
      <div className="muted">Yarrr! Yet Another Arc Clone: an open-source, Arc-style browser. Not affiliated with The Browser Company.</div>
    </div>
  )
}
