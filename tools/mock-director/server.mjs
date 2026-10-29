// Mock disguise Director for development and tests (BUILD_PLAN Phase 1).
//
//   npm run mock                         ws://localhost:8090/api/session/liveupdate
//   npm run mock -- --port 9000 --designer-edits --live-every 8000
//
// Speaks the Live Update protocol (subscribe / unsubscribe / set → subscriptions /
// valuesChanged / error) and POST /api/session/python/execute. It understands the
// placeholder paths in shared/disguise/paths.ts (imported directly, so they never drift),
// rotates which ColourAdjust layers are "live" on a timer, and logs any client traffic
// that breaks the API budget (PRODUCT_SPEC §7).
//
// --designer-edits  nudges a value every 15 s, as if someone changed it in Designer (FR23)
// --live-every <ms> how often the live-layer list changes (default 10000; 0 = never)
//
// Test controls (mock only, not part of disguise):
//   POST /mock/live?layers=0,2    set which layers are live (indices; empty = none)
//   GET  /mock/values?layer=0     current ColourAdjust values of a layer
//   POST /mock/reset              every layer back to neutral values
//   GET  /mock/stats              { clients, pythonCalls }

import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'
import { BYPASS_PATH, LIVE_LAYERS_SUBSCRIPTION, SCRIPT_TAG } from '../../shared/disguise/paths.ts'

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const opt = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const PORT = Number(opt('--port', 8090))
const LIVE_EVERY_MS = Number(opt('--live-every', 10000))
const BUDGET_INTERVAL_MS = 50
const JITTER_MS = 5

// ── fake project ──────────────────────────────────────────────────────────────

// Field sequences and default values as measured on a real Director (probes/, 2026-10-29).
// Every field is a single KeyFloat; Colour fields are one sequence per channel.
function neutralValues() {
  const colour = (name, r, g, b, a) => ({ [`${name}.r`]: r, [`${name}.g`]: g, [`${name}.b`]: b, [`${name}.a`]: a })
  return {
    blendMode: 1,
    brightness: 1,
    'source.arrow': 0,
    'source.isExplicitEffectMode': 0,
    ccWhiteBalanceMode: 0,
    ccKelvin: 5000,
    ccTint: 0,
    ccContrast: 0,
    ccBrightness: 0,
    ccSaturation: 0,
    ...colour('tint', 1, 1, 1, 1),
    ...colour('shadowColour', 0, 0, 0, 0),
    ...colour('midtoneColour', 1, 1, 1, 1),
    ...colour('gainColour', 1, 1, 1, 1),
    outputLevelLow: 0,
    outputLevelHigh: 1,
    oututLevelClampEnable: 0,
    outputLevelLowClamp: 0,
    outputLevelHighClamp: 1,
  }
}

const layers = [
  { uid: '0x00000000000a0001', name: 'LED Main', track: 'track_1' },
  { uid: '0x00000000000a0002', name: 'LED Left IMAG', track: 'track_1' },
  { uid: '0x00000000000a0003', name: 'LED Right IMAG', track: 'track_1' },
].map((l) => ({ ...l, values: neutralValues(), render: true }))

// Which layers are live: cycles through a few playhead positions.
const liveSchedule = [[0], [0, 1], [0, 1, 2], [1, 2], [], [0]]
let pythonCalls = 0
let liveStep = 0
let liveOverride = liveSchedule[0]
const liveLayers = () => liveOverride.map((i) => ({ uid: layers[i].uid, name: layers[i].name, track: layers[i].track }))

// ── property resolution ───────────────────────────────────────────────────────

const VALUE_PATH = /^object\.findSequence\("([^"]+)"\)\.sequence\.key\((\d+)\)\.v$/
const LAYER_OBJECT = /^getByUID\((.+)\)$/

/** Returns { get(), set(v) } or throws with a disguise-like message. */
function resolve(objectPath, propertyPath) {
  if (objectPath === LIVE_LAYERS_SUBSCRIPTION.object && propertyPath === LIVE_LAYERS_SUBSCRIPTION.property) {
    return {
      get: liveLayers,
      set: () => {
        throw new Error('Property is not settable')
      },
    }
  }
  const o = LAYER_OBJECT.exec(objectPath)
  if (!o) throw new Error(`Unable to subscribe to object: ${objectPath}`)
  const layer = layers.find((l) => l.uid === o[1])
  if (!layer) throw new Error(`Unable to subscribe to object: ${objectPath}`)
  if (propertyPath === BYPASS_PATH) {
    return {
      get: () => layer.render,
      set: (v) => {
        if (typeof v !== 'boolean') throw new Error('Type mismatch setting render')
        layer.render = v
      },
    }
  }
  const p = VALUE_PATH.exec(propertyPath)
  const seq = p && p[1]
  if (!seq || !(seq in layer.values) || p[2] !== '0') throw new Error(`Unable to evaluate property: ${propertyPath}`)
  return {
    get: () => layer.values[seq],
    set: (v) => {
      if (typeof v !== 'number') throw new Error(`Type mismatch setting ${seq}`)
      layer.values[seq] = Math.fround(v) // disguise stores KeyFloat as float32
    },
  }
}

