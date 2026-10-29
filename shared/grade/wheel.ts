// Wheel geometry (GRADE_MATH.md §2) and the numeric readouts under each wheel.
// Puck coordinates: unit disc, centre 0, rim 1, +x right, +y up (maths orientation).

import { K_WHEEL, OFFSET_SCALE } from './tuning.ts'
import { CHANNELS, type Channel, type RGB, type WheelName, type WheelState } from './types.ts'

export interface Puck {
  x: number
  y: number
}

/** Hue axis of each channel on the ring, degrees counter-clockwise from +x. */
const AXIS_DEG: Record<Channel, number> = { r: 110, g: 230, b: 350 }
const AXIS: Record<Channel, Puck> = {
  r: unit(AXIS_DEG.r),
  g: unit(AXIS_DEG.g),
  b: unit(AXIS_DEG.b),
}

function unit(deg: number): Puck {
  const rad = (deg * Math.PI) / 180
  return { x: Math.cos(rad), y: Math.sin(rad) }
}

export function clampToDisc(p: Puck): Puck {
  const m = Math.hypot(p.x, p.y)
  return m > 1 ? { x: p.x / m, y: p.y / m } : { x: p.x, y: p.y }
}

/** delta.c = k × a × cos(θ − axis.c) × 2/3 — always sums to zero. */
export function puckToDeltas(p: Puck, k: number): RGB {
  const q = clampToDisc(p)
  const d = (c: Channel) => ((k * 2) / 3) * (q.x * AXIS[c].x + q.y * AXIS[c].y)
  return { r: d('r'), g: d('g'), b: d('b') }
}

/** Inverse of puckToDeltas on the zero-sum part of `color`; any common part is ignored. */
export function deltasToPuck(color: RGB, k: number): Puck {
  let x = 0
  let y = 0
  for (const c of CHANNELS) {
    x += color[c] * AXIS[c].x
    y += color[c] * AXIS[c].y
  }
  return k === 0 ? { x: 0, y: 0 } : { x: x / k, y: y / k }
}

export function wheelPuck(name: WheelName, wheel: WheelState): Puck {
  return deltasToPuck(wheel.color, K_WHEEL[name])
}

/** Moves the puck, keeping any common (non-zero-sum) part a typed readout left behind. */
export function setPuck(name: WheelName, wheel: WheelState, p: Puck): WheelState {
  const mean = (wheel.color.r + wheel.color.g + wheel.color.b) / 3
  const d = puckToDeltas(p, K_WHEEL[name])
  return { master: wheel.master, color: { r: d.r + mean, g: d.g + mean, b: d.b + mean } }
}

export type Readout = 'y' | Channel

/**
 * Displayed numbers (standard grading-panel style). Y = master. Channels:
 *  Lift/Gamma: master + color.c · Gain: master × (1 + color.c) · Offset: master + color.c × 100.
 */
export function readout(name: WheelName, wheel: WheelState, which: Readout): number {
  if (which === 'y') return wheel.master
  const c = wheel.color[which]
  switch (name) {
    case 'gain':
      return wheel.master * (1 + c)
    case 'offset':
      return wheel.master + c * OFFSET_SCALE
    default:
      return wheel.master + c
  }
}

/** Typing a readout. Returns the wheel unchanged if the value can't be represented. */
export function setReadout(name: WheelName, wheel: WheelState, which: Readout, value: number): WheelState {
  if (!Number.isFinite(value)) return wheel
  if (which === 'y') return { master: value, color: { ...wheel.color } }
  let c: number
  switch (name) {
    case 'gain':
      if (Math.abs(wheel.master) < 1e-9) return wheel
      c = value / wheel.master - 1
      break
    case 'offset':
      c = (value - wheel.master) / OFFSET_SCALE
      break
    default:
      c = value - wheel.master
  }
  return { master: wheel.master, color: { ...wheel.color, [which]: c } }
}
