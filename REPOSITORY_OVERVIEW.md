# Repository Internals Overview

## 1. What This Is

A **personal portfolio** for an electronics engineer and creative developer (Rizqi), built as a purely static website. The portfolio showcases 10 interactive visual experiments — physics simulations, shader art, dither effects, and a real-time 3D GPS navigation app — rendered inside a dark, glassmorphism-styled carousel shell.

There is **no build system, no package manager, no server, and no tests**. Every file is plain HTML, CSS, or vanilla JavaScript, loaded directly from disk or static hosting.

---

## 2. File Map

```
/workspace
├── index.html                 # Portfolio shell: sidebar, carousel, logo dither, glass tuner
├── style.css                  # Global styles, CSS variables, glassmorphism, responsive layout
├── projects.js                # Project data array, carousel engine, typewriter footer
├── dither-modes.js            # Shared dither/effect engine (9 render modes + mix system)
│
├── blackhole.html             # WebGL — raymarched black hole with gravitational lensing
├── milkyway.html              # WebGL — volumetric galaxy simulation
├── nebula.html                # Canvas 2D — dither effect ("memento mori"), uses dither-modes.js
├── vanitas.html               # Canvas 2D — dither effect ("vanitas"), uses dither-modes.js
├── attractor.html             # Canvas 2D — Lorenz strange attractor in ASCII
├── reaction-diffusion.html    # Canvas 2D — Gray–Scott reaction-diffusion
├── n-body.html                # Canvas 2D — N-body gravitational simulation
├── fourier.html               # Canvas 2D — Fourier series / epicycles
├── city.html                  # Three.js — procedural point-cloud city
├── citywatch.html             # Three.js — real-time 3D navigation (GPS, OSM, transit, aircraft)
├── riga.html                  # Leaflet — 2D city plan of Riga
│
├── skull0000-0720.mp4         # Video source for the sidebar logo dither animation
├── citywatch_debugging/       # Debug session notes for CityWatch
├── .specstory/                # SpecStory AI session history
├── .gitignore                 # Ignores .specstory/
└── .cursorindexingignore      # Ignores .specstory/ from Cursor indexing
```

---

## 3. Tech Stack

| Layer | Technology |
|-------|-----------|
| Markup | HTML5 |
| Styling | CSS3 (custom properties, `backdrop-filter`, CSS animations) |
| Scripting | Vanilla JavaScript (ES5/ES6, no transpilation) |
| 2D Graphics | Canvas 2D API |
| 3D Graphics | Three.js (CDN: r128 and 0.160.0) + OrbitControls, EffectComposer, UnrealBloomPass |
| Maps | Leaflet 1.9.4 (CDN) |
| Font | Google Fonts — DotGothic16 |
| Build | None — zero build steps, no bundler, no npm |
| Deploy | Static hosting (e.g. GitHub Pages) |

All third-party dependencies are loaded from CDNs (unpkg, cdnjs, jsdelivr). There is no `package.json` or lockfile.

---

## 4. Architecture

### Pattern

**Static multi-page app.** `index.html` is the portfolio shell. Each simulation is a fully self-contained HTML file that can run independently. The shell loads simulations into `<iframe>` elements inside a carousel.

### Module Dependency Graph

```
index.html
├── style.css           (shared styles)
├── projects.js         (data + carousel logic)
├── skull0000-0720.mp4  (logo video)
└── inline scripts      (logo dither, glass tuner)

vanitas.html ──┐
               ├── dither-modes.js  (shared dither engine)
nebula.html  ──┘

blackhole.html         (standalone — Three.js 0.160 + inline GLSL)
milkyway.html          (standalone — Three.js 0.160 + inline GLSL)
attractor.html         (standalone — Canvas 2D)
reaction-diffusion.html(standalone — Canvas 2D)
n-body.html            (standalone — Canvas 2D)
fourier.html           (standalone — Canvas 2D)
city.html              (standalone — Three.js r128 + bloom)
citywatch.html         (standalone — Three.js r128 + bloom, ~4100 lines)
riga.html              (standalone — Leaflet)
```

### Entry Point: `index.html`

On `DOMContentLoaded`, `projects.js` runs:

