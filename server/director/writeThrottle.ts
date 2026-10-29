// Batches and throttles Live Update `set` writes (PRODUCT_SPEC §7, DISGUISE_API §7 rules 2–3):
//  - at most one `set` message per WRITE_INTERVAL_MS, carrying the latest value of every
//    changed property, so no property is written more than once per interval;
//  - the latest value is never dropped, so a gesture's final value always goes out;
//  - no timer runs while idle, so nothing is sent when nobody is touching a control;
//  - many properties queued together (Undo, Bypass, Reset) leave as one message.

export const WRITE_INTERVAL_MS = 50

export interface Clock {
  now(): number
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
}

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof globalThis.setTimeout>),
}

export interface SetEntry {
  id: number
  value: unknown
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export class WriteThrottle {
  private pending = new Map<number, unknown>()
  private timer: unknown = null
  private lastSendAt = -Infinity
  private readonly send: (batch: SetEntry[]) => void
  private readonly clock: Clock
  private readonly intervalMs: number

  constructor(send: (batch: SetEntry[]) => void, clock: Clock = systemClock, intervalMs = WRITE_INTERVAL_MS) {
    this.send = send
    this.clock = clock
    this.intervalMs = intervalMs
  }

  /** Queue a value. Partial objects for the same id merge, like the server's own `set`. */
  enqueue(id: number, value: unknown): void {
    const prev = this.pending.get(id)
    this.pending.set(id, isPlainObject(prev) && isPlainObject(value) ? { ...prev, ...value } : value)
    if (this.timer !== null) return
    // Even when idle, wait for the end of the current task so every write queued together
    // (e.g. all fields of an Undo) leaves in one message.
    const wait = Math.max(0, this.lastSendAt + this.intervalMs - this.clock.now())
    this.timer = this.clock.setTimeout(() => this.tick(), wait)
  }

  isPending(id: number): boolean {
    return this.pending.has(id)
  }

  get idle(): boolean {
    return this.pending.size === 0 && this.timer === null
  }

  /** Drop everything queued, e.g. on disconnect or layer change. Never replays stale writes. */
  clear(): void {
    this.pending.clear()
    if (this.timer !== null) this.clock.clearTimeout(this.timer)
    this.timer = null
  }

  private tick(): void {
    this.timer = null
    if (this.pending.size === 0) return
    const batch = [...this.pending].map(([id, value]) => ({ id, value }))
    this.pending.clear()
    this.lastSendAt = this.clock.now()
    this.send(batch)
    // Re-arm once so anything queued during the interval goes out on the next tick.
    this.timer = this.clock.setTimeout(() => this.tick(), this.intervalMs)
  }
}
