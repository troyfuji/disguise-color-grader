# Grade Maths — panel controls → disguise Levels

The panel keeps its own **grade state** in panel units. A pure function turns that state into ColourAdjust values every time it changes. The UI never edits disguise values directly (decision D7).

```
UI gesture → GradeState (panel units) → toDisguise(GradeState) → Live Update set
```

All formulas work per channel `c ∈ {r, g, b}` on normalised values `x ∈ [0, 1]`.

> **Verify first.** Section 4 depends on how disguise implements Levels. Phase 0 must measure it (see `BUILD_PLAN.md`) and update this file before the converter is written.

---

## 1. GradeState

```ts
type RGB = { r: number; g: number; b: number };

interface WheelState {
  master: number;   // the jog wheel (Y)
  color: RGB;       // per-channel deltas from the puck, sum ≈ 0
}

interface GradeState {
  tempK: number;        // Kelvin, neutral 5000 (measured disguise default)
  tint: number;         // neutral 0
  contrast: number;     // disguise units, neutral 0, range −50…+50
  brightness: number;   // disguise units, neutral 0, range −50…+50
  saturation: number;   // disguise units, neutral 0, range −100…+100
  lift: WheelState;     // neutral master 0.00
  gamma: WheelState;    // neutral master 0.00
  gain: WheelState;     // neutral master 1.00
  offset: WheelState;   // display neutral 25.00
  clamp: { enabled: boolean; low: number; high: number };
  source: string;       // ColourAdjust source option (verify values)
}
```

Displayed numbers per wheel (as on standard grading panels): **Y R G B** = `master` and `master + color.c` (for Gain, `master × (1 + color.c)` is also acceptable — pick one and keep it).

**Chosen (2026-10-29):** Gain readouts use `master × (1 + color.c)`, matching the transfer function in §3. `color` is in normalised units for every wheel, Offset included. Offset readouts show `master + color.c × 100`, since Offset's `master` is in display units.

## 2. Wheel puck → RGB deltas

The puck position `(px, py)` in the unit disc (centre = 0, rim = 1) gives an angle `θ` and an amount `a = |p|`.

Hue axes on the ring, matching the reference wheel (math angles, counter-clockwise from +x):

| Channel | Axis angle |
| --- | --- |
| Red | 110° |
| Green | 230° |
| Blue | 350° |

```
delta.c = k_wheel × a × cos(θ − axis.c) × 2/3
```

The three deltas always sum to zero, so a puck move changes colour, not overall level. `k_wheel` sets sensitivity per wheel (start: Lift 0.25, Gamma 0.25, Gain 0.5, Offset 0.25; tune by eye with a colourist).

The jog wheel changes `master` only. Drag sensitivity: 0.001 per px (Lift/Gamma/Offset), 0.002 per px (Gain); `Shift` divides by 10.

## 3. Reference transfer function

The panel models the grade as one affine step plus a gamma, per channel:

```
L = lift.master + lift.color.c
G = gain.master × (1 + gain.color.c)
O = offsetValue(offset.master + offset.color.c)   // display 25 → 0

affine:  y = G × (L + x × (1 − L)) + O
       = a × x + b
  where a = G × (1 − L)
        b = G × L + O

gamma:   out = y ^ (1 / e)
  where e = 2 ^ (gammaValue × k_gamma),   gammaValue = gamma.master + gamma.color.c
```

- Lift moves blacks and holds white (`x = 1` stays 1 when G = 1 and O = 0).
- Gain scales from black (`x = 0 → 0` when L = 0).
- Offset shifts everything.
- `offsetValue(d) = (d − 25) / 100` to start; calibrate by eye with a colourist.
- `k_gamma` starts at 1.0; calibrate.

## 4. Mapping onto disguise Levels

Assumed disguise Levels model (to be confirmed in Phase 0):

```
n   = clamp01( (x − Shadow.c) / (Highlight.c − Shadow.c) )
m   = n ^ (1 / Midtone.c)              // or n ^ Midtone.c — measure which
out = OutputLow + m × (OutputHigh − OutputLow)
```

With `OutputLow = 0`, `OutputHigh = 1`, the affine step `y = a·x + b` is matched exactly by:

```
Shadow.c    = −b / a
Highlight.c = (1 − b) / a
Midtone.c   = e
```

Check: `x = Shadow → 0`, `x = Highlight → 1`, slope `1 / (Highlight − Shadow) = a`.

### When Shadow would be negative

Raising blacks (`b > 0`) gives a negative Shadow. If disguise rejects or clamps negative Shadow values:

1. Move the black lift into `OutputLow`. With any `OutputLow`/`OutputHigh`, the affine step is matched by `Shadow.c = (OutputLow − b_c) / a_c` and `Highlight.c = (OutputHigh − b_c) / a_c`.
2. `OutputLow` is a single value. Choosing `OutputLow = max over channels of b_c` keeps every `Shadow.c ≥ 0` **with the slope still exact**. The channel with the highest lift has `Shadow = 0`; the others get a small positive Shadow.
3. The only error is each channel's toe below its own Shadow, which clips to `OutputLow` instead of reaching `b_c`. Raising blacks with a colour tint is therefore slightly approximate in this case; `toDisguiseDetailed()` reports `approximate: true`.

> Implementation note (2026-10-29): this replaces the first draft's `OutputLow = min over channels of b_c`. With `min`, the other channels still need negative Shadow, which would then be clamped and change the slope across the whole range. Using `max` limits the error to the toe.

The same logic applies to Highlight if it is capped: `OutputHigh = min over channels of (a_c + b_c)`.

Which limits apply is set by `LEVELS_MODEL.shadowMin` / `highlightMax` in `shared/disguise/paths.ts` (VERIFY).

### Clamp

`clamp.enabled/low/high` pass straight through to `oututLevelClampEnable`, `outputLevelLowClamp`, `outputLevelHighClamp`.

## 5. Direct mappings

| GradeState | disguise | Conversion |
| --- | --- | --- |
| `tempK` | `ccKelvin` | direct |
| `tint` | `ccTint` | direct (scale to be checked) |
| `contrast` | `ccContrast` | direct (panel range −50…+50, neutral 0) |
| `brightness` | `ccBrightness` | direct (panel range −50…+50) |
| `saturation` | `ccSaturation` | direct (panel range −100…+100, neutral 0) |
| — | `ccWhiteBalanceMode` | always `1` (Custom) — Temp/Tint only work with Custom |

## 6. Reading back (two-way sync)

When Designer pushes new values (`valuesChanged`) that this panel didn't send:

1. Direct mappings: update GradeState directly.
2. Levels: there is no unique inverse (wheel colour vs. master is ambiguous). Rebuild a GradeState with `master` from the channel average and the rest as `color`, and show it. Mark the panel "changed in Designer" so the user knows.

## 7. Tests the converter must pass

| GradeState | Expected disguise values |
| --- | --- |
| All neutral | Shadow (0,0,0), Highlight (1,1,1), Midtone (1,1,1), OutputLow 0, OutputHigh 1 |
| Gain master 2.0 | Highlight (0.5, 0.5, 0.5) |
| Lift master −0.1 | Shadow ≈ 0.0909 each, Highlight 1 |
| Lift master +0.1 | Shadow ≈ −0.111 each (or OutputLow 0.1 if negatives not allowed) |
| Offset display 35 | Shadow −0.1, Highlight 0.9 |
| Lift puck toward red | `Shadow.r` lower than `Shadow.g` and `Shadow.b`; sum of deltas 0 |
| Round trip | `toDisguise` then the assumed Levels model on 0, 0.18, 0.5, 1 equals the Section 3 transfer within 1e-6 |
