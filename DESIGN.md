# Lace design language: paper, pixels, points, thread

A portable guide to the visual language used in Lace. Paste it into another project, for example as `DESIGN.md` or into your AI coding assistant's instructions, and follow it as the source of truth for look, feel and motion. Every number here is the value Lace ships with.

---

## 0. The ten rules

1. **Everything is paper.** Surfaces are opaque, with an ink hairline and a hard, unblurred offset shadow. There's no translucency, no blur and no frosted glass.
2. **Every tone is a dither.** Gradients, shading, scrims and atmosphere are ordered 8×8 Bayer dithers on a 2px grid, never smooth gradients or alpha fades.
3. **One system pixel: 2px.** Offsets, dither cells, points, icon pixels, knots and handles are all whole multiples of it. The only exception is the 1px hairline.
4. **Square points.** Point clouds, selection handles, dot leaders and icons are made of square points, never round dots.
5. **Thread is the only smooth curve.** Connections ("laces") are anti-aliased droops with a square knot bead. Nothing else is curved.
6. **Three voices.** A pixel serif for places and titles, a dot-matrix face for the system, and a clean sans for content.
7. **Chrome is an early-Mac desktop in soft paper and ink.** That means pinstriped title bars, close boxes, status lines, double-framed dialogs, reverse-video selection and square handles. It is never black-and-white harsh.
8. **Colour carries meaning.** Ochre is relation, ink is commit/create/selected, madder is destroy.
9. **The space changes, the objects don't.** An atmosphere recolours the table and the world; cards, windows and controls stay recognisable in every atmosphere.
10. **Two kinds of motion.** Things you touch move physically, with springs. Things the app does on its own are *printed*: reverse video, blinks, zoom rects and dither dissolves.

---

## 1. The idea

It's a desk. Your work is paper documents on a table: cards, notes and cuttings, connected by thread. The interface borrows the grammar of the Lisa and early Macintosh desktop, the original "documents and folders on a desk". It's rendered like dithered print (risograph, newsprint, 1-bit bitmaps) in warm paper and brown ink rather than pure black and white.

Names for the style: *dithered print*, *bitmap editorial*, *soft 1-bit*. Its relatives are 1-bit dither art (Obra Dinn, Playdate), riso zines and early Mac GUIs, in a warmer, friendlier register.

**The mood:** calm, tactile, printed, deliberate and friendly. Retro in *grammar*, modern in *comfort*: real photos stay true colour, touch targets are generous, and nothing is harsh.

---

## 2. The four materials

| Material | What it is | Rules |
|---|---|---|
| **Paper** | Every surface | Opaque. 1px ink hairline. Hard offset shadow (blur 0). Square corners, 0–2px radius at most. |
| **Pixels** | Every tone | 8×8 ordered Bayer dither on 2px cells, with 2–4 flat colours per field. No gradients or opacity fades for tone. |
| **Points** | Structure and detail | Square, 2px (or multiples). Point clouds thin *stochastically* toward edges instead of fading with alpha. |
| **Thread** | Relationships | The only smooth curves. They droop under gravity, end at their objects, and carry a square knot at the lowest point. |

---

## 3. Colour

### Palette

| Token | Hex | Use |
|---|---|---|
| `paper` | `#f5f0e8` | The table (default background) |
| `paperShade` | `#e9e0d0` | Dither shade of the table |
| `paperDeep` | `#d9ccb6` | Deeper shade, globe shadow side |
| `sheet` | `#fbf8f2` | Panels, windows, controls |
| `stock` | `#fffdf9` | Cards (bond paper) |
| `ink` | `#2b1f0e` | Text, lines, ink blocks (dark brown, never pure black) |
| `ochre` | `#a0782a` | Relation / thread / accent |
| `ochreInk` | `#7a5a1c` | Ochre text and marks |
| `madder` | `#a8402a` | Destroy / danger |
| `indigo` | `#3e5480` | Secondary thread colour |
| `moss` | `#52703f` | Success |

### Ink at alpha (the grey scale)

Greys are always **ink at an alpha**, never neutral grey. `ink(a)` is `rgba(43,31,14,a)`.