1. **`renderCards()`** — iterates the `projects` array, creates DOM cards with `<iframe data-src="...">` and dot indicators.
2. **`initNavButtons()`** — binds left/right arrow buttons.
3. **`initSwipe()`** — binds touch events for mobile swipe navigation.
4. **`initKeyboard()`** — binds `ArrowLeft` / `ArrowRight` keyboard events.
5. **`typewriter()`** — starts the animated footer text.

Two inline IIFEs in `index.html` add:
- **Logo dither** — reads frames from a hidden `<video>` element, applies a Bayer 8x8 ordered dither, and renders to a 48px `<canvas>`.
- **Glass tuner** — a floating control panel that adjusts CSS custom properties (`--glass-blur`, `--glass-tint`, `--glass-wash`, `--glass-radius`, `--glass-border`) in real time, with a "copy CSS" button.

### Lazy Iframe Loading

`updateIframes()` only sets `iframe.src` for cards within distance 1 of the current carousel index. Cards further away have their `src` set to `about:blank` to save resources.

---

## 5. Shared Modules in Detail

### `projects.js` — Data + Carousel

The `projects` array is the single source of truth for all cards:

```js
{
    type: "sim",
    title: "black hole",
    subtitle: "ASCII gravitational lensing simulation",
    classification: "webgl // glsl",
    sim: "blackhole.html",
    tags: ["three.js", "raymarching", "shaders"]
}
```

The carousel is implemented with CSS `translateX` transforms on a flex track. `goTo(idx)` clamps the index, applies a 0.4s CSS transition, updates dots, and triggers iframe loading.

### `dither-modes.js` — Dither Engine

A strategy-pattern module exposing 9 render modes and a compositing/mix system.

**Architecture:**

- **`MODES`** array — each mode is an object with `{ id, label, pixelated, params[], render(engine, params) }`.
- **`window.initDitherEngine(canvasId, videoId)`** — factory function that wires up:
  - A mode selector dropdown
  - A tuner panel with dynamically-built sliders for the current mode's parameters
  - A mix system (blend two modes together with configurable blend mode and amount)
  - URL preset parsing (`?mode=dissolve&pixelSize=1.8&...`)
  - `requestAnimationFrame` render loop

**The 9 Modes:**

| # | ID | Technique |
|---|-----|-----------|
| 1 | `dither` | Bayer 8x8 ordered dither with configurable color levels |
| 2 | `ascii` | ASCII art rendering using luminance-mapped character set |
| 3 | `halftone` | Variable-radius dot grid |
| 4 | `crosshatch` | Multi-angle line hatching based on darkness |
| 5 | `edge` | Sobel edge detection |
| 6 | `pixelsort` | Horizontal pixel sorting by luminance within threshold bands |
| 7 | `glitch` | Chromatic aberration + row shifting + noise |
| 8 | `thermal` | False-color thermal palette via LUT |
| 9 | `dissolve` | Flow-field particle displacement driven by luminance |

**Engine object** passed to each `render()`:

```js
{
    canvas, ctx, video,
    screenW, screenH,
    setupCanvas(w, h, pixelated),
    sampleVideo(w, h)             // returns ImageData
}
```

**Mix system:** Renders two modes to offscreen canvases, then composites them using `globalCompositeOperation` (mix, add, multiply, screen, overlay) and `globalAlpha`.

---

## 6. Individual Simulations

### Black Hole (`blackhole.html`)

WebGL + Three.js 0.160. Full-screen quad with a custom fragment shader that **raymarches a Schwarzschild black hole**. Implements gravitational lensing by bending ray paths near the event horizon. Output is converted to ASCII characters using a Bayer 8x8 dither for the final visual. Features an accretion disk and star field.

### Milky Way (`milkyway.html`)

WebGL + Three.js 0.160. Volumetric galaxy simulation with spiral arm density functions. Fragment shader samples 3D noise-based density fields to render a rotating galaxy. ASCII-style output using the same Bayer dither approach.

### Memento Mori / Nebula (`nebula.html`)

Canvas 2D. Uses `dither-modes.js` to apply real-time dither effects to a video source. The default mode creates an ethereal nebula-like effect.

### Vanitas (`vanitas.html`)

Canvas 2D. Also uses `dither-modes.js`. Loaded with a URL preset that configures the dissolve mode + thermal mix blend for a specific artistic effect.

### Strange Attractor (`attractor.html`)

