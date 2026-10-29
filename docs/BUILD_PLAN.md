# Build Plan — disguise Colour Grader

## 1. Tech stack

| Part | Choice | Why |
| --- | --- | --- |
| Language | TypeScript (strict) | Safety for the maths and protocol types |
| UI | **Vue 3** + Vite | Standalone web app served by our own Node server; not a Designer plugin |
| Live Update | Own thin client in the server (`server/director/liveUpdate.ts`), not `vue-liveupdate` | The API budget needs exact control of throttling, batching, echo suppression and message counts |
| Controls | Hand-built SVG components (wheel, jog, value field) | Full control over the grading-panel look and touch behaviour; no UI kit |
| State | Pinia store holding `GradeState` | One source of truth; converter is a pure function of it |
| Tests | Vitest (unit), Playwright (UI smoke) | Converter maths must be tested before touching a real Director |
| Dev backend | `tools/mock-director` — small Node WebSocket server speaking the Live Update protocol | Build and test without disguise on the desk |
| Server | Standalone Node server (`server/main.ts`, runs on Node ≥ 22.18 with built-in TypeScript) on the operator's laptop. Serves the panel, owns the one Live Update socket and all Python calls, keeps panels in sync over `/api/panel` | D17, D19: not a Designer plugin; one disguise connection however many panels |

## 2. Repository layout

```text
/
├─ CLAUDE.md · README.md
├─ docs/                     these specs
├─ index.html · vite.config.ts · tsconfig.json · package.json
├─ shared/                   pure TypeScript used by server and panel
│  ├─ protocol.ts            panel ⇄ server messages, SessionState
│  ├─ disguise/paths.ts      every VERIFY placeholder (paths, neutrals, Levels model, scripts)
│  └─ grade/
│     ├─ types.ts            GradeState, WheelState, DisguiseValues
│     ├─ tuning.ts           sensitivities and scales to tune with a colourist
│     ├─ neutral.ts          neutral GradeState, reset, isNeutral
│     ├─ wheel.ts            puck ↔ RGB deltas, readouts
│     ├─ toDisguise.ts       GradeState → ColourAdjust values (GRADE_MATH.md)
│     ├─ fromDisguise.ts     read-back
│     ├─ validate.ts         shape check for grades arriving from panels
│     └─ history.ts          undo / redo stack (used by the panel)
├─ server/                   standalone Node server (the only thing that talks to disguise)
│  ├─ main.ts                HTTP (panel page, /api/health) + panel WebSocket /api/panel
│  ├─ session.ts             Director link, selected layer, authoritative grade, sync
│  └─ director/
│     ├─ liveUpdate.ts       one socket, subscribe, back-off, echo-filtered read-back
│     ├─ writeThrottle.ts    50 ms batched set writes
│     ├─ echoFilter.ts       ignore echoes of our own writes
│     └─ pythonApi.ts        Python execute with the call budget enforced
├─ src/                      the browser panel (talks only to our server)
│  ├─ main.ts · App.vue
│  ├─ styles/tokens.css      colour/type tokens from STYLE_GUIDE.md (+ base.css)
│  ├─ panel/connection.ts    WebSocket to the server, back-off
│  ├─ stores/grade.ts        panel grade, gestures, undo/redo, Safe/Live
│  ├─ stores/session.ts      server link + broadcast session state
│  └─ components/            Phase 2: ValueField, Parameter, ColorWheel, JogWheel, WheelColumn,
│                            SourceToggle, LayerPicker, Toolbar, StatusBar, ConnectDialog
├─ scripts/dev.mjs           npm run dev: server (watch) + Vite
├─ tools/mock-director/      fake Live Update + execute endpoints (+ /mock/* test controls)
├─ probes/                   Phase 0 Python probes (run with d3-plugin-toolkit as a dev tool)
└─ tests/
```

## 3. Phases

### Phase 0 — Prove it on a real Director (half a day, needs disguise)

Goal: answer every **VERIFY** in `DISGUISE_API.md` and `GRADE_MATH.md`. Write findings back into those docs before Phase 2.

- [ ] Test project: grey ramp, colour bars, skin-tone clip → each into its own ColourAdjust layer
- [x] Python execute: list ColourAdjust layers and their field-sequence names
- [x] Find the Live Update path for every property; confirm `set` works for floats, Colour fields (whole and single-channel), bool and `source`
- [x] Record range + neutral of every property; does `shadowColour` accept negatives? does `gainColour` accept > 1?
- [ ] Measure the Levels formula: set known Shadow/Midtone/Highlight values, read output pixel values (Colour Inspector or waveform)
- [x] Find `source` values (background / texture)
- [ ] Check behaviour with 2+ keyframes on a property
- [x] Find a subscribable expression for "ColourAdjust layers live at the playhead" (DISGUISE_API §6.1)
- [ ] Find how to add a keyframe at the playhead via Python, and time it during playback — no dropped frames allowed (§6.2)
- [x] Look for a layer bypass/mute property for Bypass (§6.3)
- [ ] Run a full playback test with a script sending the maximum budgeted traffic (PRODUCT_SPEC §7) and watch for dropped frames

### Phase 1 — Skeleton and maths (no disguise needed)

- [x] Vite + Vue 3 + TS project, tokens.css from the style guide
- [x] `grade/` module with full unit tests from `GRADE_MATH.md` §7
- [x] Mock director: accepts subscribe/set/unsubscribe, echoes `valuesChanged`, serves a fake live-layer list that changes on a timer, counts messages per second
- [x] `history.ts`: undo/redo stack of GradeState, one entry per completed gesture, ≥ 50 steps
- [x] API budget tests: fail if writes exceed 1 per property per 50 ms, any write while idle, or Python calls outside the allowed cases

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
- [x] Throttled, batched sets (50 ms), final value on release, echo suppression (server)
- [ ] Keyframe at playhead on first change of a gesture
- [x] Bypass and batched Undo/Redo writes (server side; panel buttons in Phase 2)
- [ ] Source toggle
- [x] Read-back from Designer edits (server broadcasts to panels)
- [ ] Legal range popover

### Phase 4 — Show-readiness

- [ ] Test on the real Director with the Phase 0 project; compare by eye with a colourist on the same clip
- [ ] Tune wheel and jog sensitivity with a colourist
- [ ] Network-loss test: pull the cable mid-drag; panel must lock and recover cleanly
- [ ] Wrong-layer test: switch layers mid-drag; no writes may hit the old layer
- [ ] Playback test: full show run with the panel in use; zero dropped frames or playback errors from the app
- [ ] iPad Safari and laptop Chrome both pass
- [ ] Production build + serving instructions in README

## 4. Definition of done (v1)

All success criteria in `PRODUCT_SPEC.md` §11 met on a real Director, on Chrome desktop and iPad Safari.
