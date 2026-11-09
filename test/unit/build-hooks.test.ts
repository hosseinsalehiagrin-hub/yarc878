// electron-builder loads its hook scripts only while packaging, and the macOS signing hook only on
// a Mac, so a dependency bump that breaks one surfaces in the release, after the merge. Loading
// them here makes CI's check job fail first (a missing named export throws on import).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const root = new URL('../../', import.meta.url)
const config = readFileSync(new URL('electron-builder.yml', root), 'utf8')
const hooks = [...config.matchAll(/^\s*(\w+):\s*(\.\/scripts\/[\w.-]+\.m?js)\s*$/gm)].map(([, key, path]) => ({ key, path }))

test('electron-builder.yml names the afterPack and macOS sign hooks', () => {
  assert.deepEqual(
    hooks.map((h) => h.key),
    ['afterPack', 'sign']
  )
})

for (const { key, path } of hooks) {
  test(`the ${key} hook (${path}) loads and exports a function`, async () => {
    const hook = await import(new URL(path, root).href)
    assert.equal(typeof hook.default, 'function')
  })
}
