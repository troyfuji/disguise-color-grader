# Build Plan — disguise Colour Grader

## 1. Tech stack

| Part | Choice | Why |
| --- | --- | --- |
| Language | TypeScript (strict) | Safety for the maths and protocol types |
| UI | **Vue 3** + Vite | disguise publishes a Vue Live Update composable (`@disguise-one/vue-liveupdate`) |
| Controls | Hand-built SVG components (wheel, jog, value field) | Full control over the Resolve-like look and touch behaviour; no UI kit |
| State | Pinia store holding `GradeState` | One source of truth; converter is a pure function of it |
| Tests | Vitest (unit), Playwright (UI smoke) | Converter maths must be tested before touching a real Director |
| Dev backend | `tools/mock-director` — small Node WebSocket server speaking the Live Update protocol | Build and test without disguise on the desk |
| Prod serving | A small Node server on the operator's laptop serves the built page on the show network, and proxies `/api/session/python/*` to the Director if CORS blocks direct calls | Decision D17: page served from a laptop |

## 2. Repository layout

```
/
├─ CLAUDE.md                 instructions for the coding assistant
├─ README.md
├─ docs/                     these specs
├─ reference/                Resolve screenshots + colourist guide (move the root images here)
├─ src/
│  ├─ main.ts
│  ├─ App.vue
│  ├─ styles/tokens.css      colour/type tokens from STYLE_GUIDE.md
│  ├─ components/
│  │  ├─ ValueField.vue
│  │  ├─ Parameter.vue       label + ValueField + hint bar
│  │  ├─ ColorWheel.vue
│  │  ├─ JogWheel.vue
│  │  ├─ WheelColumn.vue     name, reset, wheel, readouts, jog
│  │  ├─ SourceToggle.vue
│  │  ├─ LayerPicker.vue
│  │  ├─ Toolbar.vue
│  │  ├─ StatusBar.vue
│  │  └─ ConnectDialog.vue
│  ├─ grade/
│  │  ├─ types.ts            GradeState, WheelState
│  │  ├─ neutral.ts          neutral GradeState
│  │  ├─ wheel.ts            puck → RGB deltas
│  │  ├─ toDisguise.ts       GradeState → ColourAdjust values (GRADE_MATH.md)
│  │  ├─ fromDisguise.ts     read-back
│  │  └─ history.ts          undo / redo stack
│  ├─ disguise/
│  │  ├─ liveUpdate.ts       connection, subscribe, throttled set, echo suppression
│  │  ├─ discovery.ts        Python execute: list ColourAdjust layers
│  │  └─ paths.ts            property paths per field (filled in Phase 1)
│  └─ stores/grade.ts
├─ tools/mock-director/      fake Live Update + execute endpoints
└─ tests/
```

## 3. Phases

### Phase 0 — Prove it on a real Director (half a day, needs disguise)

Goal: answer every **VERIFY** in `DISGUISE_API.md` and `GRADE_MATH.md`. Write findings back into those docs before Phase 2.

- [ ] Test project: grey ramp, colour bars, skin-tone clip → each into its own ColourAdjust layer
- [ ] Python execute: list ColourAdjust layers and their field-sequence names
- [ ] Find the Live Update path for every property; confirm `set` works for floats, Colour fields (whole and single-channel), bool and `source`
- [ ] Record range + neutral of every property; does `shadowColour` accept negatives? does `gainColour` accept > 1?
- [ ] Measure the Levels formula: set known Shadow/Midtone/Highlight values, read output pixel values (Colour Inspector or waveform)
- [ ] Find `source` values (background / texture)
- [ ] Check CORS from a browser page on another machine to `/api/session/python/execute`
- [ ] Check behaviour with 2+ keyframes on a property
- [ ] Find a subscribable expression for "ColourAdjust layers live at the playhead" (DISGUISE_API §6.1)
- [ ] Find how to add a keyframe at the playhead via Python, and time it during playback — no dropped frames allowed (§6.2)
- [ ] Look for a layer bypass/mute property for Bypass (§6.3)
- [ ] Run a full playback test with a script sending the maximum budgeted traffic (PRODUCT_SPEC §7) and watch for dropped frames

### Phase 1 — Skeleton and maths (no disguise needed)

- [ ] Vite + Vue 3 + TS project, tokens.css from the style guide
- [ ] `grade/` module with full unit tests from `GRADE_MATH.md` §7
- [ ] Mock director: accepts subscribe/set/unsubscribe, echoes `valuesChanged`, serves a fake live-layer list that changes on a timer, counts messages per second
- [ ] `history.ts`: undo/redo stack of GradeState, one entry per completed gesture, ≥ 50 steps
- [ ] API budget tests: fail if writes exceed 1 per property per 50 ms, any write while idle, or Python calls outside the allowed cases

### Phase 2 — Controls

- [ ] `ValueField`, `Parameter` (drag, wheel, type, fine, reset)
- [ ] `ColorWheel` (relative drag, fine, double-tap reset, live readouts)
- [ ] `JogWheel`
- [ ] `WheelColumn`, top/bottom strips, toolbar with disabled later-goal icons
- [ ] Undo/Redo, Bypass and Live/Safe (hold-to-arm) controls; Safe dims and blocks all input
- [ ] Plain-language tooltips (long-press on touch)
- [ ] Touch: pointer capture, `touch-action: none`, 44 px targets — test on an iPad

### Phase 3 — Live connection

- [ ] Connect dialog, status bar, reconnect overlay
- [ ] Layer discovery + live-layer picker; resubscribe on change; return to Safe on change
- [ ] "Layer no longer live" lock and banner
- [ ] Throttled, batched sets (50 ms), final value on release, echo suppression
- [ ] Keyframe at playhead on first change of a gesture
- [ ] Bypass and batched Undo/Redo writes
- [ ] Source toggle
- [ ] Read-back from Designer edits
- [ ] Legal range popover

### Phase 4 — Show-readiness

- [ ] Test on the real Director with the Phase 0 project; compare against Resolve on the same clip
- [ ] Tune wheel and jog sensitivity with a colourist
- [ ] Network-loss test: pull the cable mid-drag; panel must lock and recover cleanly
- [ ] Wrong-layer test: switch layers mid-drag; no writes may hit the old layer
- [ ] Playback test: full show run with the panel in use; zero dropped frames or playback errors from the app
- [ ] iPad Safari and laptop Chrome both pass
- [ ] Production build + serving instructions in README

## 4. Definition of done (v1)

All success criteria in `PRODUCT_SPEC.md` §11 met on a real Director, on Chrome desktop and iPad Safari.
