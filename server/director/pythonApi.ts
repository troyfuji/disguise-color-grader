// Python Execution API client (DISGUISE_API.md §4) with the budget enforced in code
// (PRODUCT_SPEC §7, DISGUISE_API §7 rule 5). The only allowed calls are:
//   'discovery' — once per connect · 'refresh' — explicit user Refresh
//   'keyframe'  — at gesture start, at most once per property per gesture
// It is never polled; there is no timer anywhere in this module. Only the server calls it,
// straight to the Director, so browser CORS (Q9) does not matter.

export type PythonReason = 'discovery' | 'refresh' | 'keyframe'

export class PythonBudgetError extends Error {}

export interface PythonResult {
  ok: boolean
  message: string
  returnValue: unknown
}

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

const TIMEOUT_MS = 10000

export class PythonApi {
  readonly counts: Record<PythonReason, number> = { discovery: 0, refresh: 0, keyframe: 0 }
  private keyframed = new Set<string>()
  private gesture: string | null = null
  private discovered = false
  private inFlight = false
  private director: string
  private readonly fetchFn: FetchLike

  constructor(director: string, fetchFn: FetchLike = (url, init) => fetch(url, init)) {
    this.director = director
    this.fetchFn = fetchFn
  }

  /** New Live Update connection: allows one discovery call again. */
  resetForConnect(director: string): void {
    this.director = director
    this.discovered = false
  }

  beginGesture(gestureId: string): void {
    this.gesture = gestureId
    this.keyframed.clear()
  }

  endGesture(): void {
    this.gesture = null
    this.keyframed.clear()
  }

  async execute(reason: PythonReason, script: string, property?: string): Promise<PythonResult> {
    this.checkBudget(reason, property)
    this.counts[reason]++
    this.inFlight = true
    try {
      const res = await this.fetchFn(`http://${this.director}/api/session/python/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      const body = (await res.json()) as {
        status?: { code?: number; message?: string }
        returnValue?: string
        error?: string
      }
      if (!res.ok || body.error) return { ok: false, message: body.error ?? `HTTP ${res.status}`, returnValue: null }
      const ok = body.status?.code === 0
      let returnValue: unknown = body.returnValue ?? null
      if (typeof returnValue === 'string') {
        try {
          returnValue = JSON.parse(returnValue)
        } catch {
          // returnValue was a plain string
        }
      }
      return { ok, message: body.status?.message ?? '', returnValue }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err), returnValue: null }
    } finally {
      this.inFlight = false
    }
  }

  private checkBudget(reason: PythonReason, property?: string): void {
    // A Python call blocks Designer's main thread; never stack them.
    if (this.inFlight) throw new PythonBudgetError('A Python call is already in flight')
    if (reason === 'discovery') {
      if (this.discovered) throw new PythonBudgetError('Discovery already ran for this connection')
      this.discovered = true
      return
    }
    if (reason === 'keyframe') {
      if (!this.gesture) throw new PythonBudgetError('Keyframe call outside a gesture')
      if (!property) throw new PythonBudgetError('Keyframe call needs a property')
      if (this.keyframed.has(property)) throw new PythonBudgetError(`Keyframe for ${property} already added this gesture`)
      this.keyframed.add(property)
    }
  }
}
