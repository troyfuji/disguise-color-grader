# Product Requirements — disguise Colour Grader

| | |
| --- | --- |
| **Owner** | Troy |
| **Status** | Agreed for build — v1 |
| **Last updated** | 2026-10-29 |
| **Related docs** | `UI_SPEC.md` · `STYLE_GUIDE.md` · `GRADE_MATH.md` · `DISGUISE_API.md` · `BUILD_PLAN.md` · `mockup/index.html` |

---

## 1. Overview

A web page that gives anyone on a show professional, colourist-style primary grading controls — Temp/Tint, Lift/Gamma/Gain/Offset wheels, Contrast, Brightness, Saturation — and drives the disguise **ColourAdjust** layer that is live on screen, in real time, over the network.

disguise can already grade with the ColourAdjust layer, but only through Designer's sliders. People who think in standard grading controls — and clients who just want "a bit warmer" — shouldn't need to learn Designer, and the media server operator shouldn't have to hand over the show file to let them.

## 2. Goals

Speed, familiarity and safety matter equally (all three are v1 goals).

| # | Goal | Measured by |
| --- | --- | --- |
| G1 | **Speed** — fix a screen in seconds during tech or a show | Common corrections (warm/cool, lift blacks, pull saturation) take under 10 s from picking up the tablet |
| G2 | **Familiarity** — a colourist grades without training on disguise | A colourist confirms it feels like a professional grading panel (success criterion S2) |
| G3 | **Safety** — the grader can't hurt the show | Only the selected ColourAdjust layer is ever changed; Safe lock stops all input; the app never causes playback errors (S5, S6) |
| G4 | **Light on disguise** — the app never slows the Director | Stays within the API budget in §7 at all times |

## 3. Users

The panel must work for every group below; none of them is assumed to know Designer.

| User | Context | What they need |
| --- | --- | --- |
| **Colourist / DIT** | Brought in for the show | Controls that behave like a professional grading panel |
| **Media server operator** | Owns the disguise system | To hand grading to someone else safely, and grade themselves quickly |
| **Camera / IMAG director** | Matching IMAG screens to camera | Fast warm/cool and exposure trims |
| **Client / creative** | Wants to tweak the look | Clear, forgiving controls; Bypass to compare; Undo |

Because clients and non-colourists are users, labels stay familiar to colourists but every control has a plain-language tooltip (e.g. "Lift — shadows").

## 4. User stories

**Grading**
- US1 As a colourist, I want Lift/Gamma/Gain/Offset wheels with master jog wheels, so I can grade the way I do in my grading software.
- US2 As a camera director, I want Temp and Tint, so I can match the LED to the camera's white balance quickly.
- US3 As a client, I want to see the picture without the grade and switch back, so I can judge whether the grade helps.
- US4 As any user, I want to undo and redo my last moves, so I can experiment without fear.
- US5 As any user, I want to reset one control, one wheel, or the whole grade.

**Targeting**
- US6 As an operator, I want the panel to target only the ColourAdjust layer that is playing right now, so nobody grades something that isn't on screen.
- US7 As an operator, I want to toggle the layer's source (background / texture) from the panel.
- US8 As a grader, when I move a control on an animated grade, I want a keyframe added at the playhead, so I change the grade from this moment on without wrecking the rest of the timeline.

**Safety**
- US9 As an operator, I want a Live / Safe lock, so I can hand over the tablet or walk away without accidental changes.
- US10 As an operator, I want the app to stay within a strict API budget, so it never slows the system or causes playback errors.
- US11 As any user, I want the panel to tell me clearly when it's disconnected, and never show values that aren't really on the layer.

## 5. Functional requirements

### Connection
- **FR1** The user enters a Director address in a panel; the colour-grader server connects to it over the Live Update WebSocket. Every panel shows the state (connected / connecting / offline) at all times.
- **FR2** The server remembers the last Director address and reconnects to it on start.
- **FR3** No login or PIN: anyone who can open the page can connect. The page is only reachable on the show network.
- **FR4** On connection loss, all controls lock and a reconnect overlay appears. On reconnect, the app re-reads every value from disguise before unlocking.

### Layer targeting
- **FR5** The layer picker lists **only ColourAdjust layers that are live at the current playhead** on the playing track.
- **FR6** The user selects one of them; that layer becomes the only layer the panel may write to.
- **FR7** The live list updates when the playhead moves into or out of ColourAdjust layers, using a Live Update subscription — never by polling.
- **FR8** If the selected layer stops being live (the playhead leaves it), the panel locks, shows "Layer no longer live", and offers the layers that are now live. It never switches layers by itself.
- **FR9** The header shows a **Source** toggle (background / texture) that writes the selected layer's `source` immediately.

