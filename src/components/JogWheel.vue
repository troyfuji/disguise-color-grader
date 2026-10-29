<script setup lang="ts">
// Master jog wheel (STYLE_GUIDE §5.4): endless horizontal encoder; the ridges scroll with the
// finger. Emits the drag distance in px since the gesture started. Double-tap resets master.
import { ref } from 'vue'

const props = defineProps<{ disabled?: boolean; title?: string }>()
const emit = defineEmits<{
  gestureStart: []
  drag: [dxPx: number, fine: boolean]
  gestureEnd: []
  reset: []
}>()

const offset = ref(0)
let pointerId: number | null = null
let startX = 0
let base = 0
let lastTap = 0

function onDown(e: PointerEvent) {
  if (props.disabled) return
  const now = performance.now()
  if (now - lastTap < 300) {
    lastTap = 0
    emit('reset')
    return
  }
  lastTap = now
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  pointerId = e.pointerId
  startX = e.clientX
  base = offset.value
  emit('gestureStart')
}

function onMove(e: PointerEvent) {
  if (e.pointerId !== pointerId) return
  const dx = e.clientX - startX
  offset.value = base + dx
  emit('drag', dx, e.shiftKey)
}

function onUp(e: PointerEvent) {
  if (e.pointerId !== pointerId) return
  pointerId = null
  emit('gestureEnd')
}
</script>

<template>
  <div
    class="jog"
    :class="{ disabled }"
    :title="title"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onUp"
  >
    <div class="ridges" :style="{ backgroundPositionX: `${offset}px` }" />
  </div>
</template>

<style scoped>
.jog {
  position: relative;
  width: 100%;
  height: 40px;
  border-radius: 20px;
  background: var(--surface-well);
  box-shadow: inset 0 2px 4px var(--surface-well);
  overflow: hidden;
  touch-action: none;
  cursor: ew-resize;
}
.jog.disabled {
  cursor: default;
}
.ridges {
  position: absolute;
  inset: 6px 14px;
  border-radius: 14px;
  background: repeating-linear-gradient(90deg, var(--jog-ridge-light) 0 2px, var(--jog-ridge-dark) 2px 6px);
}
</style>
