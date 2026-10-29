// Integration: the real LiveUpdateClient against tools/mock-director over a real socket.

import { spawn, type ChildProcess } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { LiveUpdateClient, liveUpdateUrl, type SocketLike, type ValueUpdate } from '../server/director/liveUpdate.ts'
import { LIVE_LAYERS_SUBSCRIPTION, layerObject, propertyPath } from '../shared/disguise/paths.ts'

const PORT = 18090
const DIRECTOR = `localhost:${PORT}`
const LAYER = '0x00000000000a0001'
let mock: ChildProcess

beforeAll(async () => {
  mock = spawn(process.execPath, ['tools/mock-director/server.mjs', '--port', String(PORT)], { stdio: 'pipe' })
  await new Promise<void>((resolve, reject) => {
    mock.stdout!.on('data', (d: Buffer) => d.toString().includes('mock director on') && resolve())
    mock.on('exit', (code) => reject(new Error(`mock exited ${code}`)))
  })
})

afterAll(() => {
  mock.kill()
})

function connect() {
  const updates: ValueUpdate[] = []
  const errors: string[] = []
  let onConnected: () => void
  const connected = new Promise<void>((r) => (onConnected = r))
  const client = new LiveUpdateClient({
    socketFactory: (url) => new WebSocket(url) as unknown as SocketLike,
    onValues: (u) => updates.push(...u),
    onError: (e) => errors.push(e),
    onState: (s) => s === 'connected' && onConnected(),
  })
  client.connect(liveUpdateUrl(DIRECTOR))
  return { client, updates, errors, connected }
}

const until = async (cond: () => boolean, ms = 2000) => {
  const end = Date.now() + ms
  while (!cond()) {
    if (Date.now() > end) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 10))
  }
}

describe('mock director', () => {
  it('subscribes, reads values, and syncs a set to a second panel', async () => {
    const a = connect()
    const b = connect()
    await Promise.all([a.connected, b.connected])

    const path = propertyPath('ccKelvin')
    const [idA] = await a.client.subscribe(layerObject(LAYER), [path], 50)
    const [idB] = await b.client.subscribe(layerObject(LAYER), [path], 50)
    await until(() => a.updates.some((u) => u.id === idA) && b.updates.some((u) => u.id === idB))
    expect(a.updates.find((u) => u.id === idA)?.value).toBe(5000)

    a.client.set(idA!, 5200)
    await until(() => b.updates.some((u) => u.id === idB && u.value === 5200))
    // Panel A's own echo is suppressed
    await new Promise((r) => setTimeout(r, 400))
    expect(a.updates.filter((u) => u.id === idA)).toHaveLength(1)

    a.client.disconnect()
    b.client.disconnect()
  })

  it('serves the live-layer list', async () => {
    const a = connect()
    await a.connected
    const [id] = await a.client.subscribe(LIVE_LAYERS_SUBSCRIPTION.object, [LIVE_LAYERS_SUBSCRIPTION.property], 250)
    await until(() => a.updates.some((u) => u.id === id))
    const list = a.updates.find((u) => u.id === id)!.value as { uid: string; name: string }[]
    expect(Array.isArray(list)).toBe(true)
    a.client.disconnect()
  })

  it('reports an error for an unknown path', async () => {
    const a = connect()
    await a.connected
    await expect(a.client.subscribe('getByUID(0xdead)', ['object.nope'], 50).catch(() => 'rejected')).resolves.toBe('rejected')
    expect(a.errors.length).toBeGreaterThan(0)
    a.client.disconnect()
  }, 10000)
})
