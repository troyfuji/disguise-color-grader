# disguise API Notes

How the panel talks to disguise Designer. Everything here was read from the official docs on 2026-10-29; items marked **VERIFY** must be tested on a real Director in Phase 0.

Sources:
- [ColourAdjustModule — Python API Reference](https://developer.disguise.one/python-api/docs/colouradjustmodule/index.html)
- [Live Update API](https://developer.disguise.one/api/session/liveupdate)
- [Python Execution API](https://developer.disguise.one/python-api/execution-api)
- [vue-liveupdate (GitHub)](https://github.com/disguise-one/vue-liveupdate)
- [Designer Plugins — Introduction](https://developer.disguise.one/plugins/introduction/)
- [ColourAdjust layer — User Guide](https://help.disguise.one/designer/layers/layer-types/effect/colouradjust)

---

## 1. Two APIs, two jobs

| API | Endpoint | Use for | Never use for |
| --- | --- | --- | --- |
| **Live Update** (WebSocket) | `ws://<director>/api/session/liveupdate` | Every control move; reading current values; two-way sync | Creating objects |
| **Python Execution** (HTTP) | `POST http://<director>/api/session/python/execute` and `/registermodule` | Listing ColourAdjust layers at connect; one-off setup | Anything per frame, polling, or during the show |

disguise's docs state the Python endpoint "MUST NOT be polled" and is not supported during production. The Live Update API is the real-time path.

## 2. ColourAdjustModule properties

| Python property | Type | Designer name | Panel control |
| --- | --- | --- | --- |
| `ccWhiteBalanceMode` | int | White balance preset | Hidden, set to 1 (Custom) |
| `ccKelvin` | float | Kelvin | Temp |
| `ccTint` | float | Tint | Tint |
| `ccContrast` | float | Contrast | Cont |
| `ccBrightness` | float | Brightness | Bright |
| `ccSaturation` | float | Saturation | Sat |
| `shadowColour` | Colour | Levels → Shadow | Lift (converted) |
| `midtoneColour` | HDRColour | Levels → Midtone | Gamma (converted) |
| `gainColour` | Colour | Levels → Highlight | Gain (converted) |
| `outputLevelLow` | float | Output Low | Lift fallback |
| `outputLevelHigh` | float | Output High | Gain fallback |
| `oututLevelClampEnable` | bool | Enable Output Clamp | Legal range (note the typo is in the real API name) |
| `outputLevelLowClamp` | float | Output Low Clamp | Legal range |
| `outputLevelHighClamp` | float | Output High Clamp | Legal range |
| `source` | ContentSource | Source | Source toggle |

`ccWhiteBalanceMode` options: 0 None, 1 Custom, 2 Daylight, 3 Shade, 4 Cloudy, 5 Tungsten, 6 Florescent, 7 Flash. **Kelvin and Tint only take effect with 1 (Custom)** (operator finding, 2026-10-29), so the server writes 1 once when a layer loads (only if it isn't already 1) and `toDisguise()` always sends 1.

**VERIFY:** ranges and defaults of every property; the JSON shape of `Colour` / `HDRColour` (expected `{r, g, b, a}`); the values `source` accepts.

## 3. Live Update protocol

Connect: `ws://<director>:80/api/session/liveupdate`

**Subscribe** — an object (Designer expression) plus property paths (Python expressions where `object` is the resolved object):

```json
{ "subscribe": {
    "object": "track:track_1.getLeafLayers()[0]",
    "properties": ["object.findSequence(\"<name>\").sequence.key(0).v"],
    "configuration": { "updateFrequencyMs": 50 }
} }
```

**Server replies** with the full subscription list (`subscriptions`: id, objectPath, propertyPath) and the current values (`valuesChanged`: id, value, changeTimestamp, messageTimestamp).

**Set** — by subscription id; JSON objects can be set one field at a time (partial merge):

```json
{ "set": [ { "id": 123, "value": 6500 }, { "id": 124, "value": { "r": 0.02 } } ] }
```

**Unsubscribe:** `{ "unsubscribe": { "ids": [123, 124] } }`

**Errors:** `{ "error": "<message>" }`

Behaviour that matters for us:
- Sets are **undoable**, **persistent** on the Director, and spread to every Designer machine in the session.
- The same object+property subscribed twice returns the same id (reference counted). Every subscribe needs a matching unsubscribe.
- There's no way to know if a path is settable except trying it.
- Fastest update rate is 50 ms (vue-liveupdate default).

### Property path to each value — VERIFY

Layer values live in keyframe sequences. The docs' example for a layer value:

```
object.findSequence("pos.x").sequence.key(0).v
```

Phase 0 must find:
1. The sequence name for each ColourAdjust field (e.g. `"ccKelvin"`? `"Kelvin"`?).
2. How Colour fields split (one sequence returning `{r,g,b,a}`, or `shadowColour.r` etc.).
3. How to address a layer by name rather than by index.
4. What happens when a sequence has more than one keyframe.

Useful discovery query (run once via Python execute, Section 4):

```python
layer = ...  # a ColourAdjust layer
return [s.name for s in layer.fieldSequences]   # VERIFY attribute names against d3.pyi
```

Type stubs for autocomplete: <https://developer.disguise.one/assets/d3.pyi>

## 4. Python Execution API

```http
POST /api/session/python/execute
Content-Type: application/json

{ "script": "return [l.name for l in ...]" }
```

Response fields: `status.code` (0 = OK), `status.message`, `d3Log`, `pythonLog`, `returnValue` (JSON string).

Rules:
- Python 2.7. The script is wrapped in a function, so use `return` and no `from x import *`. The `d3` package is pre-imported.
- From r34.2 enums can't be serialised: return `int(value)` or `value.toString()`.
- Runs on Designer's main thread; long scripts pause Designer and hit a timeout. Failed scripts are rolled back (undo).
- `registermodule` preloads a module (needs its own `from d3 import *`).

The panel uses it **only** at connect time to list ColourAdjust layers (track, layer name, index/uid, current source).

Only the colour-grader server calls this endpoint (D19), so browser CORS does not apply.

## 5. Vue composable (not used)

The server uses its own thin client (`server/director/liveUpdate.ts`) for exact control of the budget. Kept here for reference.

disguise publishes `@disguise-one/vue-liveupdate` (ISC licence, install from GitHub):

```bash
npm install disguise-one/vue-liveupdate
```

```ts
const liveUpdate = useLiveUpdate(directorEndpoint);          // one connection per page
const { kelvin } = liveUpdate.subscribe(layerExpr, { kelvin: '<path>' });
```

- `autoSubscribe(object, ['object.x'])` names refs automatically.
- `freeze()` / `thaw()` pause a subscription; `useSubscriptionVisibility` does it on scroll.
- `<LiveUpdateOverlay :liveUpdate="liveUpdate" />` shows a reconnect overlay.

The README doesn't document a separate `set` call — writing a subscribed ref is how values go back. **VERIFY** this, and fall back to our own thin WebSocket client if we need throttling control it doesn't give.

## 6. Features that need API work — VERIFY in Phase 0

### 6.1 Live layer list (PRODUCT_SPEC FR5–FR8)

The picker shows only ColourAdjust layers live at the playhead. It must update without polling. Candidate approach: one Live Update subscription on the playing track (or transport) whose property is a list comprehension, for example:

```
[{"layer": l, "name": l.name}
 for l in object.getLeafLayers(ColourAdjustModule)
 if l.tStart <= <playhead> < l.tEnd]
```

with `updateFrequencyMs: 250`. Phase 0 must find: the expression for the playing track, the playhead time in beats, the correct layer-type argument for `getLeafLayers`, and whether layer `tStart`/`tEnd` are in the same units. If no subscribable form exists, fall back to subscribing to the playhead section/cue and re-running discovery only when it changes.

### 6.2 Keyframe at playhead (FR17–FR18)

Live Update can set existing values but cannot create keyframes. Candidate: at the **start** of a gesture on a property with no keyframe at the playhead, one Python execute call adds the key (via the layer's field sequence), then the gesture continues over Live Update on that key's `.v`. Phase 0 must confirm:
- the d3 call to add a key at a given time (check `d3.pyi` for `KeySequence` methods);
- that this call is quick and safe while playing (no frame drops);
- how to find "the key at the playhead" for the Live Update path (`key(index)` needs the index).

If unsafe during playback, fall back to editing the existing key at or before the playhead and update PRODUCT_SPEC §7.

### 6.3 Bypass (FR19)

Look for a layer-level enable/mute/bypass property first (check `Layer` in `d3.pyi`). If none exists, Bypass writes neutral values to the keys being edited and restores the stored grade on Bypass off, in one batched `set` each way. It must never create keyframes.

## 7. Rules the code must follow

These implement the API budget in `PRODUCT_SPEC.md` §7 — treat them as hard limits.

1. One Live Update connection per colour-grader server. Panels never connect to disguise.
2. Throttle writes: at most one set per property every 50 ms, batched into one message per tick; always send the latest value; send the final value on gesture end. Nothing is sent while idle.
3. Undo, Redo, Bypass and Reset send one batched `set`, never one message per property.
4. Unsubscribe everything for the previous layer when the user picks a new one, and everything on page unload.
5. Python execute only for: discovery at connect, an explicit Refresh, and keyframe creation at gesture start (max once per property per gesture). Never in a move handler, never on a timer.
6. Read-back subscriptions use `updateFrequencyMs` ≥ 50 (values) and ≥ 250 (live-layer list).
7. Reconnect with back-off from 1 s up to 10 s.
8. On disconnect: freeze the UI, show the overlay, and resubscribe + re-read all values on reconnect before allowing edits.
9. Ignore echoed `valuesChanged` for values we just sent (compare against the last sent value) so the UI doesn't jump while dragging.
10. Log every outgoing message count per second in dev builds, and fail a test if any rule above is exceeded.

## 8. Phase 0 findings (measured 2026-10-29)

Measured on a live Director (localhost) on track `color`, which has one ColourAdjust layer (`ColourAdjust`, beats 0–60, uid `0x9ae8e3b4bfbcdb7d`), with the playhead stopped at 0. Probes: `probes/probe_colouradjust_sequences.py` and `probes/probe_colouradjust_values.py` (Python, read-only), plus Live Update set/read-back/restore scripts. Every value was restored afterwards and checked through Python.

### Field sequences (Q1)

- The sequence name is the Python property name. **Colour fields split per channel**: `shadowColour.r/.g/.b/.a`, and likewise for `midtoneColour` and `gainColour`. The panel writes r, g and b and never touches alpha.
- `source` splits into `source.arrow` (uint), `source.isExplicitEffectMode` (uint, Designer label "from background") and `source.texture` (DxTexture resource).
- Every numeric field is a **`KeyFloat`** (float/uint/ubyte), so `findSequence("<name>").sequence.key(0).v` is a safe read and write path. `mapping` and `source.texture` are resource sequences and are never touched.
- A new layer has **one key per field at the layer start, with `disableSequencing = true`** on every field.
- `oututLevelClampEnable` is a ubyte and is sent as 0/1.
- Other sequences on the layer: `blendMode`, `brightness` (layer master), `tint.r/g/b/a`.
- Live Update object `getByUID(0x<16 hex>)` works for the layer.

### Defaults (Q2)

| Field | Default | Note |
| --- | --- | --- |
| `ccKelvin` | **5000** | not 6500 |
| `ccContrast` | **0** | neutral is 0; the panel maps Cont 1.000 → 0 |
| `ccSaturation` | **0** | neutral is 0; the panel shows disguise units, −100 to +100 |
| `ccTint`, `ccBrightness`, `ccWhiteBalanceMode` | 0 | |
| `shadowColour` | 0, 0, 0 (a 0) | |
| `midtoneColour`, `gainColour` | 1, 1, 1 (a 1) | |
| `outputLevelLow` / `High` | 0 / 1 | |
| `outputLevelLowClamp` / `HighClamp` | 0 / 1 | |
| `oututLevelClampEnable` | 0 | |
| `source.isExplicitEffectMode` | 0 | |

**No clamping on write.** Live Update `set` stored every test value as sent: Kelvin 500 and 40000; Contrast −2; Saturation −0.5 and 5; Shadow −0.1 and −2; Highlight 1.5 and −0.5; Midtone 0 and 2; Output Low −0.2; Output High 1.5. Values are stored as **float32** (0.3 reads back as 0.30000001192…). Whether out-of-range values *render* as expected still needs a picture.

### Source (Q4)

`source.isExplicitEffectMode` is settable over Live Update: 1 = from background, 0 = arrow/texture.

### Live layers at the playhead (Q5)

This subscription works and pushes on change:

```text
object:   transportManager:default
property: [{"uid": "0x%016x" % l.uid, "name": l.name, "track": object.player.track.description}
           for l in object.player.track.getLeafLayers(ColourAdjustModule)
           if l.contains(object.player.tRender)]
```

It returned `[{"track": "color", "uid": "0x9ae8e3b4bfbcdb7d", "name": "ColourAdjust"}]`. Formatting the uid as a hex string avoids large-int precision loss. In Python, `Track.getLeafLayers` **requires** a type argument (`getLeafLayers(d3.ColourAdjustModule)`); calling it without one raises "Incorrect number of arguments".

### Bypass (Q7)

Bypass is `object.renderEnable` (`SuperLayer.renderEnable`): setting it `false` stops the module rendering (`object.module.isRendering` reads `false`), and `true` restores it. It is one write that never touches keyframes. **Not** `object.render`: that flag reads back `false` when set, but the module keeps rendering, so the grade stays on screen (operator report, confirmed 2026-10-29).

### End-to-end

The colour-grader server, connected to this Director, discovered the layer, loaded a neutral grade (Temp 5000, Cont 1.000, Sat 50), wrote an edit as one `set` message, toggled Bypass, and restored everything. Director traffic for the whole run was 6 Live Update messages (4 sets) and 1 Python call.

### Still open

- **Q3:** the Levels formula and Midtone direction (`n^(1/M)` vs `n^M`). Needs a picture or Colour Inspector readings.
- ~~Contrast/Saturation scale~~ — resolved: the panel uses disguise's own units with Designer's ranges: Kelvin 800…14000, Tint −50…+50, Contrast −50…+50, Brightness −50…+50, Saturation −100…+100 (operator, 2026-10-29). There is no API to read these ranges.
- **Q6:** keyframe at the playhead. Every field ships with sequencing disabled, so FR17 would first have to enable sequencing on a field. That is a project change, and it needs a product decision before it is probed.
- **Behaviour during playback**, and the full-budget playback test.
- **The `d3.pyi` gap:** `layer.sequences` (named in the toolkit's reference.md and in the official guide) is absent from the stub. The probes used `Layer.nSequences()` and `Layer.sequence(i)`.
