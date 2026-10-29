# Style Guide — disguise Colour Grader

The product should feel familiar to a colourist who lives in DaVinci Resolve's Color page: dark, quiet, dense, with colour used only where it carries meaning. This guide describes that look and the rules for building it.

> **Inspired by, not copied from.** Match the *feel* of Resolve's Primaries panel (layout, density, contrast, control behaviour). Do **not** use Blackmagic Design or DaVinci logos, product names, icons, or artwork anywhere in the UI. All icons are our own or from an open icon set.

Colour values below were sampled from the reference screenshots in this folder (`adjustment-controls-in-color-wheel-of-davinci-resolve.jpg` and the Resolve 18 Primaries screenshot). Treat them as the starting palette; tune by eye against the references.

---

## 1. Design principles

1. **The picture is the hero.** The UI is near-neutral dark grey so it never tints the operator's perception of the image or the LED wall.
2. **Colour means something.** Saturated colour appears only on: the hue rings of the wheels, the R/G/B channel underlines, the gradient hint bars under parameters, and status (modified / error / connected).
3. **Numbers are always visible.** Every control shows its exact value in a numeric field. Values are editable by typing, dragging, or scrolling.
4. **Dense but calm.** Small type, tight spacing, no decoration, no shadows-for-style, no rounded "cards".
5. **Everything resets.** Every control and every group has a one-click reset to its neutral value.

---

## 2. Colour tokens

Define these as CSS custom properties (or the equivalent in the chosen UI framework). Never hard-code hex values in components.

### Surfaces

| Token | Hex | Use |
| --- | --- | --- |
| `--surface-app` | `#28282E` | Main panel background (the most common colour in the reference) |
| `--surface-strip` | `#2F3036` | Parameter strips (the Temp/Tint row, the Sat/Hue row) |
| `--surface-header` | `#212126` | Panel title bar ("Primaries – Color Wheels" row) |
| `--surface-footer` | `#17181A` | Status bar at the bottom of the window |
| `--surface-field` | `#1F1F1F` | Numeric value fields |
| `--surface-well` | `#0A0A0B` | Wheel bezel shadow, jog-wheel track |
| `--border-field` | `#070707` | 1 px border around numeric fields |
| `--divider` | `#48494C` | Vertical separators in the toolbar |
| `--rule` | `#2E3036` | Horizontal rules between rows |

### Text and icons

| Token | Hex | Use |
| --- | --- | --- |
| `--text-primary` | `#FFFFFF` | Panel title, wheel names (Lift, Gamma, Gain, Offset) |
| `--text-value` | `#F1F1F0` | Numbers inside value fields |
| `--text-label` | `#939293` | Parameter labels on `--surface-app` |
| `--text-label-strip` | `#9C9B9C` | Parameter labels on `--surface-strip` (keeps 4.5:1 contrast) |
| `--icon-inactive` | `#898988` | Toolbar icons, reset icons |
| `--icon-active` | `#FFFFFF` | Selected toolbar icon |

### Channel colours (underlines under R/G/B fields, wheel parade)

| Token | Hex |
| --- | --- |
| `--channel-y` (master) | `#FFFFFF` |
| `--channel-r` | `#FF1A00` |
| `--channel-g` | `#0AD239` |
| `--channel-b` | `#205BD7` |

### Hint gradients (2 px bar under each parameter field)

| Parameter | Gradient |
| --- | --- |
| Temp | `#2673D5` → `#DE891F` (blue → amber) |
| Tint | `#0CF463` → `#F10DAB` (green → magenta) |
| Contrast, Shadows, Highlights | `#1F1F1F` → `#FFFFFF` (black → white) |
| Saturation | grey → full-spectrum |

### Status

| Token | Hex | Use |
| --- | --- | --- |
| `--status-modified` | `#E5402A` | Small dot on a toolbar icon or control that differs from neutral |
| `--status-warning-bg` | `#A74331` | Badge background (e.g. "OFFLINE", "NOT CONNECTED") |
| `--status-connected` | `#0AD239` | Connection indicator |
| `--status-live` | `#B3261E` | Live/Safe lock when **LIVE** (controls active) |
| `--status-bypass` | `#8A5A12` | Bypass button when on |

### Safety controls

- **Live / Safe lock:** 104 × 40 px button at the right end of the toolbar. Safe = field styling with a padlock and "SAFE" in `--text-label`. Live = `--status-live` fill, white "LIVE". While holding to arm, a `--status-live` fill grows left to right over 1 s.
- **Bypass:** field-styled button; on = `--status-bypass` fill, white text.
- **Undo / Redo:** 44 × 40 px field-styled buttons with arrow icons; 35% opacity when unavailable.
- In Safe or Bypass, the panel's controls drop to 50% opacity and ignore input; the toolbar stays fully visible.

---

## 3. Typography

- **Font:** a clean humanist sans. Use **Open Sans** (bundled, OFL licence) with system sans as fallback. Do not ship Resolve's own UI font.
- **Numbers:** `font-variant-numeric: tabular-nums;` so values don't jitter while dragging.

| Role | Size | Weight | Colour |
| --- | --- | --- | --- |
| Panel title | 16 px | 600 | `--text-primary` |
| Wheel name | 15 px | 400 | `--text-primary` |
| Parameter label | 14 px | 400 | `--text-label` |
| Value field | 14 px | 400 | `--text-value` |
| Status bar | 12 px | 400 | `--text-label` |

---

## 4. Layout