### Grading controls
- **FR10** Horizontal sliders under the wheels: **Cont** and **Bright** on the left (under Lift and Gamma); **Temp** (Kelvin), **Tint** and **Sat** on the right (under Gain and Offset).
- **FR11** Four wheels — **Lift, Gamma, Gain, Offset** — each with a draggable puck, numeric readouts (Y R G B; R G B for Offset), a master jog wheel and a reset.
- **FR12** Bottom strip: a **Legal range** popover (clamp on/off, low, high).
- **FR13** Lift/Gamma/Gain/Offset follow standard grading behaviour (Lift holds whites, Gain holds blacks, Offset moves everything); the app converts them into disguise Levels values as defined in `GRADE_MATH.md`.
- **FR14** Standard grading controls disguise can't perform (Pivot, MD, Col Boost, Shad, Hi/Light, Hue, L. Mix) are not shown.
- **FR15** Every value can be changed by dragging, typing, mouse wheel or touch; Shift / two-finger gives fine control.
- **FR16** Reset per control, per wheel, and for the whole grade (whole-grade reset needs a second tap to confirm).

### Keyframes
- **FR17** When the user changes a value: if a keyframe for that property exists at the playhead, the panel edits it; if not, it **adds a new keyframe at the playhead** at the start of the gesture and edits that.
- **FR18** A keyframe is created at most once per property per gesture (not per move event).

### Bypass, undo, Safe lock
- **FR19** **Bypass** toggle shows the ungraded picture without losing the grade; toggling again restores it exactly.
- **FR20** **Undo / Redo** buttons step through the panel's own history of grade changes (one step per completed gesture, at least 50 steps). Undo sends the earlier values to disguise like any other change. Designer's own undo is unaffected.
- **FR21** **Live / Safe** lock in the header. In Safe, every control is inert and visibly dimmed; switching to Live needs a deliberate action (press and hold 1 s).
- **FR22** The panel starts in **Safe** after every connect and every layer change.

