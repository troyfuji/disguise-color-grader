// Ignores `valuesChanged` that are echoes of our own writes, so controls don't jump back
// while dragging (DISGUISE_API §7 rule 9). A non-echo that arrives while we are still
// writing that property is held, then delivered once the property goes quiet — that is how
// a value disguise rejected or clamped still reaches the panel.

export const ECHO_WINDOW_MS = 2000
export const QUIET_MS = 300
const TOLERANCE = 1e-6

function matches(sent: unknown, got: unknown): boolean {
  if (typeof sent === 'number' && typeof got === 'number') return Math.abs(sent - got) <= TOLERANCE
  if (sent && got && typeof sent === 'object' && typeof got === 'object') {
    // A partial write matches if every field we sent has the value we sent.
    const s = sent as Record<string, unknown>
    const g = got as Record<string, unknown>
    return Object.keys(s).every((k) => matches(s[k], g[k]))
  }
  return sent === got
}

export class EchoFilter {
  private sent = new Map<number, { value: unknown; at: number }[]>()

  recordSent(id: number, value: unknown, now: number): void {
    const list = (this.sent.get(id) ?? []).filter((e) => now - e.at <= ECHO_WINDOW_MS)
    list.push({ value, at: now })
    this.sent.set(id, list)
  }

  isEcho(id: number, value: unknown, now: number): boolean {
    const list = this.sent.get(id)
    return !!list && list.some((e) => now - e.at <= ECHO_WINDOW_MS && matches(e.value, value))
  }

  /** Time of our last write to this id, or -Infinity. */
  lastSentAt(id: number): number {
    const list = this.sent.get(id)
    return list && list.length ? list[list.length - 1]!.at : -Infinity
  }

  clear(): void {
    this.sent.clear()
  }
}
