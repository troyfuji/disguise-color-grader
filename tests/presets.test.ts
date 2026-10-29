import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PresetError, PresetStore } from '../server/presets.ts'
import { GradingSession, type PanelLink } from '../server/session.ts'
import { neutralGrade } from '../shared/grade/neutral.ts'
import type { GradeState } from '../shared/grade/types.ts'
import { cleanPresetName, presetGradeFor, sameGrade } from '../shared/presets.ts'
import type { ServerMessage } from '../shared/protocol.ts'

let dir: string
let file: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'grader-presets-'))
  file = join(dir, 'presets.json')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const warm = (): GradeState => {
  const g = neutralGrade()
  g.tempK = 6500
  g.saturation = -20
  g.lift.color = { r: 0.02, g: 0, b: -0.02 }
  return g
}

describe('PresetStore', () => {
  it('saves, sorts by name, and survives a restart', () => {
    const a = new PresetStore(file)
    a.save('Warm night', warm())
    a.save('  cool   day ', neutralGrade())
    expect(a.list.map((p) => p.name)).toEqual(['cool day', 'Warm night'])
    const b = new PresetStore(file)
    expect(b.list).toEqual(a.list)
    expect(b.list[1]!.grade.tempK).toBe(6500)
  })

  it('refuses empty, over-long and duplicate names (case-insensitive)', () => {
    const s = new PresetStore(file)
    s.save('Show look', neutralGrade())
    expect(() => s.save('   ', neutralGrade())).toThrow(PresetError)
    expect(() => s.save('x'.repeat(61), neutralGrade())).toThrow(PresetError)
    expect(() => s.save('show LOOK', neutralGrade())).toThrow(/already exists/)
  })

  it('refuses a malformed grade', () => {
    const s = new PresetStore(file)
    expect(() => s.save('Bad', { ...neutralGrade(), tempK: Number.NaN })).toThrow(PresetError)
    expect(s.list).toHaveLength(0)
  })

  it('updates, renames and deletes', () => {
    const s = new PresetStore(file)
    const p = s.save('A', neutralGrade(), 1)
    s.save('B', neutralGrade(), 1)
    expect(s.update(p.id, warm(), 2).grade.tempK).toBe(6500)
    expect(s.rename(p.id, 'C', 3).name).toBe('C')
    expect(() => s.rename(p.id, 'b')).toThrow(/already exists/)
    expect(s.rename(p.id, 'c').name).toBe('c') // own name, new case
    s.remove(p.id)
    expect(s.list.map((q) => q.name)).toEqual(['B'])
    expect(() => s.remove(p.id)).toThrow(/no longer exists/)
  })

  it('skips unreadable entries in the file', () => {
    writeFileSync(file, JSON.stringify({ presets: [{ id: 'x', name: 'Ok', grade: neutralGrade() }, { id: 'y', name: '', grade: {} }] }))
    expect(new PresetStore(file).list.map((p) => p.name)).toEqual(['Ok'])
  })
})

describe('preset helpers', () => {
  it('applying keeps the layer Source', () => {
    const current = neutralGrade(1)
    const p = { id: '1', name: 'W', grade: { ...warm(), source: 0 }, createdAt: 0, updatedAt: 0 }
    const g = presetGradeFor(p, current)
    expect(g.source).toBe(1)
    expect(g.tempK).toBe(6500)
  })

  it('sameGrade ignores Source and float32 noise', () => {
    const a = warm()
    const b = { ...structuredClone(a), source: 1, tempK: Math.fround(6500.0001) }
    expect(sameGrade(a, b)).toBe(true)
    expect(sameGrade(a, neutralGrade())).toBe(false)
  })

  it('cleans names', () => {
    expect(cleanPresetName(' a \n b ')).toBe('a b')
    expect(cleanPresetName(3)).toBeNull()
  })
})

describe('GradingSession presets', () => {
  class Panel implements PanelLink {
    readonly id: string
    messages: ServerMessage[] = []
    constructor(id: string) {
      this.id = id
    }
    send(m: ServerMessage) {
      this.messages.push(m)
    }
    last<T extends ServerMessage['type']>(type: T) {
      return this.messages.filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type).at(-1)
    }
  }

  it('sends the list on attach, broadcasts changes, and tells only the sender', () => {
    const session = new GradingSession({ presets: new PresetStore(file) })
    const a = new Panel('a')
    const b = new Panel('b')
    session.attach(a)
    session.attach(b)
    expect(a.last('presets')?.presets).toEqual([])

    session.handle('a', { type: 'presetSave', name: 'Warm', grade: warm() })
    expect(b.last('presets')?.presets.map((p) => p.name)).toEqual(['Warm'])
    expect(a.last('notice')?.text).toMatch(/Saved/)
    expect(b.last('notice')).toBeUndefined()

    session.handle('b', { type: 'presetSave', name: 'warm', grade: warm() })
    expect(b.last('notice')).toMatchObject({ level: 'warn', text: expect.stringMatching(/already exists/) })
    expect(JSON.parse(readFileSync(file, 'utf8')).presets).toHaveLength(1)
  })

  it('preset requests never reach disguise', () => {
    const session = new GradingSession({ presets: new PresetStore(file) })
    session.attach(new Panel('a'))
    session.handle('a', { type: 'presetSave', name: 'X', grade: warm() })
    const stats = session.directorStats
    expect(stats.liveUpdate.messages + stats.python.discovery + stats.python.refresh + stats.python.keyframe).toBe(0)
  })
})
