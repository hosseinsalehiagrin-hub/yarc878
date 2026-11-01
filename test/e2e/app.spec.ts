// End-to-end tests against the built app (run `pnpm build` first; `pnpm test:e2e` does).
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Action } from '../../src/shared/actions'
import type { AppState } from '../../src/shared/types'

let app: ElectronApplication
let server: Server
let base = ''
const userData = mkdtempSync(join(tmpdir(), 'arc-shell-e2e-'))

const page = (name: string) =>
  `<!doctype html><title>Page ${name}</title><h1>${name}</h1>` +
  `<a id="blank" href="/child-of-${name}" target="_blank">open child</a>` +
  `<a id="same" href="/next-${name}">same tab</a><p>findme findme findme</p>`

async function launch(): Promise<ElectronApplication> {
  // ARC_SHELL_EXE runs the suite against a packaged app (e.g. release/win-unpacked/Arc Shell.exe).
  const exe = process.env.ARC_SHELL_EXE
  const a = await electron.launch({
    ...(exe ? { executablePath: exe, args: [] } : { args: ['out/main/index.js'] }),
    env: { ...process.env, ARC_SHELL_USER_DATA: userData, ARC_SHELL_TEST: '1' }
  })
  await a.firstWindow()
  await expect.poll(() => a.evaluate(() => !!(globalThis as { arcBrowser?: unknown }).arcBrowser)).toBe(true)
  return a
}

const state = (): Promise<AppState> => app.evaluate(() => (globalThis as any).arcBrowser.snapshot())
const dispatch = (a: Action) => app.evaluate((_e, action) => (globalThis as any).arcBrowser.dispatch(action), a)
const space = async () => {
  const s = await state()
  return s.spaces.find((x) => x.id === s.activeSpaceId)!
}

async function pageWithUrl(fragment: string): Promise<Page> {
  let found: Page | undefined
  await expect
    .poll(() => {
      found = app.windows().find((w) => w.url().includes(fragment))
      return !!found
    }, { timeout: 15_000 })
    .toBe(true)
  return found!
}

