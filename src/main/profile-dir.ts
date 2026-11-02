// YARC used to be called Arc Shell. A profile from then stays where it is, so updating keeps
// everyone's spaces, tabs and logins without moving files around.
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** The profile folder for `name` ("YARC" or "YARC (dev)") inside the OS's app-data folder. */
export function profileDir(appData: string, name: string): string {
  const current = join(appData, name)
  const legacy = join(appData, name.replace('YARC', 'Arc Shell'))
  return !existsSync(current) && existsSync(legacy) ? legacy : current
}
