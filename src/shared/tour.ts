// The first-run tour: setup steps (import, default browser), then one step per thing worth knowing,
// most of which go on by themselves once the user has tried them. Arc's own onboarding works the
// same way: a setup wizard, then its "Welcome to Arc" basics (new tab, pinning, spaces, split view).
import type { CommandId } from './keymap'

export type TourStep = 'welcome' | 'import' | 'default' | 'spaces' | 'peek' | 'command' | 'pin' | 'split' | 'little' | 'incognito' | 'done'

export const TOUR_STEPS: TourStep[] = ['welcome', 'import', 'default', 'spaces', 'peek', 'command', 'pin', 'split', 'little', 'incognito', 'done']

/** What the user does to try a step: run a command (by shortcut, menu or command bar) or make a split. */
export type TourEvent = CommandId | 'split'

/** The try-it steps and what completes them. */
const TRY: Partial<Record<TourStep, TourEvent>> = {
  spaces: 'toggleSidebar',
  peek: 'toggleSidebar',
  command: 'newTab',
  pin: 'togglePin',
  split: 'split',
  little: 'littleArc',
  incognito: 'newIncognitoWindow'
}

export function tryEvent(step: TourStep): TourEvent | undefined {
  return TRY[step]
}

/**
 * Try-it steps float over the page as a small card, so the sidebar and the page stay usable; the
 * setup steps and the last one are centered over the dimmed window.
 */
export function isFloating(step: TourStep): boolean {
  return step in TRY
}

export function nextStep(step: TourStep): TourStep | undefined {
  return TOUR_STEPS[TOUR_STEPS.indexOf(step) + 1]
}

export function previousStep(step: TourStep): TourStep | undefined {
  const i = TOUR_STEPS.indexOf(step)
  return i > 0 ? TOUR_STEPS[i - 1] : undefined
}

/** The step after `event`: the next one if it completes `step`, else `step` itself. */
export function stepAfter(step: TourStep, event: TourEvent): TourStep {
  return TRY[step] === event ? (nextStep(step) ?? step) : step
}
