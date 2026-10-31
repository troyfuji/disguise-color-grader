# UI Spec — disguise Colour Grader

The main screens: **Color Wheels** and **Presets**. Look and feel: `STYLE_GUIDE.md`. Visual reference you can click: `docs/mockup/index.html`.

---

## 1. Screen layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│ TOOLBAR  [Wheels●] [Presets]                             ↶ ↷  [Bypass] [SAFE🔒] │ 56 px
├──────────────────────────────────────────────────────────────────────────┤
│ HEADER   Color Wheels   Layer: [LED Main ▾]  Source: [BG|TEX] ⟲ │ 56 px
├──────────────────────────────────────────────────────────────────────────┤
│   Lift ⟲          Gamma ⟲          Gain ⟲          Offset ⟲              │
│   ( wheel )       ( wheel )        ( wheel )       ( wheel )              │
│  Y  R  G  B      Y  R  G  B       Y  R  G  B        R   G   B             │
│  ▓▓▓▓ jog ▓▓▓    ▓▓▓ jog ▓▓▓      ▓▓▓ jog ▓▓▓      ▓▓▓ jog ▓▓▓            │
├──────────────────────────────────────────────────────────────────────────┤
│ SLIDERS  Cont   ──────●────── [0.00]    Temp ─────●────── [5000]          │
│          Bright ──────●────── [0.00]    Tint ─────●────── [0.00]          │
│                                         Sat  ─────●────── [0.00]          │
├──────────────────────────────────────────────────────────────────────────┤
│ BOTTOM STRIP                                             [Legal range ▸] │ 56 px
├──────────────────────────────────────────────────────────────────────────┤
│ STATUS  ● Connected  director.local · LED Main / track_1        v0.1     │ 40 px
└──────────────────────────────────────────────────────────────────────────┘
```

Base design width 1280 px. Must work from 1024 px (iPad landscape) to 1920 px. No horizontal scroll. Below 1024 px wide, wheels go 2 × 2.

## 2. Regions

### 2.1 Toolbar

- Icon buttons, 56 × 56 px hit area.
- Page tabs: **Color Wheels** (circle icon) and **Presets** (four squares). The header title follows the page.
- A/B, Copy grade and Curves are later goals and are not shown until they are built.
- A red dot on Color Wheels when the grade isn't neutral.
- Right end of the toolbar, always visible (PRODUCT_SPEC FR19–FR22):

| Control | Behaviour |
| --- | --- |
| **Undo ↶ / Redo ↷** | Step through the panel's own history, one step per completed gesture (≥ 50 steps). Disabled when there's nothing to undo/redo. Each step is sent as one batched write. |
| **Bypass** | Toggle. On: picture shows ungraded, button lit amber, wheels and fields dimmed but still showing the stored grade; editing is blocked while bypassed. Off: grade restored exactly. |
| **Live / Safe** | Lock. **Safe** (default after connect and after every layer change): padlock icon, label "SAFE", all controls inert and dimmed to 50%. **Live**: press and hold 1 s; a fill animation shows the hold; label "LIVE" on red. Tap once to go back to Safe instantly. |

### 2.2 Header

| Element | Behaviour |
| --- | --- |
| Title | "Color Wheels" |
| **Layer picker** | Lists **only ColourAdjust layers live at the playhead** on the playing track: `track › layer name`. The list updates as the playhead moves (Live Update subscription, never polling). Nothing is selected automatically. Changing the layer unsubscribes the old one, loads the new one's values and returns the panel to Safe. Refresh item at the bottom re-runs discovery. |
| **Source toggle** | Two-segment control: **Background** / **Texture** (labels to match the values disguise returns — VERIFY). Writes `source` immediately. Always visible (decision D5). |
| Grade reset ⟲ | Resets the whole grade to neutral. Needs a confirm: second tap within 2 s, label changes to "Tap again to reset". |

### 2.3 Sliders (under the wheels)

Horizontal sliders below the wheel row, in two halves that line up with the wheels:

- **Left, under Lift and Gamma:** **Cont** (2 dp, −50 to +50, neutral 0), **Bright** (2 dp, −50 to +50, neutral 0).
- **Right, under Gain and Offset:** **Temp** (K, 0 dp, 800 to 14000, linear, so neutral 5000 sits about a third along with more travel to the warm right), **Tint** (2 dp, −50 to +50, neutral 0), **Sat** (2 dp, −100 to +100, neutral 0).

Each slider: label · track (6 px rail with the parameter's hint gradient, neutral tick, fill from neutral to the thumb, 44 px hit height) · value field · reset button (dimmed while at neutral). Dragging the track moves the value relative to where it was — touch-down never jumps it. Shift = fine (÷10), mouse wheel nudges, double-tap the track or label resets to neutral, tap the value field to type. Below 1024 px the halves stack.

### 2.4 Wheel row

Four equal columns. Each column, top to bottom:

1. Name + reset icon.
2. Wheel (diameter = column width − 48, max 220 px, min 140 px).
3. Readouts: **Y R G B** for Lift/Gamma/Gain, **R G B** for Offset (as on standard grading panels). Each readout is an editable value field with a channel underline.
4. Master jog wheel (full column width, 40 px tall).

Neutral readouts: Lift 0.00, Gamma 0.00, Gain 1.00, Offset 25.00.

### 2.5 Bottom strip

- **Legal range ▸** button opens a popover: Clamp on/off switch, Low and High value fields. A small badge "Clamp" shows in the strip while it's on.

### 2.5a Presets page

Shown by the four-squares tab; the header title reads **Presets** (Layer picker and Source stay; grade Reset is hidden).

- **Save bar:** name field + **Save current grade**. Works in Safe (it never touches disguise); needs a loaded layer. Names are 1–60 characters and unique (case-insensitive).
- **Cards** (grid, sorted by name): name, an **On layer** badge when the layer's grade matches, chips for what the preset changes (Temp, Tint, Cont, Bright, Sat, the wheels, Clamp), last-changed time.
- **Apply** puts the preset on the layer as one edit (one batched write, one Undo step). Needs Live. The layer keeps its own Source.
- **⋯** opens: **Update from current grade** and **Delete** (both need a second tap within 2 s), **Rename** (inline, Enter/blur saves, Esc cancels).
- The list is kept by the server in `data/presets.json` and shared by every panel; changes appear on all panels at once.

### 2.6 Status bar

Connection dot (green connected / amber connecting / red offline), Director address, `layer / track`, app version. Tapping the address opens the Connect dialog.

## 3. Interactions

### Value fields

| Input | Action |
| --- | --- |
| Tap / click | Select and type; Enter commits, Esc cancels |
| Horizontal drag | Scrub value (mouse: px; touch: finger drag) |
| Mouse wheel | Nudge one step |
| Shift + drag / wheel | Fine (÷10) |
| Double-tap the label | Reset that value |

### Wheels

| Input | Action |
| --- | --- |
| Drag inside the wheel | Moves the puck relative to where the drag started (never jumps under the finger) |
| Shift + drag (mouse) / two-finger drag (touch) | Fine (÷4) |
| Double-tap the wheel | Centre the puck (colour reset; master unchanged) |
| Reset icon | Resets colour **and** master |

Puck is clamped to the disc. Typed readouts are kept as typed, even when they hold more colour than the rim represents; the puck is then drawn on the rim in their direction. Readouts update live while dragging.

### Jog wheels

- Horizontal drag changes master (endless: the ridges scroll with the finger).
- Double-tap resets master only.

### Touch rules

- Minimum touch target 44 × 44 px; value fields are 92 × 40 px.
- A drag that starts on a control captures the pointer until release (`setPointerCapture`), so the page never scrolls mid-grade.
- Disable browser pinch-zoom and pull-to-refresh on the panel (`touch-action: none` on controls).

## 4. Connect flow

1. First load: **Connect** dialog — Director address (e.g. `192.168.10.11` or `director.local`), Connect button. The server remembers the last address and reconnects to it on start, so this dialog appears when the server has no Director, or when the remembered one hasn't connected within 3 s of the page opening (the Director may be on another machine). The "Reconnecting…" overlay has a **Change Director** button, and the address in the status bar always opens the dialog.
2. On connect, the server opens its Live Update socket → runs layer discovery (one Python execute call) → subscribe to the live-layer list → fill the layer picker. If exactly one ColourAdjust layer is live and it was the last-used layer, preselect it; otherwise the user picks.
3. Subscribe to the selected layer's values. The panel shows them when the first `valuesChanged` arrives, in **Safe**.

## 5. States

| State | What the user sees |
| --- | --- |
| Not connected | Connect dialog; panel behind it at 50% opacity |
| Connecting | Status dot amber; controls locked |
| No live ColourAdjust layer | Empty-state message in the picker: "No ColourAdjust layer is live at the playhead" + Refresh; controls locked |
| Layer selected, panel in Safe | Normal values shown, everything dimmed, SAFE lit in the toolbar |
| Selected layer no longer live | Controls lock; banner "LED Main is no longer live — pick a live layer"; picker opens with the current live layers. Never switches by itself |
| Bypass on | Amber Bypass button; controls dimmed and read-only |
| Keyframe added | On the first change of a property with no keyframe at the playhead, a small "Keyframe added at 01:02:03" note in the status bar |
| Live | Normal |
| Connection lost | Overlay "Reconnecting…", controls locked, last values kept but dimmed |
| Changed in Designer | Brief highlight on the fields that changed; a note in the status bar "Updated from Designer" |
| Value rejected by disguise | Field flashes red border once; value snaps back to the last confirmed value; error in status bar |

## 6. Keyboard (desktop)

`Tab` / `Shift+Tab` move between fields · arrows nudge · `Shift`+arrows fine · `Esc` leaves a field · `Ctrl/Cmd+Z` panel undo · `Ctrl/Cmd+Shift+Z` panel redo · `B` toggles Bypass · `Esc` twice goes to Safe. Keyboard shortcuts never switch to Live.

## 7. Tooltips

Every control has a plain-language tooltip for non-colourists, e.g. "Lift — shadows", "Gamma — midtones", "Gain — highlights", "Offset — whole image", "Temp — warmer / cooler", "Tint — green / magenta". On touch, a long press shows the tooltip without changing the value.

## 8. Not in v1

Scopes, curves, A/B, copy grade, multiple layers at once, hardware control, grading controls with no disguise equivalent (Pivot, MD, Col Boost, Shad, Hi/Light, Hue, L. Mix).
