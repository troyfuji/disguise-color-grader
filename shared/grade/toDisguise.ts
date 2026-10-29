// GradeState (panel units) → ColourAdjust values. Pure; see GRADE_MATH.md §3–5.

import { DISGUISE_NEUTRAL, LEVELS_MODEL, WB_MODE_CUSTOM } from '../disguise/paths.ts'
import { K_GAMMA, MIN_SLOPE, OFFSET_NEUTRAL, OFFSET_SCALE } from './tuning.ts'
import { CHANNELS, type Channel, type DisguiseValues, type GradeState, type RGB } from './types.ts'

export type LevelsModel = typeof LEVELS_MODEL
export type DisguiseNeutral = Record<keyof typeof DISGUISE_NEUTRAL, number>

/** Per-channel transfer: out = (a·x + b)^(1/e). */
export interface ChannelTransfer {
  a: number
  b: number
  e: number
}

export function channelTransfer(state: GradeState, c: Channel): ChannelTransfer {
  const L = state.lift.master + state.lift.color[c]
  const G = state.gain.master * (1 + state.gain.color[c])
  const O = (state.offset.master - OFFSET_NEUTRAL) / OFFSET_SCALE + state.offset.color[c]
  const gammaValue = state.gamma.master + state.gamma.color[c]
  return {
    a: G * (1 - L),
    b: G * L + O,
    e: Math.pow(2, gammaValue * K_GAMMA),
  }
}

/** The reference curve (GRADE_MATH §3), used by tests and read-back. */
export function referenceTransfer(state: GradeState, c: Channel, x: number): number {
  const { a, b, e } = channelTransfer(state, c)
  const y = a * x + b
  return Math.sign(y) * Math.pow(Math.abs(y), 1 / e)
}

export interface DisguiseResult {
  values: DisguiseValues
  /** True when Shadow/Highlight limits forced the OutputLow/High fallback (GRADE_MATH §4). */
  approximate: boolean
}

export function toDisguiseDetailed(
  state: GradeState,
  model: LevelsModel = LEVELS_MODEL,
  neutral: DisguiseNeutral = DISGUISE_NEUTRAL,
): DisguiseResult {
  const t = {} as Record<Channel, ChannelTransfer>
  for (const c of CHANNELS) {
    const tc = channelTransfer(state, c)
    t[c] = { ...tc, a: Math.max(tc.a, MIN_SLOPE) }
  }

  // Exact solution uses OutputLow 0 / OutputHigh 1. If disguise limits Shadow or Highlight,
  // move the common part into OutputLow/High: choosing OL = max_c(b_c + min·a_c) keeps every
  // Shadow ≥ min with the slope still exact; only each channel's toe below its Shadow differs.
  let outLow = 0
  let outHigh = 1
  let approximate = false
  if (model.shadowMin !== null) {
    const lo = model.shadowMin
    if (CHANNELS.some((c) => -t[c].b / t[c].a < lo)) {
      outLow = Math.max(...CHANNELS.map((c) => t[c].b + lo * t[c].a))
      approximate = true
    }
  }
  if (model.highlightMax !== null) {
    const hi = model.highlightMax
    if (CHANNELS.some((c) => (1 - t[c].b) / t[c].a > hi)) {
      outHigh = Math.min(...CHANNELS.map((c) => t[c].b + hi * t[c].a))
      approximate = true
    }
  }

  const shadow = {} as RGB
  const highlight = {} as RGB
  const midtone = {} as RGB
  for (const c of CHANNELS) {
    shadow[c] = (outLow - t[c].b) / t[c].a
    highlight[c] = (outHigh - t[c].b) / t[c].a
    midtone[c] = model.midtone === 'inverse' ? t[c].e : 1 / t[c].e
  }

  return {
    approximate,
    values: {
      ccWhiteBalanceMode: WB_MODE_CUSTOM,
      ccKelvin: state.tempK,
      ccTint: state.tint,
      ccContrast: state.contrast,
      ccBrightness: state.brightness,
      ccSaturation: state.saturation,
      shadowColour: shadow,
      midtoneColour: midtone,
      gainColour: highlight,
      outputLevelLow: outLow,
      outputLevelHigh: outHigh,
      oututLevelClampEnable: state.clamp.enabled,
      outputLevelLowClamp: state.clamp.low,
      outputLevelHighClamp: state.clamp.high,
      source: state.source,
    },
  }
}

export function toDisguise(state: GradeState, model?: LevelsModel, neutral?: DisguiseNeutral): DisguiseValues {
  return toDisguiseDetailed(state, model, neutral).values
}

/** The assumed disguise Levels model (GRADE_MATH §4), per channel. For tests and simulation. */
export function applyLevels(v: DisguiseValues, c: Channel, x: number, model: LevelsModel = LEVELS_MODEL): number {
  const s = v.shadowColour[c]
  const h = v.gainColour[c]
  const n = Math.min(1, Math.max(0, (x - s) / (h - s)))
  const m = model.midtone === 'inverse' ? Math.pow(n, 1 / v.midtoneColour[c]) : Math.pow(n, v.midtoneColour[c])
  return v.outputLevelLow + m * (v.outputLevelHigh - v.outputLevelLow)
}
