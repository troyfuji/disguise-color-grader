// Connection to the colour-grader server and the session state it broadcasts.

import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import type { PanelMessage, ServerMessage, SessionState } from '@shared/protocol'
import { PanelConnection, panelUrl, type LinkState } from '@/panel/connection'
import { useGradeStore } from './grade'
import { usePresetsStore } from './presets'

export interface Notice {
  level: 'info' | 'warn' | 'error'
  text: string
  at: number
}

export const useSessionStore = defineStore('session', () => {
  const link = ref<LinkState>('connecting')
  const session = ref<SessionState | null>(null)
  const notice = ref<Notice | null>(null)
  const panelId = ref('')
  const serverVersion = ref('')
  const conn = shallowRef<PanelConnection | null>(null)

  /** Server reachable, Director connected, selected layer live and loaded. */
  const writable = computed(
    () =>
      link.value === 'open' &&
      session.value?.director.status === 'connected' &&
      !!session.value.selected &&
      session.value.selectedLive &&
      session.value.ready,
  )

  function start() {
    if (!conn.value) conn.value = new PanelConnection(panelUrl(), onMessage, onLink)
  }

  function send(msg: PanelMessage): boolean {
    return conn.value?.send(msg) ?? false
  }

  function onLink(state: LinkState) {
    link.value = state
    if (state !== 'open') useGradeStore().lockSafe()
  }

  function onMessage(msg: ServerMessage) {
    const grade = useGradeStore()
    switch (msg.type) {
      case 'hello':
        panelId.value = msg.panelId
        serverVersion.value = msg.version
        break
      case 'session': {
        const prevEpoch = session.value?.layerEpoch
        session.value = msg.session
        // New layer or reconnect: back to Safe (FR22)
        if (prevEpoch !== undefined && prevEpoch !== msg.session.layerEpoch) grade.lockSafe()
        if (!msg.session.selectedLive) grade.lockSafe()
        break
      }
      case 'grade':
        if (msg.origin === 'load') grade.load(msg.grade)
        else grade.applyRemote(msg.grade)
        break
      case 'presets':
        usePresetsStore().setList(msg.presets)
        break
      case 'notice':
        notice.value = { level: msg.level, text: msg.text, at: Date.now() }
        break
    }
  }

  const connectDirector = (address: string) => send({ type: 'connect', address })
  const selectLayer = (uid: string) => send({ type: 'selectLayer', uid })
  const refresh = () => send({ type: 'refresh' })

  return { link, session, notice, panelId, serverVersion, writable, start, send, connectDirector, selectLayer, refresh }
})
