# Voxel Sphere

A from-scratch WebGL voxel game where the world is a **finite sphere** —
"down" is toward a molten core, "up" is out to the sky. Minecraft-style
creative sandbox on a cubed-sphere grid with onion-shell depth. The world is
a two-body system: an earth-like home planet and a small desert moon you
reach by spaceship (🚀 in the hotbar — place it, press E, fly).

**▶ Play:** https://chittle.cc/voxel-sphere/ (hub) ·
[game.html](https://chittle.cc/voxel-sphere/game.html) (the game)

No dependencies, no bundler, no framework — plain WebGL + ES modules + a
hand-rolled mat4. The one-file demos in the repo root are frozen artifacts
of the design process (grid comparisons, distortion heat maps, the icosphere
decision probe); the live game is `game.html` + `src/`.

## Controls

Click to capture the mouse. WASD walk · space jump/swim · shift dive ·
F fly · E enter/exit the spaceship · 1–9/scroll hotbar · click break ·
right-click place · ESC menu (settings, save export/import/share) ·
backtick debug panel. Touch works too — joystick + tap (✈ near a ship
boards it).

Ship flight is Newtonian (Outer Wilds-style): thrust accelerates, velocity
persists, both planets pull real gravity — orbit, slingshot, flip-and-burn.
Z/X roll · B match velocity (retro-burn to a stop) · V landing camera ·
T lock the other planet · G autopilot — one stage per press, like a real
mission: surface → parking orbit, orbit → transfer to the locked planet
(arrives into orbit), orbit → land. Each stage ends stable with a ✓ hint;
touching the stick cancels. M opens the live map: the orbit view draws
your coasting trajectory (apoapsis/periapsis/impact markers) while the sim
keeps running, and W/S burn prograde/retro, space/shift radial — fly the
ellipse by instruments. Easy to learn (the G ladder), hard to master (the
map). The pilot HUD shows the body you're over (or
the lock/autopilot status), speed/vertical rate, and 6-axis thruster
lights.

## Dev

Any static server works:

```bash
python3 -m http.server 8000
# open http://localhost:8000/game.html
```

Checks (Node, no deps): `node game-check.mjs` (worldgen vs frozen reference
snapshot + integrity), `node chunk-check.mjs` (chunked mesher vs monolithic,
incremental remesh vs full rebuild), `node system-check.mjs` (desert moon
gen, two-body frame math, ship mesh, Newtonian flight physics, save v3),
`node planet-check.mjs` (frozen Build 1).
After an *intentional* worldgen change: `node make-reference.mjs` and commit
the new `reference-v2.json`.

Roadmap and design history: [GOAL.md](GOAL.md).

## Credits

Block textures: [Pixel Perfection](https://github.com/minetest-texture-packs/Pixel-Perfection)
by Hugh "XSSheep" Rutland and contributors, licensed
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Inlined
(base64) in `src/textures.js`; recolored/derived textures fall under the
same license.
