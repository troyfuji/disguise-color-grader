// The grading session: the server's single link to the Director, shared by every panel.
//
//  - one Live Update socket and all Python calls (API budget, PRODUCT_SPEC §7)
//  - one selected layer; writes only to it, and only while it is live (FR6–FR8)
//  - authoritative GradeState for that layer; panels send edits, the server converts with
//    toDisguise() and writes only the fields that changed, through the 50 ms throttle
//  - read-back from Designer is converted with fromDisguise() and broadcast (FR23)
//  - the shared preset list (no disguise traffic; applying a preset is an ordinary grade edit)

import { LiveUpdateClient, liveUpdateUrl, type LiveUpdateOptions, type ValueUpdate } from './director/liveUpdate.ts'
import { PythonApi, PythonBudgetError, type FetchLike } from './director/pythonApi.ts'
import { PresetError, type PresetStore } from './presets.ts'
import { rawValue, valuesFromRaw } from '../shared/disguise/fields.ts'
import {
  BYPASS_PATH,
  DISCOVERY_SCRIPT,
  LIVE_FIELDS,
  LIVE_LAYERS_SUBSCRIPTION,
  layerObject,
  propertyPath,
  WB_MODE_CUSTOM,
} from '../shared/disguise/paths.ts'
import { fromDisguise } from '../shared/grade/fromDisguise.ts'
import { neutralGrade } from '../shared/grade/neutral.ts'
import { toDisguise } from '../shared/grade/toDisguise.ts'
import type { DisguiseValues, GradeState } from '../shared/grade/types.ts'
import { isGradeState } from '../shared/grade/validate.ts'
import {
  DIRECTOR_ADDRESS_RE,
  type GradeOrigin,
  type LayerInfo,
  type PanelMessage,
  type ServerMessage,
  type SessionState,
} from '../shared/protocol.ts'

export interface PanelLink {
  readonly id: string
  send(msg: ServerMessage): void
}

export interface SessionOptions {
  version?: string
  /** Called when the Director address changes, so the server can remember it (FR2). */
  onAddressChange?: (address: string) => void
  liveUpdate?: Pick<LiveUpdateOptions, 'socketFactory' | 'clock'>
  fetch?: FetchLike
  log?: (line: string) => void
  /** Shared grade presets. Without one, preset requests are refused. */
  presets?: PresetStore
}

const VALUE_FREQ_MS = 50
const SEQS = LIVE_FIELDS.map((f) => f.seq)

/** disguise stores KeyFloat values as float32, so compare with a relative tolerance. */
function sameNumber(a: unknown, b: unknown): boolean {
  if (typeof a !== 'number' || typeof b !== 'number') return a === b
  return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b))
}

export class GradingSession {
  private readonly panels = new Map<string, PanelLink>()
  private readonly live: LiveUpdateClient
  private readonly python: PythonApi
  private readonly opts: SessionOptions
  private readonly log: (line: string) => void

  private state: SessionState = {
    director: { address: '', status: 'offline' },
    liveLayers: [],
    selected: null,
    selectedLive: false,
    ready: false,
    bypass: false,
    layerEpoch: 0,
  }
  private grade: GradeState | null = null
  private liveListId: number | null = null
  private layerIds: number[] = []
  /** Subscription id → sequence name (LIVE_FIELDS) or BYPASS_PATH. */
  private idToSeq = new Map<number, string>()
  private seqToId = new Map<string, number>()
  /** What the selected layer holds now per sequence, as far as we know (last read or written). */
  private onLayer = new Map<string, unknown>()
  /** Values that arrived before their subscription ids were mapped. */
  private unmapped = new Map<number, unknown>()

  constructor(opts: SessionOptions = {}) {
    this.opts = opts
    this.log = opts.log ?? (() => {})
    this.python = new PythonApi('', opts.fetch)
    this.live = new LiveUpdateClient({
      ...opts.liveUpdate,
      onState: (s) => this.onDirectorState(s),
      onValues: (u) => this.onValues(u),
      onError: (e) => this.notice('warn', `disguise: ${e}`),
    })
  }

  get snapshot(): SessionState {
    return structuredClone(this.state)
  }

  get currentGrade(): GradeState | null {
    return this.grade && structuredClone(this.grade)
  }

  /** Outgoing message counts to the Director, for logging and tests. */
  get directorStats() {
    return { liveUpdate: { ...this.live.stats }, python: { ...this.python.counts } }
  }

  // ── panels ──────────────────────────────────────────────────────────────────

