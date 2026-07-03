# Voxel Sphere

A from-scratch WebGL voxel game where the world is a **finite sphere** —
"down" is toward a molten core, "up" is out to the sky. Minecraft-style
creative sandbox on a cubed-sphere grid with onion-shell depth.

**▶ Play:** https://chittle.cc/voxel-sphere/ (hub) ·
[game.html](https://chittle.cc/voxel-sphere/game.html) (the game)

No dependencies, no bundler, no framework — plain WebGL + ES modules + a
hand-rolled mat4. The one-file demos in the repo root are frozen artifacts
of the design process (grid comparisons, distortion heat maps, the icosphere
decision probe); the live game is `game.html` + `src/`.

## Controls

Click to capture the mouse. WASD walk · space jump/swim · shift dive ·
F fly · 1–9/scroll hotbar · click break · right-click place · ESC menu
(settings, save export/import/share) · backtick debug panel. Touch works
too — joystick + tap.

## Dev

Any static server works:

```bash
python3 -m http.server 8000
# open http://localhost:8000/game.html
```

Checks (Node, no deps): `node game-check.mjs` (worldgen vs frozen reference
snapshot + integrity), `node chunk-check.mjs` (chunked mesher vs monolithic,
incremental remesh vs full rebuild), `node planet-check.mjs` (frozen Build 1).
After an *intentional* worldgen change: `node make-reference.mjs` and commit
the new `reference-v2.json`.

Roadmap and design history: [GOAL.md](GOAL.md).
