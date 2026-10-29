<script setup lang="ts">
// Source toggle (UI_SPEC §2.2, STYLE_GUIDE §5.6): writes the layer's source on tap.
import { SOURCE_OPTIONS } from '@shared/disguise/paths'
import { useGradeStore } from '@/stores/grade'

const store = useGradeStore()
const set = (v: number) => store.update((g) => (g.source = v))
</script>

<template>
  <div class="seg" title="Source — what the colour adjust grades">
    <button
      v-for="o in SOURCE_OPTIONS"
      :key="o.value"
      :class="{ on: store.grade.source === o.value }"
      :disabled="!store.editable"
      @click="set(o.value)"
    >
      {{ o.label }}
    </button>
  </div>
</template>

<style scoped>
.seg {
  display: flex;
  height: var(--field-h);
  padding: 2px;
  background: var(--surface-field);
  border: 1px solid var(--border-field);
  border-radius: var(--radius-field);
}
button {
  min-width: 96px;
  border: 0;
  border-radius: 2px;
  background: transparent;
  color: var(--text-label);
  font-size: var(--fs-label);
  cursor: pointer;
}
button.on {
  background: var(--surface-segment-on);
  color: var(--text-value);
}
button:disabled {
  cursor: default;
}
</style>
