<script setup lang="ts">
// Colour wheel (STYLE_GUIDE §5.3, UI_SPEC §3). The puck moves RELATIVE to where the drag
// started (never jumps under the finger). Shift-drag or two-finger drag = fine (÷4).
// Double-tap centres the puck. Puck coords: unit disc, +y up.
import { computed, ref } from 'vue'
import type { Puck } from '@shared/grade/wheel'

const props = defineProps<{
  puck: Puck
  /** 0…1 share of the master arc (0.5 = neutral). */
  masterFraction: number
  disabled?: boolean
  title?: string
}>()

const emit = defineEmits<{
  gestureStart: []
  move: [puck: Puck]
  gestureEnd: []
  centre: []
}>()

// Geometry in a 100×100 viewBox. Disc (the puck's range) radius = 35.5.
const C = 50
const DISC_R = 35.5
const ARC_R = 46

const el = ref<HTMLElement | null>(null)
const pointers = new Map<number, { x: number; y: number }>()
let lead: number | null = null
let start = { x: 0, y: 0 }
let startPuck: Puck = { x: 0, y: 0 }
let lastTap = 0

const puckXY = computed(() => ({ x: C + props.puck.x * DISC_R, y: C - props.puck.y * DISC_R }))

const arcPath = computed(() => {
  // Grows clockwise from the bottom (6 o'clock), like the reference.
  const f = Math.min(0.9999, Math.max(0, props.masterFraction))
  if (f <= 0) return ''
  const a0 = Math.PI / 2 // bottom, in screen coords (y down)
  const a1 = a0 + f * 2 * Math.PI
  const p = (a: number) => `${C + ARC_R * Math.cos(a)} ${C + ARC_R * Math.sin(a)}`
  return `M ${p(a0)} A ${ARC_R} ${ARC_R} 0 ${f > 0.5 ? 1 : 0} 1 ${p(a1)}`
})

function onDown(e: PointerEvent) {
  if (props.disabled) return
  el.value!.setPointerCapture(e.pointerId)
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (lead !== null) return // second finger: only switches to fine
  const now = performance.now()
  if (now - lastTap < 300) {
    lastTap = 0
    emit('centre')
    return
  }
  lastTap = now
  lead = e.pointerId
  start = { x: e.clientX, y: e.clientY }
  startPuck = { ...props.puck }
  emit('gestureStart')
}

function onMove(e: PointerEvent) {
  if (!pointers.has(e.pointerId)) return
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (e.pointerId !== lead) return
  const radiusPx = (el.value!.getBoundingClientRect().width * DISC_R) / 100
  const fine = e.shiftKey || pointers.size > 1 ? 0.25 : 1
  let x = startPuck.x + ((e.clientX - start.x) / radiusPx) * fine
  let y = startPuck.y - ((e.clientY - start.y) / radiusPx) * fine
  const m = Math.hypot(x, y)
  if (m > 1) {
    x /= m
    y /= m
  }
  emit('move', { x, y })
}

function onUp(e: PointerEvent) {
  pointers.delete(e.pointerId)
  if (e.pointerId !== lead) return
  lead = null
  emit('gestureEnd')
}
</script>

<template>
  <div
    ref="el"
    class="wheel"
    :class="{ disabled }"
    :title="title"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onUp"
  >
    <div class="bezel" />
    <div class="ring" />
    <div class="disc" />
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <path v-if="arcPath" :d="arcPath" class="arc" />
      <line :x1="C - DISC_R" :y1="C" :x2="C + DISC_R" :y2="C" class="cross" />
      <line :x1="C" :y1="C - DISC_R" :x2="C" :y2="C + DISC_R" class="cross" />
      <circle :cx="puckXY.x" :cy="puckXY.y" r="2.6" class="puck" />
    </svg>
  </div>
</template>

<style scoped>
.wheel {
  position: relative;
  width: 100%;
  max-width: 220px;
  min-width: 140px;
  aspect-ratio: 1;
  touch-action: none;
  cursor: crosshair;
}
.wheel.disabled {
  cursor: default;
}
.bezel,
.ring,
.disc,
svg {
  position: absolute;
  border-radius: 50%;
}
.bezel {
  inset: 0;
  background: var(--surface-bezel);
  box-shadow:
    inset 0 2px 6px var(--surface-well),
    0 0 0 1px var(--surface-well);
}
.ring {
  inset: 12%;
  background: var(--hue-ring);
}
.disc {
  inset: 14.5%;
  background: radial-gradient(circle, var(--disc-centre) 0%, var(--disc-mid) 70%, var(--disc-edge) 100%);
}
svg {
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}
.arc {
  fill: none;
  stroke: var(--master-arc);
  stroke-width: 1.6;
  stroke-linecap: round;
}
.cross {
  stroke: var(--crosshair);
  stroke-width: 0.4;
}
.puck {
  fill: var(--puck);
  stroke: var(--surface-well);
  stroke-width: 0.5;
}
</style>
