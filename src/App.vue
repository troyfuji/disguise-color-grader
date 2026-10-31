<script setup lang="ts">
// The main screen (UI_SPEC §1). Controls edit GradeState through the grade store; the store
// sends edits to the Colour Grader server, which is the only thing that talks to disguise.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { BRIGHTNESS_RANGE, CONTRAST_RANGE, KELVIN_RANGE, SATURATION_RANGE, TINT_RANGE } from '@shared/disguise/paths'
import { neutralGrade } from '@shared/grade/neutral'
import { WHEELS, type GradeState } from '@shared/grade/types'
import { useGradeStore } from '@/stores/grade'
import { useSessionStore } from '@/stores/session'
import { useUiStore } from '@/stores/ui'
import ConnectDialog from '@/components/ConnectDialog.vue'
import LayerPicker from '@/components/LayerPicker.vue'
import LegalRange from '@/components/LegalRange.vue'
import PresetsPage from '@/components/PresetsPage.vue'
import ResetIcon from '@/components/ResetIcon.vue'
import Slider from '@/components/Slider.vue'
import SourceToggle from '@/components/SourceToggle.vue'
import StatusBar from '@/components/StatusBar.vue'
import Toolbar from '@/components/Toolbar.vue'
import WheelColumn from '@/components/WheelColumn.vue'

const store = useGradeStore()
const session = useSessionStore()
const ui = useUiStore()
const picker = ref<InstanceType<typeof LayerPicker> | null>(null)

onMounted(() => session.start())

// ── sliders under the wheels: Cont/Bright left (under Lift, Gamma), Temp/Tint/Sat right ──
type Key = 'tempK' | 'tint' | 'contrast' | 'brightness' | 'saturation'
interface SliderDef {
  key: Key
  label: string
  dp: number
  step: number
  min: number
  max: number
  hint: string
  tip: string
}
const LEFT: SliderDef[] = [
  { key: 'contrast', label: 'Cont', dp: 2, step: 0.1, ...CONTRAST_RANGE, hint: '--hint-contrast', tip: 'Contrast (−50 to +50, 0 is neutral)' },
  { key: 'brightness', label: 'Bright', dp: 2, step: 0.1, ...BRIGHTNESS_RANGE, hint: '--hint-luma', tip: 'Brightness (−50 to +50, 0 is neutral)' },
]
const RIGHT: SliderDef[] = [
  { key: 'tempK', label: 'Temp', dp: 0, step: 10, ...KELVIN_RANGE, hint: '--hint-temp', tip: 'Temp — warmer / cooler (800 to 14000 K, 5000 is neutral)' },
  { key: 'tint', label: 'Tint', dp: 2, step: 0.1, ...TINT_RANGE, hint: '--hint-tint', tip: 'Tint — green / magenta (−50 to +50, 0 is neutral)' },
  { key: 'saturation', label: 'Sat', dp: 2, step: 0.2, ...SATURATION_RANGE, hint: '--hint-sat', tip: 'Saturation (−100 to +100, 0 is neutral)' },
]
const NEUTRAL = neutralGrade()

const setParam = (key: Key, v: number) => store.update((g: GradeState) => (g[key] = v))
const resetParam = (key: Key) => setParam(key, NEUTRAL[key])

// ── whole-grade reset needs a second tap within 2 s (FR16) ──────────────────
const resetArmed = ref(false)
let resetTimer: ReturnType<typeof setTimeout> | null = null
function resetTap() {
  if (!store.editable) return
  if (resetArmed.value) {
    resetArmed.value = false
    if (resetTimer) clearTimeout(resetTimer)
    store.resetAll()
    return
  }
  resetArmed.value = true
  resetTimer = setTimeout(() => (resetArmed.value = false), 2000)
}

