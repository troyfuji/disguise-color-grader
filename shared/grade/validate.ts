// Shape check for GradeState arriving from a panel, so a bad message can never put NaN or
// garbage onto a live layer.

import { CHANNELS, WHEELS, type GradeState } from './types.ts'

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export function isGradeState(v: unknown): v is GradeState {
  if (!v || typeof v !== 'object') return false
  const g = v as Record<string, unknown>
  if (!['tempK', 'tint', 'contrast', 'brightness', 'saturation'].every((k) => num(g[k]))) return false
  for (const w of WHEELS) {
    const wheel = g[w] as { master?: unknown; color?: Record<string, unknown> } | undefined
    if (!wheel || !num(wheel.master) || !wheel.color) return false
    if (!CHANNELS.every((c) => num(wheel.color![c]))) return false
  }
  const clamp = g.clamp as Record<string, unknown> | undefined
  if (!clamp || typeof clamp.enabled !== 'boolean' || !num(clamp.low) || !num(clamp.high)) return false
  return num(g.source)
}
