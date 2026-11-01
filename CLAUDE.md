# Arc Shell — notes for Claude sessions

Open-source Arc-browser replacement (Electron 45 / Chromium 156, React 19, TypeScript 7, electron-vite 6). Arc shuts down 2026-12-22; the goal is to match Arc's behavior as closely as possible, with **macOS as the main platform** (most Arc users), Windows second.

## Commands

- `pnpm install` (postinstall downloads the Electron binary) · `pnpm dev` · `pnpm build`
- `pnpm typecheck` · `pnpm test` (unit, `node --test`) · `pnpm test:e2e` (builds, then Playwright drives the real app)
- `pnpm dist:mac` / `dist:win` → installers in `release/`. Releases: bump version, push a `v*` tag, CI fills a draft GitHub release.

## Architecture (see README "How it works")

- Main process owns all state: `src/main/browser.ts` (controller), persisted in `state.json` via `src/main/store.ts`. Renderers get full snapshots and send typed `Action`s (`src/shared/actions.ts`).
- Window = UI webContents (sidebar) under per-tab `WebContentsView`s, plus a transparent overlay view on top for the command bar/panels (`src/main/window.ts`).
- One session partition per profile (`persist:profile-<id>`): extensions (`extensions.ts`), ad blocking (`adblock.ts`), history (`history.ts`, `node:sqlite`). Spaces map to profiles; favorites belong to profiles.
- Shortcuts are matched in `before-input-event` on every webContents (`src/shared/keymap.ts`, physical key codes). Playwright's synthetic keys bypass this — e2e tests use `wc.sendInputEvent`.
- Research notes in `docs/`: Arc behavior & shortcuts (`arc-reference.md`), Arc's `StorableSidebar.json` format (`arc-data-format.md`), Electron/Google sign-in/packaging gotchas (`electron-notes.md`).

## Decisions already made (don't re-litigate)

- Google sign-in needs Electron's own UA (only the app-name token stripped); a spoofed Chrome UA is rejected. Chrome Sync is impossible for non-Chrome browsers → import instead.
- Built-in ad blocking (Ghostery engine) because Electron has no `declarativeNetRequest`. Uses a custom adapter, not `enableBlockingInSession` (global IPC handlers break with multiple sessions).
- Unsigned builds: macOS ad-hoc signed (`identity: "-"`), not notarized.

## Status / next steps

Built and tested on Windows only (unit + e2e + installed). The macOS build comes from CI but has **never been run by hand**. Next session (on a Mac), verify and fix:

1. Traffic lights: position in the sidebar top bar, hidden with the sidebar, shown during hover-peek; window dragging from the sidebar.
2. Two-finger horizontal swipe on the sidebar switches spaces (direction and sensitivity like Arc).
3. App menu (Edit → Cmd+C/V/X/A/Z in pages and in the command bar), Cmd+Q, Cmd+W closing tabs not the window, Cmd+, settings.
4. Arc shortcuts while focus is in a page text field (Cmd+T/L/S/D etc.), Ctrl+1–9 spaces, Ctrl+Tab switcher keyup on Ctrl.
5. Default browser (`setAsDefaultProtocolClient`), links from other apps → Little Arc (`open-url`), `.html` via `open-file`.
6. Gatekeeper first launch of the DMG from the release; README instructions accurate.
7. **Import from Arc with real data** (`~/Library/Application Support/Arc`) — the parser was written from docs/fixtures only; check spaces, profiles, favorites, folders, colors/emoji, history.
8. Visual polish vs. Arc on macOS (vibrancy, sidebar colors, fonts, dark mode).

Pending: v0.1.0 is an unpublished draft release without ad blocking; plan was to release v0.1.1 (with ad blocking) and delete the v0.1.0 draft.
