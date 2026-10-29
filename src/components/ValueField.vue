<script setup lang="ts">
// Numeric field (STYLE_GUIDE §5.1, UI_SPEC §3): tap to type · horizontal drag to scrub ·
// mouse wheel to nudge · Shift = fine (÷10) · Enter commits, Esc cancels.
import { nextTick, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    value: number
    dp?: number
    /** Change per px of drag (and per wheel notch ÷ 10 × 10). */
    step: number
    min?: number
    max?: number
    disabled?: boolean
    title?: string
  }>(),
  { dp: 2, min: -Infinity, max: Infinity, disabled: false, title: '' },
)

const emit = defineEmits<{
  /** A drag or wheel run started — one undo step until gestureEnd. */
  gestureStart: []
  input: [value: number]
  gestureEnd: []
  /** Typed value (a single commit). */
  commit: [value: number]
}>()

const editing = ref(false)
const text = ref('')
const input = ref<HTMLInputElement | null>(null)
let pointerId: number | null = null
let startX = 0
let startValue = 0
let moved = false
let wheelTimer: ReturnType<typeof setTimeout> | null = null

const clamp = (v: number) => Math.min(props.max, Math.max(props.min, v))
const show = (v: number) => (Math.abs(v) < 0.5 * 10 ** -props.dp ? 0 : v).toFixed(props.dp)

function onPointerDown(e: PointerEvent) {
  if (props.disabled || editing.value || e.button > 0) return
  pointerId = e.pointerId
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  startX = e.clientX
  startValue = props.value
  moved = false
}

function onPointerMove(e: PointerEvent) {
  if (e.pointerId !== pointerId) return
  const dx = e.clientX - startX
  if (!moved && Math.abs(dx) > 3) {
    moved = true
    emit('gestureStart')
  }
  if (moved) emit('input', clamp(startValue + dx * props.step * (e.shiftKey ? 0.1 : 1)))
}

function onPointerUp(e: PointerEvent) {
  if (e.pointerId !== pointerId) return
  pointerId = null
  if (moved) emit('gestureEnd')
  else if (e.type === 'pointerup') startEdit()
}

function onWheel(e: WheelEvent) {
  if (props.disabled || editing.value) return
  e.preventDefault()
  if (!wheelTimer) emit('gestureStart')
  else clearTimeout(wheelTimer)
  const notch = -Math.sign(e.deltaY) * props.step * 10 * (e.shiftKey ? 0.1 : 1)
  emit('input', clamp(props.value + notch))
  wheelTimer = setTimeout(() => {
    wheelTimer = null
    emit('gestureEnd')
  }, 250)
}

async function startEdit() {
  editing.value = true
  text.value = show(props.value)
  await nextTick()
  input.value?.focus()
  input.value?.select()
}

function finish(commit: boolean) {
  if (!editing.value) return
  editing.value = false
  const v = parseFloat(text.value)
  if (commit && Number.isFinite(v)) emit('commit', clamp(v))
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter') finish(true)
  else if (e.key === 'Escape') finish(false)
}

defineExpose({ startEdit })
</script>

<template>
  <div
    class="field"
    :class="{ disabled }"
    :title="title"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @wheel="onWheel"
  >
    <input v-if="editing" ref="input" v-model="text" inputmode="decimal" @keydown="onKey" @blur="finish(true)" />
    <span v-else>{{ show(value) }}</span>
  </div>
</template>

<style scoped>
.field {
  position: relative;
  width: var(--field-w);
  height: var(--field-h);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-field);
  border: 1px solid var(--border-field);
  border-radius: var(--radius-field);
  color: var(--text-value);
  font-size: var(--fs-value);
  cursor: ew-resize;
  touch-action: none;
  transition: border-color var(--t-hover);
}
.field:hover {
  border-color: var(--border-field-hover);
}
.field.disabled {
  cursor: default;
}
input {
  width: 100%;
  height: 100%;
  background: transparent;
  border: 0;
  color: inherit;
  font: inherit;
  text-align: center;
  outline: none;
  -webkit-user-select: text;
  user-select: text;
}
</style>
