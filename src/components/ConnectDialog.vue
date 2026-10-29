<script setup lang="ts">
// Connect dialog (UI_SPEC §4): enter the Director address and Connect. The server remembers
// it and reconnects on start, so this only appears when there is no Director yet, or when
// the address in the status bar is tapped.
import { computed, ref, watch } from 'vue'
import { DIRECTOR_ADDRESS_RE } from '@shared/protocol'
import { useSessionStore } from '@/stores/session'

const emit = defineEmits<{ close: [] }>()
const session = useSessionStore()

const address = ref(session.session?.director.address ?? '')
const tried = ref(false)
const valid = computed(() => DIRECTOR_ADDRESS_RE.test(address.value.trim()))
const status = computed(() => session.session?.director.status ?? 'offline')

watch(status, (s) => {
  if (tried.value && s === 'connected') emit('close')
})

function connect() {
  if (!valid.value) return
  tried.value = true
  session.connectDirector(address.value.trim())
}
</script>

<template>
  <div class="backdrop" @pointerdown.self="session.session?.director.address && emit('close')">
    <form class="dialog" @submit.prevent="connect">
      <h2>Connect to disguise</h2>
      <label for="director">Director address</label>
      <input
        id="director"
        v-model="address"
        placeholder="192.168.10.11 or director.local"
        autocomplete="off"
        spellcheck="false"
        autofocus
      />
      <p class="hint">The Director, not a render node. Add <code>:port</code> if it isn't 80.</p>
      <p v-if="tried" class="state" :class="status">
        {{ status === 'connected' ? 'Connected' : status === 'connecting' ? 'Connecting…' : 'Not connected' }}
      </p>
      <div class="buttons">
        <button v-if="session.session?.director.address" type="button" class="btn" @click="emit('close')">Cancel</button>
        <button type="submit" class="btn primary" :disabled="!valid">Connect</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--shadow-popover);
}
.dialog {
  width: min(380px, calc(100vw - 32px));
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 20px;
  background: var(--surface-header);
  border: 1px solid var(--surface-well);
  border-radius: 4px;
  box-shadow: 0 8px 24px var(--shadow-popover);
}
h2 {
  margin: 0 0 6px;
  font-size: var(--fs-title);
  font-weight: 600;
  color: var(--text-primary);
}
label,
.hint {
  font-size: var(--fs-status);
  color: var(--text-label);
}
.hint {
  margin: 0;
}
input {
  height: var(--touch-min);
  padding: 0 12px;
  background: var(--surface-field);
  border: 1px solid var(--border-field);
  border-radius: var(--radius-field);
  color: var(--text-value);
  font: inherit;
  font-size: var(--fs-value);
  outline: none;
  -webkit-user-select: text;
  user-select: text;
}
input:focus {
  border-color: var(--border-field-hover);
}
.state {
  margin: 0;
  font-size: var(--fs-status);
}
.state.connected {
  color: var(--status-connected);
}
.state.connecting {
  color: var(--status-connecting);
}
.state.offline {
  color: var(--status-modified);
}
.buttons {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 6px;
}
.btn {
  height: var(--touch-min);
  padding: 0 18px;
  border: 1px solid var(--border-field);
  border-radius: var(--radius-field);
  background: var(--surface-field);
  color: var(--text-label);
  font-size: var(--fs-label);
  cursor: pointer;
}
.btn.primary {
  background: var(--surface-segment-on);
  color: var(--text-value);
}
.btn:disabled {
  opacity: var(--later);
  cursor: default;
}
</style>
