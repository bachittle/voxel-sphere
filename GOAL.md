# List of Goals

**Voxel Sphere** — a from-scratch WebGL voxel game where the world is a **finite
sphere** instead of a flat Cartesian grid. "Down" is toward a molten core, "up"
is outward to the sky, and there are multiple spheres you can fly between.
Design DNA: [[Voxel Factory Game]].

**Direction (decided 2026-07-01):** build a **Minecraft-style creative sandbox**
as the starting point — break/place blocks, dig through the onion, torchlit
caves — then subtract or mutate from there. Survival, automation, and the rest
layer on later.

**Status:** ✅ done · 🔄 in progress · ⬜ not started · 🚫 blocked (see dep)
Reference any goal by its label (e.g. "do B.3"). Phases are ordered; Phase 0
gates Phase A (the grid choice shapes the chunk format).

---

## Build 1 — the orbital artifact (done ✅)

`planet.html` (Fable, 2026-07-01) delivered the original goals 1–4 in one
self-contained file: cubed-sphere grid, onion depth, Perlin terrain, biomes,
caves, oceans, ore veins, lava core, real MC textures + biome tint, cutaway,
**day/night with a real sweeping terminator (2.4)**, and **first-person
walk/jump/fly with radial gravity (4.1)** — at 86–104fps via surface-shell-only
static meshing. Its one limit is the reason for everything below: the world is
**immutable** — meshed once, never edited.

One-file artifacts stay in the repo as the walked-through thought process:
`dots.html`, `cubed-sphere.html`, `heatmap.html`, `depth.html`, `demo.html`,
and `planet.html` (to be renamed, see A.3). Don't grow them; freeze them.

Known defect to carry forward: **some trees mesh incorrectly** (see A.4).

---

## Phase 0 — Probes 🔄 (first, before any chunk code)

- **0.1 ⬜ Icosphere decision probe** — resolves the old open goal 1.6 (pick the
  grid). Minimal one-file orbital artifact (`icosphere-planet.html`): hex-prism
  terrain from the same Perlin heightfield, real MC textures on caps + sides,
  the 12 pentagons visibly marked, a few dug-out cells to show prism stacking,
  zoomable orbit camera for side-by-side comparison with the cubed-sphere
  planet. *Verifier:* answers by eyeball — do square textures survive on hex
  caps, and does a hex world still read as Minecraft-like? **Decision gate:**
  the winner's addressing scheme becomes the chunk format in Phase B.
- **0.2 ⬜ Raymarched clouds probe** — independent, anytime (artifact or git
  branch). Planet as a simple sphere + raymarched volumetric cloud shell, sun
  slider, quality dial, fps counter. *Verifier:* holds ~60fps at acceptable
  quality on the M4 and looks right next to blocky terrain. Fallback if it
  fails: blocky textured cloud shell (D.3).

## Phase A — Foundation ⬜

- **A.1 ⬜ Promote to a real project** — split the monolith into plain ES
  modules (`main.js`, `world.js`, `mesher.js`, `player.js`, …), no bundler, no
  framework. Worldgen becomes a **pure function of (seed, cell)** with an edit
  overlay on top — the shape that persistence (B.5) and chunked loading both
  need. *Verifier:* the modular build renders the same planet as Build 1.
