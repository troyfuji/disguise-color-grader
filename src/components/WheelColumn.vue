<script setup lang="ts">
// One wheel column (UI_SPEC §2.4): name + reset · wheel · readouts · master jog.
import { computed } from 'vue'
import { neutralWheel } from '@shared/grade/neutral'
import { JOG_PER_PX, OFFSET_NEUTRAL } from '@shared/grade/tuning'
import type { WheelName } from '@shared/grade/types'
import { readout, setPuck, setReadout, wheelPuck, type Puck, type Readout } from '@shared/grade/wheel'
import { useGradeStore } from '@/stores/grade'
import ColorWheel from './ColorWheel.vue'
import JogWheel from './JogWheel.vue'
import ResetIcon from './ResetIcon.vue'
import ValueField from './ValueField.vue'

const props = defineProps<{ name: WheelName }>()
const store = useGradeStore()

const LABEL: Record<WheelName, string> = { lift: 'Lift', gamma: 'Gamma', gain: 'Gain', offset: 'Offset' }
const TIP: Record<WheelName, string> = {
  lift: 'Lift — shadows',
  gamma: 'Gamma — midtones',
  gain: 'Gain — highlights',
  offset: 'Offset — whole image',
}
const CHANNEL_TIP: Record<Readout, string> = { y: 'Master (Y)', r: 'Red', g: 'Green', b: 'Blue' }
const CHANNEL_COLOUR: Record<Readout, string> = {
  y: 'var(--channel-y)',
  r: 'var(--channel-r)',
  g: 'var(--channel-g)',
  b: 'var(--channel-b)',
}

const wheel = computed(() => store.grade[props.name])
const readouts = computed<Readout[]>(() => (props.name === 'offset' ? ['r', 'g', 'b'] : ['y', 'r', 'g', 'b']))
const puck = computed(() => wheelPuck(props.name, wheel.value))
const masterFraction = computed(() => {
  const n = neutralWheel(props.name).master
  const span = props.name === 'offset' ? OFFSET_NEUTRAL : 1
  return 0.5 + (wheel.value.master - n) / span / 2
})
const minMaster = computed(() => (props.name === 'gain' ? 0 : -Infinity))

const edit = (fn: (w: typeof wheel.value) => typeof wheel.value) =>
  store.update((g) => {
    g[props.name] = fn(g[props.name])
  })

function movePuck(p: Puck) {
  edit((w) => setPuck(props.name, w, p))
}
function centre() {
  store.update((g) => {
    g[props.name] = { master: g[props.name].master, color: { r: 0, g: 0, b: 0 } }
  })
}
function resetAll() {
  store.update((g) => {
    g[props.name] = neutralWheel(props.name)
  })
}

let jogBase = 0
function jogStart() {
  jogBase = wheel.value.master
  store.beginGesture()
}
function jogDrag(dx: number, fine: boolean) {
  const m = Math.max(minMaster.value, jogBase + dx * JOG_PER_PX[props.name] * (fine ? 0.1 : 1))
  edit((w) => ({ master: m, color: { ...w.color } }))
}
function jogReset() {
  store.update((g) => {
    g[props.name] = { master: neutralWheel(props.name).master, color: { ...g[props.name].color } }
  })
}

const setChannel = (which: Readout, v: number) => edit((w) => setReadout(props.name, w, which, v))
</script>

<template>
  <div class="col">
    <div class="head">
      <span class="name" :title="TIP[name]">{{ LABEL[name] }}</span>
      <button class="iconbtn" :title="`Reset ${LABEL[name]} (colour and master)`" @click="resetAll">
        <ResetIcon />
      </button>
    </div>

    <ColorWheel
      :puck="puck"
      :master-fraction="masterFraction"
      :disabled="!store.editable"
      :title="`${TIP[name]} · drag to push colour, Shift or two fingers for fine, double-tap to centre`"
      @gesture-start="store.beginGesture"
      @move="movePuck"
      @gesture-end="store.endGesture"
      @centre="centre"
    />

    <div class="readouts">
      <div v-for="c in readouts" :key="c" class="readout">
        <ValueField
          class="ro-field"
          :value="readout(name, wheel, c)"
          :dp="2"
          :step="JOG_PER_PX[name] * 2"
          :disabled="!store.editable"
          :title="`${LABEL[name]} ${CHANNEL_TIP[c]}`"
          @gesture-start="store.beginGesture"
          @input="(v) => setChannel(c, v)"
          @gesture-end="store.endGesture"
          @commit="(v) => setChannel(c, v)"
        />
        <div class="uline" :style="{ background: CHANNEL_COLOUR[c] }" />
      </div>
    </div>

    <JogWheel
      :disabled="!store.editable"
      :title="`${LABEL[name]} master · drag left/right, Shift for fine, double-tap to reset`"
      @gesture-start="jogStart"
      @drag="jogDrag"
      @gesture-end="store.endGesture"
      @reset="jogReset"
    />
  </div>
</template>

<style scoped>
.col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  min-width: 0;
}
.head {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: var(--touch-min);
}
.name {
  font-size: var(--fs-wheel-name);
  color: var(--text-primary);
}
.iconbtn {
  position: absolute;
  right: 4%;
  width: var(--touch-min);
  height: var(--touch-min);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  color: var(--icon-inactive);
  cursor: pointer;
}
.iconbtn:hover {
  color: var(--icon-active);
}
.readouts {
  display: flex;
  gap: 6px;
  justify-content: center;
  width: 100%;
}
.readout {
  flex: 1;
  max-width: 72px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ro-field {
  width: 100%;
}
.uline {
  height: 3px;
  border-radius: 1px;
}
</style>
