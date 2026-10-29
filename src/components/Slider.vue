<script setup lang="ts">
// Horizontal slider: label · track (hint gradient, neutral tick, thumb) · value field.
// Drag anywhere on the track moves the value relative to where it was (no jump on touch-down),
// so a stray tap never changes the grade. Shift = fine (÷10). Mouse wheel nudges.
// Double-tap the track or label, or the reset button, resets to neutral. Tap the value field to type.
import { computed, ref } from 'vue'
import ResetIcon from './ResetIcon.vue'
import ValueField from './ValueField.vue'

const props = withDefaults(
  defineProps<{
    label: string
    value: number
    neutral: number
    min: number
    max: number
    dp?: number
    /** Value-field drag sensitivity per px. */
    step: number
    /** CSS custom property holding the hint gradient, e.g. '--hint-temp'. */
    hint: string
    tooltip: string
  }>(),
  { dp: 2 },
)

const emit = defineEmits<{
  gestureStart: []
  input: [value: number]
  gestureEnd: []
  commit: [value: number]
  reset: []
}>()

const clamp = (v: number) => Math.min(props.max, Math.max(props.min, v))

// value ↔ track position 0…1
function toPos(v: number): number {
  return (clamp(v) - props.min) / (props.max - props.min)
}
function fromPos(p: number): number {
  return props.min + Math.min(1, Math.max(0, p)) * (props.max - props.min)
}

const pos = computed(() => toPos(props.value))
const atNeutral = computed(() => Math.abs(props.value - props.neutral) < 0.5 * 10 ** -props.dp)
const neutralPos = computed(() => toPos(props.neutral))
const fillLeft = computed(() => Math.min(pos.value, neutralPos.value))
const fillWidth = computed(() => Math.abs(pos.value - neutralPos.value))

const track = ref<HTMLElement | null>(null)
let pointerId: number | null = null
let startX = 0
let startPos = 0
let width = 1
let moved = false
let lastTap = 0

function onPointerDown(e: PointerEvent) {
  if (e.button > 0) return
  const now = performance.now()
  if (now - lastTap < 300) {
    lastTap = 0
    emit('reset')
    return
  }
  lastTap = now
  pointerId = e.pointerId
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  startX = e.clientX
  startPos = pos.value
  width = track.value?.clientWidth || 1
  moved = false
}

function onPointerMove(e: PointerEvent) {
  if (e.pointerId !== pointerId) return
  const dx = e.clientX - startX
  if (!moved && Math.abs(dx) > 3) {
    moved = true
    lastTap = 0
    emit('gestureStart')
  }
  if (moved) emit('input', fromPos(startPos + (dx / width) * (e.shiftKey ? 0.1 : 1)))
}

function onPointerUp(e: PointerEvent) {
  if (e.pointerId !== pointerId) return
  pointerId = null
  if (moved) emit('gestureEnd')
}

let wheelTimer: ReturnType<typeof setTimeout> | null = null
function onWheel(e: WheelEvent) {
  e.preventDefault()
  if (!wheelTimer) emit('gestureStart')
  else clearTimeout(wheelTimer)
  const notch = -Math.sign(e.deltaY) * 0.005 * (e.shiftKey ? 0.1 : 1)
  emit('input', fromPos(pos.value + notch))
  wheelTimer = setTimeout(() => {
    wheelTimer = null
    emit('gestureEnd')
  }, 250)
}

const pct = (p: number) => `${p * 100}%`
</script>

<template>
  <div class="slider" :title="tooltip">
    <label @dblclick="emit('reset')">{{ label }}</label>
    <div
      ref="track"
      class="track"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @wheel="onWheel"
    >
      <div class="rail">
        <div class="hint" :style="{ background: `var(${hint})` }" />
        <div class="fill" :style="{ left: pct(fillLeft), width: pct(fillWidth) }" />
      </div>
      <div class="tick" :style="{ left: pct(neutralPos) }" />
      <div class="thumb" :style="{ left: pct(pos) }" />
    </div>
    <ValueField
      :value="value"
      :dp="dp"
      :step="step"
      :min="min"
      :max="max"
      :title="tooltip"
      @gesture-start="emit('gestureStart')"
      @input="(v) => emit('input', v)"
      @gesture-end="emit('gestureEnd')"
      @commit="(v) => emit('commit', v)"
    />
    <button class="reset" :class="{ neutral: atNeutral }" :title="`Reset ${label}`" @click="emit('reset')">
      <ResetIcon />
    </button>
  </div>
</template>

<style scoped>
.slider {
  display: grid;
  grid-template-columns: 56px 1fr var(--field-w) var(--touch-min);
  align-items: center;
  gap: 12px;
  min-height: var(--touch-min);
}
label {
  font-size: var(--fs-label);
  color: var(--text-label);
  text-align: right;
  cursor: default;
}
.track {
  position: relative;
  height: var(--touch-min);
  cursor: ew-resize;
  touch-action: none;
}
.rail {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 6px;
  transform: translateY(-50%);
  border-radius: 3px;
  background: var(--surface-well);
  overflow: hidden;
}
.hint {
  position: absolute;
  inset: auto 0 0 0;
  height: 2px;
  opacity: 0.8;
}
.fill {
  position: absolute;
  top: 0;
  bottom: 2px;
  background: var(--master-arc);
  opacity: 0.35;
}
.tick {
  position: absolute;
  top: calc(50% - 9px);
  width: 1px;
  height: 18px;
  background: var(--crosshair);
}
.thumb {
  position: absolute;
  top: 50%;
  width: 14px;
  height: 22px;
  transform: translate(-50%, -50%);
  border: 1px solid var(--border-field);
  border-radius: 3px;
  background: var(--puck);
  pointer-events: none;
}
.reset {
  width: var(--touch-min);
  height: var(--touch-min);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  color: var(--icon-inactive);
  cursor: pointer;
  touch-action: none;
}
.reset:hover {
  color: var(--icon-active);
}
.reset.neutral {
  opacity: var(--later);
}
.track:hover .thumb {
  background: var(--text-primary);
}
</style>
