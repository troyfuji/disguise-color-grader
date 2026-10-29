// Thin Live Update client (protocol: DISGUISE_API.md §3). The server owns exactly one instance,
// so the Director sees one socket however many panels are open. Writes go through
// WriteThrottle; echoes are filtered by EchoFilter.
// The client does not resubscribe by itself after a reconnect: subscription ids change per
// connection, so the session resubscribes and re-reads every value before unlocking (FR4).

import { EchoFilter, QUIET_MS } from './echoFilter.ts'
import { systemClock, WriteThrottle, type Clock, type SetEntry } from './writeThrottle.ts'

export type ConnectionState = 'offline' | 'connecting' | 'connected'

export interface SocketLike {
  readonly readyState: number
  send(data: string): void
  close(): void
  onopen: ((ev: unknown) => void) | null
  onclose: ((ev: unknown) => void) | null
  onerror: ((ev: unknown) => void) | null
  onmessage: ((ev: { data: unknown }) => void) | null
}
export type SocketFactory = (url: string) => SocketLike

export interface ValueUpdate {
  id: number
  value: unknown
}

export interface LiveUpdateOptions {
  socketFactory?: SocketFactory
  clock?: Clock
  onState?: (state: ConnectionState) => void
  onValues?: (updates: ValueUpdate[]) => void
  onError?: (message: string) => void
}

export const BACKOFF_MIN_MS = 1000
export const BACKOFF_MAX_MS = 10000
const SUBSCRIBE_TIMEOUT_MS = 5000
const OPEN = 1

export function liveUpdateUrl(director: string): string {
  return `ws://${director}/api/session/liveupdate`
}

interface PendingSubscribe {
  object: string
  properties: string[]
  resolve: (ids: number[]) => void
  reject: (err: Error) => void
  timer: unknown
}

export class LiveUpdateClient {
  state: ConnectionState = 'offline'
  /** Outgoing message counts, for the dev budget monitor and tests. */
  readonly stats = { messages: 0, sets: 0, subscribes: 0, unsubscribes: 0 }

  private socket: SocketLike | null = null
  private url = ''
  private wanted = false
  private backoff = BACKOFF_MIN_MS
  private reconnectTimer: unknown = null
  private pendingSubs: PendingSubscribe[] = []
  private held = new Map<number, unknown>()
  private heldTimer: unknown = null
  private readonly clock: Clock
  private readonly socketFactory: SocketFactory
  private readonly writes: WriteThrottle
  private readonly echoes = new EchoFilter()
  private readonly opts: LiveUpdateOptions

  constructor(opts: LiveUpdateOptions = {}) {
    this.opts = opts
    this.clock = opts.clock ?? systemClock
    // Node ≥ 22 has a global WebSocket client.
    this.socketFactory = opts.socketFactory ?? ((url) => new WebSocket(url) as unknown as SocketLike)
    this.writes = new WriteThrottle((batch) => this.sendSet(batch), this.clock)
  }

  connect(url: string): void {
    this.disconnect()
    this.url = url
    this.wanted = true
    this.backoff = BACKOFF_MIN_MS
    this.open()
  }

  disconnect(): void {
    this.wanted = false
    if (this.reconnectTimer !== null) this.clock.clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    const s = this.socket
    this.socket = null
    if (s) {
      s.onclose = s.onerror = s.onmessage = s.onopen = null
      s.close()
    }
    this.dropConnectionState()
    this.setState('offline')
  }

  /** Gives one id per property, in order, once the server lists them all. */
  subscribe(object: string, properties: string[], updateFrequencyMs: number): Promise<number[]> {
    if (updateFrequencyMs < 50) throw new Error('updateFrequencyMs must be ≥ 50 (API budget)')
    return new Promise((resolve, reject) => {
      if (!this.sendJson({ subscribe: { object, properties, configuration: { updateFrequencyMs } } })) {
        reject(new Error('Not connected'))
        return
      }
      this.stats.subscribes++
      const pending: PendingSubscribe = { object, properties, resolve, reject, timer: null }
      pending.timer = this.clock.setTimeout(() => {
        this.pendingSubs = this.pendingSubs.filter((p) => p !== pending)
        reject(new Error(`Subscribe timed out: ${object}`))
      }, SUBSCRIBE_TIMEOUT_MS)
      this.pendingSubs.push(pending)
    })
  }

  unsubscribe(ids: number[]): void {
    if (ids.length === 0) return
    for (const id of ids) this.held.delete(id)
    if (this.sendJson({ unsubscribe: { ids } })) this.stats.unsubscribes++
  }

  /** Queue a write; it leaves in the next throttled batch. */
  set(id: number, value: unknown): void {
    if (this.state !== 'connected') return
    this.writes.enqueue(id, value)
  }