| Role | Value |
|---|---|
| Text | `ink` |
| Soft text | `ink(0.68)` |
| Muted text | `ink(0.48)` |
| Faint text | `ink(0.30)` |
| Hairline | `ink(0.16)` |
| Strong hairline (controls) | `ink(0.36)` |
| Window frame | `ink(0.70)` |
| Pinstripe | `ink(0.24)` |
| Text on ink blocks | `paper` |

### Semantic colour

- **Ochre** means *lace / relation*: threads, relation accents, "connect".
- **Ink** means *commit / create / selected*: primary buttons, the create button, active states. Active is an ink block with paper text.
- **Madder** means *destroy*: delete buttons get a madder line and text on a `madder(0.08)` fill.
- Don't use colour decoratively outside these meanings.

### Print-shop stocks (card colours)

Cards are paper stocks, not pastels.

| Stock | Hex | Note |
|---|---|---|
| Bond | `#fffdf9` | Default |
| Manila | `#f2e3c2` | |
| Newsprint | `#ebe9e0` | |
| Pink copy | `#f8e0d9` | Carbonless-form pink |
| Blue copy | `#e0e8f0` | Carbonless-form blue |
| Graph | `#fbfaf5` + ruling | Faint blue grid `rgba(62,84,128,0.16)` every 10px |

Card borders are `ink(0.16)`; Manila and Graph use `ink(0.18)`.

---

## 4. Atmospheres (the space)

An atmosphere is the *space the work sits in*: the table, its dither, the world/globe, text printed directly on the table, and the ink threads are drawn with. **Objects never change with it**: cards, windows, sheets and controls stay paper-and-ink in every atmosphere.

| | Paper (default) | Rose (dusk) | Amber (lamplight) |
|---|---|---|---|
| Tone | light | light | dark |
| Table | `#f5f0e8` | `#f6e9e3` | `#2c200e` |
| Table shade | `#e9e0d0` | `#e8cec4` | `#150f06` |
| Texture density | 0.22 | 0.24 | 0.28 |
| Edge vignette | 0.32 | 0.34 | 0.40 |
| World ink | `#2b1f0e` | `#5e2c1d` | `#d39a4a` |
| Text on table | `#2b1f0e` | `#4f2418` | `#f1ddb0` |
| Muted text on table | `ink(0.52)` | `rgba(94,44,29,0.64)` | `rgba(241,221,176,0.62)` |
| Globe lit / shade | `#fbf8f2` / `#d9ccb6` | `#fcf4f0` / `#e0bcae` | `#553c17` / `#1b1308` |
| Region points | `#7a5a1c` | `#b3552c` | `#f4d18a` |
| Scrim ink | `#2b1f0e` | `#3b1a10` | `#050302` |
| Thread must reach | 1.6:1 | 1.6:1 | 4:1 |
| Ink-block edge | none | none | `rgba(241,221,176,0.6)` hairline |

Rules:
- **Threads adapt; objects don't.** If a thread colour sinks into the table, re-ink it toward the atmosphere's lift colour (ink on light tables, `#f3e2bd` on Amber) until it reaches the contrast floor, keeping its hue.
- **Ink blocks on dark tables get a light hairline edge**, so the create button and active filters don't vanish.
- Keep every atmosphere passing the same contrast floors. Test them.

---

## 5. Typography: three voices

| Voice | Face | Used for | Sizes |
|---|---|---|---|
| **Places and moments** | PP Mondwest (pixel serif) | Wordmark, view titles, folder/place names, window headings, section headers | 40 hero · 28 title · 22 place name · 20 heading · 17 list places · 15 label. Line height 1.15. |
| **The system** | DotGothic16 (dot matrix) | Controls, buttons, segments, chips, labels, metadata, dates, counts, status lines, tags | 10 (tags, UPPERCASE, line 12) · 12 labels/muted · 13 controls/segments · 14 buttons. Line height 1.3. **One weight only**; never faux-bold. |
| **What you read or write** | Geist (sans) | Card titles and bodies, inputs, long text | 16 semibold title · 14 body · 13 medium label · 11 muted/body-small (line 15) |

Rules:
- Labels are **sentence case**, not letter-spaced caps. Only tags are uppercase.
- Keep DotGothic16 at 10/12/13/14 so the dots stay crisp.
- Emphasis in system text is **reverse video** (an ink run with paper text), not bold.
- **Licences:**
  - PP Mondwest is commercial (Pangram Pangram); buy a licence for your use, including apps.
  - DotGothic16 is SIL OFL with no Reserved Font Name, so a Latin subset is allowed (Lace ships an 89 KB subset).
  - Geist is SIL OFL.
