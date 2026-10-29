// Grade presets: named grades kept by the server (data/presets.json) and shared by every panel.
// A preset stores the whole GradeState, but applying one keeps the layer's current Source —
// Source is routing, not grade (same rule as Reset).

import { CHANNELS, WHEELS, type GradeState } from './grade/types.ts'

export interface Preset {
  id: string
  name: string
  grade: GradeState
  createdAt: number
  updatedAt: number
}

export const PRESET_NAME_MAX = 60
export const PRESET_LIMIT = 500

/** Trimmed, single-line name, or null if empty / too long. */
export function cleanPresetName(name: unknown): string | null {
  if (typeof name !== 'string') return null
  const n = name.replace(/\s+/g, ' ').trim()
  return n.length >= 1 && n.length <= PRESET_NAME_MAX ? n : null
}

/** The grade a preset puts on the layer: the preset's values with the layer's own Source. */
export function presetGradeFor(preset: Preset, current: GradeState): GradeState {
  // JSON copy, not structuredClone: in the panel the preset is a Vue reactive proxy, which
  // structuredClone refuses to copy (DataCloneError). GradeState is plain JSON data.
  return { ...(JSON.parse(JSON.stringify(preset.grade)) as GradeState), source: current.source }
}

const EPS = 1e-6
const close = (a: number, b: number) => Math.abs(a - b) <= EPS * Math.max(1, Math.abs(a), Math.abs(b))

/** Same grade, ignoring Source. Marks the preset that is on the layer now. */
export function sameGrade(a: GradeState, b: GradeState): boolean {
  if (!(['tempK', 'tint', 'contrast', 'brightness', 'saturation'] as const).every((k) => close(a[k], b[k]))) return false
  for (const w of WHEELS) {
    if (!close(a[w].master, b[w].master)) return false
    if (!CHANNELS.every((c) => close(a[w].color[c], b[w].color[c]))) return false
  }
  return a.clamp.enabled === b.clamp.enabled && close(a.clamp.low, b.clamp.low) && close(a.clamp.high, b.clamp.high)
}