### Sync
- **FR23** Changes made to the selected layer in Designer (or by another panel) appear in the panel live.
- **FR24** Two panels on the same layer are not prevented or coordinated in v1; the last change wins and both stay in sync via FR23.
- **FR25** **Presets:** save the current grade under a name, apply a saved grade (one undoable edit, needs Live, keeps the layer's Source), update, rename, delete. The list is stored by the server (`data/presets.json`) and shared by every panel. Preset actions other than Apply never touch disguise.

## 6. Non-goals (v1)

- **Never** make repeated or unthrottled API calls that could slow the Director or cause playback errors (see §7). This is a hard rule, not just a v1 limit.
- Never create or delete layers, tracks or resources; never move the playhead or change the timeline (beyond adding keyframes per FR17).
- Never write to any layer other than the one selected in FR6.
- No scopes — users watch disguise's Waveform and Vectorscope.
- No hardware control (MIDI, OSC, panels).
- No access control or user accounts.
- No coordination between simultaneous users.
- No A/B compare, copy grade between screens, linked screens or Curves (later goals, not shown until built). Saved grades are in scope as Presets (FR25).
- No secondary grading, LUT authoring or output colour management.

## 7. Performance and API budget (hard requirements)

The app must never be the reason a show stutters.

| Rule | Limit |
| --- | --- |
| Live Update connections | **1** per colour-grader server, however many panels are open |
| Value writes (`set`) | At most **1 per property every 50 ms** during a gesture (≤ 20/s), batched into one message per tick; the final value always sent on release |
| Idle writes | **0** — nothing is sent when nobody is touching a control |
| Subscriptions | Only the selected layer's properties + the live-layer list; all unsubscribed on layer change or page close |
| Read-back rate | `updateFrequencyMs` ≥ 50 for values, ≥ 250 for the live-layer list |
| Python Execution API | **Never polled.** Only: discovery at connect, an explicit Refresh, and keyframe creation (at most once per property per gesture, FR18). Never during a drag's move events |
| Reconnect | Back-off from 1 s up to 10 s; no reconnect storms |
| Undo / Bypass / Reset | Sent as one batched write, not one call per property |

Phase 0 must confirm that keyframe creation through the Python API is safe during playback. If it isn't, FR17 falls back to "edit the existing keyframe at or before the playhead" and this doc is updated.

## 8. Design considerations

- Look and feel: familiar to colourists, own branding — `STYLE_GUIDE.md`.
- Screen layout, controls, touch rules and states — `UI_SPEC.md`.
- Visual target — `mockup/index.html`.
- Touch-first: 44 px minimum targets; works on iPad and laptop.

## 9. Technical considerations

- **Standalone server** (Node) on a laptop on the show network, not a Designer plugin. It serves the panel page and is the only thing that talks to disguise: one Live Update socket, all Python calls, layer selection and the API budget. Panels (browsers) talk only to the server.
- Vue 3 + TypeScript + Vite panel; the server shares the grade maths with it — `BUILD_PLAN.md`.
- disguise API details and unknowns — `DISGUISE_API.md`.
- Panel → disguise maths — `GRADE_MATH.md`.

## 10. Panel control → disguise mapping

| Control | disguise ColourAdjust property | Notes |
| --- | --- | --- |
| Temp | `ccKelvin` | Shown in Kelvin |
| Tint | `ccTint` | |
| Cont | `ccContrast` | No pivot |
| Bright | `ccBrightness` | disguise extra; −50 to +50, 0 neutral |
| Lift wheel + master | `shadowColour` (RGB), `outputLevelLow` | Converted |
| Gamma wheel + master | `midtoneColour` (RGB, HDR) | Converted |
| Gain wheel + master | `gainColour` (RGB), `outputLevelHigh` | Converted |
| Offset wheel + master | Folded into Levels values | Emulated |
| Sat | `ccSaturation` | −100 to +100, 0 = neutral |
| Legal range | `oututLevelClampEnable`, `outputLevelLowClamp`, `outputLevelHighClamp` | |
| Source | `source` | Header toggle |
| (hidden) | `ccWhiteBalanceMode` | Set to 1 (Custom) on layer load — Temp/Tint only work with Custom |

## 11. Success criteria (v1 is done when all are true)

| # | Criterion |
| --- | --- |
| S1 | It grades one screen reliably through a real show |
| S2 | A colourist confirms it feels like a professional grading panel |
| S3 | It survives a network drop mid-gesture without corrupting the grade or leaving wrong values on screen |
| S4 | It runs on an iPad (Safari) as well as a laptop (Chrome) |
| S5 | During a full playback test, disguise shows no dropped frames or playback errors attributable to the app, and the API budget in §7 is never exceeded |
| S6 | No write ever lands on a layer other than the selected one |

## 12. Open questions

| # | Question | Answer by |
| --- | --- | --- |
| Q1 | Exact Live Update property path for each ColourAdjust value | **Answered** — DISGUISE_API §8 |
| Q2 | Ranges and neutral values; can `shadowColour` go negative? | **Answered** (stored unclamped; render check open) — DISGUISE_API §8 |
| Q3 | Exact disguise Levels formula | Phase 0 |
| Q4 | Values `source` takes, and setting it remotely | **Answered** — `source.isExplicitEffectMode` 1/0 |
| Q5 | How to subscribe to "ColourAdjust layers live at the playhead" without polling | **Answered** — DISGUISE_API §8 |
| Q6 | Is creating a keyframe via Python safe during playback (FR17)? Fields ship with sequencing disabled, so this also needs a decision on enabling sequencing | Phase 0 + decision |
| Q7 | **Answered: `object.renderEnable` (verified: stops the module rendering; `object.render` does not).** How to implement Bypass: a layer mute/enable property if one exists, otherwise neutral values written to the current keyframe and restored. Must not leave extra keyframes behind | Phase 0 |
| Q8 | If two ColourAdjust layers are live at once, which is selected by default? (Proposal: none; the user picks) | Design review |
| Q9 | ~~Can the browser call the Python endpoint directly (CORS)?~~ Moot: only the server calls disguise (D19) | Closed |

## 13. Decision log

| # | Decision | Date |
| --- | --- | --- |
| D1 | Runs as a web page | 2026-10-29 |
| D2 | Mouse and touch only in v1 | 2026-10-29 |
| D3 | Custom product, familiar to colourists, own branding | 2026-10-29 |
| D4 | Hide grading controls disguise can't do | 2026-10-29 |
| D5 | Source toggle on the main panel | 2026-10-29 |
| D6 | Scopes stay in disguise | 2026-10-29 |
| D7 | Behave like a standard grading panel; convert to disguise values | 2026-10-29 |
| D8 | Target only the selected ColourAdjust layer that is live now | 2026-10-29 |
| D9 | Speed, familiarity and safety are equal goals | 2026-10-29 |
| D10 | Users: colourists, operators, camera directors and clients | 2026-10-29 |
| D11 | No access control | 2026-10-29 |
| D12 | Changes add a keyframe at the playhead | 2026-10-29 |
| D13 | Simultaneous users not handled in v1 | 2026-10-29 |
| D14 | Bypass toggle in v1 | 2026-10-29 |
| D15 | Live / Safe lock | 2026-10-29 |
| D16 | Panel has its own Undo / Redo | 2026-10-29 |
| D17 | Page served from a laptop on the show network | 2026-10-29 |
| D18 | Strict API budget; no repeated calls that slow the system | 2026-10-29 |
| D19 | Standalone server owns the disguise link; panels talk only to the server; not a Designer plugin | 2026-10-29 |
