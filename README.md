# disguise Colour Grader

Colourist-style primary grading for disguise, from any browser or tablet. Lift / Gamma / Gain / Offset wheels, Temp, Tint, Contrast, Brightness and Saturation drive a disguise **ColourAdjust** layer live, over the network.

disguise can already grade with the ColourAdjust layer, but only through Designer's sliders. This panel gives colourists, camera directors and clients the controls they already know, without handing them the show file. A small server on a laptop talks to the Director; every tablet and browser talks only to that server.

> **Status:** v0.1.0. It grades a live ColourAdjust layer end to end and was tested against a real Director on 2026-10-29. See [Known limitations](#known-limitations).

## Features

- **Colour wheels:** Lift, Gamma, Gain and Offset with Y R G B readouts and master jog wheels. They behave like a standard grading panel, and the server converts them to disguise Levels values ([GRADE_MATH.md](docs/GRADE_MATH.md)).
- **Sliders:** Temp, Tint, Contrast, Brightness and Saturation, in disguise's own units and Designer's ranges.
- **Legal range:** clamp the output to a low and high level.
- **Source:** toggle the layer between background and texture.
- **Bypass:** switch the grade off and on to compare.
- **Undo / Redo:** 100 steps, separate from Designer's undo.
- **Presets:** save, apply, rename and update grades. They're stored on the server and shared by every panel.
- **Safe by default:** the panel starts locked after every connect and layer change. Hold **SAFE** for 1 second to go Live.
- **Only the layer that's on screen:** the layer picker lists ColourAdjust layers live at the playhead. If the selected one stops being live, the panel locks. It never switches layers by itself.
- **Light on disguise:** one Live Update connection however many panels are open, at most one write per property every 50 ms, and nothing sent while idle (see [API budget](#api-budget)).
- **Touch first:** works on an iPad (Safari) and a laptop (Chrome), with 44 px minimum targets.

## Requirements

- A disguise **Director** running Designer, reachable on the network (port 80). The Colour Grader uses Designer's Live Update and Python Execution APIs.
- A **ColourAdjust layer** on the playing track.
- A Windows laptop on the show network for the server. Panels run in any modern browser.

## Quick start (portable ZIP)

No install needed: the ZIP carries its own Node runtime.

1. Download `ColourGrader-v<version>-win-x64.zip` and unzip it somewhere writable, like the Desktop (not Program Files).
2. Double-click **`Start-Grader.cmd`**. If Windows asks whether `node.exe` may use the network, allow it on private networks so tablets can connect.
3. Open <http://localhost:8080>. From a tablet, use the address the window prints.
4. Enter the Director's IP and click **Connect**. The address is remembered.
5. Pick the ColourAdjust layer, then **hold SAFE for 1 second** to go Live.

Launcher options (PowerShell):

```powershell
.\Start-Grader.ps1 -Port 9000               # another port
.\Start-Grader.ps1 -Director 192.168.10.11  # connect to this Director on start
.\Start-Grader.ps1 -BindHost 127.0.0.1      # this laptop only, no tablets
```

The ZIP includes a `README.txt` quick start for operators.

## Running from source

Needs **Node.js 22.18 or newer**, because the server runs TypeScript directly.

```powershell
git clone https://github.com/troyfuji/disguise-color-grader.git
cd disguise-color-grader
.\Start-Grader.cmd            # or: npm install, then npm run dev
```

The launcher installs dependencies on first run and starts the server (port 8080) and the Vite panel (port 5174) together. Open <http://localhost:5174>.

No disguise to hand? Add `-Mock` (or run `npm run dev:mock`) to also start a mock Director on port 8090 and connect to it.

### Commands

```bash
npm run dev          # server :8080 + panel :5174 (what the launcher runs)
npm run dev:mock     # same, plus the mock Director on :8090
npm run mock         # mock Director only (add -- --designer-edits to simulate Designer edits)
npm test             # vitest: grade maths, API budget, presets, server ⇄ mock Director
npm run build        # typecheck + build the panel into dist/
npm start            # production: the server alone serves dist/ on :8080
npm run package      # tests + build + portable Windows ZIP
```

The server reads `HOST`, `PORT` and `DIRECTOR` from the environment. The `--host`, `--port` and `--director` flags override them, and `--static`, `--state` and `--presets` point it at other folders or files.

## Using it

The toolbar has two pages, **Color Wheels** and **Presets**. Undo / Redo, **Bypass** and **SAFE / LIVE** sit on the right and work on both.

- **Wheels:** drag the puck to tint, use the jog under each wheel for the master level. Shift (or two fingers) gives fine control, and double-tapping resets.
- **Sliders:** drag, use the mouse wheel, or tap the value to type it. Ranges: Temp 800–14000 K, Tint / Cont / Bright −50…+50, Sat −100…+100. Each slider has a reset button.
- **Presets:** save works in Safe. **Apply** is one undoable edit, needs Live, and keeps the layer's Source. **⋯** on a card updates, renames or deletes it.

Things the server does on its own:

- **White balance:** when a layer loads, it sets the layer's white-balance preset to **Custom**, because Temp and Tint only work with Custom.
- **Bypass:** switches the layer's `renderEnable` off and on. It never changes the grade or adds keyframes.
- **Sync:** changes made in Designer, or by another panel, show up on every panel live. With two people grading at once, the last change wins.

There's no login: anyone who can open the page can grade. Keep the server on the show network.

## Known limitations

- **Keyframes:** the panel edits each field's first keyframe, the one at the layer start. A new ColourAdjust layer has sequencing off on every field, so that's the only key and this just works. If you keyframe a ColourAdjust field in Designer, the panel still edits that first key, not the one at the playhead. The panel never adds keyframes.
- **Scopes:** the panel has none. Open Designer's Vectorscope or Waveform from the Feed view; Designer doesn't allow them to be opened remotely.
- **Two graders at once:** the last change wins.
- **Picture checks:** the Levels formula behind Lift / Gamma / Gain has not yet been checked against a picture ([docs/DISGUISE_API.md §8](docs/DISGUISE_API.md)).

## API budget

The app must never be the reason a show stutters. These limits are enforced in the server and covered by tests ([PRODUCT_SPEC.md §7](docs/PRODUCT_SPEC.md)):

| Rule | Limit |
| --- | --- |
| Live Update connections | 1 per server, however many panels |
| Writes | At most 1 per property every 50 ms, batched into one message; the final value is always sent on release |
| Idle | Nothing sent when nobody is touching a control |
| Python Execution API | Only at connect and on an explicit Refresh. Never polled, never during a drag |
| Undo / Bypass / Reset | One batched write each |
| Reconnect | Back-off from 1 s up to 10 s |

## Where things are saved

The server keeps its state in `data/` (git-ignored; `app\data\` in the ZIP):

| File | What |
| --- | --- |
| `server-state.json` | The last Director address |
| `presets.json` | The preset list. Copy it to move presets to another machine, or across when upgrading. |

## How it fits together

```text
tablet ─┐                     colour-grader server (laptop)            disguise Director
tablet ─┼─ ws /api/panel ──▶  session: selected layer, grade,  ── ws ──▶ Live Update (1 socket)
laptop ─┘   (GradeState)      toDisguise(), 50 ms batched sets  ─ http ─▶ Python execute
                              budget + layer lock enforced              (discovery, Refresh)
```

- `src/`: the Vue 3 panel. It talks only to the server, over `/api/panel`.
- `server/`: a Node server and the only code that talks to disguise. It handles the Live Update socket, Python calls, layer selection and the API budget.
- `shared/`: grade maths and the panel ⇄ server protocol, used by both. `toDisguise()` is a pure, unit-tested function from the panel's grade to disguise values.
- `tools/mock-director/`: a fake Director that speaks the Live Update protocol, so everything can be built and tested without disguise.

Disguise details are kept in [shared/disguise/paths.ts](shared/disguise/paths.ts). Anything not yet measured on a real Director is marked **VERIFY**.

## Packaging

`npm run package` (or `.\scripts\Make-Portable.ps1`; add `-SkipTests` to skip the tests) builds `ColourGrader-v<version>-win-x64.zip` in the project root, about 33 MB. It copies `node.exe` from the build machine, so build with Node 22.18 or newer.

```text
ColourGrader\
  Start-Grader.cmd / .ps1   launcher (-Port, -BindHost, -Director)
  README.txt                quick start for operators
  LICENSE.txt, licenses\    this licence, and those of the bundled third-party code
  node\node.exe             Node runtime + licence
  app\                      server\, shared\, dist\, node_modules\ws, package.json
  app\data\                 created on first run: presets.json, server-state.json
```

The ZIP isn't committed. Attach it to a GitHub release instead.

## Docs

| File | What it covers |
| --- | --- |
| [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md) | Goals, users, agreed decisions, scope, panel → disguise mapping |
| [docs/UI_SPEC.md](docs/UI_SPEC.md) | The screen, every control, interactions, touch rules, states |
| [docs/STYLE_GUIDE.md](docs/STYLE_GUIDE.md) | Colours, type and component look |
| [docs/GRADE_MATH.md](docs/GRADE_MATH.md) | How Lift / Gamma / Gain / Offset become disguise Levels values |
| [docs/DISGUISE_API.md](docs/DISGUISE_API.md) | Live Update and Python Execution APIs, ColourAdjust properties, measured findings |
| [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) | Stack, repo layout, phased checklist |
| [docs/mockup/index.html](docs/mockup/index.html) | The original clickable mockup. The app has since moved on: sliders under the wheels, a Presets page. |
| [probes/README.md](probes/README.md) | How the disguise behaviour was measured on a real Director |
| [CLAUDE.md](CLAUDE.md) | Rules for the AI coding assistant used on this repo |

## License

Copyright (c) 2026 troyfuji. **All rights reserved.** No licence is granted to use, copy, modify or distribute this software without written permission. See [LICENSE](LICENSE).

Third-party components (Node.js, ws, Vue, Pinia, the Open Sans font) keep their own licences, which ship in the ZIP's `licenses\` folder.
