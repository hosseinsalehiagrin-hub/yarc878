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

Windows: unit + e2e + installed. macOS (2026-11-01, Apple silicon): unit + e2e pass, `dist:mac --dir` packages and launches. Checked on macOS by driving the app through `ARC_SHELL_TEST` (no real keyboard/trackpad/screen capture available to the agent):

- Import from Arc with real data: spaces in Arc's order, profile names, favorites, pinned tabs and folders, archive and history all import. Arc's named space icons (`customInfo.iconType.icon`, Ionicons names) are mapped to emoji. Gaps: untitled spaces become "Space N"; spaces without a theme get palette colors.
- Shortcuts from a focused page `<input>` via `sendInputEvent`: Cmd+L/D/S/W/, , Ctrl+2, Ctrl+Tab with Ctrl keyup. Cmd+W never closes the window (the Window menu role has no Close item on macOS).
- Traffic lights: hidden with the sidebar, shown during hover-peek and back after; no gap in native fullscreen. Links from other apps open Little Arc.
- Fixed: the closed main window (app keeps running on macOS) crashed menu-bar commands, the overlay blur handler, toasts, Little Arc's "Open in Arc Shell" and external links.

Still needs a human on a Mac:

1. Traffic lights' visual alignment with the top bar; window dragging from the sidebar and from the drag strip when the sidebar is hidden.
2. Two-finger horizontal swipe on the sidebar (direction and sensitivity like Arc).
3. Real keystrokes through the native menu: Cmd+C/V/X/A/Z in pages and the command bar, Cmd+Q, Arc shortcuts not also firing a menu item.
4. Default browser from the installed app; `.html` via `open-file`.
5. Gatekeeper first launch of the DMG from the release; README instructions accurate.
6. Visual polish vs. Arc on macOS: matched side by side with Arc (2026-11-01): vibrancy + grain, per-space light/dark appearance, sidebar metrics, Arc favicons, ⌘T command bar (position, colors, inline completion). Still to compare: dark-appearance spaces, hover/active states, split view, Little Arc.

Comparing with real Arc: with Screen Recording and Accessibility granted to the Claude Code `claude.app` (not Claude.app), `screencapture -R` and System Events work. Arc's menu bar (via System Events, `AXMenuItemCmdChar`/`AXMenuItemCmdModifiers`) is the source for its default shortcuts; they aren't stored in any file.

Updates (`src/main/updater.ts`): Windows auto-updates with electron-updater (NSIS, unsigned is fine) from the GitHub release's `latest.yml`. macOS is notify-only until there's a Developer ID (Squirrel.Mac refuses ad-hoc signatures): it polls `releases/latest` on the GitHub API and opens the arch's DMG. Packaged builds only; not yet tried end to end against a real published release.

Releases: v0.1.2 is the first release meant for publishing (ad blocking plus the Windows fixes from #3; CI drafts it from the `v0.1.2` tag). The v0.1.0 and v0.1.1 drafts predate those fixes and are to be deleted.