Reference layout (top to bottom), at a base width of 1300 px:

1. **Toolbar** (56 px): page icons with thin vertical dividers. Primaries is active; Looks, A/B, Copy grade and Curves are shown disabled to reserve their place.
2. **Panel header** (56 px, `--surface-header`): title on the left ("Primaries – Color Wheels"), then the layer picker and the Source toggle, grade reset at far right.
3. **Top parameter strip** (72 px, `--surface-strip`): Temp · Tint · Cont · Bright, evenly spaced.
4. **Wheel row**: four equal columns — Lift, Gamma, Gain, Offset. Each column: name + reset icon → wheel → numeric readouts (Y R G B, or R G B for Offset) → master jog wheel.
5. **Bottom parameter strip** (72 px, `--surface-strip`): Sat on the left, Legal range button on the right.
6. **Status bar** (40 px, `--surface-footer`): connection state, Director address, target layer, version.

Resolve controls that disguise can't do (Pivot, MD, Col Boost, Shad, Hi/Light, Hue, L. Mix) are **not shown at all**. Their absence leaves the strips a little airier than Resolve's — keep the even spacing rather than filling the gaps.

Spacing uses an **8 px grid**. Column gutters 16 px; inner padding 16 px.

The layout must also work on a **tablet in landscape** (1024–1366 px wide): wheels scale down proportionally; strips wrap to two rows if needed. Nothing scrolls horizontally.

---

## 5. Components

### 5.1 Value field

- 92 × 40 px (never smaller than 44 px tall including its hint bar, for touch), `--surface-field` fill, 1 px `--border-field`, 3 px radius.
- Value centred, 2 decimals by default (Contrast 3 decimals, Kelvin 0–1 decimals).
- Under the field: a 2 px hint bar or channel underline, 60% of the field width, 6 px below.
- **Interactions:** click to type · drag horizontally to scrub · mouse wheel to nudge · `Shift` for fine (÷10) · double-click label to reset.

### 5.2 Parameter (label + field)

- Label left of field, right-aligned to the field, 12 px gap, `--text-label`.

### 5.3 Colour wheel

Built from the outside in:

1. **Bezel:** dark ring (`--surface-well` inner shadow) about 12% of the wheel diameter.
2. **Master arc:** a light grey arc (`#DDDDDF`) on the bezel showing the master (Y) level; it grows clockwise as the master goes up.
3. **Hue ring:** thin full-saturation spectrum ring, red at top-left, running through magenta, blue, cyan, green, yellow (match the reference).
4. **Field:** dark neutral disc with a faint centre-out tint toward the ring.
5. **Crosshair:** two thin `#FFFFFF` lines at 35% opacity through the centre.
6. **Puck:** 10 px light-grey dot (`#DDDDDF`). Its offset from centre is the colour push: direction = hue, distance = amount.

- **Interactions:** drag anywhere in the wheel to move the puck relative to where the drag started (it never jumps under a finger) · `Shift`-drag or two-finger drag for fine · double-tap to centre the puck · reset icon resets colour and master. Full rules in `UI_SPEC.md` §3.
- The wheel's numeric readouts update live during the drag.

### 5.4 Master jog wheel

- Full-width horizontal ridged bar under each wheel (`--surface-well` with repeating 2 px vertical ridges).
- Drag left/right to move the master level (all channels equally). Feels like an endless encoder: no end stops in the visual.

### 5.5 Reset icon

- Circular counter-clockwise arrow, 20 px, `--icon-inactive`; `--icon-active` on hover.

### 5.6 Segmented toggle (Source)

- Two segments, 40 px tall, each at least 96 px wide, inside a `--surface-field` track with 1 px `--border-field`.
- Selected segment: `#46464C` fill, `--text-value` text. Unselected: transparent, `--text-label` text.
- Switches on tap; no confirm.

### 5.7 Dropdown (Layer picker)

- Same field styling as the value field, 240 px wide, chevron icon in `--icon-inactive`.
- Menu: `--surface-header` background, 36 px rows (44 px on touch devices), hover `#33333A`, selected row shows a white check.

### 5.8 Toolbar icon

- 32 px line icons, `--icon-inactive`; selected = `--icon-active`; a 6 px `--status-modified` dot top-right when that page has non-neutral values.

---

## 6. States

| State | Treatment |
| --- | --- |
| Hover | Field border lightens to `#3A3A40`; icon goes `--icon-active` |
| Dragging | Value text stays `--text-value`; cursor hidden while scrubbing |
| Modified from neutral | No colour change on the field itself; red dot on the page icon |
| Coming later (toolbar pages) | Icon at 35% opacity, not interactive, tooltip "Coming later" |
| Disconnected | Whole panel at 50% opacity; status bar badge `--status-warning-bg` "NOT CONNECTED" |
| Value sent but not confirmed | Faint pulse on the field until the matching update comes back from disguise |

---

## 7. Motion

- No decorative animation. Controls respond immediately to input.
- Only allowed transitions: hover (80 ms), panel fade on disconnect (150 ms).

---

## 8. Accessibility

- Labels should meet 4.5:1 against their surface. The sampled `#939293` gives 4.7:1 on `--surface-app` but only 4.2:1 on `--surface-strip`, so labels on strips use `#9C9B9C` (≈ 4.7:1).
- All controls reachable by keyboard: `Tab` between fields, arrow keys to nudge, `Shift`+arrows for fine.
- Never rely on colour alone: channel fields keep their position order Y R G B and have tooltips.
