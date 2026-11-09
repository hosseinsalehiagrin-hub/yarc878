import assert from 'node:assert/strict'
import { test } from 'node:test'
import { changesFromBody, dayKey, pendingReleases, promptDue } from '../../src/main/update-notes.ts'

const body = (...titles: string[]) =>
  [
    'Downloads: Windows `YARC-Setup-*-x64.exe` …',
    '',
    "## What's Changed",
    ...titles,
    '',
    '**Full Changelog**: https://github.com/yenebeb/yarc/compare/v0.1.30...v0.1.31'
  ].join('\r\n')

test('reads PR titles from generated release notes', () => {
  const changes = changesFromBody(
    body(
      '* Windows pass: keep the command bar open by @yenebeb in https://github.com/yenebeb/yarc/pull/38',
      '* Bump electron from 45.2.1 to 45.2.3 by @dependabot[bot] in https://github.com/yenebeb/yarc/pull/28',
      '* Release 0.1.2 by @yenebeb in https://github.com/yenebeb/yarc/pull/4',
      '* Use native caption buttons, like Arc for Windows by @yenebeb in https://github.com/yenebeb/yarc/pull/39'
    )
  )
  assert.deepEqual(changes, ['Windows pass: keep the command bar open', 'Use native caption buttons, like Arc for Windows'])
})

test('a release without generated notes has no changes', () => {
  assert.deepEqual(changesFromBody(null), [])
  assert.deepEqual(changesFromBody('Just a hand-written note'), [])
})

test('lists every version between the running one and the download, newest first', () => {
  const releases = [
    { tag_name: 'v0.1.33', body: body('* Not yet downloaded by @a in https://x/pull/9') },
    { tag_name: 'v0.1.32', body: body('* Daily relaunch card by @a in https://x/pull/8'), draft: false },
    { tag_name: 'v0.1.31', body: body('* Caption buttons by @a in https://x/pull/7') },
    { tag_name: 'v0.1.30', body: '' },
    { tag_name: 'v0.1.29', body: body('* Already running by @a in https://x/pull/6') },
    { tag_name: 'v0.1.34', body: '', draft: true }
  ]
  assert.deepEqual(pendingReleases(releases, '0.1.29', '0.1.32'), [
    { version: '0.1.32', changes: ['Daily relaunch card'] },
    { version: '0.1.31', changes: ['Caption buttons'] },
    { version: '0.1.30', changes: [] }
  ])
})

test('the relaunch card is due once per local calendar day', () => {
  const morning = new Date(2026, 10, 9, 8, 30)
  const evening = new Date(2026, 10, 9, 23, 59)
  const nextDay = new Date(2026, 10, 10, 0, 1)
  assert.equal(dayKey(morning), '2026-11-09')
  assert.equal(promptDue(undefined, morning), true)
  assert.equal(promptDue(dayKey(morning), evening), false)
  assert.equal(promptDue(dayKey(evening), nextDay), true)
})
