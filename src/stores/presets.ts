// The shared preset list (kept by the server) and the actions on it. Saving, renaming and
// deleting never touch disguise; applying is an ordinary grade edit, so it needs Live.

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { presetGradeFor, sameGrade, type Preset } from '@shared/presets'
import { useGradeStore } from './grade'
import { useSessionStore } from './session'

export const usePresetsStore = defineStore('presets', () => {
  const presets = ref<Preset[]>([])
  const session = () => useSessionStore()

  /** The preset whose grade is on the layer now, if any. */
  const activeId = computed(() => {
    const grade = useGradeStore().grade
    return session().session?.ready ? (presets.value.find((p) => sameGrade(p.grade, grade))?.id ?? null) : null
  })

  const setList = (list: Preset[]) => (presets.value = list)
  const save = (name: string) => session().send({ type: 'presetSave', name, grade: useGradeStore().grade })
  const update = (id: string) => session().send({ type: 'presetUpdate', id, grade: useGradeStore().grade })
  const rename = (id: string, name: string) => session().send({ type: 'presetRename', id, name })
  const remove = (id: string) => session().send({ type: 'presetDelete', id })

  /** One undoable edit, sent as one batched write. Keeps the layer's Source. */
  function apply(preset: Preset) {
    const grade = useGradeStore()
    grade.replaceAll(presetGradeFor(preset, grade.grade))
  }

  return { presets, activeId, setList, save, update, rename, remove, apply }
})
