// Sensitivities and scales from GRADE_MATH.md. These are starting values to tune by eye
// by eye with a colourist (BUILD_PLAN Phase 4) — not disguise facts.

import type { WheelName } from './types.ts'

/** Puck at the rim gives a channel delta of up to k × 2/3 (GRADE_MATH §2). */
export const K_WHEEL: Record<WheelName, number> = {
  lift: 0.25,
  gamma: 0.25,
  gain: 0.5,
  offset: 0.25,
}

/** Jog drag sensitivity per px, in each wheel's displayed units. Shift divides by 10. */
export const JOG_PER_PX: Record<WheelName, number> = {
  lift: 0.001,
  gamma: 0.001,
  gain: 0.002,
  offset: 0.1, // display units: 0.001 normalised
}

/** Offset display: 25 = neutral, 100 display units = 1.0 normalised (GRADE_MATH §3). */
export const OFFSET_NEUTRAL = 25
export const OFFSET_SCALE = 100

/** Gamma exponent e = 2^(gammaValue × K_GAMMA). */
export const K_GAMMA = 1

/** Smallest affine slope sent to disguise, so Shadow/Highlight never divide by zero. */
export const MIN_SLOPE = 1e-4
