<script setup lang="ts">
// Presets page: save the current grade under a name, apply a saved grade, and keep the list
// tidy (update with the current grade, rename, delete). The list lives on the server and is
// shared by every panel. Applying needs Live, like any other edit; the rest never touch disguise.
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { neutralGrade } from '@shared/grade/neutral'
import { CHANNELS, WHEELS, type GradeState } from '@shared/grade/types'
import { PRESET_NAME_MAX, type Preset } from '@shared/presets'
import { useGradeStore } from '@/stores/grade'
import { usePresetsStore } from '@/stores/presets'
import { useSessionStore } from '@/stores/session'

const grade = useGradeStore()
const presets = usePresetsStore()
const session = useSessionStore()

const canSave = computed(() => !!session.session?.ready && session.link === 'open')
const canApply = computed(() => grade.editable)

// ── save ──────────────────────────────────────────────────────────────────────
const newName = ref('')
function save() {
  const name = newName.value.trim()
  if (!canSave.value || !name) return
  presets.save(name)
  newName.value = ''
}

// ── card actions ──────────────────────────────────────────────────────────────
const menuFor = ref<string | null>(null)
const renaming = ref<string | null>(null)
const renameText = ref('')
const renameInput = ref<HTMLInputElement[] | null>(null)

/** Update and Delete need a second tap within 2 s (same rule as Reset). */
const armed = ref<{ id: string; action: 'update' | 'delete' } | null>(null)
let armTimer: ReturnType<typeof setTimeout> | null = null
function confirmTap(id: string, action: 'update' | 'delete') {
  if (armed.value?.id === id && armed.value.action === action) {
    disarm()
    menuFor.value = null
    if (action === 'update') presets.update(id)
    else presets.remove(id)
    return
  }
  disarm()
  armed.value = { id, action }
  armTimer = setTimeout(disarm, 2000)
}
function disarm() {
  armed.value = null
  if (armTimer) clearTimeout(armTimer)
  armTimer = null
}
const isArmed = (id: string, action: 'update' | 'delete') => armed.value?.id === id && armed.value.action === action
onBeforeUnmount(disarm)

function toggleMenu(id: string) {
  disarm()
  menuFor.value = menuFor.value === id ? null : id
}

async function startRename(p: Preset) {
  menuFor.value = null
  renaming.value = p.id
  renameText.value = p.name
  await nextTick()
  renameInput.value?.[0]?.focus()
  renameInput.value?.[0]?.select()
}
function finishRename(commit: boolean) {
  const id = renaming.value
  renaming.value = null
  const p = presets.presets.find((q) => q.id === id)
  if (commit && p && renameText.value.trim() && renameText.value.trim() !== p.name) presets.rename(p.id, renameText.value)
}

function apply(p: Preset) {
  if (!canApply.value) return
  presets.apply(p)
}

