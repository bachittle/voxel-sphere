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
and `cubed-sphere-planet.html` (renamed from `planet.html`, A.3 ✅). Don't grow
them; freeze them.

Known defect carried forward from Build 1: **some trees meshed incorrectly** —
diagnosed and fixed in the modular build (A.4 ✅).

---

## Phase 0 — Probes 🔄 (first, before any chunk code)

- **0.1 ✅ Icosphere decision probe — RESOLVED: cube wins (2026-07-02).**
  Bailey's eyeball verdict on `icosphere-planet.html` vs the cubed-sphere
  `planet.html`: **cube.** The Minecraft feel — square 16×16 textures on square
  faces — beats the hexagon's better evenness. **The cubed-sphere per-face i,j
  grid is now the canonical chunk format for Phase B and everything downstream.**
  `icosphere-planet.html` is frozen as an archived probe artifact; the icosphere
  gameplay-fairness edge is noted and shelved, not pursued. (Probe was built
  2026-07-02 + `icosphere-check.mjs`: mesh watertight, 0 unmatched edges; ~286k
  quads at subdiv 6 ≈ Build 1's budget; click = dig, shift-click = un-dig.)
- **0.2 ⬜ Raymarched clouds probe** — independent, anytime (artifact or git
  branch). Planet as a simple sphere + raymarched volumetric cloud shell, sun
  slider, quality dial, fps counter. *Verifier:* holds ~60fps at acceptable
  quality on the M4 and looks right next to blocky terrain. Fallback if it
  fails: blocky textured cloud shell (D.3).

## Phase A — Foundation 🔄

- **A.1 ✅ Promote to a real project (2026-07-02)** — `game.html` + plain ES
  modules under `src/`: `worldgen.js` (pure), `mesher.js`, `world.js` (seed +
  **edit overlay** — `blockAt()` answers edits → trees → worldgen), `player.js`,
  `input.js`, `gl.js`, `math.js`, `textures.js`, `state.js`, `main.js`. No
  bundler, no framework; needs http:// not file://. `window.VS` debug handle
  for browser-automation tests (seeds S.5). *Verified:* `game-check.mjs` —
  terrain/biomes/materials/water/cutaway/core meshes **byte-identical** to
  Build 1's GEN block (3 seeds); orbital screenshots indistinguishable; FP
  walk/collision works.
- **A.2 ⬜ Static hosting (decided 2026-07-02: no Go server for now)** — the
  whole game is static ES modules, so serve it from **GitHub Pages** to share
  with friends; local dev via any static server (`python -m http.server`).
  Save-sync moves to export/import (see B.5). A backend (the shelved Go
  service) only returns if multiplayer needs it (S.7). *Verifier:* game.html
  loads and runs from a Pages URL.
- **A.3 ✅ Rename the artifact (2026-07-02)** — `planet.html` →
  `cubed-sphere-planet.html`, frozen as Build 1; `index.html` hub +
  `planet-check.mjs` updated. (The voice card is a standalone copy, not a
  pointer — left as its own snapshot.)
- **A.4 ✅ Fix the tree mesher bug (2026-07-02)** — diagnosed: Build 1 meshed
  each tree in its own tangent frame, culling only against its own blocks, so
  **adjacent trees interpenetrated with near-coincident coplanar faces**
  (z-fighting; 523 overlapping pairs on seed 1337). Fix: trees now resolve to
  **grid-aligned world cells** — `worldgen.js` bakes `treeCells: (col,shell) →
  tile` (trunks win over leaves, cells inside terrain dropped), and the mesher
  culls faces against other tree cells *and* terrain, so canopies merge like
  Minecraft's. Bonus: trees are real voxel cells, ready for B.1 digging.
  *Verified:* `game-check.mjs` quantized-coincidence test — Build 1 has 34–88
  coincident quads per seed, modular build has **0**.

- **A.5 ✅ index.html refresh (2026-07-03)** — the hub now leads with a Play
  hero card for `game.html` (previously unlinked!), demotes Build 1 + the
  icosphere probe to a "Frozen builds" section (icosphere card rewritten past
  tense: cube won), groups the studies, and updates the scores line to state
  the *decisions* rather than the horse race. Re-edit one card per milestone.

## Phase B — The Loop ✅ (it became a game, 2026-07-03)

**Order (decided 2026-07-03 grilling): B.4 → B.2 → B.3.** Pointer-lock aiming
changes the feel of looking so much that the crosshair (B.2) should be tuned
against it, not against drag-look. B.5 last, as written.

- **B.1 ✅ Mutable chunks + re-meshing (2026-07-02)** — `src/chunks.js`: the
  planet cut into 16×16-column × full-depth chunks (384 total), each meshed
  from per-column 96-bit solidity masks (terrain + trees + edits − open
  caves); a face exists wherever a solid bit meets an air bit, so seams and
  chunk borders come free from `neighbor()`. Caves stay closed (meshed solid,
  Build 1's papering) until a dig floods the touched pocket open via BFS —
  probe measured 190 sealed pockets, largest ~20k cells, so reveals are
  bounded. Perf: full build 87ms, single-chunk remesh 0.17ms median, cave
  reveal ~6ms; 86–92fps in browser. Extras that rode along: edit-aware
  `groundR` (fall into pits, stand on placed blocks; trees still non-solid,
  ceiling check minimal — real voxel collision lands with B.3/B.4), throwaway
  click-dig / right-click-place raycast (`interact.js`, B.2 replaces it), FP
  near plane 0.49→0.2 blocks (standing in a 1×1 shaft no longer clips through
  the wall). Known gap: the cutaway view renders pure worldgen — edits don't
  appear in cross-section. *Verified:* `chunk-check.mjs` — unedited chunked
  face set **identical** to Build 1 (terrain+water, 3 seeds), incremental
  remesh == full rebuild across 9 edit scripts (surface, pit, face seam, cube
  corner, chunk border, floating block, re-dig, pocket reveal, re-seal), zero
  coincident quads; browser smoke: dig staircase/shaft, fall in, place block,
  dig into a 1,372-cell cave pocket and walk its floor.
- **B.2 ✅ Raycast block targeting (2026-07-03)** — crosshair picks the aimed
  block + face; highlight outline. Shipped: `interact.js` rebuilt around a
  per-frame `target` cache (dr/16 sampling, 5-block reach; face from the
  entering air cell: 'out'/'in'/lateral 0–3) that dig()/place() consume, so
  the outline and the break can't disagree by construction; 12-edge inflated
  line outline via a new `drawLines` in gl.js. (True DDA on the curved grid
  judged not worth it — 80 cheap lookups/frame.) *Verified:* browser-automation
  — dug cell === aimed cell, retarget after dig, sky clears target, reach
  limit; outline visible in screenshot. Caveat learned: rAF pauses in hidden
  tabs, so automation must keep the tab foregrounded (or drive updateTarget
  directly).
- **B.3 ✅ Break & place, creative (2026-07-03)** — break = vanish, place =
  from hotbar, unlimited. 9-slot hotbar (keys 1–9 / scroll / click): dirt,
  stone, sand, log, leaves, glass*, torch* (*new block types, atlas tiles
  19/20, hand-drawn 16×16 PNGs). **Water & lava hotbar slots stay 🚫 blocked
  on S.2.** Torch places **inert** until C.1 lights it. Implementation notes:
  glass & torch are *non-occluding* — excluded from the chunk solidity mask so
  terrain behind them still meshes; glass emits cube faces culled against
  solid/glass neighbors, torch emits double-sided cross-quads; torch is
  walk-through (isSolid exception) but raycast-targetable; hotbar icons cut
  from the composed atlas so tinted tiles look right (`hotbar.js`, ICONS in
  `textures.js`). *Verified:* browser-automation — place/dig glass + torch,
  hotbar key/scroll/click selection, anti-self-place, chunk remesh clean;
  screenshot shows see-through glass + torch sprite. Node checks byte-
  identical. *Bailey's verifier still open:* build a house; dig a shaft
  through a shell merge.
- **B.4 ✅ Desktop controls + menus (2026-07-03)** — Pointer Lock API (click to capture,
  raw-delta look), ESC → pause/settings menu (mouse sensitivity, invert Y,
  FOV, input-mode override), backtick → debug panel (the old dev sliders:
  time of day, spin, cutaway, fps). Touch controls kept, auto-detected.
  Decided 2026-07-03: ESC is a **real pause** (sim freezes, keeps rendering;
  backtick panel does *not* pause), and settings persist to localStorage
  (`vs-settings` — separate from B.5 world saves).
  Shipped: `settings.js` + `menu.js`; sensitivity/invert-Y/FOV live-applied;
  desktop hides touch FABs + debug panel (backtick reveals); ESC-guard so the
  lock-releasing ESC doesn't also close the fresh menu. Browser-automation
  verified (pause freezes theta, settings persist, locked dig/look via stubbed
  pointerLockElement — headless refuses real lock, so **the FPS feel needs
  Bailey's hands**). *Verifier:* feels like a native FPS in the browser;
  mobile still works.
- **B.5 ✅ Persistence (2026-07-03)** — **principle: localStorage first;
  export/import files second; a backend only if neither suffices.**
  Shipped as `persistence.js` (the narrow interface as specced): per-seed
  localStorage autosave (1.2s debounce off `world.rev`), export/import JSON
  file, `#save=` URL fragment (menu warns >8KB → use export), reset-world.
  openMask isn't serialized — re-flooding dig edits rebuilds it. Pause menu
  gained a World section; import/reset reach `regenerate` via CustomEvents.
  *Verified:* browser-automation — save/reload roundtrip, share-link load
  with cleared localStorage (the "friend" flow), import-becomes-local-save,
  reset. Node checks pass.
  Original spec: seed + edit deltas: localStorage per-seed
  (automatic), plus **export/import** for sharing — a save is a small JSON
  blob (seed + delta list), downloadable as a file; small ones can ride a URL
  fragment so a friend loads your build from a link. Keep it behind a narrow
  `saveDeltas()`/`loadDeltas()` interface so localStorage, file, URL, and a
  someday-server are swappable. *Verifier:* build, reload, it's there; export
  on one browser, import on another, same world.

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
- **S.7 ⬜ Multiplayer-someday** — either a small backend (the shelved Go
  server, needed for authoritative state / >2-3 players) or **peer-to-peer**
  (WebRTC data channels — serverless gameplay traffic, but still needs
  signaling: a tiny relay, PeerJS's public broker, or copy-paste offer/answer
  blobs which works on pure GitHub Pages).

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

*Game:* `game.html` + `src/` (the modular build, A.1). *Demos:* `index.html`
(hub), `demo.html` (unified geometry explorer), `dots.html`,
`cubed-sphere.html`, `heatmap.html`, `depth.html`, `cubed-sphere-planet.html`
→ Build 1 (frozen). *Checks:* `compute-ratio.mjs`, `measure-all.mjs`,
`depth-measure.mjs`, `planet-check.mjs` (Build 1), `game-check.mjs` (modular
vs Build 1), `icosphere-check.mjs`, `chunk-check.mjs` (B.1 chunked mesher vs
Build 1 + incremental-vs-full edit oracle).