- **A.2 ⬜ Go server** — small standalone Go service in-repo: serves the static
  files (ES modules need http, not file://) and exposes `GET/PUT /world/:seed`
  save-sync endpoints writing delta files to disk. No accounts. *Verifier:*
  game loads from it; a saved delta round-trips.
- **A.3 ⬜ Rename the artifact** — `planet.html` → `cubed-sphere-planet.html`
  (or similar), frozen as Build 1. Update `index.html` hub + the voice card
  pointer.
- **A.4 ⬜ Fix the tree mesher bug** — some trees are visibly broken; fix while
  the mesher is being modularized, before building on it.

## Phase B — The Loop ⬜ (where it becomes a game)

- **B.1 ⬜ Mutable chunks + re-meshing** — world edits change voxel data and
  re-mesh the affected chunk(s) fast, including edits that cross cube-face
  seams and onion shell-merge boundaries. *Verifier:* edit anywhere — surface,
  seam, deep shell — with no holes or stale geometry.
- **B.2 ⬜ Raycast block targeting** — crosshair picks the aimed block +
  face; highlight outline. *Verifier:* the outlined cell is always the one
  that breaks.
- **B.3 ⬜ Break & place (creative)** — break = vanish, place = from hotbar,
  unlimited. 9-slot hotbar (keys 1–9 / scroll): dirt, stone, sand, log,
  leaves, glass*, torch* (*new block types). **Water & lava hotbar slots are
  🚫 blocked on S.2 (cellular flow)** — placeable fluids need spreading to
  make sense. *Verifier:* build a house; dig a shaft through a shell merge.
- **B.4 ⬜ Desktop controls + menus** — Pointer Lock API (click to capture,
  raw-delta look), ESC → pause/settings menu (mouse sensitivity, invert Y,
  FOV, input-mode override), backtick → debug panel (the old dev sliders:
  time of day, spin, cutaway, fps). Touch controls kept, auto-detected.
  *Verifier:* feels like a native FPS in the browser; mobile still works.
- **B.5 ⬜ Persistence** — seed + edit deltas: localStorage per-seed
  (automatic), synced through the Go backend (A.2). *Verifier:* build,
  reload, it's there; wipe localStorage, it comes back from the server.

## Phase C — Depth & Feel ⬜

- **C.1 ⬜ Torches + emissive lava** — torch = placeable point light (uniform
  array, ~8 nearest, per-pixel); lava renders emissive (ignores sun). Full
  light propagation is deferred to S.1. *Verifier:* descend a cave placing
  torches; a lava pit lights its cavern.
- **C.2 ⬜ Bedrock cap** — unbreakable layer sealing off the innermost core;
  the shell-merge weirdness above it is canon, not a bug. *Verifier:* dig
  straight down; you hit bedrock, not the singularity.
- **C.3 ⬜ Swimming** — player cell is water → buoyancy, drag, swim controls,
  against static water. *Verifier:* swim across an ocean; dive and surface.

## Phase D — World & Sky ⬜

- **D.1 ⬜ Vegetation pass** — MC-style cross-quad sprites (tall grass,
  flowers, cave mushrooms), biome-tinted, scattered as a worldgen decoration
  layer; no collision, break instantly, die with their supporting block.
- **D.2 ⬜ Sun disc** — visible sun where the light actually comes from.
- **D.3 ⬜ Clouds** — raymarched shell if 0.2 passed, blocky drifting cloud
  shell otherwise. Visible from ground *and* orbit.
- **D.4 ⬜ The moon** — real orbit, lit by the same sun (true phases, the
  occasional eclipse), impostor sphere at distance. Architecture anticipates
  chunk-promotion up close (S.6), but this milestone is look-don't-touch.
- **D.5 ⬜ Water shader glow-up** — animated UV scroll, depth tint,
  transparency/fresnel polish.

## Shelf — explicitly later ⬜

- **S.1 ⬜ Block-light propagation** — Minecraft-true flood-fill light levels
  baked at mesh time; replaces/augments C.1's point lights. Must survive the
  onion's shell merges.
- **S.2 ⬜ Cellular water/lava flow** — spreading, draining, containment on a
  spherical shell-merging grid. **Unlocks:** water & lava in the hotbar (B.3).
- **S.3 ⬜ Survival layer** — blocks drop as items, inventory, counts.
- **S.4 ⬜ Full creative inventory** — every block, searchable picker.
- **S.5 ⬜ Test harness** — unit tests for grid math/worldgen, integration
  tests for chunk edits, browser-automation smoke tests.
- **S.6 ⬜ Visitable moon / solar system** (old 5.1) — impostor→chunk LOD
  promotion, space flight between spheres. The Outer Wilds end-state.
- **S.7 ⬜ Backend beyond saves** — accounts / sharing / multiplayer-someday.

---

## Geometry findings (Phase 1 archive — measurements stand)

Surface — mean distance to 6 nearest neighbors, max÷min across all cells:

| Scheme            | Score | Notes |
|-------------------|-------|-------|
| Lat/Long          | 11.26 | poles ruin it — unusable |
| Cubed sphere      | 2.18  | gridded & cube blocks; face centers stretch, corners tightest |
| Fibonacci spiral  | 1.05  | nearly perfect spacing, but no grid — can't stack/chunk |
| Icosphere (hex)   | 1.12  | near-Fibonacci evenness and a real grid; **0.1 decides** whether it beats cubes *as a game* |

Depth — 3D nearest-neighbor spacing, max÷min through the solid sphere:

| Strategy        | Score | Notes |
|-----------------|-------|-------|
| Naive shells    | 3.98  | constant cells/shell — crowd toward the core |
| **Onion (∝ r²)** | **1.15** | cells/shell ∝ area — even & cubic; its discrete shell-merges are **embraced as canon** (blocks get weird as you go down) |

---

*Demos:* `index.html` (hub), `demo.html` (unified geometry explorer),
`dots.html`, `cubed-sphere.html`, `heatmap.html`, `depth.html`,
`planet.html` → Build 1 (rename pending, A.3). *Checks:* `compute-ratio.mjs`,
`measure-all.mjs`, `depth-measure.mjs`, `planet-check.mjs`.