Canvas 2D. Computes the **Lorenz attractor** differential equations (`dx/dt = σ(y-x)`, `dy/dt = x(ρ-z)-y`, `dz/dt = xy-βz`) and renders the chaotic trajectory as ASCII characters on a black background.

### Reaction-Diffusion (`reaction-diffusion.html`)

Canvas 2D. Implements the **Gray-Scott model** — a two-chemical reaction-diffusion system that generates Turing patterns (spots, stripes, waves) from noise.

### N-Body (`n-body.html`)

Canvas 2D. **N-body gravitational simulation** using direct pairwise force calculation. Bodies interact through Newtonian gravity with softening to prevent singularities. Renders orbital trails.

### Fourier (`fourier.html`)

Canvas 2D. Visualizes **Fourier series decomposition** as a chain of rotating circles (epicycles). Draws complex shapes by summing rotating vectors at different frequencies.

### City (`city.html`)

Three.js r128 + bloom post-processing. **Procedural point-cloud city** using simplex noise for terrain height, grid-based building placement, and animated stream particles along building edges. OrbitControls for camera.

### CityWatch (`citywatch.html`)

The most complex project (~4100 lines). A **real-time 3D GPS navigation system** built on Three.js r128 with bloom post-processing.

**Key subsystems:**

| Subsystem | Description |
|-----------|-------------|
| **Tile loading** | Web Mercator tile math at zoom 16. Loads 3x3 (or 5x5 in surveillance mode) tiles around the user. Binary VPS tiles via Cloudflare Worker with Overpass API fallback. Tile queue with concurrency limit of 3. |
| **GPS** | `navigator.geolocation.watchPosition` with exponential smoothing (`α=0.2`). GPS override for jumping to arbitrary coordinates. Fallback to Riga center after 12s timeout. |
| **Routing** | Nominatim geocoding → OSRM driving route → turn-by-turn navigation with step tracking (15m proximity trigger). |
| **Camera modes** | `birdseye` (top-down), `followme` (behind user), `anchor` (orbiting a point: user, destination, or aircraft). |
| **Transit** | Stockholm (SL) transit: vehicle polling every 5s, route shape fetching, dead reckoning between updates. |
| **Aircraft** | OpenSky ADS-B data every 15s via VPS proxy. Linear interpolation + velocity-based extrapolation between updates. |
| **Weather** | Open-Meteo wind data every 5 min. |
| **Traffic** | HERE traffic incidents every 5 min. |
| **Scene reset** | `resetScene()`: aborts in-flight requests, clears tile cache, clears transit intervals, resets world origin. Uses `sceneGeneration` counter to invalidate stale callbacks. |

**External services (all proxied through a Cloudflare Worker):**

| Service | Endpoint | Purpose |
|---------|----------|---------|
| Cloudflare Worker | `citywatch-tile-proxy.rizqi-wahyudin.workers.dev` | Tile proxy, auth proxy, caching |
| Overpass API | Multiple mirrors | OSM building/road data |
| Nominatim | `/search?q=...` | Geocoding |
| OSRM | `router.project-osrm.org` | Driving route calculation |
| OpenSky Network | Via VPS proxy | ADS-B aircraft positions |
| Open-Meteo | Via VPS proxy | Wind data |
| HERE Traffic | Via VPS proxy | Traffic incidents |
| SL Transit | Via VPS proxy | Stockholm public transit vehicles |

### Riga (`riga.html`)

Leaflet 1.9.4. A 2D map centered on Riga with custom styling.

---

## 7. Visual Design System

### Theme

Dark, minimal, monochromatic with subtle metallic accents. Defined in CSS custom properties on `:root`:

- **Background:** `#050505`
- **Text:** `#e8e8e8` with dim (`0.25α`) and mid (`0.45α`) variants
- **Accent:** Gray metallic gradient (`#484848` → `#c8c8c8`)
- **Highlights:** Cyan (`#00e5ff`) and magenta (`#ff0050`) for hover/glitch effects
- **Font:** DotGothic16 (pixel-style monospace from Google Fonts)

### Glassmorphism

Cards use layered glass effects controlled by CSS variables:
- `--glass-blur` — `backdrop-filter: blur()`
- `--glass-tint` — background alpha
- `--glass-wash` — animated color wash overlay opacity
- `--glass-radius` — border radius
- `--glass-border` — border alpha

