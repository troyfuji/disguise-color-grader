// Integration: the server's GradingSession against tools/mock-director over real sockets.
// Panels are fakes that record what the server sends them.

import { spawn, type ChildProcess } from 'node:child_process'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { GradingSession, type PanelLink } from '../server/session.ts'
import { neutralGrade } from '../shared/grade/neutral.ts'
import type { GradeState } from '../shared/grade/types.ts'
import type { ServerMessage, SessionState } from '../shared/protocol.ts'

const PORT = 18094
const DIRECTOR = `localhost:${PORT}`
const MOCK = `http://${DIRECTOR}`
const LED_MAIN = '0x00000000000a0001'
let mock: ChildProcess

beforeAll(async () => {
  mock = spawn(process.execPath, ['tools/mock-director/server.mjs', '--port', String(PORT), '--live-every', '0'], {
    stdio: 'pipe',
  })
  await new Promise<void>((resolve, reject) => {
    mock.stdout!.on('data', (d: Buffer) => d.toString().includes('mock director on') && resolve())
    mock.on('exit', (code) => reject(new Error(`mock exited ${code}`)))
  })
})

afterAll(() => {
  mock.kill()
})

class FakePanel implements PanelLink {
  readonly id: string
  messages: ServerMessage[] = []
  constructor(id: string) {
    this.id = id
  }
  send(msg: ServerMessage) {
    this.messages.push(msg)
  }
  get session(): SessionState | undefined {
    return this.messages.filter((m) => m.type === 'session').at(-1)?.session
  }
  grades(origin?: string) {
    return this.messages.filter(
      (m): m is Extract<ServerMessage, { type: 'grade' }> => m.type === 'grade' && (!origin || m.origin === origin),
    )
  }
}

const until = async (cond: () => boolean, ms = 3000) => {
  const end = Date.now() + ms
  while (!cond()) {
    if (Date.now() > end) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 10))
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const mockValues = async () => (await (await fetch(`${MOCK}/mock/values?layer=0`)).json()) as Record<string, any>
const setLive = (layers: string) => fetch(`${MOCK}/mock/live?layers=${layers}`, { method: 'POST' })

let session: GradingSession

/** Connects, selects LED Main and waits until its values are loaded. */
async function ready() {
  await setLive('0')
  session = new GradingSession()
  const a = new FakePanel('a')
  const b = new FakePanel('b')
  session.attach(a)
  session.attach(b)
  session.connect(DIRECTOR)
  await until(() => !!a.session?.liveLayers.some((l) => l.uid === LED_MAIN))
  session.handle('a', { type: 'selectLayer', uid: LED_MAIN })
  await until(() => !!a.session?.ready)
  return { a, b, epoch: a.session!.layerEpoch }
}

function edited(edit: (g: GradeState) => void): GradeState {
  const g = session.currentGrade ?? neutralGrade()
  edit(g)
  return g
}

const mockStats = async () => (await (await fetch(`${MOCK}/mock/stats`)).json()) as { clients: number; pythonCalls: number }

afterEach(async () => {
  session?.disconnect()
  await sleep(50)
  await fetch(`${MOCK}/mock/reset`, { method: 'POST' })
})

