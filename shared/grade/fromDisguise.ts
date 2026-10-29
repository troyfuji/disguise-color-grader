// Read-back: values pushed by Designer → GradeState (GRADE_MATH.md §6).
// Direct mappings update directly. Levels have no unique inverse, so when they change the
// wheels are rebuilt canonically: Offset neutral, master = channel average, rest = colour.

import { DISGUISE_NEUTRAL, LEVELS_MODEL } from '../disguise/paths.ts'
import { toDisguise, type DisguiseNeutral, type LevelsModel } from './toDisguise.ts'
import { K_GAMMA, MIN_SLOPE } from './tuning.ts'
import { neutralWheel } from './neutral.ts'
import { CHANNELS, type Channel, type DisguiseValues, type GradeState, type RGB } from './types.ts'

const LEVELS_FIELDS = ['shadowColour', 'midtoneColour', 'gainColour', 'outputLevelLow', 'outputLevelHigh'] as const
const TOLERANCE = 1e-6

export interface ReadBack {
  state: GradeState
  /** The wheels were rebuilt from Levels values (panel shows "changed in Designer"). */
  levelsRebuilt: boolean
}

function sameValue(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= TOLERANCE
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ra = a as Partial<RGB>
    const rb = b as Partial<RGB>
    return CHANNELS.every((c) => sameValue(ra[c], rb[c]))
  }
  return a === b
}

const mean = (v: RGB) => (v.r + v.g + v.b) / 3

export function fromDisguise(
  incoming: Partial<DisguiseValues>,
  prev: GradeState,
  model: LevelsModel = LEVELS_MODEL,
  neutral: DisguiseNeutral = DISGUISE_NEUTRAL,
): ReadBack {
  const current = toDisguise(prev, model, neutral)
  // Colours can arrive as partial objects (and with alpha); merge over what we expect.
  const v: DisguiseValues = {
    ...current,
    ...incoming,
    shadowColour: { ...current.shadowColour, ...incoming.shadowColour },
    midtoneColour: { ...current.midtoneColour, ...incoming.midtoneColour },
    gainColour: { ...current.gainColour, ...incoming.gainColour },
  }

  const state: GradeState = {
    ...prev,
    tempK: v.ccKelvin,
    tint: v.ccTint,
    contrast: v.ccContrast,
    brightness: v.ccBrightness,
    saturation: v.ccSaturation,
    clamp: { enabled: v.oututLevelClampEnable, low: v.outputLevelLowClamp, high: v.outputLevelHighClamp },
    source: v.source,
  }

  const levelsRebuilt = LEVELS_FIELDS.some((f) => !sameValue(v[f], current[f]))
  if (!levelsRebuilt) return { state, levelsRebuilt }

  const L = {} as RGB
  const G = {} as RGB
  const gv = {} as RGB
  for (const c of CHANNELS) {
    const { lift, gain, gamma } = invertChannel(v, c, model)
    L[c] = lift
    G[c] = gain
    gv[c] = gamma
  }
  const liftM = mean(L)
  const gainM = mean(G)
  const gammaM = mean(gv)
  state.lift = { master: liftM, color: { r: L.r - liftM, g: L.g - liftM, b: L.b - liftM } }
  state.gamma = { master: gammaM, color: { r: gv.r - gammaM, g: gv.g - gammaM, b: gv.b - gammaM } }
  state.gain =
    Math.abs(gainM) < MIN_SLOPE
      ? { master: gainM, color: { r: 0, g: 0, b: 0 } }
      : { master: gainM, color: { r: G.r / gainM - 1, g: G.g / gainM - 1, b: G.b / gainM - 1 } }
  state.offset = neutralWheel('offset')
  return { state, levelsRebuilt }
}

/** Levels → (lift, gain, gammaValue) for one channel, with Offset taken as 0. */
function invertChannel(v: DisguiseValues, c: Channel, model: LevelsModel) {
  const span = v.gainColour[c] - v.shadowColour[c]
  const a = (v.outputLevelHigh - v.outputLevelLow) / (Math.abs(span) < MIN_SLOPE ? MIN_SLOPE : span)
  const b = v.outputLevelLow - a * v.shadowColour[c]
  // a = G(1 − L), b = G·L  →  G = a + b, L = b / G
  const gain = a + b
  const lift = Math.abs(gain) < MIN_SLOPE ? 0 : b / gain
  const m = v.midtoneColour[c]
  const e = model.midtone === 'inverse' ? m : 1 / m
  const gamma = e > 0 ? Math.log2(e) / K_GAMMA : 0
  return { lift, gain, gamma }
}