test.beforeAll(async () => {
  server = createServer((req, res) => {
    res.setHeader('content-type', 'text/html')
    res.end(page((req.url ?? '/').slice(1) || 'home'))
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  app = await launch()
})

test.afterAll(async () => {
  await app?.close()
  server?.close()
})

test('starts with a default space and the sidebar', async () => {
  const ui = await pageWithUrl('index.html')
  await expect(ui.locator('.sidebar')).toBeVisible()
  await expect(ui.locator('.space-name')).toContainText('Personal')
})

test('command bar opens a new tab at the top of Today', async () => {
  const ui = await pageWithUrl('index.html')
  await ui.locator('.newtab').click()
  const overlay = await pageWithUrl('overlay.html')
  const input = overlay.locator('.command input')
  await expect(input).toBeFocused()
  await input.fill(`${base}/one`)
  await input.press('Enter')
  await expect.poll(async () => (await space()).today[0]?.url).toBe(`${base}/one`)
  await expect.poll(async () => (await state()).live[(await space()).today[0].id]?.title).toBe('Page one')
  await expect(ui.locator('.row.active .title')).toHaveText('Page one')
})

// Playwright's synthetic keys skip Electron's before-input-event, so send real input events.
const pressInActiveTab = (keyCode: string, modifiers: string[]) =>
  app.evaluate((_e, [k, m]) => (globalThis as any).arcBrowser.activeTab().wc.sendInputEvent({ type: 'keyDown', keyCode: k, modifiers: m }), [
    keyCode,
    modifiers
  ] as const)
const mod = process.platform === 'darwin' ? 'meta' : 'control'

test('keyboard shortcut Ctrl/Cmd+T opens the command bar from a web page', async () => {
  await pageWithUrl('/one')
  await pressInActiveTab('T', [mod])
  const overlay = await pageWithUrl('overlay.html')
  await expect(overlay.locator('.command input')).toBeVisible()
  await overlay.locator('.command input').fill(`${base}/two`)
  await overlay.locator('.command input').press('Enter')
  await expect.poll(async () => (await space()).today.map((t) => t.url)).toEqual([`${base}/two`, `${base}/one`])
})

test('command bar finds and switches to open tabs', async () => {
  await dispatch({ type: 'overlay', mode: { kind: 'command', target: 'tab' } })
  const overlay = await pageWithUrl('overlay.html')
  await overlay.locator('.command input').fill('page one')
  await expect(overlay.locator('.result').first()).toContainText('Page one')
  await expect(overlay.locator('.result.sel .hint')).toContainText('Switch to Tab')
  await overlay.locator('.command input').press('Enter')
  const s = await space()
  await expect.poll(async () => (await space()).activeItemId).toBe(s.today.find((t) => t.url.endsWith('/one'))!.id)
})

test('command bar completes the top URL inline, like Arc', async () => {
  await dispatch({ type: 'overlay', mode: { kind: 'command', target: 'tab' } })
  const overlay = await pageWithUrl('overlay.html')
  const input = overlay.locator('.command input')
  await input.pressSequentially('127.0.0', { delay: 30 })
  await expect(input).toHaveValue(/^127\.0\.0\.1:\d+\//)
  // The completed part is selected, so typing on replaces it.
  expect(await input.evaluate((el: HTMLInputElement) => el.selectionStart)).toBe('127.0.0'.length)
  await input.press('Backspace')
  await expect(input).toHaveValue('127.0.0')
  await input.press('Escape')
})

test('target=_blank links open as new Today tabs', async () => {
  const tab = await pageWithUrl('/one')
  await tab.locator('#blank').click()
  await expect.poll(async () => (await space()).today[0]?.url).toBe(`${base}/child-of-one`)
  await expect.poll(async () => (await space()).activeItemId).toBe((await space()).today[0].id)
})

test('Ctrl/Cmd+S toggles the sidebar and the page grows', async () => {
  const before = (await state()).layout.content
  await pressInActiveTab('S', [mod])
  await expect.poll(async () => (await state()).settings.sidebarVisible).toBe(false)
  expect((await state()).layout.content.width).toBeGreaterThan(before.width)
  await pressInActiveTab('S', [mod])
  await expect.poll(async () => (await state()).settings.sidebarVisible).toBe(true)
})

test('dragging the sidebar edge resizes the sidebar and the page', async () => {
  const ui = app.windows().find((w) => w.url().endsWith('index.html'))!
  const drag = async (dx: number) => {
    const box = (await ui.locator('.sidebar-resize').boundingBox())!
    const x = box.x + box.width / 2
    const y = box.y + 200
    await ui.mouse.move(x, y)
    await ui.mouse.down()
    await ui.mouse.move(x + dx, y, { steps: 5 })
    await ui.mouse.up()
  }
  const before = (await state()).settings.sidebarWidth
  await drag(60)
  await expect.poll(async () => (await state()).settings.sidebarWidth).toBe(before + 60)
  await expect.poll(async () => (await state()).layout.content.x).toBe(before + 60)
  // Clamped at the minimum width.
  await drag(-1000)
  await expect.poll(async () => (await state()).settings.sidebarWidth).toBe(200)
  await dispatch({ type: 'settings', patch: { sidebarWidth: before } })
})

test('pinning keeps the saved URL; closing a pinned tab resets it', async () => {
  const one = (await space()).today.find((t) => t.url.endsWith('/one'))!
  await dispatch({ type: 'activate', id: one.id })
  await dispatch({ type: 'togglePin', id: one.id })
  let s = await space()
  const pinned = s.pinned.find((n) => n.id === one.id)
  expect(pinned && pinned.kind === 'tab' ? pinned.savedUrl : undefined).toBe(`${base}/one`)
  const tab = await pageWithUrl('/one')
  await tab.locator('#same').click()
  await expect.poll(async () => (await state()).live[one.id]?.url).toBe(`${base}/next-one`)
  const ui = await pageWithUrl('index.html')
  await expect(ui.locator('.row .slash')).toHaveCount(1)
  await dispatch({ type: 'close', id: one.id })
  s = await space()
  const after = s.pinned.find((n) => n.id === one.id)
  expect(after?.kind === 'tab' ? after.url : '').toBe(`${base}/one`)
  expect((await state()).live[one.id]).toBeUndefined()
})

test('links from a pinned tab to another site open in Peek', async () => {
  await dispatch({ type: 'open', url: `${base}/peekhome`, where: 'tab' })
  const home = (await space()).today[0]
  await dispatch({ type: 'togglePin', id: home.id })
  // localhost is another site than 127.0.0.1.
  const away = `${base.replace('127.0.0.1', 'localhost')}/elsewhere`
  const tab = await pageWithUrl('/peekhome')
  await tab.evaluate((href) => document.body.insertAdjacentHTML('beforeend', `<a id="away" href="${href}">away</a>`), away)
  // A real click: Playwright's would wait for the navigation Peek cancels, and its page handle
  // stays stuck on it afterwards.
  const clickAway = async () => {
    await app.evaluate(async (_e, id) => {
      const wc = (globalThis as any).arcBrowser.live.get(id).wc
      const r = await wc.executeJavaScript('JSON.parse(JSON.stringify(document.getElementById("away").getBoundingClientRect()))')
      const at = { x: Math.round(r.x + 4), y: Math.round(r.y + 4) }
      for (const type of ['mouseDown', 'mouseUp']) wc.sendInputEvent({ type, ...at, button: 'left', clickCount: 1 })
    }, home.id)
    await expect.poll(async () => (await state()).peek?.url).toBe(away)
  }

  await clickAway()
  expect((await state()).live[home.id]?.url).toBe(`${base}/peekhome`)
  const overlay = await pageWithUrl('overlay.html')
  await expect(overlay.locator('.peek-buttons button')).toHaveCount(3)
  await pressInActiveTab('Escape', [])
  await expect.poll(async () => (await state()).peek).toBeUndefined()

  await clickAway()
  await overlay.locator('.peek-buttons button[title^="Open as a tab"]').click()
  await expect.poll(async () => (await space()).today[0]?.url).toBe(away)
  const s = await space()
  expect(s.activeItemId).toBe(s.today[0].id)
  expect((await state()).peek).toBeUndefined()
  expect((await state()).live[home.id]?.url).toBe(`${base}/peekhome`)
})

test('favorites live at the top and belong to the profile', async () => {
  const two = (await space()).today.find((t) => t.url.endsWith('/two'))!
  await dispatch({ type: 'addFavorite', id: two.id })
  const s = await state()
  const profile = s.profiles.find((p) => p.id === (s.spaces.find((x) => x.id === s.activeSpaceId)!.profileId))!
  expect(profile.favorites.map((f) => f.id)).toContain(two.id)
  const ui = await pageWithUrl('index.html')
  await expect(ui.locator('.favorite')).toHaveCount(1)
})

test('split view shows two pages side by side and can be closed', async () => {
  await dispatch({ type: 'open', url: `${base}/left`, where: 'tab' })
  await dispatch({ type: 'open', url: `${base}/right`, where: 'split' })
  await expect.poll(async () => (await state()).layout.views.length).toBe(2)
  const views = (await state()).layout.views
  expect(views[0].rect.x + views[0].rect.width).toBeLessThan(views[1].rect.x)
  await dispatch({ type: 'unsplit' })
  await expect.poll(async () => (await state()).layout.views.length).toBe(1)
})

test('closing a Today tab archives it and it can be reopened', async () => {
  const s = await space()
  const left = s.today.find((t) => t.url.endsWith('/left'))!
  await dispatch({ type: 'close', id: left.id })
  expect((await space()).today.some((t) => t.id === left.id)).toBe(false)
  expect((await state()).archive[0].url).toBe(`${base}/left`)
  await dispatch({ type: 'reopenClosed' })
  await expect.poll(async () => (await space()).today[0]?.url).toBe(`${base}/left`)
})

test('find in page counts matches', async () => {
  await dispatch({ type: 'open', url: `${base}/findpage`, where: 'tab' })
  await pageWithUrl('/findpage')
  await expect.poll(async () => (await state()).live[(await space()).activeItemId!]?.loading).toBe(false)
  await dispatch({ type: 'overlay', mode: { kind: 'find' } })
  const overlay = await pageWithUrl('overlay.html')
  await overlay.locator('.findbar input').fill('findme')
  await expect(overlay.locator('.findbar .count')).toHaveText(/\/3$/)
  await dispatch({ type: 'stopFind' })
})

test('spaces with their own profile do not share storage', async () => {
  await dispatch({ type: 'open', url: `${base}/storage`, where: 'tab' })
  const a = await pageWithUrl('/storage')
  await a.evaluate(() => localStorage.setItem('who', 'space-a'))
  const firstSpace = (await state()).activeSpaceId
  await dispatch({ type: 'createSpace', name: 'Work', emoji: '💼', color: '#3fa7d6', profileId: 'new' })
  const s = await state()
  expect(s.spaces).toHaveLength(2)
  expect(s.activeSpaceId).not.toBe(firstSpace)
  expect(s.spaces[0].profileId).not.toBe(s.spaces[1].profileId)
  await dispatch({ type: 'open', url: `${base}/storage-b`, where: 'tab' })
  const b = await pageWithUrl('/storage-b')
  expect(await b.evaluate(() => localStorage.getItem('who'))).toBeNull()
  // Same origin, different profile: cookies are separate too.
  await b.evaluate(() => (document.cookie = 'k=b'))
  expect(await a.evaluate(() => document.cookie)).not.toContain('k=b')
  await dispatch({ type: 'switchSpace', id: firstSpace })
  expect((await state()).activeSpaceId).toBe(firstSpace)
})

test('Little Arc opens a mini window and can move the page into the main window', async () => {
  await dispatch({ type: 'littleArc', url: `${base}/little` })
  await pageWithUrl('little.html')
  await pageWithUrl('/little')
  const count = (await space()).today.length
  await app.evaluate(() => {
    const b = (globalThis as any).arcBrowser
    const l = [...b.littles][0]
    l.op('openInMain')
  })
  await expect.poll(async () => (await space()).today.length).toBe(count + 1)
  expect((await space()).today[0].url).toBe(`${base}/little`)
})

test('built-in ad blocking blocks ad requests and can be turned off per site', async () => {
  test.setTimeout(90_000)
  // The filter lists download on first start; wait for the engine.
  await expect.poll(() => app.evaluate(() => !!(globalThis as any).arcBrowser.adblock.engine), { timeout: 60_000 }).toBe(true)
  await dispatch({ type: 'open', url: `${base}/ads`, where: 'tab' })
  await expect.poll(async () => (await state()).live[(await space()).activeItemId!]?.loading).toBe(false)
  const id = (await space()).activeItemId!
  // Injected from the main process: a Playwright-attached page doesn't survive the reload below in packaged builds.
  await app.evaluate(
    (_e, src) => (globalThis as any).arcBrowser.activeTab().wc.executeJavaScript(src),
    `for (const src of ['https://securepubads.g.doubleclick.net/tag/js/gpt.js', 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js']) {
      const s = document.createElement('script'); s.src = src; document.head.appendChild(s)
    }`
  )
  await expect.poll(async () => (await state()).live[id]?.blocked ?? 0).toBeGreaterThanOrEqual(2)
  expect((await state()).live[id].shielded).toBe(true)
  await dispatch({ type: 'adblockToggleSite' })
  expect((await state()).settings.adblockAllowlist).toContain('127.0.0.1')
  await expect.poll(async () => (await state()).live[id]?.shielded).toBe(false)
  await dispatch({ type: 'adblockToggleSite' })
  expect((await state()).settings.adblockAllowlist).not.toContain('127.0.0.1')
})

// What Windows/macOS do when Arc Shell is the default browser: start a second instance with the URL.
function launchSecondInstance(arg: string): void {
  const exe = process.env.ARC_SHELL_EXE
  const env = { ...process.env, ARC_SHELL_USER_DATA: userData, ARC_SHELL_TEST: '1' }
  const child = exe
    ? spawn(exe, ['--', arg], { env, stdio: 'ignore' })
    : spawn(require('electron') as unknown as string, ['out/main/index.js', arg], { env, stdio: 'ignore' })
  child.unref()
}

test('links and .html files from other apps open in Little Arc', async () => {
  const littles = () => app.evaluate(() => (globalThis as any).arcBrowser.littles.size as number)
  const before = await littles()
  launchSecondInstance(`${base}/from-slack`)
  await expect.poll(littles, { timeout: 15_000 }).toBe(before + 1)
  await pageWithUrl('/from-slack')
  const file = join(userData, 'local page.html')
  writeFileSync(file, '<title>Local file</title><h1>local</h1>')
  launchSecondInstance(file)
  await expect.poll(littles, { timeout: 15_000 }).toBe(before + 2)
  await pageWithUrl('local%20page.html')
  await app.evaluate(() => {
    for (const l of (globalThis as any).arcBrowser.littles) l.win.close()
  })
  await expect.poll(littles).toBe(0)
})

test('updates: command bar check, then a notice and menu item once one is found', async () => {
  await dispatch({ type: 'overlay', mode: { kind: 'command', target: 'tab' } })
  const overlay = await pageWithUrl('overlay.html')
  await overlay.locator('.command input').fill('updates')
  await expect(overlay.locator('.result', { hasText: 'Check for Updates' })).toHaveCount(1)
  await expect(overlay.locator('.result', { hasText: 'Download Arc Shell' })).toHaveCount(0)
  await dispatch({ type: 'overlay', mode: { kind: 'none' } })

  // The real check needs the installed app; pretend it found a release.
  await app.evaluate(() => (globalThis as any).arcBrowser.updater.set({ state: 'available', version: '99.0.0' }))
  const ui = await pageWithUrl('index.html')
  await expect(ui.locator('.update-notice')).toContainText('Arc Shell 99.0.0 is available')
  if (process.platform === 'darwin') {
    const labels = await app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.items[0].submenu!.items.map((i) => i.label))
    expect(labels).toContain('Update Available…')
  }
  await dispatch({ type: 'overlay', mode: { kind: 'command', target: 'tab' } })
  await overlay.locator('.command input').fill('download arc')
  await expect(overlay.locator('.result', { hasText: 'Download Arc Shell 99.0.0…' })).toHaveCount(1)
  await dispatch({ type: 'overlay', mode: { kind: 'none' } })

  await ui.locator('.update-notice .icon-btn').click()
  await expect(ui.locator('.update-notice')).toHaveCount(0)
  await app.evaluate(() => (globalThis as any).arcBrowser.updater.set({ state: 'none' }))
})

test('pages cannot turn themselves into window-drag areas', async () => {
  // Like Linear's web app: a page-sized `-webkit-app-region: drag` would otherwise swallow
  // every click over the page, including on the overlay panels above it.
  const html = '<div id="d" style="-webkit-app-region: drag !important; position: fixed; inset: 0">drag me</div>'
  await dispatch({ type: 'open', url: `data:text/html,${encodeURIComponent(html)}`, where: 'tab' })
  const page = await pageWithUrl('data:text/html')
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.getElementById('d')!).getPropertyValue('-webkit-app-region')))
    .toBe('no-drag')
})

