# Phase 0 probes

Python probe scripts that answer the **VERIFY** items in `docs/DISGUISE_API.md` and
`docs/GRADE_MATH.md` on a real Director. Nothing here has been run yet.

Probes are written and run with the **d3-plugin-toolkit** (`C:\dev\d3-plugin-toolkit`), which
holds the Designer API stub, the knowledge base and the safety hooks.

## Before writing any probe

From the toolkit's `CLAUDE.md` (non-negotiable):

1. Read `docs/mandatory-workflow.md` and `docs/reference.md` in the toolkit, in full.
2. Read the official guide page first (`https://developer.disguise.one`, fetch with `curl -sL`).
   `d3.pyi` is not the source of truth.
3. Grep `packages/shared/d3.pyi` for every method name before using it. Invented methods are
   the toolkit's most expensive known failure.
4. Read the KB patterns that apply here:
   - `patterns/safe-iteration.md`: never iterate d3 collections directly
   - `patterns/bare-except-required.md`
   - `patterns/layer-module-access.md`: `layer.module`
   - `patterns/timeline-export-keyframe-access.md`: KeyFloat vs KeyAsKeyContainer
   - `patterns/liveupdate-subscribe.md`: object names with spaces are unparseable
   - `patterns/python-attribute-assignment-is-permissive.md`: always read back after a set

## Running

From the toolkit root, with Designer running a disposable test project:

```bash
npm run cli -- session snapshot
npm run cli -- kb submit-probe C:/dev/disguise-color-grader/probes/<probe>.py
npm run cli -- session diff
```

Use plain `npm run cli -- exec --file …` only for throwaway debugging.

## Questions to answer (BUILD_PLAN Phase 0)

| # | Question | Feeds |
| --- | --- | --- |
| Q1 | Field-sequence name per ColourAdjust property; how Colour fields split | `SEQUENCE_NAMES`, `propertyPath()` |
| Q1 | Object expression for one layer (`getByUID(<uid>)`?) | `layerObject()` |
| Q2 | Range and neutral of every property; negative `shadowColour`? `gainColour` > 1? | `DISGUISE_NEUTRAL`, `LEVELS_MODEL` |
| Q3 | Levels formula; `n^(1/Midtone)` or `n^Midtone` | `LEVELS_MODEL.midtone` |
| Q4 | `source` values and whether Live Update can set them | `SOURCE_OPTIONS` |
| Q5 | Subscribable "ColourAdjust layers live at the playhead" | `LIVE_LAYERS_SUBSCRIPTION` |
| Q6 | Add a key at the playhead via Python; safe during playback? | `keyframeScript()` |
| Q7 | Layer bypass/mute property for Bypass | store / Phase 3 |

Every placeholder lives in `shared/disguise/paths.ts`. When a probe answers a question:

1. Write the finding into the relevant doc.
2. Update `paths.ts` and remove that item's `VERIFY` marker.
3. Promote reusable findings to the toolkit KB (`npm run cli -- learn`).