  attach(panel: PanelLink): void {
    this.panels.set(panel.id, panel)
    panel.send({ type: 'hello', panelId: panel.id, version: this.opts.version ?? '0.0.0' })
    panel.send({ type: 'session', session: this.snapshot })
    if (this.state.ready && this.grade) panel.send(this.gradeMessage('load'))
    if (this.opts.presets) panel.send({ type: 'presets', presets: this.opts.presets.list })
  }

  detach(panelId: string): void {
    this.panels.delete(panelId)
  }

  handle(panelId: string, msg: PanelMessage): void {
    switch (msg.type) {
      case 'connect':
        return this.connect(msg.address)
      case 'disconnect':
        return this.disconnect()
      case 'refresh':
        return void this.discover('refresh')
      case 'selectLayer':
        return this.selectLayer(msg.uid)
      case 'grade':
        return this.applyGrade(panelId, msg)
      case 'bypass':
        return this.setBypass(panelId, msg.on, msg.layerEpoch)
      case 'presetSave':
      case 'presetUpdate':
      case 'presetRename':
      case 'presetDelete':
        return this.editPresets(panelId, msg)
    }
  }

  // ── presets ─────────────────────────────────────────────────────────────────

  private editPresets(
    panelId: string,
    msg: Extract<PanelMessage, { type: 'presetSave' | 'presetUpdate' | 'presetRename' | 'presetDelete' }>,
  ): void {
    const store = this.opts.presets
    const reply = (level: 'info' | 'warn', text: string) => this.panels.get(panelId)?.send({ type: 'notice', level, text })
    if (!store) return reply('warn', 'Presets are not available on this server')
    try {
      let text: string
      if (msg.type === 'presetSave') text = `Saved preset “${store.save(msg.name, msg.grade).name}”`
      else if (msg.type === 'presetUpdate') text = `Updated “${store.update(msg.id, msg.grade).name}” with the current grade`
      else if (msg.type === 'presetRename') text = `Renamed to “${store.rename(msg.id, msg.name).name}”`
      else text = `Deleted preset “${store.remove(msg.id).name}”`
      this.log(`presets: ${text}`)
      this.broadcast({ type: 'presets', presets: store.list })
      reply('info', text)
    } catch (err) {
      if (err instanceof PresetError) return reply('warn', err.message)
      this.log(`presets: ${String(err)}`)
      reply('warn', 'Could not save presets on the server')
    }
  }

  // ── Director connection ─────────────────────────────────────────────────────

  connect(address: string): void {
    if (!DIRECTOR_ADDRESS_RE.test(address)) {
      this.notice('error', `Invalid Director address: ${address}`)
      return
    }
    this.state.director.address = address
    this.opts.onAddressChange?.(address)
    this.resetLayerLink()
    this.state.selected = null
    this.python.resetForConnect(address)
    this.live.connect(liveUpdateUrl(address))
  }

  disconnect(): void {
    // Unsubscribe explicitly before closing (DISGUISE_API §7 rule 4).
    this.resetLayerLink()
    if (this.liveListId !== null) this.live.unsubscribe([this.liveListId])
    this.liveListId = null
    this.live.disconnect()
    this.state.liveLayers = []
    this.broadcastSession()
  }

  private onDirectorState(status: SessionState['director']['status']): void {
    this.state.director.status = status
    if (status === 'connected') {
      void this.onConnected()
    } else {
      // Socket gone: every subscription id is void; panels lock until values are re-read.
      this.resetLayerLink()
      this.state.layerEpoch++
    }
    this.broadcastSession()
  }

  private async onConnected(): Promise<void> {
    this.log(`connected to ${this.state.director.address}`)
    this.python.resetForConnect(this.state.director.address)
    await this.discover('discovery')
    try {
      const [id] = await this.live.subscribe(
        LIVE_LAYERS_SUBSCRIPTION.object,
        [LIVE_LAYERS_SUBSCRIPTION.property],
        LIVE_LAYERS_SUBSCRIPTION.updateFrequencyMs,
      )
      this.liveListId = id ?? null
      this.flushUnmapped()
    } catch (err) {
      this.notice('error', `Could not subscribe to the live-layer list: ${String(err)}`)
    }
    if (this.state.selected) await this.subscribeLayer(this.state.selected)
  }