test('state survives a restart', async () => {
  const before = await state()
  await app.close()
  app = await launch()
  const after = await state()
  expect(after.spaces.map((s) => s.name)).toEqual(before.spaces.map((s) => s.name))
  expect(after.spaces[0].pinned.length).toBe(before.spaces[0].pinned.length)
  expect(after.profiles[0].favorites.length).toBe(before.profiles[0].favorites.length)
})

test('menu bar commands reopen the closed main window (macOS)', async () => {
  test.skip(process.platform !== 'darwin', 'macOS keeps the app running without windows')
  await app.evaluate(() => (globalThis as any).arcBrowser.window.win.close())
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(0)
  await app.evaluate(({ Menu }) => {
    const items = (m: Electron.Menu): Electron.MenuItem[] => m.items.flatMap((i) => [i, ...(i.submenu ? items(i.submenu) : [])])
    items(Menu.getApplicationMenu()!).find((i) => i.label === 'New Tab')!.click()
  })
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
  await expect.poll(() => app.evaluate(() => (globalThis as any).arcBrowser.window.overlayMode.kind)).toBe('command')
})

test('Little Arc can move its page into a closed main window (macOS)', async () => {
  test.skip(process.platform !== 'darwin', 'macOS keeps the app running without windows')
  await app.evaluate(() => (globalThis as any).arcBrowser.window.win.close())
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(0)
  await app.evaluate((_e, url) => (globalThis as any).arcBrowser.openLittle(url), `${base}/little-closed`)
  await pageWithUrl('/little-closed')
  await app.evaluate(() => [...(globalThis as any).arcBrowser.littles][0].op('openInMain'))
  await expect.poll(async () => (await space()).today.some((t) => t.url.endsWith('/little-closed'))).toBe(true)
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
})
