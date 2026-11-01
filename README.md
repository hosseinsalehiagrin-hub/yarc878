# Arc Shell

An open-source browser that works like [Arc](https://arc.net), for everyone who loved it and needs somewhere to go now that Arc is shutting down (22 December 2026).

Built on Electron (Chromium), for Windows and macOS. Not affiliated with The Browser Company.

## What's in it

- **Vertical sidebar** with the URL pill, extension buttons, navigation and window controls. Hide it with `Ctrl/⌘+S`, and it reappears when you hover the window edge.
- **Spaces** with their own name, emoji and color theme. Switch between them by swiping on the sidebar, with `Ctrl+1–9` (macOS) / `Alt+1–9` (Windows), or with `⌥⌘←/→` / `Ctrl+Alt+←/→`.
- **Profiles per space.** Each space gets its own profile by default, which means separate cookies and logins, storage, history and extensions. Spaces can also share a profile, like Arc.
- **Favorites** at the top of the sidebar (shared by every space on the same profile), **pinned tabs and folders**, and **Today** tabs that archive themselves after 12 hours (configurable).
- **Pinned tab behavior** like Arc: a `/` shows when you've browsed away and you can jump back to the pinned URL, and closing a pinned tab only unloads it.
- **Command bar** (`Ctrl/⌘+T`). It searches open tabs in every space, history, commands, archived tabs and search suggestions. `Ctrl/⌘+L` edits the current URL.
- **Split view** (`Ctrl+Shift+=`). Use up to four panes, with draggable dividers. Shift-click a tab to add it.
- **Little Arc** (`Ctrl+Alt+N` / `⌘⌥N`): a mini window for quick lookups and for links opened from other apps. "Open in Arc Shell" moves the page into your sidebar without reloading.
- **Ctrl+Tab switcher** ordered by most recently used, plus find in page, the archive, history, downloads and zoom.
- **Chrome extensions** installed straight from the Chrome Web Store, separately for each profile.
- **Import from Arc**: spaces, pinned tabs, folders, favorites, profiles, archive and history. It works on the Mac or Windows machine where Arc lives, or from a copy of the Arc folder.
- **Import from Chrome, Edge or Brave**: history and bookmarks.
- **Open in Chrome** (`Ctrl/⌘+Alt+O`) for the occasional site that only accepts a managed Google Chrome.

The full shortcut list is in Settings → Keyboard shortcuts, and in [docs/arc-reference.md](docs/arc-reference.md).

## Install

Download the latest installer from the [Releases](https://github.com/yenebeb/arc-shell/releases) page.

- **Windows:** run `Arc Shell Setup x.y.z.exe`. It installs just for you and doesn't need admin rights. The app isn't code-signed yet, so SmartScreen may warn you: click **More info → Run anyway**. To make it your default browser, go to Settings → Apps → Default apps → Arc Shell.
- **macOS:** open the `.dmg` that matches your Mac (`arm64` for Apple Silicon, `x64` for Intel) and drag Arc Shell to Applications. The app isn't notarized, so the first launch is blocked. Go to **System Settings → Privacy & Security → Open Anyway**, or run `xattr -dr com.apple.quarantine "/Applications/Arc Shell.app"`.

## Moving from Arc

1. Install Arc Shell on the computer where Arc is installed.
2. Open the command bar (`Ctrl/⌘+T`) and run **Import from Arc**. You'll find the same option under Settings → Import.
3. To import from a Mac onto a Windows PC, first copy `~/Library/Application Support/Arc` from the Mac. Then choose **Use a Different Copy…** and pick that folder.

Logins, cookies and saved passwords are **not** imported, because browsers encrypt them per machine. Sign in to your sites again, and export your passwords from Arc (`arc://settings/passwords`) into your password manager before Arc shuts down.

### What about Google sync?

Google only lets Google Chrome use Chrome Sync (since 2021), so no third-party browser can sync your Google bookmarks or history. You **can** sign in to Google websites (Gmail, Drive, Workspace SSO) normally. To bring over your Chrome history and bookmarks, use **Import from Chrome**.

## Develop

Requires Node 22.12+ (24 recommended).

```bash
npm install
npm run dev        # run with hot reload
npm test           # unit tests
npm run test:e2e   # builds, then drives the real app with Playwright
npm run dist       # build installers into release/
```

The code is organized like this:

| Path | What |
| --- | --- |
| `src/main/browser.ts` | The controller: spaces, tabs, splits, archive, shortcuts, actions |
| `src/main/window.ts` | Window layout: UI underneath, page views, overlay on top |
| `src/main/tab.ts` | A live web page (`WebContentsView`) attached to a sidebar item |
| `src/main/profiles.ts` | One Electron session per profile, permissions, downloads |
| `src/main/extensions.ts` | Chrome extension APIs and the Chrome Web Store per profile |
| `src/main/importers/` | Arc and Chromium importers |
| `src/shared/` | State types, actions, keymap and pure helpers (unit tested) |
| `src/renderer/` | React UI: sidebar (`index`), command bar and panels (`overlay`), Little Arc |

The state lives in one JSON file (`state.json` in the app's user-data folder), and each profile keeps its history in `Profiles/<id>/history.sqlite`.

## Known limitations

- Chrome extensions that rely on `declarativeNetRequest` load but can't block anything yet. That includes uBlock Origin Lite.
- There is no Boosts, Easels, Notes or Peek yet.
- There are no multiple windows yet. Little Arc windows are separate.

## License

GPL-3.0-or-later. "Arc" is a trademark of The Browser Company; this project is an independent, unaffiliated re-implementation of its interaction design.
