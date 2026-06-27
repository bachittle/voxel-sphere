// Standalone (no browser) verification of cubed-sphere cell spacing distortion.
// Builds the same gnomonic cubed sphere as heatmap.html and reports the
// min / max average-neighbor spacing and the max/min distortion ratio.
//
// Run:  node compute-ratio.mjs

const N = 18; // grid cells per cube face (matches heatmap.html default)

// cube cell center -> a 3D point on the cube face (axis fixed to sign)
function buildFace(axis, sign, u, v) {
  const p = [0, 0, 0];
  p[axis] = sign;
  const o1 = (axis + 1) % 3, o2 = (axis + 2) % 3;
  p[o1] = u; p[o2] = v;
  return p;
}
function normalize(p) {
  const len = Math.hypot(p[0], p[1], p[2]);
  return [p[0] / len, p[1] / len, p[2] / len];
}
// great-circle (angular) distance between two unit vectors, robust via atan2
function angDist(a, b) {
  const cx = a[1] * b[2] - a[2] * b[1];
  const cy = a[2] * b[0] - a[0] * b[2];
  const cz = a[0] * b[1] - a[1] * b[0];
  const cross = Math.hypot(cx, cy, cz);
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return Math.atan2(cross, dot);
}

// build all six faces as grids of normalized sphere positions
const faces = [];
for (let axis = 0; axis < 3; axis++) {
  for (let s = -1; s <= 1; s += 2) {
    const grid = [];
    for (let i = 0; i < N; i++) {
      grid[i] = [];
      for (let j = 0; j < N; j++) {
        const u = ((i + 0.5) / N) * 2 - 1;
        const v = ((j + 0.5) / N) * 2 - 1;
        grid[i][j] = normalize(buildFace(axis, s, u, v));
      }
    }
    faces.push(grid);
  }
}

// per cell: average great-circle distance to its in-face grid neighbors
const spacings = [];
for (const grid of faces) {
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const c = grid[i][j];
      let sum = 0, n = 0;
      const nb = [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]];
      for (const [ni, nj] of nb) {
        if (ni < 0 || ni >= N || nj < 0 || nj >= N) continue;
        sum += angDist(c, grid[ni][nj]);
        n++;
      }
      spacings.push(sum / n);
    }
  }
}

let min = Infinity, max = -Infinity;
for (const s of spacings) { if (s < min) min = s; if (s > max) max = s; }
const ratio = max / min;

console.log(`cells:  ${spacings.length}  (N=${N} per face, 6 faces)`);
console.log(`min spacing: ${min.toFixed(6)} rad`);
console.log(`max spacing: ${max.toFixed(6)} rad`);
console.log(`max/min distortion ratio: ${ratio.toFixed(4)}`);
