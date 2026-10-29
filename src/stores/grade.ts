// The panel's grade (CLAUDE.md: grade state is the source of truth). Components edit GradeState
// through these actions; each edit goes to the server, which owns the disguise link and runs
// toDisguise(). Undo/redo is this panel's own history (FR20).

import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { History } from '@shared/grade/history'
import { isNeutral, neutralGrade, resetGrade } from '@shared/grade/neutral'
import type { GradeState } from '@shared/grade/types'
import type { GesturePhase } from '@shared/protocol'
import { useSessionStore } from './session'

export type LockMode = 'safe' | 'live'

export const useGradeStore = defineStore('grade', () => {
  const grade = ref<GradeState>(neutralGrade())
  const history = shallowRef(new History<GradeState>(grade.value))
  const historyTick = ref(0) // History is not reactive; bump to refresh canUndo/canRedo
  const lock = ref<LockMode>('safe')
  const gesture = ref<'none' | 'starting' | 'active'>('none')

  const session = () => useSessionStore()
  const bypass = computed(() => session().session?.bypass ?? false)
  const modified = computed(() => !isNeutral(grade.value))
  const editable = computed(() => lock.value === 'live' && !bypass.value && session().writable)
  const canUndo = computed(() => (historyTick.value, history.value.canUndo))
  const canRedo = computed(() => (historyTick.value, history.value.canRedo))

  // 'move' edits are coalesced to one per animation frame; every other phase goes at once
  // (after flushing any pending move, so the server sees them in order).
  let moveFrame = 0
  function sendNow(phase: GesturePhase) {
    const epoch = session().session?.layerEpoch
    if (epoch === undefined) return
    session().send({ type: 'grade', grade: grade.value, phase, layerEpoch: epoch })
  }
  function send(phase: GesturePhase) {
    if (phase === 'move') {
      if (!moveFrame) {
        moveFrame = requestAnimationFrame(() => {
          moveFrame = 0
          sendNow('move')
        })
      }
      return
    }
    if (moveFrame) {
      cancelAnimationFrame(moveFrame)
      moveFrame = 0
    }
    sendNow(phase)
  }

  function beginGesture() {
    gesture.value = 'starting'
  }

  /** Apply an edit during or outside a gesture. Ignored unless the panel is editable. */
  function update(edit: (g: GradeState) => void) {
    if (!editable.value) return
    edit(grade.value)
    if (gesture.value === 'none') {
      send('commit')
      commit()
    } else {
      send(gesture.value === 'starting' ? 'begin' : 'move')
      gesture.value = 'active'
    }
  }

  function endGesture() {
    const moved = gesture.value === 'active'
    gesture.value = 'none'
    if (!moved) return
    send('end')
    commit()
  }

  function commit() {
    if (history.value.commit(grade.value)) historyTick.value++
  }

  /** Undo/Redo/Reset: the whole state goes as one edit → one batched write on the server. */
  function replace(state: GradeState | undefined) {
    if (!state) return
    grade.value = state
    historyTick.value++
    send('commit')
  }

  const undo = () => editable.value && replace(history.value.undo())
  const redo = () => editable.value && replace(history.value.redo())

  function resetAll() {
    replaceAll(resetGrade(grade.value))
  }

  /** Put a whole new grade on (Reset, a preset): one undo step, one batched write. */
  function replaceAll(state: GradeState) {
    if (!editable.value) return
    replace(state)
    commit()
  }

  function toggleBypass() {
    const s = session().session
    if (!s || lock.value !== 'live') return
    session().send({ type: 'bypass', on: !s.bypass, layerEpoch: s.layerEpoch })
  }

  /** New layer or reconnect: values from disguise, fresh history, back to Safe (FR22). */
  function load(state: GradeState) {
    grade.value = state
    history.value.reset(state)
    historyTick.value++
    lockSafe()
  }

  /** Another panel or Designer changed the grade (FR23). Not added to this panel's history. */
  function applyRemote(state: GradeState) {
    if (gesture.value !== 'none') return // our own drag wins; the server already has it
    grade.value = state
  }

  function lockSafe() {
    lock.value = 'safe'
    if (gesture.value !== 'none') gesture.value = 'none'
  }

  function goLive() {
    if (session().writable) lock.value = 'live'
  }

  return {
    grade,
    lock,
    bypass,
    modified,
    editable,
    canUndo,
    canRedo,
    beginGesture,
    update,
    endGesture,
    undo,
    redo,
    resetAll,
    replaceAll,
    toggleBypass,
    load,
    applyRemote,
    lockSafe,
    goLive,
  }
})