// ── connect dialog, banners, overlay ────────────────────────────────────────
// The dialog opens by itself when there is no Director, and when a remembered one hasn't
// connected within a few seconds of opening the page (it may be on another machine now).
const connectOpen = ref(false)
let staleTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
  staleTimer = null
  if (session.session?.director.status !== 'connected') connectOpen.value = true
}, 3000)
watch(
  () => session.session?.director.status,
  (s) => {
    if (s === 'connected' && staleTimer) {
      clearTimeout(staleTimer)
      staleTimer = null
    }
  },
)
onBeforeUnmount(() => staleTimer && clearTimeout(staleTimer))
const showConnect = computed(() => connectOpen.value || (session.link === 'open' && !session.session?.director.address))
const lostLayer = computed(() => {
  const s = session.session
  return s?.selected && s.ready !== undefined && !s.selectedLive ? s.selected : null
})
const reconnecting = computed(() => {
  if (session.link !== 'open') return 'Reconnecting to the Colour Grader server…'
  const d = session.session?.director
  if (d?.address && d.status !== 'connected') return `Reconnecting to disguise at ${d.address}…`
  return ''
})
const needsLayer = computed(() => session.session?.director.status === 'connected' && !session.session.selected)

// ── keyboard (UI_SPEC §6). Shortcuts never switch to Live. ────────────────────
let lastEsc = 0
function onKey(e: KeyboardEvent) {
  if ((e.target as HTMLElement).tagName === 'INPUT') return
  const mod = e.ctrlKey || e.metaKey
  if (mod && e.key.toLowerCase() === 'z') {
    e.preventDefault()
    if (e.shiftKey) store.redo()
    else store.undo()
  } else if (e.key === 'b' || e.key === 'B') store.toggleBypass()
  else if (e.key === 'Escape') {
    const now = performance.now()
    if (now - lastEsc < 600) store.lockSafe()
    lastEsc = now
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="app" :class="{ locked: !store.editable, offline: !!reconnecting }">
    <Toolbar />

    <header class="header">
      <h1>{{ ui.page === 'presets' ? 'Presets' : 'Color Wheels' }}</h1>
      <span class="label">Layer</span>
      <LayerPicker ref="picker" />
      <span class="label">Source</span>
      <SourceToggle class="dimmable" />
      <span class="spacer" />
      <button v-if="ui.page === 'wheels'" class="iconbtn dimmable" :class="{ armed: resetArmed }" title="Reset the whole grade" @click="resetTap">
        <template v-if="resetArmed">Tap again to reset</template>
        <ResetIcon v-else />
      </button>
    </header>

    <div v-if="lostLayer" class="banner">
      {{ lostLayer.name }} is no longer live — pick a live layer
      <button class="banner-btn" @click="picker?.show()">Pick layer</button>
    </div>
    <div v-else-if="needsLayer" class="banner info">
      {{ session.session?.liveLayers.length ? 'Pick the ColourAdjust layer to grade' : 'No ColourAdjust layer is live at the playhead' }}
      <button class="banner-btn" @click="picker?.show()">{{ session.session?.liveLayers.length ? 'Pick layer' : 'Refresh' }}</button>
    </div>
    <div v-else-if="store.lock === 'safe' && session.writable" class="banner info">
      SAFE — controls are locked. Hold <b>SAFE</b> for 1 second to go Live.
    </div>

    <template v-if="ui.page === 'wheels'">
      <section class="wheels dimmable">
        <WheelColumn v-for="w in WHEELS" :key="w" :name="w" />
      </section>

      <section class="sliders dimmable">
        <div class="group left">
          <Slider
            v-for="p in LEFT"
            :key="p.key"
            :label="p.label"
            :value="store.grade[p.key]"
            :neutral="NEUTRAL[p.key]"
            :min="p.min"
            :max="p.max"
            :dp="p.dp"
            :step="p.step"
            :hint="p.hint"
            :tooltip="p.tip"
            @gesture-start="store.beginGesture"
            @input="(v) => setParam(p.key, v)"
            @gesture-end="store.endGesture"
            @commit="(v) => setParam(p.key, v)"
            @reset="resetParam(p.key)"
          />
        </div>
        <div class="group right">
          <Slider
            v-for="p in RIGHT"
            :key="p.key"
            :label="p.label"
            :value="store.grade[p.key]"
            :neutral="NEUTRAL[p.key]"
            :min="p.min"
            :max="p.max"
            :dp="p.dp"
            :step="p.step"
            :hint="p.hint"
            :tooltip="p.tip"
            @gesture-start="store.beginGesture"
            @input="(v) => setParam(p.key, v)"
            @gesture-end="store.endGesture"
            @commit="(v) => setParam(p.key, v)"
            @reset="resetParam(p.key)"
          />
        </div>
      </section>

      <section class="strip bottom">
        <span class="spacer" />
        <LegalRange />
      </section>
    </template>
    <PresetsPage v-else />

    <StatusBar @open-connect="connectOpen = true" />

    <div v-if="reconnecting && !showConnect" class="overlay">
      {{ reconnecting }}
      <button v-if="session.link === 'open'" class="banner-btn" @click="connectOpen = true">Change Director</button>
    </div>
    <ConnectDialog v-if="showConnect" @close="connectOpen = false" />
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  max-width: 1920px;
  margin: 0 auto;
}

.header {
  display: flex;
  align-items: center;
  gap: 20px;
  min-height: var(--h-header);
  padding: 8px var(--gutter);
  background: var(--surface-header);
  border-bottom: 1px solid var(--surface-well);
  flex-wrap: wrap;
}
.header h1 {
  margin: 0;
  font-size: var(--fs-title);
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
}
.label {
  font-size: var(--fs-label);
  color: var(--text-label);
}
.spacer {
  flex: 1;
}
.iconbtn {
  min-width: var(--touch-min);
  height: var(--touch-min);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  color: var(--icon-inactive);
  font-size: var(--fs-status);
  cursor: pointer;
}
.iconbtn:hover {
  color: var(--icon-active);
}
.iconbtn.armed {
  color: var(--status-modified);
  padding: 0 8px;
}

.banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  min-height: 44px;
  padding: 4px var(--gutter);
  background: var(--status-warning-bg);
  color: var(--text-primary);
  font-size: var(--fs-label);
}
.banner.info {
  background: var(--surface-strip);
  color: var(--text-label-strip);
}
.banner-btn {
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--border-field);
  border-radius: var(--radius-field);
  background: var(--surface-field);
  color: var(--text-value);
  font-size: var(--fs-status);
  cursor: pointer;
}