  /** Python discovery: only at connect and on explicit Refresh (budget enforced by PythonApi). */
  private async discover(reason: 'discovery' | 'refresh'): Promise<void> {
    if (this.state.director.status !== 'connected') return
    try {
      const r = await this.python.execute(reason, DISCOVERY_SCRIPT)
      if (!r.ok) this.notice('warn', `Layer discovery failed: ${r.message}`)
      else this.log(`discovery: ${Array.isArray(r.returnValue) ? r.returnValue.length : 0} ColourAdjust layers`)
    } catch (err) {
      if (err instanceof PythonBudgetError) this.log(`python budget: ${err.message}`)
      else throw err
    }
  }

  // ── layer selection ─────────────────────────────────────────────────────────

  selectLayer(uid: string): void {
    const layer = this.state.liveLayers.find((l) => l.uid === uid)
    if (!layer) {
      this.notice('error', 'That layer is not live at the playhead')
      return
    }
    this.resetLayerLink()
    this.state.selected = layer
    this.state.selectedLive = true
    this.state.layerEpoch++
    this.broadcastSession()
    void this.subscribeLayer(layer)
  }

  private async subscribeLayer(layer: LayerInfo): Promise<void> {
    const epoch = this.state.layerEpoch
    let ids: number[]
    try {
      ids = await this.live.subscribe(layerObject(layer.uid), [...SEQS.map((q) => propertyPath(q)), BYPASS_PATH], VALUE_FREQ_MS)
    } catch (err) {
      this.notice('error', `Could not subscribe to ${layer.name}: ${String(err)}`)
      return
    }
    if (epoch !== this.state.layerEpoch || this.state.selected?.uid !== layer.uid) {
      this.live.unsubscribe(ids) // layer changed while we waited
      return
    }
    this.layerIds = ids
    const keys = [...SEQS, BYPASS_PATH]
    ids.forEach((id, i) => {
      this.idToSeq.set(id, keys[i]!)
      this.seqToId.set(keys[i]!, id)
    })
    this.state.selectedLive = this.state.liveLayers.some((l) => l.uid === layer.uid)
    this.flushUnmapped()
  }

  /** Unsubscribe the selected layer's values and forget anything tied to them. */
  private resetLayerLink(): void {
    this.live.dropPendingWrites()
    if (this.layerIds.length && this.state.director.status === 'connected') this.live.unsubscribe(this.layerIds)
    this.layerIds = []
    this.idToSeq.clear()
    this.seqToId.clear()
    this.unmapped.clear()
    this.onLayer.clear()
    this.grade = null
    this.state.ready = false
    this.state.bypass = false
    if (this.state.director.status !== 'connected') this.liveListId = null
  }

  // ── values from disguise ────────────────────────────────────────────────────

  private onValues(updates: ValueUpdate[]): void {
    let layerChanged = false
    for (const { id, value } of updates) {
      if (id === this.liveListId) this.onLiveList(value)
      else {
        const seq = this.idToSeq.get(id)
        if (!seq) this.unmapped.set(id, value)
        else if (seq === BYPASS_PATH) this.onRender(value)
        else {
          this.onLayer.set(seq, value)
          layerChanged = true
        }
      }
    }
    if (layerChanged) this.onLayerValues()
  }

  private flushUnmapped(): void {
    if (!this.unmapped.size) return
    const pending = [...this.unmapped].map(([id, value]) => ({ id, value }))
    this.unmapped.clear()
    this.onValues(pending.filter((u) => u.id === this.liveListId || this.idToSeq.has(u.id)))
  }

  private onLiveList(value: unknown): void {
    const list = Array.isArray(value) ? (value as LayerInfo[]).filter((l) => l && typeof l.uid === 'string') : []
    this.state.liveLayers = list
    const sel = this.state.selected
    const nowLive = !!sel && list.some((l) => l.uid === sel.uid)
    if (sel && this.state.selectedLive && !nowLive) {
      this.live.dropPendingWrites() // nothing more may reach a layer that isn't on screen
      this.notice('warn', `${sel.name} is no longer live — pick a live layer`)
    }
    this.state.selectedLive = nowLive
    this.broadcastSession()
  }

  private onLayerValues(): void {
    const values = valuesFromRaw(this.onLayer)
    if (!values) return // still waiting for some fields
    if (!this.state.ready) {
      this.grade = fromDisguise(values, neutralGrade(values.source)).state
      this.state.ready = true
      this.forceCustomWhiteBalance()
      this.broadcastSession()
      this.broadcast(this.gradeMessage('load'))
      return
    }
    if (!this.grade) return
    const r = fromDisguise(values, this.grade)
    this.grade = r.state
    this.broadcast({ ...this.gradeMessage('designer'), levelsRebuilt: r.levelsRebuilt })
  }

