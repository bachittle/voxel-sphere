# List of Goals

Voxel Sphere — a from-scratch WebGL voxel game where the world is a **finite
sphere built from an inflated cube** (the cubed sphere), with multiple spheres
you can fly between. Design DNA: [[Voxel Factory Game]].

**Status:** ✅ complete · 🔄 in progress · ⬜ not started · 1️⃣ assigned to agent 1
(number first, then status)

## Approach (locked)
Take a **cube**, draw an even grid on each of its six faces, **inflate it round
like a balloon**. No poles, no pinch — squares only stretch a little at the 8
corners, and each face stays a clean grid so blocks behave like Minecraft. For
depth, the planet is a finite crust with fewer blocks per inner shell (onion).
Demos: `index.html`, `cubed-sphere.html`.

---

1 ✅ **Spinnable sphere of dots** — finite sphere of points, orbit camera, live
resolution slider. *Verifier:* drag spins it, scroll zooms, slider adds dots.

1.4 ✅ **See the pole problem** — lat/long dots visibly pinch at the poles, the
distortion the cubed sphere fixes.

1.5 ✅ **Cubed-sphere surface** — gridded cube inflates to a sphere, squares stay
even, none collapse to a point. *Verifier:* `cubed-sphere.html` morphs cube↔ball.

1.6 1️⃣ **Distortion heat map** — measure each block's distance to its neighbor and
paint the sphere by it (blue = tight, red = stretched). Add a histogram and a
single max/min ratio score to beat. *Verifier:* corners light up red; ratio prints.

2 ⬜ **Solid voxel sphere (depth)** — fill the cubed sphere through its radius,
the onion crust. *Verifier:* a cutaway shows stacked shells; stays smooth.

3 ⬜ **Real voxel cubes** — swap dots for shaded cubes, later map Minecraft-style
block textures.

4 ⬜ **Walk / fly the surface** — first-person camera with radial gravity.

5 ⬜ **Multiple spheres** — several finite worlds you can fly between.
