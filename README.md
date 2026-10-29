# disguise Colour Grader

Resolve-style primary grading controls in the browser, driving a disguise ColourAdjust layer live.

**Status:** specs written, build not started.

## The docs

| File | What it covers |
| --- | --- |
| [CLAUDE.md](CLAUDE.md) | Instructions for the AI coding assistant in VS Code |
| [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md) | Goals, users, agreed decisions, v1 scope, later goals, Resolve → disguise mapping |
| [docs/UI_SPEC.md](docs/UI_SPEC.md) | The main screen, every control, interactions, touch rules, states |
| [docs/STYLE_GUIDE.md](docs/STYLE_GUIDE.md) | Resolve-familiar visual language: colours, type, components |
| [docs/GRADE_MATH.md](docs/GRADE_MATH.md) | How Lift/Gamma/Gain/Offset become disguise Levels values |
| [docs/DISGUISE_API.md](docs/DISGUISE_API.md) | Live Update + Python Execution APIs, ColourAdjust properties, open checks |
| [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md) | Stack, repo layout, phased checklist |
| [docs/mockup/index.html](docs/mockup/index.html) | Clickable visual mockup (no disguise connection) |

## Getting started in VS Code

1. Open this folder in VS Code.
2. Open `docs/mockup/index.html` in a browser to see the target.
3. Ask the coding assistant to start **Phase 1** of `docs/BUILD_PLAN.md` (Phase 0 needs a real disguise Director).

## Version 1 at a glance

Web page · mouse and touch · one ColourAdjust layer at a time · source toggle on the panel · Temp, Tint, Contrast, Brightness · Lift / Gamma / Gain / Offset wheels with master jogs · Saturation · legal-range clamp · disguise's own scopes for monitoring.
