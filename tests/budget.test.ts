// API budget (PRODUCT_SPEC §7). These must fail if any hard limit is exceeded.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BACKOFF_MAX_MS, LiveUpdateClient, type SocketLike } from '../server/director/liveUpdate.ts'
import { PythonApi, PythonBudgetError } from '../server/director/pythonApi.ts'
import { WRITE_INTERVAL_MS } from '../server/director/writeThrottle.ts'

class FakeSocket implements SocketLike {
  readyState = 0
  sent: { at: number; msg: Record<string, unknown> }[] = []
  onopen: SocketLike['onopen'] = null
  onclose: SocketLike['onclose'] = null
  onerror: SocketLike['onerror'] = null
  onmessage: SocketLike['onmessage'] = null
  send(data: string) {
    this.sent.push({ at: Date.now(), msg: JSON.parse(data) })
  }
  close() {
    this.readyState = 3
  }
  open() {
    this.readyState = 1
    this.onopen?.({})
  }
  drop() {
    this.readyState = 3
    this.onclose?.({})
  }
  receive(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) })
  }
  sets() {
    return this.sent.filter((s) => 'set' in s.msg) as { at: number; msg: { set: { id: number; value: unknown }[] } }[]
  }
}

function setup() {
  const sockets: FakeSocket[] = []
  const values: { id: number; value: unknown }[][] = []
  const client = new LiveUpdateClient({
    socketFactory: () => {
      const s = new FakeSocket()
      sockets.push(s)
      return s
    },
    onValues: (u) => values.push(u),
  })
  client.connect('ws://mock/api/session/liveupdate')
  sockets[0]!.open()
  return { client, sockets, socket: sockets[0]!, values }
}

