// make-reference.mjs — freezes the CURRENT worldgen as reference-v2.json,
// the oracle game-check.mjs compares against. Run ONLY when a worldgen
// change is intentional, and commit the new JSON in the same commit as the
// change. History: v2 baked 2026-07-03 (E.1 terracing + C.2 visible
// bedrock — the first intentional break from Build 1 equivalence).
// Caveat: mesh floats bake this engine's Math.* ulps; if a Node upgrade
// ever flips hashes with zero code changes, regenerate deliberately and
// sanity-check quad counts before committing.
import{writeFileSync}from'node:fs';
import*as WG from'./src/worldgen.js';
import*as MESH from'./src/mesher.js';
import{snapshot}from'./ref-hash.mjs';

const N=128,seeds=[1337,42,7];
const out={_node:process.version,_baked:'2026-07-03',_N:N};
for(const seed of seeds){
  out[`${seed}:${N}`]=snapshot(WG,MESH,seed,N);
  console.log(`baked seed ${seed}`);
}
writeFileSync(new URL('./reference-v2.json',import.meta.url),
  JSON.stringify(out,null,1));
console.log('wrote reference-v2.json');