// ── subscriptions ─────────────────────────────────────────────────────────────

let nextId = 1
/** key `${object}\0${property}` → { id, objectPath, propertyPath, resolver } — ids never repeat */
const subsByKey = new Map()
const subsById = new Map()
/** client → { refs: Map<id, count>, freq: Map<id, ms>, lastPush: Map<id, t>, dirty: Set<id>, stats } */
const clients = new Map()

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg))
}

function subscriptionList(client) {
  return [...client.refs.keys()].map((id) => {
    const s = subsById.get(id)
    return { id, objectPath: s.objectPath, propertyPath: s.propertyPath }
  })
}

function valueMessage(ids) {
  const t = process.uptime()
  return {
    valuesChanged: ids.map((id) => ({ id, value: subsById.get(id).resolver.get(), changeTimestamp: t, messageTimestamp: t })),
  }
}

/** Marks a subscription changed for every client; pushed at each client's frequency. */
function markDirty(id) {
  for (const c of clients.values()) if (c.refs.has(id)) c.dirty.add(id)
}

function onSubscribe(ws, client, msg) {
  const { object, properties, configuration } = msg
  if (typeof object !== 'string' || !Array.isArray(properties)) {
    send(ws, { error: 'subscribe requires "object" and "properties" (array)' })
    return
  }
  const freq = Math.max(BUDGET_INTERVAL_MS, Number(configuration?.updateFrequencyMs) || BUDGET_INTERVAL_MS)
  const fresh = []
  for (const property of properties) {
    const key = `${object}\u0000${property}`
    let sub = subsByKey.get(key)
    if (!sub) {
      let resolver
      try {
        resolver = resolve(object, property)
      } catch (err) {
        send(ws, { error: err.message })
        continue
      }
      sub = { id: nextId++, objectPath: object, propertyPath: property, resolver }
      subsByKey.set(key, sub)
      subsById.set(sub.id, sub)
    }
    const count = client.refs.get(sub.id) ?? 0
    client.refs.set(sub.id, count + 1)
    client.freq.set(sub.id, freq)
    if (count === 0) fresh.push(sub.id)
  }
  send(ws, { subscriptions: subscriptionList(client) })
  if (fresh.length) send(ws, valueMessage(fresh))
}

function onUnsubscribe(ws, client, msg) {
  const ids = Array.isArray(msg.ids) ? msg.ids : [msg.id]
  for (const id of ids) {
    if (!Number.isInteger(id)) {
      send(ws, { error: `Invalid subscription id: ${JSON.stringify(id)}` })
      continue
    }
    const count = client.refs.get(id) ?? 0
    if (count <= 1) {
      client.refs.delete(id)
      client.dirty.delete(id)
    } else client.refs.set(id, count - 1)
  }
  send(ws, { subscriptions: subscriptionList(client) })
}

function onSet(ws, client, entries) {
  const now = Date.now()
  for (const { id, value } of entries) {
    const last = client.stats.lastSetAt.get(id)
    if (last !== undefined && now - last < BUDGET_INTERVAL_MS - JITTER_MS) {
      client.stats.violations++
      console.warn(`[mock] BUDGET: id ${id} set twice within ${now - last} ms`)
    }
    client.stats.lastSetAt.set(id, now)
    const sub = subsById.get(id)
    if (!sub || !client.refs.has(id)) {
      send(ws, { error: `Unknown subscription id: ${id}` })
      continue
    }
    try {
      sub.resolver.set(value)
      markDirty(id)
    } catch (err) {
      send(ws, { error: err.message })
    }
  }
}

// ── servers ───────────────────────────────────────────────────────────────────

function setLiveLayers(indices) {
  liveOverride = indices.filter((i) => layers[i])
  const sub = liveSub()
  if (sub) markDirty(sub.id)
  console.log(`[mock] live layers: ${liveLayers().map((l) => l.name).join(', ') || '(none)'}`)
}

