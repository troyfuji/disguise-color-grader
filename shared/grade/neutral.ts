import { DISGUISE_NEUTRAL, SOURCE_DEFAULT } from '../disguise/paths.ts'
import { OFFSET_NEUTRAL } from './tuning.ts'
import type { GradeState, WheelName, WheelState } from './types.ts'

const NEUTRAL_MASTER: Record<WheelName, number> = {
  lift: 0,
  gamma: 0,
  gain: 1,
  offset: OFFSET_NEUTRAL,
}

export function neutralWheel(name: WheelName): WheelState {
  return { master: NEUTRAL_MASTER[name], color: { r: 0, g: 0, b: 0 } }
}

export function neutralGrade(source = SOURCE_DEFAULT): GradeState {
  return {
    tempK: DISGUISE_NEUTRAL.ccKelvin,
    tint: 0,
    contrast: DISGUISE_NEUTRAL.ccContrast,
    brightness: DISGUISE_NEUTRAL.ccBrightness,
    saturation: DISGUISE_NEUTRAL.ccSaturation,
    lift: neutralWheel('lift'),
    gamma: neutralWheel('gamma'),
    gain: neutralWheel('gain'),
    offset: neutralWheel('offset'),
    clamp: { enabled: false, low: 0, high: 1 },
    source,
  }
}

/** Whole-grade reset. Source is routing, not grade, so it is kept. */
export function resetGrade(state: GradeState): GradeState {
  return neutralGrade(state.source)
}

const EPS = 1e-9

/** True when the grade (ignoring source) matches neutral. Drives the toolbar's modified dot. */
export function isNeutral(state: GradeState): boolean {
  const n = neutralGrade(state.source)
  const close = (a: number, b: number) => Math.abs(a - b) < EPS
  const wheelNeutral = (w: WheelName) =>
    close(state[w].master, n[w].master) &&
    close(state[w].color.r, 0) &&
    close(state[w].color.g, 0) &&
    close(state[w].color.b, 0)
  return (
    close(state.tempK, n.tempK) &&
    close(state.tint, n.tint) &&
    close(state.contrast, n.contrast) &&
    close(state.brightness, n.brightness) &&
    close(state.saturation, n.saturation) &&
    wheelNeutral('lift') &&
    wheelNeutral('gamma') &&
    wheelNeutral('gain') &&
    wheelNeutral('offset') &&
    state.clamp.enabled === n.clamp.enabled &&
    close(state.clamp.low, n.clamp.low) &&
    close(state.clamp.high, n.clamp.high)
  )
}