.strip {
  display: flex;
  align-items: center;
  justify-content: space-around;
  gap: var(--gutter);
  min-height: var(--h-strip);
  padding: var(--grid) var(--gutter);
  background: var(--surface-strip);
  border-bottom: 1px solid var(--surface-well);
  flex-wrap: wrap;
}
.strip.bottom {
  min-height: 56px;
  padding-right: 32px;
}

/* Two halves matching the wheel grid: left under Lift + Gamma, right under Gain + Offset. */
.sliders {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--gutter);
  padding: var(--grid) var(--gutter) 20px;
  background: var(--surface-strip);
  border-top: 1px solid var(--surface-well);
  border-bottom: 1px solid var(--surface-well);
}
.group {
  display: flex;
  flex-direction: column;
  gap: var(--grid);
  padding: var(--grid) 24px 0;
}
@media (max-width: 1023px) {
  .sliders {
    grid-template-columns: 1fr;
  }
}

.wheels {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--gutter);
  padding: 20px var(--gutter) 24px;
  align-items: start;
}
@media (max-width: 1023px) {
  .wheels {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* Safe, Bypass, no layer, or offline: controls visibly dimmed and inert (FR21). */
.app.locked .dimmable,
.app.locked :deep(.legal .pop) {
  opacity: var(--dim);
  pointer-events: none;
}
.app.offline {
  transition: opacity var(--t-fade);
}

.overlay {
  position: fixed;
  left: 50%;
  top: 50%;
  z-index: 40;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 24px;
  background: var(--surface-header);
  border: 1px solid var(--surface-well);
  border-radius: 4px;
  box-shadow: 0 8px 24px var(--shadow-popover);
  color: var(--text-value);
  font-size: var(--fs-label);
}
</style>