- **Fallbacks:** without Mondwest, use another pixel/bitmap serif for display and keep the same roles. Without DotGothic16, VT323 or Silkscreen work for the system voice, but they're less legible.

---

## 6. The grid

- **System pixel: 2px.** Everything snaps to multiples: 2, 4, 6, 8…
- **Hairline:** 1px, the one exception. Strong stroke 1.5, focus 2.
- **Spacing scale:** 4 · 8 · 12 · 16 · 20 · 24.
- **Radii:** cards 0, controls and panels 2. Nothing rounder.
- **Sizes:**
  - Controls are at least 36px tall (square icon controls 36×36).
  - Chips are at least 28px tall.
  - Buttons are at least 40px tall.
  - The primary create button is a 52×52 ink block.
  - Cards are 160×120 at rest, with 16px padding.
- **Touch targets** stay at least 44pt: small visuals (a 10px close box) get a larger hit area.

---

## 7. Surfaces and elevation

- Opaque fill (`sheet` for chrome, `stock` for cards) plus a 1px hairline.
- **Hard shadow:** offset down and right, blur 0, ink at low alpha.

| Element | Offset | Ink alpha |
|---|---|---|
| Control | 2px | 0.14 |
| Card at rest | 4px | 0.13 |
| Card lifted/selected | 6px | 0.20 |
| Panel / window / modal | 4px | 0.16 |
| Create button (ink block) | 4px | 0.24 |
| Drop target | 4px | ochre at 0.55 |

- **Scrims are screens, not blur.** Behind a window, the page is covered by a dithered dot screen:
  - ink scrim: 25% of cells at `scrim@0.2` over `scrim@0.46`;
  - paper scrim: the table colour at 60% and 95% coverage.

  What's underneath survives as a sparse grid of points.

---

## 8. Pixels: the dither

### The function

Lace uses this ordered-dither threshold. The same maths runs in JS and in the shader, so every platform draws the same pattern.

```ts
const fract = (v: number) => v - Math.floor(v);
const bayer2 = (x: number, y: number) => {
  const fx = Math.floor(x), fy = Math.floor(y);
  return fract(fx * 0.5 + fy * fy * 0.75);
};
const bayer4 = (x: number, y: number) => bayer2(x * 0.5, y * 0.5) * 0.25 + bayer2(x, y);
/** Threshold in [0, 1) for the dither cell at integer (x, y). */
export const bayer8 = (x: number, y: number) => bayer4(x * 0.5, y * 0.5) * 0.25 + bayer2(x, y);
```

```glsl
// GLSL / SkSL
float fractf(float v) { return v - floor(v); }
float bayer2(vec2 a) { a = floor(a); return fractf(a.x * 0.5 + a.y * a.y * 0.75); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }
```

### A dither field

A field is a continuous value `v` in 0–1 per cell, quantised onto 2–4 flat colours:

```
cell      = floor(pixel / 2)                 // 2px cells
v         = base + vignette(distance) + blobs
level     = floor(v · (n − 1)) + (fractional part > bayer8(cell) ? 1 : 0)
colour    = palette[level]
```

- **The table:** `base = texture` (0.22 on Paper), with a vignette of strength 0.32 easing in from 35% to 110% of the half-diagonal. The palette is `[table, tableShade]`.
- **Scrims:** see §7.
- **Shading on spheres/objects:** Lambert light from the top-left, `(-0.55, -0.6, 0.58)`, quantised to 3 tones: lit, mid, shade.
- **Web:** render one canvas pixel per cell and scale it up with `image-rendering: pixelated`. **Native:** a runtime shader (e.g. Skia) with the same maths.

### The live table

The table's texture shows everywhere, and **work clears it**. Around each object, cells whose threshold is below a local "clear" amount are repainted as plain table colour, so objects sit in clean pools and threads run through clean channels. The pools move with the objects and scale with zoom.

```
clear(d) = 1 − smoothstep(margin, margin + reach, distanceToObject)
cell shows texture only if  clear ≤ bayer8(cell) < texture(cell)
```

