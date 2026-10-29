// Preset store: the server's list of named grades, kept in one JSON file (data/presets.json by
// default) so every panel shares it and it survives restarts. Nothing here talks to disguise.

import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { isGradeState } from '../shared/grade/validate.ts'
import { cleanPresetName, PRESET_LIMIT, type Preset } from '../shared/presets.ts'

/** Thrown for a request the operator can fix (bad name, duplicate, missing preset). */
export class PresetError extends Error {}

const byName = (a: Preset, b: Preset) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true })

export class PresetStore {
  private readonly file: string
  private readonly log: (line: string) => void
  private presets: Preset[] = []

  constructor(file: string, log: (line: string) => void = () => {}) {
    this.file = file
    this.log = log
    this.load()
  }

  /** Sorted by name. */
  get list(): Preset[] {
    return structuredClone(this.presets)
  }

  save(name: unknown, grade: unknown, now = Date.now()): Preset {
    const clean = this.uniqueName(name)
    if (!isGradeState(grade)) throw new PresetError('Invalid grade')
    if (this.presets.length >= PRESET_LIMIT) throw new PresetError(`Preset limit reached (${PRESET_LIMIT})`)
    const preset: Preset = { id: randomUUID(), name: clean, grade: structuredClone(grade), createdAt: now, updatedAt: now }
    this.presets.push(preset)
    this.commit()
    return structuredClone(preset)
  }

  update(id: string, grade: unknown, now = Date.now()): Preset {
    const p = this.find(id)
    if (!isGradeState(grade)) throw new PresetError('Invalid grade')
    p.grade = structuredClone(grade)
    p.updatedAt = now
    this.commit()
    return structuredClone(p)
  }

  rename(id: string, name: unknown, now = Date.now()): Preset {
    const p = this.find(id)
    p.name = this.uniqueName(name, id)
    p.updatedAt = now
    this.commit()
    return structuredClone(p)
  }

  remove(id: string): Preset {
    const p = this.find(id)
    this.presets = this.presets.filter((q) => q.id !== id)
    this.commit()
    return structuredClone(p)
  }

  private find(id: string): Preset {
    const p = this.presets.find((q) => q.id === id)
    if (!p) throw new PresetError('That preset no longer exists')
    return p
  }

  private uniqueName(name: unknown, exceptId?: string): string {
    const clean = cleanPresetName(name)
    if (!clean) throw new PresetError('Give the preset a name (up to 60 characters)')
    const taken = this.presets.some((p) => p.id !== exceptId && byName(p, { name: clean } as Preset) === 0)
    if (taken) throw new PresetError(`A preset called “${clean}” already exists`)
    return clean
  }

  private load(): void {
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(this.file, 'utf8'))
    } catch {
      return // no file yet
    }
    const items = Array.isArray((raw as { presets?: unknown })?.presets) ? (raw as { presets: unknown[] }).presets : []
    for (const item of items) {
      const p = item as Partial<Preset>
      const name = cleanPresetName(p.name)
      if (typeof p.id === 'string' && name && isGradeState(p.grade)) {
        this.presets.push({ id: p.id, name, grade: p.grade, createdAt: Number(p.createdAt) || 0, updatedAt: Number(p.updatedAt) || 0 })
      }
    }
    this.presets.sort(byName)
    if (items.length !== this.presets.length) this.log(`presets: skipped ${items.length - this.presets.length} unreadable entries`)
  }

  /** Sort and write atomically (temp file + rename), so a crash never leaves half a file. */
  private commit(): void {
    this.presets.sort(byName)
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify({ version: 1, presets: this.presets }, null, 2))
    renameSync(tmp, this.file)
  }
}
