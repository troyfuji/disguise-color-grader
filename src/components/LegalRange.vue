<script setup lang="ts">
// Legal range (UI_SPEC §2.5): clamp switch + Low/High, in a popover from the bottom strip.
import { ref } from 'vue'
import { useGradeStore } from '@/stores/grade'
import ValueField from './ValueField.vue'

const store = useGradeStore()
const open = ref(false)

const toggle = () => store.update((g) => (g.clamp.enabled = !g.clamp.enabled))
const setLow = (v: number) => store.update((g) => (g.clamp.low = v))
const setHigh = (v: number) => store.update((g) => (g.clamp.high = v))
</script>

<template>
  <div class="legal">
    <span v-if="store.grade.clamp.enabled" class="badge">CLAMP</span>
    <button class="btn" title="Legal range — clamp the output" @click="open = !open">Legal range ▸</button>
    <div v-if="open" class="pop">
      <div class="row">
        <h3>Legal range</h3>
        <button
          class="switch"
          :class="{ on: store.grade.clamp.enabled }"
          :disabled="!store.editable"
          :aria-pressed="store.grade.clamp.enabled"
          title="Clamp on/off"
          @click="toggle"
        />
      </div>
      <div class="row">
        <span class="label">Low clamp</span>
        <ValueField
          :value="store.grade.clamp.low"
          :dp="3"
          :step="0.002"
          :min="0"
          :max="1"
          :disabled="!store.editable"
          @gesture-start="store.beginGesture"
          @input="setLow"
          @gesture-end="store.endGesture"
          @commit="setLow"
        />
      </div>
      <div class="row">
        <span class="label">High clamp</span>
        <ValueField
          :value="store.grade.clamp.high"
          :dp="3"
          :step="0.002"
          :min="0"
          :max="1"
          :disabled="!store.editable"
          @gesture-start="store.beginGesture"
          @input="setHigh"
          @gesture-end="store.endGesture"
          @commit="setHigh"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.legal {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
}
.badge {
  padding: 3px 8px;
  border-radius: var(--radius-field);
  background: var(--status-warning-bg);
  color: var(--text-primary);
  font-size: var(--fs-badge);
  letter-spacing: 0.06em;
}
.btn {
  height: var(--field-h);
  padding: 0 14px;
  border: 1px solid var(--border-field);
  border-radius: var(--radius-field);
  background: var(--surface-field);
  color: var(--text-label);
  font-size: var(--fs-label);
  cursor: pointer;
}
.btn:hover {
  color: var(--text-value);
}
.pop {
  position: absolute;
  z-index: 20;
  right: 0;
  bottom: calc(100% + 12px);
  width: 280px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  background: var(--surface-header);
  border: 1px solid var(--surface-well);
  border-radius: 4px;
  box-shadow: 0 8px 24px var(--shadow-popover);
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
h3 {
  margin: 0;
  font-size: var(--fs-label);
  font-weight: 600;
  color: var(--text-primary);
}
.label {
  font-size: var(--fs-label);
  color: var(--text-label);
}
.switch {
  position: relative;
  width: 44px;
  height: 24px;
  border-radius: 12px;
  background: var(--surface-field);
  border: 1px solid var(--border-field);
  cursor: pointer;
}
.switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--icon-inactive);
  transition: left var(--t-hover);
}
.switch.on {
  background: var(--switch-on);
}
.switch.on::after {
  left: 22px;
  background: var(--text-primary);
}
</style>
