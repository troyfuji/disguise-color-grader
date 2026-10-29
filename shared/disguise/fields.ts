// DisguiseValues ⇄ the flat per-sequence values Live Update reads and writes (LIVE_FIELDS).

import type { DisguiseValues, RGB } from '../grade/types.ts'
import { LIVE_FIELDS, type LiveField } from './paths.ts'

/** The value to send for one live field. Bools go as 0/1 (KeyFloat). */
export function rawValue(values: DisguiseValues, f: LiveField): number {
  const v = values[f.field]
  if (f.channel) return (v as RGB)[f.channel]
  if (f.kind === 'bool') return v ? 1 : 0
  return v as number
}

/** Rebuilds DisguiseValues from raw values keyed by sequence name; undefined if any are missing. */
export function valuesFromRaw(raw: ReadonlyMap<string, unknown>): DisguiseValues | undefined {
  const out: Record<string, unknown> = {}
  for (const f of LIVE_FIELDS) {
    const v = raw.get(f.seq)
    if (typeof v !== 'number' && typeof v !== 'boolean') return undefined
    const n = Number(v)
    if (f.channel) {
      const colour = (out[f.field] ??= { r: 0, g: 0, b: 0 }) as RGB
      colour[f.channel] = n
    } else out[f.field] = f.kind === 'bool' ? n !== 0 : n
  }
  return out as unknown as DisguiseValues
}
