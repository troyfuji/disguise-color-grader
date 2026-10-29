# disguise Colour Grader

Professional, colourist-style primary grading controls in the browser, driving a disguise ColourAdjust layer live.

**Status:** the panel grades a live ColourAdjust layer end to end: wheels, sliders, layer picker, Live/Safe, Bypass, undo/redo, legal range and shared presets. It was tested against a real Director on 2026-10-29. Open items: keyframes at the playhead (FR17), and the visual checks still listed in docs/DISGUISE_API.md §8 (Gamma direction, how negative Shadow renders).

## Starting it (like Strata)

Double-click **`Start-Grader.cmd`**, or in PowerShell:

```powershell
.\Start-Grader.ps1                          # binds 0.0.0.0:8080
.\Start-Grader.ps1 -Port 9000               # custom server port
.\Start-Grader.ps1 -Director 192.168.10.11  # connect to this Director on start
.\Start-Grader.ps1 -Mock                    # also start the mock Director (no disguise needed)
```

The launcher installs dependencies on first run, sets `HOST` / `PORT` / `DIRECTOR`, and runs `npm run dev`, which starts the server and the Vite panel together. Then:

1. Open **http://localhost:5174** (or `http://<this laptop's IP>:5174` from a tablet).
2. If it asks, enter the Director IP and click **Connect**. The server remembers it and reconnects on start.
3. Pick the ColourAdjust layer, then **hold SAFE for 1 second** to go Live.

Ports are 8080 (server) and 5174 (panel), so it can run beside Strata (8081/5173).

## Using it

The toolbar has two pages. Undo/Redo, **Bypass** and **SAFE/LIVE** are on the right of the toolbar and work on both pages.

- **Color Wheels:** Lift / Gamma / Gain / Offset wheels with Y R G B readouts and master jogs. Under the wheels are horizontal sliders: **Cont** and **Bright** on the left, **Temp**, **Tint** and **Sat** on the right. They use disguise's own units and Designer's ranges (Temp 800–14000 K, Tint / Cont / Bright −50…+50, Sat −100…+100). Each has a reset button; double-tap a track or label also resets. **Legal range** is at the bottom.
- **Presets:** save the current grade under a name (works in Safe), then **Apply** it later. Applying is one undoable edit, needs Live, and keeps the layer's Source. **⋯** on a card updates, renames or deletes it.

Things the panel does on its own:

- **White balance preset:** when a layer loads, the server sets it to **Custom**, because Temp and Tint only work with Custom.
- **Bypass:** switches the layer's `renderEnable` off and on. It never changes the grade or adds keyframes.

## Where things are saved

The server keeps its state in `data/` (git-ignored):

| File | What |
| --- | --- |
| `data/server-state.json` | The last Director address |
| `data/presets.json` | The preset list, shared by every panel. Copy this file to move presets to another machine. |

`--state` and `--presets` point the server at other files.

## Commands

```bash
npm install
npm run dev          # server :8080 + panel http://localhost:5174 (what the launcher runs)
npm run dev:mock     # same, plus the mock Director on :8090
npm run mock         # mock Director only
npm test             # vitest: maths, budget, presets, server ⇄ mock integration
npm run build        # typecheck + build the panel into dist/
npm start            # production: the server alone serves dist/ on http://0.0.0.0:8080
```

The server reads `HOST`, `PORT` and `DIRECTOR` from the environment; `--host`, `--port` and `--director` flags override them (also `--static`, `--state`, `--presets`). `npm run mock -- --designer-edits` also simulates someone editing the layer in Designer.

## How it fits together

```text
tablet ─┐                     colour-grader server (laptop)            disguise Director
tablet ─┼─ ws /api/panel ──▶  session: selected layer, grade,  ── ws ──▶ Live Update (1 socket)
laptop ─┘   (GradeState)      toDisguise(), 50 ms batched sets  ─ http ─▶ Python execute
                              budget + layer-lock enforced              (discovery, Refresh, keyframe)
```

The server is standalone (not a Designer plugin) and is the only thing that talks to disguise. Panels send grade edits and preset changes, and receive the session state, the grade loaded from the layer, changes made by other panels or in Designer, and the preset list. Preset changes never reach disguise; applying a preset is an ordinary grade edit.

Every disguise detail not yet measured on a real Director is in [shared/disguise/paths.ts](shared/disguise/paths.ts), marked **VERIFY**. See [probes/README.md](probes/README.md) for Phase 0.

## The docs

| File | What it covers |
| --- | --- |
| [CLAUDE.md](CLAUDE.md) | Instructions for the AI coding assistant in VS Code |
| [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md) | Goals, users, agreed decisions, v1 scope, later goals, panel → disguise mapping |
| [docs/UI_SPEC.md](docs/UI_SPEC.md) | The main screen, every control, interactions, touch rules, states |
| [docs/STYLE_GUIDE.md](docs/STYLE_GUIDE.md) | Visual language familiar to colourists: colours, type, components |
| [docs/GRADE_MATH.md](docs/GRADE_MATH.md) | How Lift/Gamma/Gain/Offset become disguise Levels values |
| [docs/DISGUISE_API.md](docs/DISGUISE_API.md) | Live Update + Python Execution APIs, ColourAdjust properties, open checks |
| [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) | Stack, repo layout, phased checklist |
| [docs/mockup/index.html](docs/mockup/index.html) | The original clickable mockup (no disguise connection). The app has since changed: sliders under the wheels, the Presets page. |
| [probes/README.md](probes/README.md) | Phase 0: how to probe a real Director with d3-plugin-toolkit |

## Version 1 at a glance

Web page · mouse and touch · one ColourAdjust layer at a time · source toggle on the panel · Lift / Gamma / Gain / Offset wheels with master jogs · Temp, Tint, Contrast, Brightness and Saturation sliders · legal-range clamp · Bypass · shared grade presets · disguise's own scopes for monitoring.