// ── what each card shows ──────────────────────────────────────────────────────
const NEUTRAL = neutralGrade()
const signed = (v: number, dp: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(dp)}`
const differs = (a: number, b: number) => Math.abs(a - b) > 1e-6

function summary(g: GradeState): string[] {
  const out: string[] = []
  if (differs(g.tempK, NEUTRAL.tempK)) out.push(`Temp ${Math.round(g.tempK)}`)
  if (differs(g.tint, NEUTRAL.tint)) out.push(`Tint ${signed(g.tint, 1)}`)
  if (differs(g.contrast, NEUTRAL.contrast)) out.push(`Cont ${signed(g.contrast, 1)}`)
  if (differs(g.brightness, NEUTRAL.brightness)) out.push(`Bright ${signed(g.brightness, 1)}`)
  if (differs(g.saturation, NEUTRAL.saturation)) out.push(`Sat ${signed(g.saturation, 1)}`)
  for (const w of WHEELS) {
    const changed = differs(g[w].master, NEUTRAL[w].master) || CHANNELS.some((c) => differs(g[w].color[c], 0))
    if (changed) out.push(w[0]!.toUpperCase() + w.slice(1))
  }
  if (g.clamp.enabled) out.push('Clamp')
  return out.length ? out : ['Neutral']
}

const when = (t: number) =>
  t ? new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''
</script>

<template>
  <section class="presets">
    <form class="savebar" @submit.prevent="save">
      <input
        v-model="newName"
        class="name"
        :maxlength="PRESET_NAME_MAX"
        :disabled="!canSave"
        placeholder="New preset name"
        aria-label="New preset name"
        enterkeyhint="done"
      />
      <button class="btn primary" type="submit" :disabled="!canSave || !newName.trim()">Save current grade</button>
      <span class="hint">
        <template v-if="!canSave">Pick a layer to save its grade.</template>
        <template v-else-if="!canApply">Saving works in Safe. To apply a preset, hold <b>SAFE</b> for 1 s to go Live.</template>
        <template v-else>Tap <b>Apply</b> to put a preset on the layer — one step, Undo takes it back.</template>
      </span>
    </form>

    <p v-if="!presets.presets.length" class="empty">
      No presets yet. Grade on the Color Wheels page, then give the grade a name here and save it.
    </p>

    <ul v-else class="grid">
      <li v-for="p in presets.presets" :key="p.id" class="card" :class="{ active: presets.activeId === p.id }">
        <div class="head">
          <input
            v-if="renaming === p.id"
            ref="renameInput"
            v-model="renameText"
            class="rename"
            :maxlength="PRESET_NAME_MAX"
            aria-label="Preset name"
            @keydown.enter="finishRename(true)"
            @keydown.esc="finishRename(false)"
            @blur="finishRename(true)"
          />
          <span v-else class="title" :title="p.name">{{ p.name }}</span>
          <span v-if="presets.activeId === p.id" class="badge">On layer</span>
        </div>
        <div class="chips">
          <span v-for="c in summary(p.grade)" :key="c" class="chip">{{ c }}</span>
        </div>
        <div class="meta">{{ when(p.updatedAt) }}</div>

        <div v-if="menuFor === p.id" class="menu">
          <button class="btn" :class="{ armed: isArmed(p.id, 'update') }" :disabled="!canSave" @click="confirmTap(p.id, 'update')">
            {{ isArmed(p.id, 'update') ? 'Tap again to overwrite' : 'Update from current grade' }}
          </button>
          <button class="btn" @click="startRename(p)">Rename</button>
          <button class="btn danger" :class="{ armed: isArmed(p.id, 'delete') }" @click="confirmTap(p.id, 'delete')">
            {{ isArmed(p.id, 'delete') ? 'Tap again to delete' : 'Delete' }}
          </button>
        </div>

        <div class="actions">
          <button class="btn primary apply" :disabled="!canApply" :title="canApply ? `Apply “${p.name}” to the layer` : 'Go Live to apply'" @click="apply(p)">
            Apply
          </button>
          <button class="btn more" :class="{ open: menuFor === p.id }" title="More: update, rename, delete" @click="toggleMenu(p.id)">⋯</button>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.presets {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.savebar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding: 12px var(--gutter);
  background: var(--surface-strip);
  border-bottom: 1px solid var(--surface-well);
}
.name,
.rename {
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
.name {
  width: 320px;
  max-width: 100%;
}
.name:focus,
.rename:focus {
  border-color: var(--border-field-hover);
}
.name:disabled {
  opacity: var(--dim);
}
.hint {
  font-size: var(--fs-status);
  color: var(--text-label-strip);
}
.empty {
  margin: 48px auto;
  max-width: 480px;
  text-align: center;
  font-size: var(--fs-label);
  color: var(--text-label);
}

.grid {
  list-style: none;
  margin: 0;
  padding: 20px var(--gutter) 24px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--gutter);
  align-content: start;
}
.card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  background: var(--surface-header);
  border: 1px solid var(--surface-well);
  border-radius: 4px;
}
.card.active {
  border-color: var(--status-connected);
}
.head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
}
.title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--fs-wheel-name);
  color: var(--text-primary);
}
.rename {
  flex: 1;
  min-width: 0;
  height: 32px;
}
.badge {
  padding: 2px 8px;
  border-radius: 10px;
  background: var(--switch-on);
  color: var(--text-primary);
  font-size: var(--fs-badge);
  white-space: nowrap;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip {
  padding: 2px 8px;
  border-radius: var(--radius-field);
  background: var(--surface-field);
  color: var(--text-label);
  font-size: var(--fs-badge);
}
.meta {
  font-size: var(--fs-badge);
  color: var(--text-label);
}
.menu {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.actions {
  display: flex;
  gap: 8px;
  margin-top: auto;
}

.btn {
  height: var(--touch-min);
  min-width: var(--touch-min);
  padding: 0 14px;
  border: 1px solid var(--border-field);
  border-radius: var(--radius-field);
  background: var(--surface-field);
  color: var(--text-label);
  font: inherit;
  font-size: var(--fs-button);
  cursor: pointer;
  touch-action: manipulation;
}
.btn:hover:not(:disabled) {
  border-color: var(--border-field-hover);
  color: var(--text-value);
}
.btn:disabled {
  opacity: var(--later);
  cursor: default;
}
.btn.primary {
  background: var(--surface-segment-on);
  color: var(--text-primary);
}
.apply {
  flex: 1;
}
.more {
  font-size: var(--fs-glyph);
  line-height: 1;
}
.more.open {
  background: var(--surface-segment-on);
  color: var(--text-primary);
}
.btn.danger {
  color: var(--status-modified);
}
.btn.armed {
  background: var(--status-warning-bg);
  border-color: var(--status-warning-bg);
  color: var(--text-primary);
}
</style>
