// Grade state in panel units (GRADE_MATH.md §1) and the disguise ColourAdjust
// values it converts to. The UI edits GradeState only; toDisguise() produces DisguiseValues.

export interface RGB {
  r: number
  g: number
  b: number
}

export const CHANNELS = ['r', 'g', 'b'] as const
export type Channel = (typeof CHANNELS)[number]

export interface WheelState {
  /** Jog wheel (Y). Offset's master is in display units (neutral 25). */
  master: number
  /**
   * Per-channel deltas from the puck, in normalised units for every wheel (Offset included).
   * Usually sums to 0; typing a single channel readout can make it non-zero.
   */
  color: RGB
}

export type WheelName = 'lift' | 'gamma' | 'gain' | 'offset'
export const WHEELS: readonly WheelName[] = ['lift', 'gamma', 'gain', 'offset']

/** ColourAdjust `source.isExplicitEffectMode`: 1 = from background, 0 = arrow/texture. */
export type SourceValue = number

export interface ClampState {
  enabled: boolean
  low: number
  high: number
}

export interface GradeState {
  tempK: number
  tint: number
  contrast: number
  brightness: number
  /** Display units, neutral 50. */
  saturation: number
  lift: WheelState
  gamma: WheelState
  gain: WheelState
  offset: WheelState
  clamp: ClampState
  source: SourceValue
}

/** ColourAdjustModule property values (DISGUISE_API.md §2). Colours sent without alpha. */
export interface DisguiseValues {
  ccWhiteBalanceMode: number
  ccKelvin: number
  ccTint: number
  ccContrast: number
  ccBrightness: number
  ccSaturation: number
  shadowColour: RGB
  midtoneColour: RGB
  gainColour: RGB
  outputLevelLow: number
  outputLevelHigh: number
  /** Typo is in the real API name. */
  oututLevelClampEnable: boolean
  outputLevelLowClamp: number
  outputLevelHighClamp: number
  source: SourceValue
}

export type DisguiseField = keyof DisguiseValues
