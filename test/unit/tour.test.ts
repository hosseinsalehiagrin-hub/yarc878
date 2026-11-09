import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { isFloating, nextStep, previousStep, stepAfter, TOUR_STEPS } from '../../src/shared/tour.ts'

describe('The tour goes on when the user does what a step asks', () => {
  test('pressing the step’s shortcut moves to the next step', () => {
    assert.equal(stepAfter('command', 'newTab'), 'pin')
    assert.equal(stepAfter('pin', 'togglePin'), 'split')
    assert.equal(stepAfter('incognito', 'newIncognitoWindow'), 'done')
  })

  test('hiding the sidebar, then bringing it back, are two steps', () => {
    assert.equal(stepAfter('spaces', 'toggleSidebar'), 'peek')
    assert.equal(stepAfter('peek', 'toggleSidebar'), 'command')
  })

  test('making a split view completes the split step', () => {
    assert.equal(stepAfter('split', 'split'), 'little')
  })

  test('anything else leaves the step where it is', () => {
    assert.equal(stepAfter('pin', 'newTab'), 'pin')
    assert.equal(stepAfter('split', 'togglePin'), 'split')
  })

  test('setup steps only go on with their buttons', () => {
    assert.equal(stepAfter('welcome', 'newTab'), 'welcome')
    assert.equal(stepAfter('import', 'toggleSidebar'), 'import')
    assert.equal(stepAfter('done', 'newTab'), 'done')
  })
})

describe('Back and Next walk the steps in order', () => {
  test('from the welcome to the end', () => {
    const walked = ['welcome']
    for (let s = nextStep('welcome'); s; s = nextStep(s)) walked.push(s)
    assert.deepEqual(walked, TOUR_STEPS)
  })

  test('nothing before the first step or after the last', () => {
    assert.equal(previousStep('welcome'), undefined)
    assert.equal(nextStep('done'), undefined)
    assert.equal(previousStep('import'), 'welcome')
  })
})

test('try-it steps float over the page; setup steps and the last one are centered cards', () => {
  assert.deepEqual(
    TOUR_STEPS.filter((s) => isFloating(s)),
    ['spaces', 'peek', 'command', 'pin', 'split', 'little', 'incognito']
  )
})
