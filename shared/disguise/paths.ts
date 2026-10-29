// ─────────────────────────────────────────────────────────────────────────────
//  disguise facts used by the server and the mock.
//
//  VERIFIED items were measured on a real Director on 2026-10-29 (probes/, findings in
//  docs/DISGUISE_API.md §8). Anything still marked VERIFY is an unconfirmed placeholder and
//  stays here, and only here (CLAUDE.md rule). When Phase 0 answers it, write the finding
//  into the docs first, then update it here and remove the marker.
// ─────────────────────────────────────────────────────────────────────────────

import type { Channel, DisguiseField, SourceValue } from '../grade/types.ts'

/** Flip to true once every VERIFY below is resolved and written into the docs. */
export const PHASE0_VERIFIED = false

/**
 * Default value of each ColourAdjust property on a new layer. VERIFIED (FieldSequence
 * defaultValue and live layer values). Note Contrast and Saturation are 0 at neutral.
 */
export const DISGUISE_NEUTRAL = {
  ccKelvin: 5000,
  ccTint: 0,
  ccContrast: 0,
  ccBrightness: 0,
  ccSaturation: 0,
} as const

/**
 * Slider ranges. Temp, Tint, Cont, Bright and Sat all show disguise's own units, so these are
 * Designer's ranges for ccKelvin, ccTint, ccContrast, ccBrightness and ccSaturation (from the
 * operator, 2026-10-29). disguise has no API to read them (FieldSequence has setRange but no
 * getter), and it stores any value sent, so the panel clamps to these.
 */
export const KELVIN_RANGE = { min: 800, max: 14000 }
export const TINT_RANGE = { min: -50, max: 50 }
export const CONTRAST_RANGE = { min: -50, max: 50 }
export const BRIGHTNESS_RANGE = { min: -50, max: 50 }
export const SATURATION_RANGE = { min: -100, max: 100 }

/**
 * ccWhiteBalanceMode options: 0 None, 1 Custom, 2 Daylight … 7 Flash. Kelvin and Tint only
 * take effect with Custom (operator finding, 2026-10-29), so the server sets it on layer load
 * and toDisguise() always sends it.
 */
export const WB_MODE_CUSTOM = 1

/** Assumed disguise Levels model (GRADE_MATH.md §4). */
export const LEVELS_MODEL = {
  /** 'inverse': m = n^(1/Midtone).  'direct': m = n^Midtone. VERIFY which (needs a picture). */
  midtone: 'inverse' as 'inverse' | 'direct',
  /** VERIFIED: negative Shadow values are stored as sent. VERIFY they also render as expected. */
  shadowMin: null as number | null,
  /** VERIFIED: Highlight > 1 is stored as sent. */
  highlightMax: null as number | null,
}

/**
 * ColourAdjust `source` is a ContentSource; the panel toggles `source.isExplicitEffectMode`
 * (Designer label "from background"). VERIFIED: uint, settable over Live Update, default 0.
 */
export const SOURCE_BACKGROUND: SourceValue = 1
export const SOURCE_DEFAULT: SourceValue = 0
export const SOURCE_OPTIONS: readonly { value: SourceValue; label: string }[] = [
  { value: 1, label: 'Background' },
  { value: 0, label: 'Texture' }, // arrow / texture input (source.arrow, source.texture)
]

/**
 * One Live Update subscription per keyframed field. VERIFIED: field-sequence names are the
 * Python property names; Colour fields are split per channel (`shadowColour.r` …), and the
 * alpha channel is left alone. Every field is a KeyFloat (numbers; bools as 0/1).
 */
export interface LiveField {
  seq: string
  field: DisguiseField
  channel?: Channel
  kind: 'number' | 'bool'
}

const scalar = (field: DisguiseField, kind: LiveField['kind'] = 'number'): LiveField => ({ seq: field, field, kind })
const colour = (field: DisguiseField): LiveField[] =>
  (['r', 'g', 'b'] as const).map((channel) => ({ seq: `${field}.${channel}`, field, channel, kind: 'number' }))

