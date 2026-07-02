// icosphere-check.mjs — mesh integrity check for icosphere-planet.html (GOAL 0.1)
// Extracts the /*==GEN==*/ script, builds the planet, and verifies the opaque
// terrain mesh is a closed, consistently-wound surface: every directed
// triangle edge must be matched by its reverse. Unmatched edges = holes or
// flipped faces. Run: node icosphere-check.mjs [seed] [subdiv]
import {readFileSync} from 'fs';

const html = readFileSync(new URL('./icosphere-planet.html', import.meta.url), 'utf8');
const m = html.match(/\/\*==GEN==\*\/([\s\S]*?)<\/script>/);
if (!m) { console.error('GEN block not found'); process.exit(1); }
const GEN = new Function(m[1] + '\nreturn GEN;')();

const seed = +(process.argv[2] ?? 7), subdiv = +(process.argv[3] ?? 5);
const P = GEN.init(seed, subdiv);
GEN.demoPit(P);
const {op, wa} = GEN.buildMesh(P);

function checkClosed(mb, name) {
  const q = x => Math.round(x * 1e6);                 // corner vecs are shared,
  const key = (V, i) => `${q(V[i*10])},${q(V[i*10+1])},${q(V[i*10+2])}`; // exact
  const seen = new Map();                              // "a|b" directed edge
  const I = mb.I, nTri = mb.ni / 3;
  for (let t = 0; t < nTri; t++) {
    const a = key(mb.V, I[t*3]), b = key(mb.V, I[t*3+1]), c = key(mb.V, I[t*3+2]);
    if (a === b || b === c || c === a) { console.log(`${name}: degenerate tri ${t}`); continue; }
    for (const [u, v] of [[a,b],[b,c],[c,a]]) {
      const k = u + '|' + v;
      seen.set(k, (seen.get(k) || 0) + 1);
    }
  }
  let unmatched = 0, doubled = 0;
  for (const [k, n] of seen) {
    const [u, v] = k.split('|');
    const rev = seen.get(v + '|' + u) || 0;
    if (n > 1) doubled++;
    if (rev !== n) unmatched++;
  }
  console.log(`${name}: tris ${nTri}, directed edges ${seen.size}, unmatched ${unmatched}, doubled ${doubled}`);
  return unmatched;
}

console.log(`seed ${seed}, subdiv ${subdiv}: tiles ${P.nT}, SEA ${P.SEA}, maxH ${P.maxH}, W ${P.W.toFixed(4)}`);
const bad = checkClosed(op, 'terrain');
console.log(`water: tris ${wa.ni/3} (open sheet, boundary expected — not checked)`);

// sanity: all effective heights within bounds, pent count
let pents = 0, hBad = 0;
for (let t = 0; t < P.nT; t++) {
  if (P.tiles[t].pent) pents++;
  const eh = P.H[t] - P.delta[t];
  if (eh < 2 || eh > P.maxH) hBad++;
}
console.log(`pentagons ${pents} (want 12), out-of-range heights ${hBad}`);
process.exit(bad || pents !== 12 || hBad ? 1 : 0);
