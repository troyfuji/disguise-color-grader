# CLAUDE.md — disguise Colour Grader

Instructions for the coding assistant working in this repo.

## What we're building

A web page that gives colourists professional, colourist-style primary grading controls and drives a disguise **ColourAdjust** layer live over the disguise **Live Update** WebSocket API. Custom product with a look familiar to colourists.

## Read these first, in order

1. `docs/PRODUCT_SPEC.md` — what and why, agreed decisions (D1–D8), scope
2. `docs/UI_SPEC.md` — the screen, controls, interactions, states
3. `docs/STYLE_GUIDE.md` — colours, type, component look
4. `docs/GRADE_MATH.md` — panel grading controls → disguise Levels values
5. `docs/DISGUISE_API.md` — Live Update and Python Execution APIs
6. `docs/BUILD_PLAN.md` — stack, repo layout, phases
7. `docs/mockup/index.html` — open in a browser for the visual target

## Rules

- **Standalone server, not a Designer plugin.** `server/` is the only code that talks to disguise (one Live Update socket, all Python calls, layer selection, budget). The panel (`src/`) talks only to our server over `/api/panel` (`shared/protocol.ts`). Never open a disguise connection from the panel.
- **`shared/` and `server/` run directly on Node** (built-in TypeScript): relative imports with `.ts` extensions, erasable syntax only (no enums, no constructor parameter properties). `erasableSyntaxOnly` enforces this.
- **Stack:** Vue 3 + TypeScript (strict) + Vite + Pinia + Vitest. No UI component kit; controls are hand-built SVG.
- **Tokens only:** every colour and font size comes from `src/styles/tokens.css` (built from the style guide). No hex in components.
- **Grade state is the source of truth.** UI edits `GradeState`; `toDisguise()` (pure, fully unit-tested) produces disguise values. Never write disguise values from a component.
- **Never guess disguise property paths.** Anything marked **VERIFY** in the docs stays in `shared/disguise/paths.ts` as a clearly marked placeholder until Phase 0 findings are written into the docs.
- **API budget is a hard rule** (`PRODUCT_SPEC.md` §7, `DISGUISE_API.md` §7): never make repeated or unthrottled calls that could slow disguise or cause playback errors. One Live Update socket per server (panels never talk to disguise); at most one `set` per property per 50 ms, batched; nothing sent while idle; Undo/Bypass/Reset as one batched write.
- **Python Execution API** only for discovery at connect, explicit Refresh, and adding a keyframe at gesture start (max once per property per gesture). Never in a move handler, never on a timer, never polled.
- **Only write to the selected, live layer.** If it stops being live, lock the panel; never switch layers automatically.
- **Start in Safe** after connect and after every layer change; Live needs a 1 s press-and-hold.
- **No third-party branding or names** — no other product's logos, names or icons in the UI, code or docs.
- **Touch first:** pointer events, `setPointerCapture`, `touch-action: none` on controls, 44 px minimum targets.
- **Hidden controls stay hidden:** don't add Pivot, MD, Col Boost, Shad, Hi/Light, Hue or L. Mix (decision D4).
- Develop against `tools/mock-director`; don't require a real Director to run the app or tests.

## Commands

```bash
Start-Grader.cmd     # Strata-style launcher (or .\Start-Grader.ps1 -Port/-BindHost/-Director/-Mock)
npm install
npm run dev          # server :8080 + panel :5174 (what the launcher runs)
npm run dev:mock     # same + mock Director on :8090
npm run mock         # mock Director only
npm test             # vitest
npm run build
npm start            # standalone server: dist/ + disguise link on :8080
npm run package      # portable Windows ZIP with bundled node.exe (scripts/Make-Portable.ps1)
```

Phase 0 Python probes go in `probes/` and are run with `C:\dev\d3-plugin-toolkit` — follow its CLAUDE.md pre-flight rules and `probes/README.md`.
