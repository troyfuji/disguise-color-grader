import { describe, expect, it } from 'vitest'
import { neutralGrade } from '../shared/grade/neutral.ts'
import { applyLevels, referenceTransfer, toDisguise, toDisguiseDetailed } from '../shared/grade/toDisguise.ts'
import { setPuck } from '../shared/grade/wheel.ts'
import { CHANNELS, type GradeState } from '../shared/grade/types.ts'

const EXACT = { midtone: 'inverse' as const, shadowMin: null, highlightMax: null }
const NO_NEGATIVE_SHADOW = { ...EXACT, shadowMin: 0 }

function grade(edit: (s: GradeState) => void): GradeState {
  const s = neutralGrade()
  edit(s)
  return s
}

function expectRGB(actual: { r: number; g: number; b: number }, expected: number, digits = 4) {
  for (const c of CHANNELS) expect(actual[c]).toBeCloseTo(expected, digits)
}

describe('toDisguise — GRADE_MATH §7', () => {
  it('neutral grade gives identity Levels', () => {
    const v = toDisguise(neutralGrade(), EXACT)
    expectRGB(v.shadowColour, 0)
    expectRGB(v.gainColour, 1)
    expectRGB(v.midtoneColour, 1)
    expect(v.outputLevelLow).toBe(0)
    expect(v.outputLevelHigh).toBe(1)
  })

  it('Gain master 2.0 → Highlight 0.5', () => {
    const v = toDisguise(grade((s) => (s.gain.master = 2)), EXACT)
    expectRGB(v.gainColour, 0.5)
    expectRGB(v.shadowColour, 0)
  })

  it('Lift master −0.1 → Shadow ≈ 0.0909, Highlight 1', () => {
    const v = toDisguise(grade((s) => (s.lift.master = -0.1)), EXACT)
    expectRGB(v.shadowColour, 0.1 / 1.1)
    expectRGB(v.gainColour, 1)
  })

  it('Lift master +0.1 → Shadow ≈ −0.111 when negatives are allowed', () => {
    const v = toDisguise(grade((s) => (s.lift.master = 0.1)), EXACT)
    expectRGB(v.shadowColour, -0.1 / 0.9)
    expectRGB(v.gainColour, 1)
  })

  it('Lift master +0.1 → OutputLow 0.1 when negative Shadow is not allowed', () => {
    const r = toDisguiseDetailed(grade((s) => (s.lift.master = 0.1)), NO_NEGATIVE_SHADOW)
    expect(r.values.outputLevelLow).toBeCloseTo(0.1, 6)
    expectRGB(r.values.shadowColour, 0)
    expect(r.approximate).toBe(true)
  })

  it('Offset display 35 → Shadow −0.1, Highlight 0.9', () => {
    const v = toDisguise(grade((s) => (s.offset.master = 35)), EXACT)
    expectRGB(v.shadowColour, -0.1)
    expectRGB(v.gainColour, 0.9)
  })

  it('Lift puck toward red lowers Shadow.r; deltas sum to 0', () => {
    const s = grade((s) => (s.lift = setPuck('lift', s.lift, { x: Math.cos((110 * Math.PI) / 180), y: Math.sin((110 * Math.PI) / 180) })))
    const sum = s.lift.color.r + s.lift.color.g + s.lift.color.b
    expect(sum).toBeCloseTo(0, 12)
    const v = toDisguise(s, EXACT)
    expect(v.shadowColour.r).toBeLessThan(v.shadowColour.g)
    expect(v.shadowColour.r).toBeLessThan(v.shadowColour.b)
  })

  it('round trip: Levels model reproduces the reference transfer at 0, 0.18, 0.5, 1', () => {
    const grades = [
      neutralGrade(),
      grade((s) => (s.gain.master = 1.4)),
      grade((s) => (s.lift.master = 0.05)),
      grade((s) => {
        s.lift.master = -0.04
        s.gamma.master = 0.3
        s.gain.master = 0.9
        s.offset.master = 27
        s.lift = setPuck('lift', s.lift, { x: 0.3, y: -0.2 })
        s.gain = setPuck('gain', s.gain, { x: -0.1, y: 0.4 })
        s.gamma = setPuck('gamma', s.gamma, { x: 0.5, y: 0.5 })
      }),
    ]
    for (const s of grades) {
      const v = toDisguise(s, EXACT)
      for (const c of CHANNELS) {
        for (const x of [0, 0.18, 0.5, 1]) {
          const expected = Math.min(1, Math.max(0, referenceTransfer(s, c, x)))
          expect(applyLevels(v, c, x, EXACT)).toBeCloseTo(expected, 6)
        }
      }
    }
  })

  it('"direct" midtone model inverts the exponent', () => {
    const s = grade((s) => (s.gamma.master = 1))
    expectRGB(toDisguise(s, EXACT).midtoneColour, 2)
    expectRGB(toDisguise(s, { ...EXACT, midtone: 'direct' }).midtoneColour, 0.5)
  })

  it('highlight cap moves the common gain into OutputHigh', () => {
    const r = toDisguiseDetailed(grade((s) => (s.gain.master = 0.8)), { ...EXACT, highlightMax: 1 })
    expect(r.values.outputLevelHigh).toBeCloseTo(0.8, 6)
    expectRGB(r.values.gainColour, 1)
    expect(r.approximate).toBe(true)
  })
})

describe('toDisguise — direct mappings', () => {
  it('passes through Temp, Tint, Contrast, Brightness, clamp, source; forces WB mode Custom', () => {
    const s = grade((s) => {
      s.tempK = 5600
      s.tint = 0.12
      s.contrast = 0.25
      s.brightness = 0.05
      s.clamp = { enabled: true, low: 0.0625, high: 0.92 }
      s.source = 1
    })
    const v = toDisguise(s, EXACT)
    expect(v).toMatchObject({
      ccWhiteBalanceMode: 1,
      ccKelvin: 5600,
      ccTint: 0.12,
      ccContrast: 0.25,
      ccBrightness: 0.05,
      oututLevelClampEnable: true,
      outputLevelLowClamp: 0.0625,
      outputLevelHighClamp: 0.92,
      source: 1,
    })
  })

  it('neutral grade gives disguise defaults (measured on a Director)', () => {
    expect(toDisguise(neutralGrade(), EXACT)).toMatchObject({ ccKelvin: 5000, ccContrast: 0, ccSaturation: 0, ccTint: 0, ccBrightness: 0, source: 0 })
  })

  it('Contrast, Brightness and Saturation are disguise units (neutral 0)', () => {
    expect(toDisguise(grade((s) => (s.saturation = -100)), EXACT).ccSaturation).toBe(-100)
    expect(toDisguise(grade((s) => (s.saturation = 60)), EXACT).ccSaturation).toBe(60)
    expect(toDisguise(grade((s) => (s.brightness = -50)), EXACT).ccBrightness).toBe(-50)
    expect(toDisguise(grade((s) => (s.contrast = -50)), EXACT).ccContrast).toBe(-50)
  })

  it('never divides by zero when Gain is 0', () => {
    const v = toDisguise(grade((s) => (s.gain.master = 0)), EXACT)
    for (const c of CHANNELS) expect(Number.isFinite(v.gainColour[c])).toBe(true)
  })
})