export const LIVE_FIELDS: readonly LiveField[] = [
  scalar('ccWhiteBalanceMode'),
  scalar('ccKelvin'),
  scalar('ccTint'),
  scalar('ccContrast'),
  scalar('ccBrightness'),
  scalar('ccSaturation'),
  ...colour('shadowColour'),
  ...colour('midtoneColour'),
  ...colour('gainColour'),
  scalar('outputLevelLow'),
  scalar('outputLevelHigh'),
  scalar('oututLevelClampEnable', 'bool'),
  scalar('outputLevelLowClamp'),
  scalar('outputLevelHighClamp'),
  { seq: 'source.isExplicitEffectMode', field: 'source', kind: 'number' },
]

/** Live Update object expression for a layer. VERIFIED: getByUID(0x<16 hex digits>). */
export function layerObject(layerUid: string): string {
  return `getByUID(${layerUid})`
}

/**
 * Live Update property path for one field's keyframe value. VERIFIED for single-key fields
 * (every field ships with disableSequencing = true and one key at the layer start).
 * VERIFY: which key index to edit when a field has several keys (FR17, §6.2).
 */
export function propertyPath(seq: string, keyIndex = 0): string {
  return `object.findSequence("${seq}").sequence.key(${keyIndex}).v`
}

/**
 * Layer bypass (Q7). VERIFIED 2026-10-29: `object.renderEnable` (SuperLayer.renderEnable).
 * Setting it false stops the module rendering (module.isRendering → false); true restores it.
 * It is a layer property, so Bypass never touches keyframes. Not `object.render`: that flag
 * changes but the module keeps rendering, so the grade stayed on screen.
 */
export const BYPASS_PATH = 'object.renderEnable'

/**
 * "ColourAdjust layers live at the playhead" (Q5). VERIFIED: subscribable, pushes on change,
 * returns [{uid, name, track}] with uid as a hex string (avoids large-int precision loss).
 */
export const LIVE_LAYERS_SUBSCRIPTION = {
  object: 'transportManager:default',
  property:
    '[{"uid": "0x%016x" % l.uid, "name": l.name, "track": object.player.track.description}' +
    ' for l in object.player.track.getLeafLayers(ColourAdjustModule)' +
    ' if l.contains(object.player.tRender)]',
  updateFrequencyMs: 250,
}

/** Tag the mock director uses to recognise each script. */
export const SCRIPT_TAG = {
  discovery: '# colour-grader:discovery',
  keyframe: '# colour-grader:keyframe',
} as const

/**
 * Run once at connect / Refresh: every ColourAdjust layer on the current track.
 * VERIFIED (probes/probe_colouradjust_sequences.py): read-only, uses only names checked in
 * d3.pyi, index iteration, bare except.
 */
export const DISCOVERY_SCRIPT = `${SCRIPT_TAG.discovery}
import d3
track = guisystem.track
leaf = track.getLeafLayers(d3.ColourAdjustModule)
out = []
for i in range(len(leaf)):
    L = leaf[i]
    try:
        out.append({'uid': '0x%016x' % int(L.uid), 'name': str(L.name), 'track': str(track.description), 'tStart': float(L.tStart), 'tEnd': float(L.tEnd)})
    except:
        pass
return out`

/**
 * Add a key at the playhead, once per field per gesture (FR17, §6.2). NOT PROBED.
 * VERIFY: every field ships with disableSequencing = true, so a keyframe first needs
 * sequencing enabled on that field — a project change the operator must agree to.
 */
export function keyframeScript(layerUid: string, seq: string): string {
  return `${SCRIPT_TAG.keyframe}
# PLACEHOLDER — not yet probed. layer=${layerUid} sequence=${seq}
raise Exception("keyframe script not verified (Phase 0)")`
}
