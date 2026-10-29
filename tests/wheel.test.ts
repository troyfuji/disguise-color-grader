import { describe, expect, it } from 'vitest'
import { neutralWheel } from '../shared/grade/neutral.ts'
import { deltasToPuck, puckToDeltas, readout, setPuck, setReadout, wheelPuck } from '../shared/grade/wheel.ts'

describe('wheel puck', () => {
  it('deltas always sum to zero', () => {
    for (let i = 0; i < 50; i++) {
      const d = puckToDeltas({ x: Math.cos(i), y: Math.sin(i * 1.7) * 0.8 }, 0.25)
      expect(d.r + d.g + d.b).toBeCloseTo(0, 12)
    }
  })

  it('puck at the red axis rim gives r = k × 2/3', () => {
    const rad = (110 * Math.PI) / 180
    const d = puckToDeltas({ x: Math.cos(rad), y: Math.sin(rad) }, 0.25)
    expect(d.r).toBeCloseTo((0.25 * 2) / 3, 12)
    expect(d.g).toBeCloseTo(d.b, 12)
  })

  it('is clamped to the disc', () => {
    const a = puckToDeltas({ x: 3, y: 0 }, 0.5)
    const b = puckToDeltas({ x: 1, y: 0 }, 0.5)
    expect(a).toEqual(b)
  })

  it('deltasToPuck inverts puckToDeltas', () => {
    const p = { x: 0.31, y: -0.62 }
    const back = deltasToPuck(puckToDeltas(p, 0.5), 0.5)
    expect(back.x).toBeCloseTo(p.x, 12)
    expect(back.y).toBeCloseTo(p.y, 12)
  })

  it('setPuck keeps a common part left by a typed readout', () => {
    let w = setReadout('lift', neutralWheel('lift'), 'r', 0.06) // r only: non-zero sum
    w = setPuck('lift', w, { x: 0.2, y: 0.4 })
    const p = wheelPuck('lift', w)
    expect(p.x).toBeCloseTo(0.2, 12)
    expect(p.y).toBeCloseTo(0.4, 12)
    expect((w.color.r + w.color.g + w.color.b) / 3).toBeCloseTo(0.02, 12)
  })
})

describe('readouts', () => {
  it('neutral readouts match UI_SPEC §2.4', () => {
    expect(readout('lift', neutralWheel('lift'), 'y')).toBe(0)
    expect(readout('gamma', neutralWheel('gamma'), 'r')).toBe(0)
    expect(readout('gain', neutralWheel('gain'), 'g')).toBe(1)
    expect(readout('offset', neutralWheel('offset'), 'b')).toBe(25)
  })

  it('typing a channel readout round-trips for every wheel', () => {
    for (const name of ['lift', 'gamma', 'gain', 'offset'] as const) {
      const w = setReadout(name, neutralWheel(name), 'g', name === 'offset' ? 30 : 1.25)
      expect(readout(name, w, 'g')).toBeCloseTo(name === 'offset' ? 30 : 1.25, 12)
    }
  })

  it('typing Y sets the master only', () => {
    const w = setReadout('gain', neutralWheel('gain'), 'y', 1.5)
    expect(w.master).toBe(1.5)
    expect(w.color).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('ignores a gain channel typed while master is 0', () => {
    const w = { master: 0, color: { r: 0, g: 0, b: 0 } }
    expect(setReadout('gain', w, 'r', 0.5)).toBe(w)
  })
})
