// macOS self-update without an Apple Developer ID. Squirrel.Mac (electron-updater's MacUpdater)
// refuses ad-hoc-signed apps, so this does the same job itself:
//   1. download the release's zip with Node's fetch, not Chromium's download manager: files Node
//      writes get no com.apple.quarantine flag, so Gatekeeper never assesses the new version;
//   2. check the zip's Ed25519 signature (update-signature.ts) before anything touches it;
//   3. unzip into the profile folder and check the app (bundle id, version, code signature);
//   4. when Arc Shell quits, swap the new bundle in for the running one (installStaged).
// The running app's files stay in place until it quits: a helper process started from a half-
// replaced bundle would be the wrong version.
import { app } from 'electron'
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import type { MacUpdate } from './release'
import { UPDATE_PUBLIC_KEY, verifyUpdate } from './update-signature'

const run = promisify(execFile)

/** Holds the unpacked update until the app quits, then the replaced app until the next start. */
const stagingDir = (): string => path.join(app.getPath('userData'), 'Update')

/** The running .app, if it can replace itself: not in development, not translocated, and in a folder this user can write to. */
export function updatableBundle(): string | undefined {
  const bundle = path.resolve(process.execPath, '../../..')
  if (!app.isPackaged || !bundle.endsWith('.app') || bundle.includes('/AppTranslocation/')) return undefined
  try {
    fs.accessSync(path.dirname(bundle), fs.constants.W_OK)
    fs.accessSync(bundle, fs.constants.W_OK)
  } catch {
    return undefined
  }
  return bundle
}

/**
 * Removes the app replaced by the last update, or an update that was never installed. With rm, not
 * fs.rm: Electron's fs treats app.asar as a folder and leaves it behind.
 */
export async function cleanUpStaging(): Promise<void> {
  await run('/bin/rm', ['-rf', stagingDir()])
}

export interface StagedUpdate {
  /** The unpacked .app, for installStaged. */
  app: string
  /**
   * Its executable once it's installed in place of the running bundle. To relaunch with: it can have
   * another name than the running one's (the Arc Shell → YARC rename), and the bundle keeps its own.
   */
  executable: string
}

/** Downloads, verifies and unpacks the update. */
export async function stageUpdate(update: MacUpdate, version: string, bundle: string): Promise<StagedUpdate> {
  const [zip, signature] = await Promise.all([download(update.url), download(update.signatureUrl)])
  if (!verifyUpdate(update.name, zip, signature.toString('utf8'), UPDATE_PUBLIC_KEY)) {
    throw new Error(`${update.name} doesn't match its signature`)
  }
  const dir = stagingDir()
  await cleanUpStaging()
  await fs.promises.mkdir(dir, { recursive: true })
  const zipPath = path.join(dir, update.name)
  await fs.promises.writeFile(zipPath, zip)
  const unpacked = path.join(dir, 'new')
  // --noqtn: don't copy a quarantine flag from the zip onto the app (there shouldn't be one).
  await run('/usr/bin/ditto', ['-x', '-k', '--noqtn', zipPath, unpacked])
  await fs.promises.rm(zipPath)
  const apps = (await fs.promises.readdir(unpacked)).filter((name) => name.endsWith('.app'))
  if (apps.length !== 1) throw new Error(`${update.name} holds ${apps.length} apps`)
  const staged = path.join(unpacked, apps[0])
  await checkBundle(staged, bundle, version)
  return { app: staged, executable: path.join(bundle, 'Contents', 'MacOS', await plistValue(staged, 'CFBundleExecutable')) }
}

/** The new app must be this app, at the expected version, with an intact (ad-hoc) code signature. */
async function checkBundle(staged: string, bundle: string, version: string): Promise<void> {
  const id = await plistValue(staged, 'CFBundleIdentifier')
  if (id !== (await plistValue(bundle, 'CFBundleIdentifier'))) throw new Error(`The update is a different app (${id})`)
  const stagedVersion = await plistValue(staged, 'CFBundleShortVersionString')
  if (stagedVersion !== version) throw new Error(`The update is version ${stagedVersion}, not ${version}`)
  await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', staged])
  // A quarantined app would hit Gatekeeper's "Open Anyway" after the relaunch.
  const quarantined = await run('/usr/bin/xattr', ['-p', 'com.apple.quarantine', staged]).then(
    () => true,
    () => false
  )
  if (quarantined) {
    console.warn('[updater] the unpacked update is quarantined; removing the flag')
    await run('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', staged])
  }
}

async function plistValue(bundle: string, key: string): Promise<string> {
  const plist = path.join(bundle, 'Contents', 'Info.plist')
  const { stdout } = await run('/usr/bin/plutil', ['-extract', key, 'raw', '-o', '-', plist])
  return stdout.trim()
}

async function download(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15 * 60_000) })
  if (!res.ok) throw new Error(`Downloading ${url} failed: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

/**
 * Puts the staged app where the running one is. Two renames, rolled back if the second fails, so
 * the app is never left half-copied (Node has no rename-swap). Synchronous: it runs in will-quit.
 */
export function installStaged(staged: string, bundle: string): void {
  const replaced = path.join(stagingDir(), 'replaced.app')
  fs.renameSync(bundle, replaced)
  try {
    fs.renameSync(staged, bundle)
  } catch (err) {
    fs.renameSync(replaced, bundle)
    throw err
  }
}