  /** Bypass is the layer's render flag (BYPASS_PATH), so Designer can change it too. */
  private onRender(value: unknown): void {
    const bypass = value === false || value === 0
    if (bypass === this.state.bypass) return
    this.state.bypass = bypass
    this.broadcastSession()
  }

  // ── edits from panels ───────────────────────────────────────────────────────

  private canWrite(epoch: number): string | null {
    if (this.state.director.status !== 'connected') return 'Not connected to disguise'
    if (!this.state.selected || !this.state.ready) return 'No layer loaded'
    if (!this.state.selectedLive) return `${this.state.selected.name} is no longer live`
    if (epoch !== this.state.layerEpoch) return 'Layer changed — edit ignored'
    return null
  }

  private applyGrade(panelId: string, msg: Extract<PanelMessage, { type: 'grade' }>): void {
    const refused = this.canWrite(msg.layerEpoch) ?? (this.state.bypass ? 'Bypass is on' : null)
    if (refused || !isGradeState(msg.grade)) {
      // Only report once per gesture, not on every move.
      if (msg.phase !== 'move') this.panels.get(panelId)?.send({ type: 'notice', level: 'warn', text: refused ?? 'Invalid grade' })
      if (this.grade) this.panels.get(panelId)?.send(this.gradeMessage('load'))
      return
    }
    if (msg.phase === 'begin') this.python.beginGesture(`${panelId}:${Date.now()}`)
    // TODO(Phase 3, FR17): on the first change of each field in a gesture, add a keyframe at
    // the playhead via this.python.execute('keyframe', …) before writing. Waits on Q6.
    this.grade = structuredClone(msg.grade)
    this.writeChanged(toDisguise(this.grade))
    if (msg.phase === 'end' || msg.phase === 'commit') this.python.endGesture()
    this.broadcast({ type: 'grade', grade: this.grade, origin: 'panel', layerEpoch: this.state.layerEpoch }, panelId)
  }

  /** Bypass on/off is a single write to the layer's render flag. Never creates keyframes. */
  private setBypass(panelId: string, on: boolean, epoch: number): void {
    const refused = this.canWrite(epoch)
    if (refused || !this.grade) {
      this.panels.get(panelId)?.send({ type: 'notice', level: 'warn', text: refused ?? 'No layer loaded' })
      return
    }
    const id = this.seqToId.get(BYPASS_PATH)
    if (on === this.state.bypass || id === undefined) return
    this.live.set(id, !on) // one write; the grade's keyframes are untouched
    this.state.bypass = on
    this.broadcastSession()
  }

  /**
   * Temp/Tint only work with the Custom white balance preset, so set it once when a layer
   * loads (one write, and only if it isn't Custom already). Never repeated on a timer.
   */
  private forceCustomWhiteBalance(): void {
    const seq = 'ccWhiteBalanceMode'
    const id = this.seqToId.get(seq)
    if (id === undefined || !this.state.selectedLive || sameNumber(this.onLayer.get(seq), WB_MODE_CUSTOM)) return
    this.live.set(id, WB_MODE_CUSTOM)
    this.onLayer.set(seq, WB_MODE_CUSTOM)
    this.log(`${this.state.selected?.name}: white balance preset set to Custom`)
  }

  /** Writes only the fields whose value differs from what the layer holds. */
  private writeChanged(values: DisguiseValues): void {
    for (const f of LIVE_FIELDS) {
      const id = this.seqToId.get(f.seq)
      const raw = rawValue(values, f)
      if (id === undefined || sameNumber(raw, this.onLayer.get(f.seq))) continue
      this.live.set(id, raw)
      this.onLayer.set(f.seq, raw)
    }
  }

  // ── broadcast ───────────────────────────────────────────────────────────────

  private gradeMessage(origin: GradeOrigin): Extract<ServerMessage, { type: 'grade' }> {
    return { type: 'grade', grade: structuredClone(this.grade!), origin, layerEpoch: this.state.layerEpoch }
  }

  private broadcastSession(): void {
    const msg: ServerMessage = { type: 'session', session: this.snapshot }
    for (const p of this.panels.values()) p.send(msg)
  }

  private broadcast(msg: ServerMessage, exceptPanel?: string): void {
    for (const p of this.panels.values()) if (p.id !== exceptPanel) p.send(msg)
  }

  private notice(level: 'info' | 'warn' | 'error', text: string): void {
    this.log(`${level}: ${text}`)
    this.broadcast({ type: 'notice', level, text })
  }
}
