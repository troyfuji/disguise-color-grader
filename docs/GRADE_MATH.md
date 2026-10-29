# Grade Maths — Resolve-style controls → disguise Levels

The panel keeps its own **grade state** in Resolve-style units. A pure function turns that state into ColourAdjust values every time it changes. The UI never edits disguise values directly (decision D7).

```
UI gesture → GradeState (Resolve units) → toDisguise(GradeState) → Live Update set
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
  tempK: number;        // Kelvin, neutral = disguise default (verify, expected 6500)
  tint: number;         // neutral 0
  contrast: number;     // neutral 1.000
  brightness: number;   // neutral = disguise default (verify)
  saturation: number;   // display units, neutral 50.00
  lift: WheelState;     // neutral master 0.00
  gamma: WheelState;    // neutral master 0.00
  gain: WheelState;     // neutral master 1.00
  offset: WheelState;   // display neutral 25.00
  clamp: { enabled: boolean; low: number; high: number };
  source: string;       // ColourAdjust source option (verify values)
}
```

Displayed numbers per wheel (as in Resolve): **Y R G B** = `master` and `master + color.c` (for Gain, `master × (1 + color.c)` is also acceptable — pick one and keep it).

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

The three deltas always sum to zero, so a puck move changes colour, not overall level. `k_wheel` sets sensitivity per wheel (start: Lift 0.25, Gamma 0.25, Gain 0.5, Offset 0.25; tune by eye against Resolve).

The jog wheel changes `master` only. Drag sensitivity: 0.001 per px (Lift/Gamma/Offset), 0.002 per px (Gain); `Shift` divides by 10.

## 3. Resolve-style transfer function

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
- `offsetValue(d) = (d − 25) / 100` to start; calibrate against Resolve.
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

1. Set `Shadow.c = 0` and move the black lift into `OutputLow`.
2. `OutputLow` is a single value, so only the **common** part of the lift goes there: `OutputLow = min over channels of b_c` (after normalising).
3. The per-channel remainder stays in Shadow/Highlight. Accept that raising blacks with a colour tint is approximate in this case, and log it.

Same logic applies to `Highlight > 1` vs. `OutputHigh` if Highlight is capped.

### Clamp

`clamp.enabled/low/high` pass straight through to `oututLevelClampEnable`, `outputLevelLowClamp`, `outputLevelHighClamp`.

## 5. Direct mappings

| GradeState | disguise | Conversion |
| --- | --- | --- |
| `tempK` | `ccKelvin` | direct |
| `tint` | `ccTint` | direct (scale to be checked) |
| `contrast` | `ccContrast` | direct if disguise neutral is 1.0, otherwise linear map |
| `brightness` | `ccBrightness` | direct |
| `saturation` | `ccSaturation` | `ccSaturation = sat / 50 × neutral` (if disguise neutral is 1.0 → `sat / 50`) |
| — | `ccWhiteBalanceMode` | always `0` (None) |

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
