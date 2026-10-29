<script setup lang="ts">
// Layer picker (UI_SPEC §2.2): only ColourAdjust layers live at the playhead. Nothing is
// selected automatically; Refresh re-runs discovery.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const open = ref(false)
const root = ref<HTMLElement | null>(null)

const live = computed(() => session.session?.liveLayers ?? [])
const selected = computed(() => session.session?.selected ?? null)
const label = computed(() => {
  const s = selected.value
  if (!s) return live.value.length ? 'Pick a layer' : 'No live layer'
  return `${s.track} › ${s.name}`
})

function pick(uid: string) {
  open.value = false
  if (uid !== selected.value?.uid) session.selectLayer(uid)
}

function refresh() {
  open.value = false
  session.refresh()
}

const outside = (e: PointerEvent) => {
  if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false
}
onMounted(() => document.addEventListener('pointerdown', outside))
onBeforeUnmount(() => document.removeEventListener('pointerdown', outside))

defineExpose({ show: () => (open.value = true) })
</script>

<template>
  <div ref="root" class="picker">
    <button class="current" :class="{ stale: selected && !session.session?.selectedLive }" @click="open = !open">
      <span class="text">{{ label }}</span>
      <svg width="12" height="8" viewBox="0 0 12 8" aria-hidden="true"><path d="M1 1l5 5 5-5" /></svg>
    </button>
    <div v-if="open" class="menu">
      <button v-for="l in live" :key="l.uid" class="row" @click="pick(l.uid)">
        <span>{{ l.track }} › {{ l.name }}</span>
        <span v-if="l.uid === selected?.uid" class="check">✓</span>
      </button>
      <div v-if="!live.length" class="empty">No ColourAdjust layer is live at the playhead</div>
      <button class="row refresh" @click="refresh">Refresh</button>
    </div>
  </div>
</template>

<style scoped>
.picker {
  position: relative;
}
.current {
  width: 240px;
  height: var(--field-h);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 12px;
  background: var(--surface-field);
  border: 1px solid var(--border-field);
  border-radius: var(--radius-field);
  color: var(--text-value);
  font-size: var(--fs-label);
  cursor: pointer;
}
.current:hover {
  border-color: var(--border-field-hover);
}
.current.stale {
  border-color: var(--status-warning-bg);
}
.text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
svg path {
  stroke: var(--icon-inactive);
  stroke-width: 1.5;
  fill: none;
}
.menu {
  position: absolute;
  z-index: 20;
  top: calc(100% + 4px);
  left: 0;
  min-width: 100%;
  background: var(--surface-header);
  border: 1px solid var(--surface-well);
  border-radius: 4px;
  box-shadow: 0 8px 24px var(--shadow-popover);
  padding: 4px 0;
}
.row {
  width: 100%;
  min-height: var(--touch-min);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  background: transparent;
  border: 0;
  color: var(--text-value);
  font-size: var(--fs-label);
  text-align: left;
  cursor: pointer;
}
.row:hover {
  background: var(--surface-menu-hover);
}
.check {
  color: var(--text-primary);
}
.refresh {
  color: var(--text-label);
  border-top: 1px solid var(--rule);
}
.empty {
  padding: 10px 12px;
  color: var(--text-label);
  font-size: var(--fs-status);
}
</style>
