# List of Goals

**Voxel Sphere** — a from-scratch WebGL voxel game where the world is a **finite
sphere** instead of a flat Cartesian grid. "Down" is toward a molten core, "up"
is outward to the sky, and there are multiple spheres you can fly between.
Design DNA: [[Voxel Factory Game]].

**Status:** ✅ done · 🔄 in progress · ⬜ not started
Reference any goal by its number (e.g. "do 2.2"). Big goals are done when all
their subgoals are.

---

## 1 — The Geometry 🔄
Pick how to tile a sphere with even, addressable cells. The core hard problem.

- **1.1 ✅ Spinnable sphere of dots** — finite sphere of points, orbit camera,
  live resolution slider. *Verifier:* drag spins, scroll zooms, slider adds dots.
  (`index.html`)
- **1.2 ✅ The pole problem, seen** — a lat/long grid visibly pinches all points
  to a single point at each pole. The thing every other scheme must beat.
- **1.3 ✅ Cubed-sphere surface** — inflate a gridded cube into a ball; no pole
  pinch, keeps a clean per-face grid. *Verifier:* `cubed-sphere.html` morphs
  cube↔ball, squares stay even, none collapse.
- **1.4 ✅ Distortion heat map + scoreboard** — measure each cell's spacing (mean
  great-circle distance to its 6 nearest neighbors) and paint blue→red, with a
  histogram and a single max/min score. *Verifier:* `heatmap.html` + the
  `measure-all.mjs` node check agree. **Findings below.**
- **1.5 ✅ Depth / radial distortion** — depth matters as much as the surface:
  inner shells shrink, so cells crowd toward the core (a radial pole problem).
  Fix = **onion**: cells per shell ∝ r² (constant areal density), shell thickness
  ≈ surface spacing → cube-ish cells all the way down, tiny core capped by lava.
  *Verifier:* `depth.html` cutaway + `depth-measure.mjs`. Naive score **3.98**,
  onion **1.15** (and onion uses *fewer* cells).
- **1.6 ⬜ Pick the grid** — decide the tiling we build the game on, accounting for
  BOTH surface and depth evenness. Leading candidate: the **icosphere / hex grid**
  (even *and* gridded). Open question: accept hexagon-prism blocks, or keep cube
  blocks on the cubed sphere?

### Measured scores (lower = more even, 1.0 = perfect)

**Surface** — mean distance to 6 nearest neighbors, max÷min across all cells:

| Scheme            | Score | Notes |
|-------------------|-------|-------|
| Lat/Long          | 11.26 | poles ruin it — unusable |
| Cubed sphere      | 2.18  | gridded & cube blocks; **face centers** stretch most, **corners** are *tightest* (the inflate is a radial projection that compresses corners — opposite of a balloon) |
| Fibonacci spiral  | 1.05  | nearly perfect spacing, but **no grid** — irregular neighbors, can't stack/chunk cleanly |
| **Icosphere (hex)** | **1.12** | near-Fibonacci evenness **and** a real grid (hexagons + 12 pentagons, every tile 6 neighbors); the likely winner |

**Depth** — 3D nearest-neighbor spacing, max÷min through the whole solid sphere:

| Strategy        | Score | Notes |
|-----------------|-------|-------|
| Naive shells    | 3.98  | constant cells/shell — crowd toward the core |
| **Onion (∝ r²)** | **1.15** | cells/shell scale with area — even & cubic, fewer cells |

## 2 — The Planet ⬜
Give the sphere depth and a living surface.

- **2.1 ⬜ Solid depth (onion)** — fill the sphere through its radius with fewer
  cells per inner shell. Radial layout: **molten lava core = bedrock**, strata
  outward, **sky** beyond the crust. Show it as an **animation** growing from the
  core. *Verifier:* a cutaway shows shells from lava core to surface; stays smooth.
- **2.2 ⬜ Perlin-noise terrain** — surface height from Perlin/simplex noise so
  the crust has hills and valleys. *Verifier:* visible rolling terrain.
- **2.3 ⬜ Minecraft-style world gen** — biomes, caves, oceans, wrapped around the
  sphere. *Verifier:* distinct biomes, carved caves, sea-level water on the planet.

## 3 — The Blocks ⬜
Make it look like a voxel world.

- **3.1 ⬜ Real shaded cubes/prisms** — swap dots for solid lit cells.
- **3.2 ⬜ Borrowed textures** — map Minecraft-style block textures onto faces.

## 4 — The Player ⬜
- **4.1 ⬜ Walk / fly the surface** — first-person camera with radial gravity
  (down = toward the core).

## 5 — The Solar System ⬜
- **5.1 ⬜ Multiple spheres** — several finite worlds you can fly between.

---

*Demos:* `index.html` (dots), `cubed-sphere.html` (cube→ball morph),
`heatmap.html` (distortion comparison). *Checks:* `compute-ratio.mjs`,
`measure-all.mjs`.
