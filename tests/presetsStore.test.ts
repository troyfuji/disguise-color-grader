// Panel-side preset store: Apply works with the reactive preset objects Vue hands it.

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { neutralGrade } from '@shared/grade/neutral'
import type { Preset } from '@shared/presets'
import { useGradeStore } from '@/stores/grade'
import { usePresetsStore } from '@/stores/presets'
import { useSessionStore } from '@/stores/session'
import type { PanelMessage, SessionState } from '@shared/protocol'

const session: SessionState = {
  director: { address: '127.0.0.1', status: 'connected' },
  liveLayers: [{ uid: '0x1', name: 'L', track: 't' }],
  selected: { uid: '0x1', name: 'L', track: 't' },
  selectedLive: true,
  ready: true,
  bypass: false,
  layerEpoch: 3,
}

describe('presets store', () => {
  let sent: PanelMessage[]
  beforeEach(() => {
    setActivePinia(createPinia())
    sent = []
    const s = useSessionStore()
    s.link = 'open'
    s.session = structuredClone(session)
    s.send = (m: PanelMessage) => (sent.push(m), true)
  })

  it('Apply sends the preset as one commit and keeps the layer Source', () => {
    const grade = useGradeStore()
    grade.load(neutralGrade(1))
    grade.goLive()
    const g = neutralGrade(0)
    g.tempK = 6500
    g.saturation = -30
    const presets = usePresetsStore()
    presets.setList([{ id: 'p', name: 'Warm', grade: g, createdAt: 0, updatedAt: 0 } satisfies Preset])

    presets.apply(presets.presets[0]!) // a reactive proxy, as the page passes it
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ type: 'grade', phase: 'commit', layerEpoch: 3, grade: { tempK: 6500, saturation: -30, source: 1 } })
    expect(grade.canUndo).toBe(true)
    expect(presets.activeId).toBe('p')
  })

  it('Apply does nothing in Safe', () => {
    useGradeStore().load(neutralGrade())
    const presets = usePresetsStore()
    presets.setList([{ id: 'p', name: 'X', grade: neutralGrade(), createdAt: 0, updatedAt: 0 }])
    presets.apply(presets.presets[0]!)
    expect(sent).toHaveLength(0)
  })
})