  /** Several writes that must leave together (Undo, Redo, Bypass, Reset). */
  setMany(entries: SetEntry[]): void {
    for (const e of entries) this.set(e.id, e.value)
  }

  /** Drop every queued write, e.g. on a layer change or when the layer stops being live. */
  dropPendingWrites(): void {
    this.writes.clear()
  }

  get writesIdle(): boolean {
    return this.writes.idle
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private open(): void {
    this.setState('connecting')
    let socket: SocketLike
    try {
      socket = this.socketFactory(this.url)
    } catch (err) {
      this.opts.onError?.(err instanceof Error ? err.message : String(err))
      this.scheduleReconnect()
      return
    }
    this.socket = socket
    socket.onopen = () => {
      this.backoff = BACKOFF_MIN_MS
      this.setState('connected')
    }
    socket.onmessage = (ev) => this.onMessage(ev.data)
    socket.onerror = () => {}
    socket.onclose = () => {
      this.socket = null
      this.dropConnectionState()
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect(): void {
    if (!this.wanted) return
    this.setState('connecting')
    const wait = this.backoff
    this.backoff = Math.min(this.backoff * 2, BACKOFF_MAX_MS)
    this.reconnectTimer = this.clock.setTimeout(() => {
      this.reconnectTimer = null
      if (this.wanted) this.open()
    }, wait)
  }

  /** Anything tied to the old socket is invalid after it closes. */
  private dropConnectionState(): void {
    this.writes.clear()
    this.echoes.clear()
    this.held.clear()
    if (this.heldTimer !== null) this.clock.clearTimeout(this.heldTimer)
    this.heldTimer = null
    for (const p of this.pendingSubs) {
      this.clock.clearTimeout(p.timer)
      p.reject(new Error('Connection closed'))
    }
    this.pendingSubs = []
  }

  private setState(state: ConnectionState): void {
    if (this.state === state) return
    this.state = state
    this.opts.onState?.(state)
  }

  private sendJson(msg: unknown): boolean {
    if (!this.socket || this.socket.readyState !== OPEN) return false
    this.socket.send(JSON.stringify(msg))
    this.stats.messages++
    return true
  }

  private sendSet(batch: SetEntry[]): void {
    if (!this.sendJson({ set: batch })) return
    this.stats.sets++
    const now = this.clock.now()
    for (const e of batch) this.echoes.recordSent(e.id, e.value, now)
  }

  private onMessage(data: unknown): void {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(String(data)) as Record<string, unknown>
    } catch {
      return
    }
    if (typeof msg.error === 'string') this.opts.onError?.(msg.error)
    if (Array.isArray(msg.subscriptions)) this.onSubscriptions(msg.subscriptions as SubscriptionInfo[])
    if (Array.isArray(msg.valuesChanged)) this.onValuesChanged(msg.valuesChanged as ValueUpdate[])
  }

  private onSubscriptions(list: SubscriptionInfo[]): void {
    const idOf = new Map(list.map((s) => [`${s.objectPath}\u0000${s.propertyPath}`, s.id]))
    this.pendingSubs = this.pendingSubs.filter((p) => {
      const ids = p.properties.map((prop) => idOf.get(`${p.object}\u0000${prop}`))
      if (ids.some((id) => id === undefined)) return true
      this.clock.clearTimeout(p.timer)
      p.resolve(ids as number[])
      return false
    })
  }

  private onValuesChanged(updates: ValueUpdate[]): void {
    const now = this.clock.now()
    const deliver: ValueUpdate[] = []
    for (const u of updates) {
      if (this.echoes.isEcho(u.id, u.value, now)) continue
      if (this.isBusy(u.id, now)) this.held.set(u.id, u.value)
      else deliver.push({ id: u.id, value: u.value })
    }
    if (deliver.length) this.opts.onValues?.(deliver)
    if (this.held.size && this.heldTimer === null) this.heldTimer = this.clock.setTimeout(() => this.releaseHeld(), QUIET_MS)
  }

  private isBusy(id: number, now: number): boolean {
    return this.writes.isPending(id) || now - this.echoes.lastSentAt(id) < QUIET_MS
  }

  private releaseHeld(): void {
    this.heldTimer = null
    const now = this.clock.now()
    const deliver: ValueUpdate[] = []
    for (const [id, value] of this.held) {
      if (this.isBusy(id, now)) continue
      this.held.delete(id)
      if (!this.echoes.isEcho(id, value, now)) deliver.push({ id, value })
    }
    if (deliver.length) this.opts.onValues?.(deliver)
    if (this.held.size) this.heldTimer = this.clock.setTimeout(() => this.releaseHeld(), QUIET_MS)
  }
}

interface SubscriptionInfo {
  id: number
  objectPath: string
  propertyPath: string
}