All tunable in real-time via the Glass Tuner panel.

### Overlays

- **Noise grain** — SVG `feTurbulence` filter applied as `body::before` at low opacity
- **Accent glow** — Radial gradient `body::after` for subtle ambient light

### Responsive

At `≤900px` viewport width, the sidebar collapses from a fixed left column to a top horizontal strip, carousel height reduces to `65vh`, and nav buttons are hidden (swipe-only).

---

## 8. State Management

All state is held in plain JavaScript variables. There is no framework, store, or reactive system.

**Portfolio state** (`projects.js`):
- `currentIdx` — current carousel position
- `projects` — static array of project data

**Dither engine state** (`dither-modes.js`):
- `currentMode`, `params` — active render mode and its parameter values
- `mixEnabled`, `mixModeRef`, `mixParams`, `blendAmount`, `blendIdx` — mix layer state
- `screenW`, `screenH` — viewport dimensions

**CityWatch state** (`citywatch.html`):
- `smoothLat`, `smoothLon` — exponentially smoothed GPS
- `gpsOverrideActive`, `gpsOverrideLat`, `gpsOverrideLon` — override coordinates
- `worldOriginLat`, `worldOriginLon` — Three.js scene origin in geographic coords
- `tileCache` — `Map<string, {points, loading, error, ...}>`
- `tileQueue`, `loadingSet` — tile request queue and concurrency tracking
- `routeState` — `{active, destLat, destLon, waypoints, steps, distanceM}`
- `cameraMode`, `anchorSubMode` — camera behavior
- `aircraftData` — `Map<icao24, {...}>` of tracked aircraft
- `sceneGeneration` — counter incremented on scene reset to invalidate stale callbacks

---

## 9. Key Patterns

| Pattern | Where | How |
|---------|-------|-----|
| **Data-driven UI** | `projects.js` | `projects` array drives card rendering; add/remove by editing the array |
| **Strategy** | `dither-modes.js` | `MODES` array of interchangeable render strategies with uniform `render(engine, params)` interface |
| **Factory** | `dither-modes.js` | `initDitherEngine()` sets up the full engine from IDs |
| **URL-based config** | `dither-modes.js`, `vanitas.html` | URL query parameters configure mode, params, mix, and blend |
| **Render loop** | All simulations | `requestAnimationFrame` driving continuous render |
| **Lazy loading** | `projects.js` | Iframes only loaded when within ±1 of current carousel index |
| **Queue + concurrency** | `citywatch.html` | `tileQueue` drained with `TILE_CONCURRENCY = 3` |
| **AbortController** | `citywatch.html` | `tileLoadController.abort()` on scene reset cancels in-flight fetches |
| **Fallback chain** | `citywatch.html` | VPS binary tile → Overpass mirror 1 → mirror 2 → mirror 3 |
| **Dead reckoning** | `citywatch.html` | Transit vehicles extrapolated between 5s polls using bearing + speed |
| **Exponential smoothing** | `citywatch.html` | GPS position smoothed with `α=0.2` to reduce jitter |
| **Generation counter** | `citywatch.html` | `sceneGeneration` invalidates callbacks from previous scene resets |

---

## 10. Error Handling

- **No global error boundary.** Each simulation handles errors independently.
- **CityWatch tile loading:** try VPS binary tile → catch → try Overpass mirrors in sequence → catch → mark tile as errored. Retry errored tiles every 20s.
- **CityWatch network:** All fetch calls wrapped in `try/catch`. Failures are logged to console and silently ignored (aircraft, transit, weather, traffic).
- **CityWatch GPS:** `onGPSError` callback; falls back to Riga center after 12s if no GPS fix.
- **CityWatch scene reset:** `AbortController` ensures in-flight requests don't mutate stale scene state.
- **Video autoplay:** Logo dither falls back to click-to-play if autoplay is blocked by browser policy.

---

## 11. Development & Infrastructure

| Aspect | Status |
|--------|--------|
| Build system | None |
| Package manager | None |
| Tests | None |
| Linting | None |
| CI/CD | None |
| Docker | None |
| Deployment config | None (static hosting assumed) |
| Environment variables | None (config is inline in source) |
| Documentation | This file + `citywatch_debugging/` session report |

To develop: open `index.html` in a browser, or serve with any static file server (e.g. `python -m http.server`). No install step required.