/** Simulates a drag: pointermove at 120 Hz for `ms`, writing to each id. */
function drag(client: LiveUpdateClient, ids: number[], ms: number, start = 0) {
  let v = start
  for (let t = 0; t < ms; t += 1000 / 120) {
    v += 0.001
    for (const id of ids) client.set(id, v)
    vi.advanceTimersByTime(1000 / 120)
  }
  return v
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('Live Update budget', () => {
  it('writes each property at most once per 50 ms during a drag', () => {
    const { client, socket } = setup()
    drag(client, [1, 2, 3], 2000)
    vi.advanceTimersByTime(200)

    const lastAt = new Map<number, number>()
    for (const { at, msg } of socket.sets()) {
      for (const { id } of msg.set) {
        const prev = lastAt.get(id)
        if (prev !== undefined) expect(at - prev).toBeGreaterThanOrEqual(WRITE_INTERVAL_MS)
        lastAt.set(id, at)
      }
    }
    // ≤ 20 messages per second, all properties batched into each one
    expect(socket.sets().length).toBeLessThanOrEqual(2000 / WRITE_INTERVAL_MS + 1)
    expect(socket.sets().every((s) => s.msg.set.length === 3)).toBe(true)
  })

  it('always sends the final value on release', () => {
    const { client, socket } = setup()
    const final = drag(client, [7], 333)
    vi.advanceTimersByTime(WRITE_INTERVAL_MS)
    const last = socket.sets().at(-1)!.msg.set.find((e) => e.id === 7)
    expect(last?.value).toBeCloseTo(final, 12)
  })

  it('sends nothing while idle', () => {
    const { client, socket } = setup()
    drag(client, [1], 300)
    vi.advanceTimersByTime(WRITE_INTERVAL_MS)
    const count = socket.sent.length
    vi.advanceTimersByTime(60_000)
    expect(socket.sent.length).toBe(count)
    expect(client.writesIdle).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('Undo / Bypass / Reset leave as one batched message', () => {
    const { client, socket } = setup()
    client.setMany(Array.from({ length: 15 }, (_, i) => ({ id: i + 1, value: i })))
    vi.advanceTimersByTime(WRITE_INTERVAL_MS * 3)
    expect(socket.sets()).toHaveLength(1)
    expect(socket.sets()[0]!.msg.set).toHaveLength(15)
  })

  it('refuses read-back faster than 50 ms', () => {
    const { client } = setup()
    expect(() => client.subscribe('x', ['object.y'], 10)).toThrow()
  })

  it('reconnects with back-off from 1 s up to 10 s, one socket at a time', () => {
    const { sockets } = setup()
    const opened: number[] = []
    for (let i = 0; i < 8; i++) {
      sockets.at(-1)!.drop()
      const before = sockets.length
      const t0 = Date.now()
      while (sockets.length === before) vi.advanceTimersByTime(100)
      opened.push(Date.now() - t0)
    }
    expect(opened[0]).toBe(1000)
    expect(opened[1]).toBe(2000)
    expect(Math.max(...opened)).toBe(BACKOFF_MAX_MS)
    expect(sockets.filter((s) => s.readyState !== 3).length).toBeLessThanOrEqual(1)
  })

  it('never replays queued writes after a reconnect', () => {
    const { client, sockets } = setup()
    client.set(1, 0.5)
    client.set(1, 0.6) // queued behind the first write
    sockets[0]!.drop()
    vi.advanceTimersByTime(1000)
    sockets[1]!.open()
    vi.advanceTimersByTime(1000)
    expect(sockets[1]!.sets()).toHaveLength(0)
  })
})

describe('echo suppression', () => {
  it('ignores echoes of our own writes', () => {
    const { client, socket, values } = setup()
    client.set(4, 0.25)
    socket.receive({ valuesChanged: [{ id: 4, value: 0.25 }] })
    vi.advanceTimersByTime(1000)
    expect(values).toHaveLength(0)
  })

  it('delivers a value disguise changed (e.g. clamped) once writing goes quiet', () => {
    const { client, socket, values } = setup()
    client.set(4, 5)
    socket.receive({ valuesChanged: [{ id: 4, value: 2 }] })
    expect(values).toHaveLength(0)
    vi.advanceTimersByTime(1000)
    expect(values.flat()).toEqual([{ id: 4, value: 2 }])
  })

  it('passes through changes made in Designer', () => {
    const { socket, values } = setup()
    socket.receive({ valuesChanged: [{ id: 9, value: { r: 0.1, g: 0.2, b: 0.3 } }] })
    expect(values.flat()).toEqual([{ id: 9, value: { r: 0.1, g: 0.2, b: 0.3 } }])
  })
})

describe('Python Execution API budget', () => {
  const okFetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ status: { code: 0 }, returnValue: '[]' }) }))

  it('allows one discovery per connection', async () => {
    const py = new PythonApi('mock', okFetch)
    await py.execute('discovery', 'x')
    await expect(py.execute('discovery', 'x')).rejects.toThrow(PythonBudgetError)
    py.resetForConnect('mock')
    await expect(py.execute('discovery', 'x')).resolves.toMatchObject({ ok: true })
  })

  it('allows a keyframe call only inside a gesture, once per property', async () => {
    const py = new PythonApi('mock', okFetch)
    await expect(py.execute('keyframe', 'x', 'ccKelvin')).rejects.toThrow(PythonBudgetError)
    py.beginGesture('g1')
    await py.execute('keyframe', 'x', 'ccKelvin')
    await py.execute('keyframe', 'x', 'ccTint')
    await expect(py.execute('keyframe', 'x', 'ccKelvin')).rejects.toThrow(PythonBudgetError)
    py.endGesture()
    py.beginGesture('g2')
    await expect(py.execute('keyframe', 'x', 'ccKelvin')).resolves.toMatchObject({ ok: true })
  })

  it('never stacks calls', async () => {
    const py = new PythonApi('mock', okFetch)
    const first = py.execute('refresh', 'x')
    await expect(py.execute('refresh', 'x')).rejects.toThrow(PythonBudgetError)
    await first
  })

  it('parses returnValue JSON', async () => {
    const py = new PythonApi('mock', okFetch)
    const r = await py.execute('refresh', 'x')
    expect(r.returnValue).toEqual([])
  })
})