describe('GradingSession with the mock Director', () => {
  it('loads the layer and sends a panel edit to disguise; other panels follow', async () => {
    const { a, b, epoch } = await ready()
    expect(a.grades('load')).toHaveLength(1)

    session.handle('a', { type: 'grade', grade: edited((g) => (g.gain.master = 2)), phase: 'commit', layerEpoch: epoch })
    await until(() => b.grades('panel').length > 0)
    expect(a.grades('panel')).toHaveLength(0) // never echoed to the sender
    await sleep(150)
    const v = await mockValues()
    expect(v['gainColour.r']).toBeCloseTo(0.5, 6)
    expect(v['gainColour.a']).toBe(1) // alpha is never written
  })

  it('sets the white balance preset to Custom once when the layer loads', async () => {
    expect((await mockValues()).ccWhiteBalanceMode).toBe(0)
    await ready()
    await sleep(150)
    expect((await mockValues()).ccWhiteBalanceMode).toBe(1)
    expect(session.directorStats.liveUpdate.sets).toBe(1)
  })

  it('one Director socket and one discovery for any number of panels', async () => {
    const pythonBefore = (await mockStats()).pythonCalls
    await ready()
    for (let i = 0; i < 5; i++) session.attach(new FakePanel(`p${i}`))
    await sleep(100)
    const stats = await mockStats()
    expect(stats.clients).toBe(1)
    expect(stats.pythonCalls - pythonBefore).toBe(1)
  })

  it('a drag only writes changed fields, at most once per 50 ms', async () => {
    const { epoch } = await ready()
    const before = session.directorStats.liveUpdate.sets
    const start = Date.now()
    session.handle('a', { type: 'grade', grade: edited((g) => (g.tempK = 6000)), phase: 'begin', layerEpoch: epoch })
    for (let i = 0; i < 60; i++) {
      session.handle('a', { type: 'grade', grade: edited((g) => (g.tempK = 6000 - i)), phase: 'move', layerEpoch: epoch })
      await sleep(1000 / 120)
    }
    session.handle('a', { type: 'grade', grade: edited((g) => (g.tempK = 5000)), phase: 'end', layerEpoch: epoch })
    await sleep(200)
    const sets = session.directorStats.liveUpdate.sets - before
    expect(sets).toBeLessThanOrEqual(Math.ceil((Date.now() - start) / 50) + 1)
    expect((await mockValues()).ccKelvin).toBe(5000)
  })

  it('stops writing and locks when the layer is no longer live; never switches layer', async () => {
    const { a, epoch } = await ready()
    await setLive('1')
    await until(() => a.session?.selectedLive === false)
    expect(a.session?.selected?.uid).toBe(LED_MAIN)

    session.handle('a', { type: 'grade', grade: edited((g) => (g.tint = 0.5)), phase: 'commit', layerEpoch: epoch })
    await sleep(150)
    expect((await mockValues()).ccTint).toBe(0)
    expect(a.messages.some((m) => m.type === 'notice' && m.text.includes('no longer live'))).toBe(true)
  })

  it('ignores edits sent for an older layer epoch', async () => {
    const { epoch } = await ready()
    session.handle('a', { type: 'grade', grade: edited((g) => (g.brightness = 0.3)), phase: 'commit', layerEpoch: epoch - 1 })
    await sleep(150)
    expect((await mockValues()).ccBrightness).toBe(0)
  })

  it('refuses a malformed grade', async () => {
    const { epoch } = await ready()
    const bad = edited((g) => (g.contrast = Number.NaN))
    session.handle('a', { type: 'grade', grade: bad, phase: 'commit', layerEpoch: epoch })
    await sleep(150)
    expect((await mockValues()).ccContrast).toBe(0)
  })

  it('Bypass is one write to the layer renderEnable flag; the grade is untouched', async () => {
    const { a, epoch } = await ready()
    session.handle('a', { type: 'grade', grade: edited((g) => (g.gain.master = 2)), phase: 'commit', layerEpoch: epoch })
    await sleep(150)
    const before = session.directorStats.liveUpdate.sets
    session.handle('a', { type: 'bypass', on: true, layerEpoch: epoch })
    await sleep(150)
    expect(session.directorStats.liveUpdate.sets - before).toBe(1)
    let v = await mockValues()
    expect(v.render).toBe(false)
    expect(v['gainColour.r']).toBeCloseTo(0.5, 6)
    expect(a.session?.bypass).toBe(true)

    // edits are refused while bypassed
    session.handle('a', { type: 'grade', grade: edited((g) => (g.tint = 0.4)), phase: 'commit', layerEpoch: epoch })
    session.handle('a', { type: 'bypass', on: false, layerEpoch: epoch })
    await sleep(150)
    v = await mockValues()
    expect(v.render).toBe(true)
    expect(v.ccTint).toBe(0)
    expect(v['gainColour.r']).toBeCloseTo(0.5, 6)
  })

  it('pushes a change made in Designer to every panel', async () => {
    const { a, b } = await ready()
    // A second Live Update client stands in for Designer.
    const other = new GradingSession()
    other.attach(new FakePanel('x'))
    other.connect(DIRECTOR)
    await sleep(200)
    other.handle('x', { type: 'selectLayer', uid: LED_MAIN })
    await until(() => other.snapshot.ready)
    const g = other.currentGrade!
    g.tempK = 4300
    other.handle('x', { type: 'grade', grade: g, phase: 'commit', layerEpoch: other.snapshot.layerEpoch })
    await until(() => a.grades('designer').some((m) => m.grade.tempK === 4300) && b.grades('designer').length > 0)
    other.disconnect()
  })
})
