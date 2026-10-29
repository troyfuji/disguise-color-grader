import { describe, expect, it } from 'vitest'
import { History } from '../shared/grade/history.ts'

describe('History', () => {
  it('undoes and redoes completed gestures', () => {
    const h = new History({ v: 0 })
    h.commit({ v: 1 })
    h.commit({ v: 2 })
    expect(h.undo()).toEqual({ v: 1 })
    expect(h.undo()).toEqual({ v: 0 })
    expect(h.canUndo).toBe(false)
    expect(h.redo()).toEqual({ v: 1 })
  })

  it('a new commit drops the redo branch', () => {
    const h = new History({ v: 0 })
    h.commit({ v: 1 })
    h.undo()
    h.commit({ v: 5 })
    expect(h.canRedo).toBe(false)
    expect(h.undo()).toEqual({ v: 0 })
  })

  it('ignores a commit that changed nothing', () => {
    const h = new History({ v: 0 })
    expect(h.commit({ v: 0 })).toBe(false)
    expect(h.canUndo).toBe(false)
  })

  it('keeps at least 50 steps', () => {
    const h = new History({ v: 0 })
    for (let i = 1; i <= 200; i++) h.commit({ v: i })
    let steps = 0
    while (h.undo()) steps++
    expect(steps).toBeGreaterThanOrEqual(50)
  })

  it('returns copies, not shared state', () => {
    const h = new History({ v: { n: 1 } })
    const a = h.current
    a.v.n = 99
    expect(h.current.v.n).toBe(1)
  })
})