| Object | Margin | Reach |
|---|---|---|
| Card (rectangle) | 6 | 40 |
| Thread (capsule through its droop point) | 1 | 20 |
| Globe (circle) | 1× radius | 0.42× radius |

Sizes are in canvas units, multiplied by zoom. On a dark table the clean pools read as lamplight around the work.

### Dissolves and dimming

- **Reveal order:** a second, offset threshold, `bayer8(x + 3, y + 5)`, so a dissolving layer doesn't line up with the pattern it reveals.
- **Appear:** cover the object with table colour, then remove the cover cell by cell in reveal order (240ms).
- **Delete:** the reverse, then remove the object.
- **Dim (a non-match in a search):** 70% of cells covered, in reveal order, at 60% opacity. The object keeps its place and its text stays whole, but it fades back into the table. Pre-render this as a tiny repeating 8×8-cell tile per atmosphere.

---

## 9. Points

- Square, 2px, in world ink.
- **Point clouds** (maps, globes, densities) thin toward the limb *stochastically*: each point survives with a probability tied to how face-on it is, instead of fading with alpha.
- **Dot leaders:** `Name ........ 6 cards`, drawn as 2×2 squares every 6px (2px dot, 4px gap) in muted ink, on the baseline.
- **Selection handles:** see §11.

---

## 10. Thread

- **Shape:** a quadratic curve between object centres, drooping by `0.12 × length` at the control point (the knot sits at `midY + sag/2`). On direct manipulation the droop is a bouncy spring; everywhere else it's still.
- Threads pass *under* objects and end at their centres.
- **Knot:** a square bead at the lowest point. Its size is `round((4 + width / 2) / 2) × 2` px, in the thread's own colour.

| Colour | Value |
|---|---|
| Ochre (default) | `rgba(160,120,42,0.72)` |
| Ochre (strong) | `rgba(160,120,42,0.82)` |
| Ink | `rgba(43,31,14,0.74)` |
| Indigo | `rgba(62,84,128,0.8)` |
| Madder | `rgba(168,64,42,0.78)` |

- **Widths:** 1.5 · **2** · 3.
- **Variants:**
  - *default*;
  - *subtle*: 50% alpha, 0.75× width;
  - *bold*: at least 3px, strong ochre;
  - *dashed*: dash 4× width, gap 3.5× width, each at least 3px.
- On a sphere or small map, draw threads at 0.62× width.

---

## 11. Chrome grammar (the Lisa/Mac desktop, softened)

### Window

```
┌───────────────────────────────────────┐  1px frame, ink(0.70), 4px hard shadow
│▢ ≡≡≡≡≡≡≡≡≡≡[  Title  ]≡≡≡≡≡≡≡≡≡≡≡≡≡ │  title bar 22px, bottom rule 1px frame
├───────────────────────────────────────┤
│                                       │  body padding 16
│                                       │
├───────────────────────────────────────┤  status line: 1px ink(0.36) rule on top
│ 3 laces   Saved on create             │  min 22px, system 12 muted, gap 12
└───────────────────────────────────────┘
```

- **Title bar:** 22px tall. Six 1px pinstripes in `ink(0.24)` with 1px gaps, inset 4px left and right, vertically centred (starting 5px from the top).
- **Title plate:** centred, a `sheet` background that interrupts the stripes, 6px horizontal padding, system font 13 in ink, max 70% width.
- **Close box:** a 10×10 square with a 1px frame and paper fill, 8px from the left, on a small paper gap that clears the stripes. Give it a 14px hit slop. It closes or cancels the window.
- **Status line:** the window's state in plain words, for example "57 characters · Updated Sep 21, 2:13 PM".
- **Dialogs** (alerts, restore, errors) have **no title bar and a double frame**: 2px frame, 2px paper gap, 1px inner frame, 16px padding.

### Controls

- Paper (`sheet`), 1px `ink(0.36)` hairline, 2px hard shadow, radius 2, system font 13.
- **Active or selected** is an ink block with paper text.
- **Segmented groups:** a 2px inner padding, with the active segment as an ink block.
- **Primary button:** an ink block. **Secondary:** paper with a hairline. **Quiet:** text only, muted. **Danger:** madder line and text on a faint madder fill.

### Reverse video

