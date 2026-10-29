<script setup lang="ts">
// Toolbar (UI_SPEC §2.1): pages (Color Wheels, Presets) · Undo/Redo · Bypass · Live/Safe.
// Live needs a 1 s press-and-hold; one tap goes back to Safe instantly (FR21).
import { onBeforeUnmount, ref } from 'vue'
import { useGradeStore } from '@/stores/grade'
import { useSessionStore } from '@/stores/session'
import { useUiStore, type Page } from '@/stores/ui'

const store = useGradeStore()
const session = useSessionStore()
const ui = useUiStore()

const PAGES: { page: Page; name: string; d: string }[] = [
  { page: 'presets', name: 'Presets', d: 'M4 5h8v8H4zM16 5h8v8h-8zM4 16h8v8H4zM16 16h8v8h-8z' },
]

const HOLD_MS = 1000
const hold = ref(0) // 0…1 fill while arming
let raf = 0
let holdStart = 0

function lockDown(e: PointerEvent) {
  if (store.lock === 'live') {
    store.lockSafe()
    return
  }
  if (!session.writable) return
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  holdStart = performance.now()
  const step = () => {
    hold.value = Math.min(1, (performance.now() - holdStart) / HOLD_MS)
    if (hold.value >= 1) {
      store.goLive()
      cancelHold()
      return
    }
    raf = requestAnimationFrame(step)
  }
  raf = requestAnimationFrame(step)
}

function cancelHold() {
  cancelAnimationFrame(raf)
  raf = 0
  hold.value = 0
}

onBeforeUnmount(cancelHold)
</script>

<template>
  <nav class="toolbar">
    <button class="tool" :class="{ active: ui.page === 'wheels' }" title="Color Wheels" @click="ui.page = 'wheels'">
      <svg viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
        <circle cx="14" cy="14" r="11" />
        <circle cx="14" cy="14" r="2.5" fill="currentColor" />
      </svg>
      <span v-if="store.modified" class="dot" />
    </button>
    <button v-for="p in PAGES" :key="p.page" class="tool" :class="{ active: ui.page === p.page }" :title="p.name" @click="ui.page = p.page">
      <svg viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
        <path :d="p.d" />
      </svg>
    </button>

    <div class="spacer" />

    <div class="right">
      <button class="tbtn glyph" title="Undo (Ctrl/Cmd+Z)" :disabled="!store.canUndo || !store.editable" @click="store.undo">↶</button>
      <button class="tbtn glyph" title="Redo (Ctrl/Cmd+Shift+Z)" :disabled="!store.canRedo || !store.editable" @click="store.redo">↷</button>
      <button
        class="tbtn bypass"
        :class="{ on: store.bypass }"
        :disabled="store.lock !== 'live'"
        title="Bypass: show the picture without the grade (B)"
        @click="store.toggleBypass"
      >
        Bypass
      </button>
      <button
        class="tbtn lock"
        :class="{ live: store.lock === 'live' }"
        :disabled="store.lock === 'safe' && !session.writable"
        :title="store.lock === 'live' ? 'Tap to go Safe' : 'Hold 1 s to go Live'"
        @pointerdown="lockDown"
        @pointerup="cancelHold"
        @pointercancel="cancelHold"
        @pointerleave="cancelHold"
      >
        <span class="fill" :style="{ width: `${hold * 100}%` }" />
        <span class="label">
          <svg v-if="store.lock === 'safe'" width="12" height="14" viewBox="0 0 12 14" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <rect x="1" y="6" width="10" height="7" rx="1" />
            <path d="M3 6V4a3 3 0 0 1 6 0v2" />
          </svg>
          {{ store.lock === 'live' ? 'LIVE' : 'SAFE' }}
        </span>
      </button>
    </div>
  </nav>
</template>

<style scoped>
.toolbar {
  display: flex;
  height: var(--h-toolbar);
  border-bottom: 1px solid var(--surface-well);
}
.tool {
  position: relative;
  width: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-right: 1px solid var(--divider);
  background: transparent;
  color: var(--icon-inactive);
  padding: 0;
}
button.tool {
  cursor: pointer;
  touch-action: manipulation;
}
button.tool:hover {
  color: var(--icon-active);
}
.tool.active {
  color: var(--icon-active);
}
.tool svg {
  width: 28px;
  height: 28px;
}
.dot {
  position: absolute;
  top: 12px;
  right: 18px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--status-modified);
}
.spacer {
  flex: 1;
}
.right {
  display: flex;
  align-items: center;
  gap: var(--grid);
  padding: 0 12px;
}
.tbtn {
  position: relative;
  overflow: hidden;
  height: var(--field-h);
  min-width: var(--touch-min);
  padding: 0 12px;
  border: 1px solid var(--border-field);
  border-radius: var(--radius-field);
  background: var(--surface-field);
  color: var(--text-label);
  font-size: var(--fs-button);
  cursor: pointer;
  touch-action: none;
}
.tbtn:disabled {
  opacity: var(--later);
  cursor: default;
}
.tbtn.glyph {
  font-size: var(--fs-glyph);
  line-height: 1;
}
.tbtn.bypass.on {
  background: var(--status-bypass);
  border-color: var(--status-bypass);
  color: var(--text-primary);
}
.tbtn.lock {
  min-width: 104px;
  font-weight: 600;
  letter-spacing: 0.06em;
}
.tbtn.lock.live {
  background: var(--status-live);
  border-color: var(--status-live);
  color: var(--text-primary);
}
.fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--status-live-hold);
}
.label {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
</style>