const http = createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://localhost')
  if (req.method === 'POST' && url.pathname === '/mock/live') {
    const raw = url.searchParams.get('layers') ?? ''
    setLiveLayers(raw === '' ? [] : raw.split(',').map(Number))
    res.writeHead(204).end()
    return
  }
  if (req.method === 'POST' && url.pathname === '/mock/reset') {
    for (const l of layers) {
      l.values = neutralValues()
      l.render = true
    }
    res.writeHead(204).end()
    return
  }
  if (req.method === 'GET' && url.pathname === '/mock/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ clients: clients.size, pythonCalls }))
    return
  }
  if (req.method === 'GET' && url.pathname === '/mock/values') {
    const layer = layers[Number(url.searchParams.get('layer') ?? 0)]
    res.writeHead(layer ? 200 : 404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(layer ? { ...layer.values, render: layer.render } : { error: 'no such layer' }))
    return
  }
  if (req.method === 'POST' && req.url === '/api/session/python/execute') {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      let script = ''
      try {
        script = JSON.parse(body).script ?? ''
      } catch {}
      let result
      if (script.startsWith(SCRIPT_TAG.discovery)) {
        result = {
          status: { code: 0, message: '' },
          returnValue: JSON.stringify(layers.map((l) => ({ uid: l.uid, name: l.name, track: l.track, tStart: 0, tEnd: 60 }))),
        }
      } else if (script.startsWith(SCRIPT_TAG.keyframe)) {
        result = { status: { code: 0, message: '' }, returnValue: JSON.stringify({ keyIndex: 0, added: true }) }
      } else {
        result = { status: { code: 1, message: 'mock: unrecognised script' }, returnValue: 'null' }
      }
      pythonCalls++
      console.log(`[mock] python execute: ${script.split('\n')[0]}`)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ...result, d3Log: '', pythonLog: '' }))
    })
    return
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' })
  res.end('mock director: only /api/session/liveupdate (ws) and /api/session/python/execute')
})

const wss = new WebSocketServer({ server: http, path: '/api/session/liveupdate' })

wss.on('connection', (ws) => {
  const client = {
    refs: new Map(),
    freq: new Map(),
    lastPush: new Map(),
    dirty: new Set(),
    stats: { messages: 0, sets: 0, violations: 0, lastSetAt: new Map() },
  }
  clients.set(ws, client)
  console.log(`[mock] client connected (${clients.size} open)`)

  ws.on('message', (raw) => {
    client.stats.messages++
    let msg
    try {
      msg = JSON.parse(String(raw))
    } catch {
      send(ws, { error: 'Invalid JSON' })
      return
    }
    if (msg.subscribe) onSubscribe(ws, client, msg.subscribe)
    else if (msg.unsubscribe) onUnsubscribe(ws, client, msg.unsubscribe)
    else if (Array.isArray(msg.set)) {
      client.stats.sets++
      onSet(ws, client, msg.set)
    } else send(ws, { error: 'Unknown message' })
  })

  ws.on('close', () => {
    clients.delete(ws)
    const leaked = client.refs.size
    console.log(`[mock] client disconnected${leaked ? ` with ${leaked} subscriptions still open` : ''}`)
  })
})

// Push dirty values at each client's subscription frequency.
setInterval(() => {
  const now = Date.now()
  for (const [ws, c] of clients) {
    const due = [...c.dirty].filter((id) => now - (c.lastPush.get(id) ?? 0) >= c.freq.get(id))
    if (!due.length) continue
    for (const id of due) {
      c.dirty.delete(id)
      c.lastPush.set(id, now)
    }
    send(ws, valueMessage(due))
  }
}, 10)

// Budget summary each second, only when there was traffic.
setInterval(() => {
  for (const c of clients.values()) {
    if (c.stats.messages) {
      const v = c.stats.violations ? `  ⚠ ${c.stats.violations} budget violations` : ''
      console.log(`[mock] client msgs/s: ${c.stats.messages} (set: ${c.stats.sets})${v}`)
    }
    c.stats.messages = c.stats.sets = c.stats.violations = 0
  }
}, 1000)

// Playhead moves: the live-layer list changes.
const liveSub = () => subsByKey.get(`${LIVE_LAYERS_SUBSCRIPTION.object}\u0000${LIVE_LAYERS_SUBSCRIPTION.property}`)
if (LIVE_EVERY_MS > 0) {
  setInterval(() => {
    liveStep++
    setLiveLayers(liveSchedule[liveStep % liveSchedule.length])
  }, LIVE_EVERY_MS)
}

if (flag('--designer-edits')) {
  setInterval(() => {
    const layer = layers[0]
    layer.values.ccKelvin = layer.values.ccKelvin === 5000 ? 5600 : 5000
    for (const sub of subsById.values()) {
      if (sub.objectPath === `getByUID(${layer.uid})` && sub.propertyPath.includes('"ccKelvin"')) markDirty(sub.id)
    }
    console.log(`[mock] designer edit: ${layer.name} ccKelvin = ${layer.values.ccKelvin}`)
  }, 15000)
}

http.listen(PORT, () => {
  console.log(`[mock] disguise mock director on ws://localhost:${PORT}/api/session/liveupdate`)
  console.log(`[mock] python execute on http://localhost:${PORT}/api/session/python/execute`)
})
