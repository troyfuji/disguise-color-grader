<script setup lang="ts">
// Status bar (UI_SPEC §2.6): connection dot · Director address (tap to change) · layer ·
// latest notice · version.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useSessionStore } from '@/stores/session'

const emit = defineEmits<{ openConnect: [] }>()
const session = useSessionStore()
const version = __APP_VERSION__

const director = computed(() => session.session?.director)
const text = computed(() => {
  if (session.link !== 'open') return 'Grader server unreachable'
  if (!director.value?.address) return 'Not connected'
  return { connected: 'Connected', connecting: 'Connecting…', offline: 'Offline' }[director.value.status]
})
const dot = computed(() =>
  session.link === 'open' && director.value?.status === 'connected'
    ? 'ok'
    : director.value?.status === 'connecting' || session.link === 'connecting'
      ? 'pending'
      : 'bad',
)

// Notices fade after a few seconds.
const message = ref('')
let timer: ReturnType<typeof setTimeout> | null = null
watch(
  () => session.notice,
  (n) => {
    if (!n) return
    message.value = n.text
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => (message.value = ''), 4000)
  },
)
onBeforeUnmount(() => timer && clearTimeout(timer))
</script>

<template>
  <footer class="status">
    <span class="dot" :class="dot" />
    <span>{{ text }}</span>
    <button class="address" title="Change Director" @click="emit('openConnect')">
      {{ director?.address || 'Set Director…' }}
    </button>
    <span v-if="session.session?.selected">{{ session.session.selected.name }} / {{ session.session.selected.track }}</span>
    <span class="grow" />
    <span class="message">{{ message }}</span>
    <span>v{{ version }}</span>
  </footer>
</template>

<style scoped>
.status {
  display: flex;
  align-items: center;
  gap: var(--gutter);
  height: var(--h-status);
  padding: 0 var(--gutter);
  background: var(--surface-footer);
  font-size: var(--fs-status);
  color: var(--text-label);
  white-space: nowrap;
  overflow: hidden;
}
.dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--status-warning-bg);
}
.dot.ok {
  background: var(--status-connected);
}
.dot.pending {
  background: var(--status-connecting);
}
.address {
  height: 32px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--radius-field);
  background: transparent;
  color: var(--text-value);
  font-size: var(--fs-status);
  text-decoration: underline dotted;
  cursor: pointer;
}
.grow {
  flex: 1;
}
.message {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
