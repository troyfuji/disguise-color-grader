import { describe, expect, it } from 'vitest'
import { fromDisguise } from '../shared/grade/fromDisguise.ts'
import { isNeutral, neutralGrade } from '../shared/grade/neutral.ts'
import { toDisguise } from '../shared/grade/toDisguise.ts'
import { setPuck } from '../shared/grade/wheel.ts'
import { CHANNELS, type DisguiseValues } from '../shared/grade/types.ts'

const EXACT = { midtone: 'inverse' as const, shadowMin: null, highlightMax: null }

function expectValuesClose(a: DisguiseValues, b: DisguiseValues) {
  for (const f of ['shadowColour', 'midtoneColour', 'gainColour'] as const) {
    for (const c of CHANNELS) expect(a[f][c]).toBeCloseTo(b[f][c], 9)
  }
  expect(a.outputLevelLow).toBeCloseTo(b.outputLevelLow, 9)
  expect(a.outputLevelHigh).toBeCloseTo(b.outputLevelHigh, 9)
}

describe('fromDisguise', () => {
  it('own echo changes nothing', () => {
    const s = neutralGrade()
    s.lift.master = 0.07
    const r = fromDisguise(toDisguise(s, EXACT), s, EXACT)
    expect(r.levelsRebuilt).toBe(false)
    expect(r.state).toEqual(s)
  })

  it('direct values update without touching the wheels', () => {
    const s = neutralGrade()
    s.offset.master = 30
    const r = fromDisguise({ ccKelvin: 4300, ccSaturation: 40, ccContrast: -12.5 }, s, EXACT)
    expect(r.levelsRebuilt).toBe(false)
    expect(r.state.tempK).toBe(4300)
    expect(r.state.saturation).toBe(40)
    expect(r.state.contrast).toBe(-12.5)
    expect(r.state.offset.master).toBe(30)
  })

  it('rebuilt wheels reproduce the same disguise values', () => {
    const s = neutralGrade()
    s.lift.master = -0.05
    s.gamma.master = 0.2
    s.gain.master = 1.3
    s.offset.master = 28
    s.lift = setPuck('lift', s.lift, { x: 0.4, y: 0.1 })
    s.gain = setPuck('gain', s.gain, { x: -0.2, y: -0.3 })
    s.gamma = setPuck('gamma', s.gamma, { x: 0.1, y: 0.6 })
    const target = toDisguise(s, EXACT)

    const r = fromDisguise(target, neutralGrade(), EXACT)
    expect(r.levelsRebuilt).toBe(true)
    expect(r.state.offset.master).toBe(25)
    expectValuesClose(toDisguise(r.state, EXACT), target)
  })

  it('a partial colour update merges with the current values', () => {
    const s = neutralGrade()
    const r = fromDisguise({ gainColour: { r: 0.5 } as DisguiseValues['gainColour'] }, s, EXACT)
    expect(r.levelsRebuilt).toBe(true)
    const v = toDisguise(r.state, EXACT)
    expect(v.gainColour.r).toBeCloseTo(0.5, 9)
    expect(v.gainColour.g).toBeCloseTo(1, 9)
  })

  it('neutral Levels read back as a neutral grade', () => {
    const r = fromDisguise({ ...toDisguise(neutralGrade(), EXACT), outputLevelLow: 0 }, neutralGrade(), EXACT)
    expect(isNeutral(r.state)).toBe(true)
  })
})