The fill and the ink swap:
- The current selection (a selected card's title as an inline ink run, the current folder).
- A control **while it's held** (instead of shrinking).
- A menu command **blinking** before it runs.

Swapping means: if the fill is ink, it becomes paper with ink text; otherwise it becomes an ink block (in the text's colour) with paper text.

### Selection

A selected object gets:
- **eight square handles**, 6×6 ink squares with a 1px paper border, centred on the corners and edge midpoints, counter-scaled with zoom up to 2.5×;
- a frame-colour border;
- a reverse-video title;
- a slightly deeper shadow (6px).

### Other marks

- **Crop marks:** printer's corner brackets (1px, 14px arms, muted table text) around the extent of all the work, with 28px of bleed. Show them only when there are two or more objects.
- **Dot leaders** in list headers (§9).
- **Pixel icons** instead of Unicode glyphs (§13).

---

## 12. Motion

### Two kinds

1. **Direct manipulation** follows the finger, with springs and inertia: dragging, pinching, flinging, tilting.
   - Lift: damping 12, stiffness 200.
   - Return: 14 / 180.
   - Tilt return: 18 / 280.
2. **Printed motion** is everything the app does on its own.

### Printed motion

| Moment | Behaviour | Timing |
|---|---|---|
| Press | Reverse video while held (no scale) | Immediate |
| Menu command | Blink on → off → on, then run | 70 / 50 / 70 ms |
| Window opens | 4 outline rectangles travel from the source (button/object) to the window's frame, each trailing the one ahead by 22% of the trip; then the window appears whole | 200 ms |
| Window closes | The rects travel back to the source, or to the new object it created | 200 ms |
| Scrim | Dithers in (reveal order), doesn't fade | 240 ms |
| Object appears | Dithers in out of the table | 240 ms |
| Object deleted | Dissolves back into the table, then it's removed | 240 ms |
| Thread created | Draws from one end to the other; the knot drops 6px into place; the joined cluster's clearing briefly swells (+110% reach) | 260 ms draw · 140 ms drop · 520 ms pulse |
| Drawer/sidebar | Slides with printed easing | 220 ms in · 140 ms out |

- **Style:** printed motion plays either **smooth** (ease-out quad, Lace's choice) or **stepped** (whole frames at 15 fps, `steps(n)`), for a more literal early-Mac feel. Keep it one switch.
- **Base durations:** fast 140 · normal 220 · slow 320.
- **Reduce Motion:** all printed motion becomes instant. Reverse-video press feedback stays.
- **Never:** bouncy scale on buttons, alpha cross-fades for tone, slide-and-fade sheets, or blur transitions.

---

## 13. Iconography

- **1-bit pixel icons** on the 2px grid, drawn from bitmaps (`#` is ink). Merge each row into runs so an icon is a handful of rectangles. No font glyphs, no emoji.
- Typical size is 7×7 to 9×10 icon pixels (14–20px). Scale by whole numbers only; the create button's plus uses 4px icon pixels.
- Icons take the colour of the text they sit with, and invert with reverse video.

```ts
// Bitmap → SVG path (web)
function bitmapToPath(rows: string[], px = 2): string {
  let d = '';
  rows.forEach((row, y) => {
    let start = -1;
    for (let x = 0; x <= row.length; x++) {
      const on = row[x] === '#';
      if (on && start < 0) start = x;
      if (!on && start >= 0) { d += `M${start * px} ${y * px}h${(x - start) * px}v${px}h${-(x - start) * px}z`; start = -1; }
    }
  });
  return d; // <svg shape-rendering="crispEdges"><path d={d} fill="currentColor"/></svg>
}

const plus = ['...#...', '...#...', '...#...', '#######', '...#...', '...#...', '...#...'];
const close = ['#.....#', '.#...#.', '..#.#..', '...#...', '..#.#..', '.#...#.', '#.....#'];
const menu = ['########', '........', '........', '########', '........', '........', '########'];
```

### App icon

- A **32×32 pixel-art** scene scaled ×32 to 1024².
- Soft brown outlines (`#5c4422`), not black, with warm tones and one small highlight. Friendly rather than strictly 1-bit.
- Lace's icon is a dithered globe with three laced cards on the night (Amber) table, with Paper and Rose versions that follow the atmosphere.
- Draw icons with a script so they can be regenerated. **iOS icons must be RGB, with no alpha channel at all.**

---

## 14. Layout and navigation patterns

- **Top bar, one row:** menu · place name in the display face (tap to switch place) · Search. Don't let it wrap.
- **One place, several depths.** A **depth ruler** (a scale with labelled stops and a marker that tracks the camera) beats mode buttons. Keep a single "List" toggle beside it for the same content as a list.
- **Find:** one window for text and `#tags` together. **Dim, don't hide:** on spatial views, non-matches stay in place, dithered back, so people keep their spatial memory. Lists may filter.
- **Inbox:** things that arrive without a place wait in a tray until they're tapped (placed mid-view) or dragged to a spot.
- **Windows open from their source** and close back to it (zoom rects).
- **Grouped lists:** display-face section headers with dot leaders and a count, instead of repeating the group name on every row.

---

## 15. Accessibility

- **Contrast:**
  - text meets WCAG AA on its own surface;
  - threads reach 1.6:1 on light tables and 4:1 on dark ones;
  - region points and text on the table are tested in every atmosphere.
- **Not colour alone:** selection is shown by reverse video, handles and a frame; danger by madder plus the word.
- **Touch targets:** at least 44pt, even where the visual is 10px.
- **Reduce Motion** is respected (§12).
- **Real photos stay true colour.** Only tones are dithered, not images.

---

## 16. Voice

- Short, plain, sentence case: "New note", "3 of 8 match", "Tap to place, or hold and drag".
- Status lines state facts: counts, times, saved state.
- Name things by what they are ("Manila", "Blue copy", "Laces"), not by their UI role.

---

## 17. Recipes

### CSS tokens

```css
:root {
  --system-pixel: 2px;
  --paper: #f5f0e8; --paper-shade: #e9e0d0; --paper-deep: #d9ccb6;
  --sheet: #fbf8f2; --stock: #fffdf9;
  --ink: #2b1f0e; --ochre: #a0782a; --ochre-ink: #7a5a1c; --madder: #a8402a;
  --ink-soft: rgba(43,31,14,.68); --ink-muted: rgba(43,31,14,.48); --ink-faint: rgba(43,31,14,.30);
  --hairline: rgba(43,31,14,.16); --hairline-strong: rgba(43,31,14,.36);
  --frame: rgba(43,31,14,.70); --pinstripe: rgba(43,31,14,.24);
  --thread: rgba(160,120,42,.72);

  --shadow-control: 2px 2px 0 rgba(43,31,14,.14);
  --shadow-card: 4px 4px 0 rgba(43,31,14,.13);
  --shadow-card-active: 6px 6px 0 rgba(43,31,14,.20);
  --shadow-panel: 4px 4px 0 rgba(43,31,14,.16);

  --font-display: "PP Mondwest", serif;
  --font-system: "DotGothic16", monospace;
  --font-text: "Geist", system-ui, sans-serif;
}
[data-atmosphere="rose"]  { --table: #f6e9e3; --table-shade: #e8cec4; --table-text: #4f2418; }
[data-atmosphere="amber"] { --table: #2c200e; --table-shade: #150f06; --table-text: #f1ddb0; }
```

### Window

```css
.window { background: var(--sheet); border: 1px solid var(--frame); box-shadow: var(--shadow-panel); }
.window__bar {
  position: relative; height: 22px; border-bottom: 1px solid var(--frame);
  display: grid; place-items: center;
}
.window__bar::before {                 /* six 1px pinstripes with 1px gaps */
  content: ""; position: absolute; left: 4px; right: 4px; top: 5px; height: 11px;
  background: repeating-linear-gradient(to bottom, var(--pinstripe) 0 1px, transparent 1px 2px);
}
.window__title {
  position: relative; background: var(--sheet); padding: 0 6px;
  font: 13px/17px var(--font-system); color: var(--ink);
}
.window__close {
  position: absolute; left: 8px; top: 6px; width: 10px; height: 10px;
  border: 1px solid var(--frame); background: var(--sheet); box-shadow: 0 0 0 2px var(--sheet);
}
.window__body { padding: 16px; }
.window__status {
  min-height: 22px; display: flex; gap: 12px; align-items: center; padding: 0 12px;
  border-top: 1px solid var(--hairline-strong);
  font: 12px/16px var(--font-system); color: var(--ink-muted);
}
.dialog { background: var(--sheet); border: 2px solid var(--frame); padding: 2px; box-shadow: var(--shadow-panel); }
.dialog > .dialog__inner { border: 1px solid var(--frame); padding: 16px; }
```

### Control, reverse video and blink

```css
.control {
  min-height: 36px; padding: 0 12px; border: 1px solid var(--hairline-strong); border-radius: 2px;
  background: var(--sheet); box-shadow: var(--shadow-control);
  font: 13px/17px var(--font-system); color: var(--ink);
}
.control[aria-pressed="true"], .control:active, .control.is-blinking {
  background: var(--ink); border-color: var(--ink); color: var(--paper);
}
.reverse { background: var(--ink); color: var(--paper); }   /* inline selection run */
```

```ts
// Menu blink: on, off, on, then run.
async function blinkThen(el: HTMLElement, run: () => void) {
  for (const [on, ms] of [[true, 70], [false, 50], [true, 70]] as const) {
    el.classList.toggle('is-blinking', on);
    await new Promise((r) => setTimeout(r, ms));
  }
  el.classList.remove('is-blinking');
  run();
}
```

### A dithered field on a canvas (web)

```ts
function drawField(canvas: HTMLCanvasElement, w: number, h: number,
                   value: (cx: number, cy: number) => number, palette: [number, number, number][]) {
  const cell = 2, cols = Math.ceil(w / cell), rows = Math.ceil(h / cell);
  canvas.width = cols; canvas.height = rows;
  canvas.style.width = `${cols * cell}px`; canvas.style.height = `${rows * cell}px`;
  canvas.style.imageRendering = 'pixelated';
  const ctx = canvas.getContext('2d')!, img = ctx.createImageData(cols, rows);
  const steps = palette.length - 1;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const v = Math.min(1, Math.max(0, value(x, y))) * steps;
    const lo = Math.min(steps - 1, Math.floor(v));
    const [r, g, b] = palette[lo + (v - lo > bayer8(x, y) ? 1 : 0)];
    const i = (y * cols + x) * 4; img.data.set([r, g, b, 255], i);
  }
  ctx.putImageData(img, 0, 0);
}
```

### Hard shadow, native (React Native)

`shadowColor: ink`, `shadowOffset: { width: n, height: n }`, `shadowOpacity: a`, **`shadowRadius: 0`**, `elevation: n`. Render dither with a Skia runtime shader using the SkSL above. Keep the JS and shader maths in lockstep, and test that they match pixel for pixel.

---

## 18. Do and don't

**Do**
- Snap every size and offset to the 2px system pixel.
- Put tone into dither, meaning into ochre, ink and madder, and relationships into thread.
- Use reverse video for selection and press feedback.
- Open windows from their source; show state in status lines.
- Dim non-matches in place.
- Test contrast in every atmosphere.

**Don't**
- Blur, glass, translucent panels, or soft drop shadows.
- Smooth gradients or opacity fades for tone.
- Round dots, pill shapes, or radii above 2px.
- Pure black (`#000`) or neutral greys; use ink at alpha.
- Faux-bold the dot-matrix face, or letter-space caps for labels.
- Unicode or emoji as icons.
- Bouncy scaling on buttons, or slide-and-fade sheets.
- Dither real photos. They stay true colour.

---

## 19. Adopting this in a new project

1. Add the tokens (§3, §6, §7) as your single source of truth, and ban raw colours and sizes elsewhere.
2. Load the three faces (§5) and define the type roles as named styles.
3. Build the dither primitives: `bayer8`, a field renderer, a scrim, a reveal-order dissolve, and a dim tile.
4. Build the chrome kit: Window (title bar, close box, status line), Dialog, Control, Segment, Chip, Button, pixel Icon, selection handles, dot leader, crop marks.
5. Build the motion kit: press reverse video, blink, zoom rects, dissolve in/out, and one smooth/stepped switch honouring Reduce Motion.
6. Define at least one atmosphere (start with Paper). Make objects atmosphere-independent and the space atmosphere-driven.
7. Write tests for:
   - contrast floors in every atmosphere;
   - JS/shader dither parity;
   - everything snapping to the system pixel.
