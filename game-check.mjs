// game-check.mjs — verifies src/ worldgen + mesher against the frozen
// reference snapshot (reference-v2.json) plus an integrity battery.
// Regenerate the reference ONLY on intentional worldgen changes
// (node make-reference.mjs). Run: node game-check.mjs [seed] [N]
//
// History: until 2026-07-03 this compared byte-for-byte against Build 1's
// GEN block. E.1 (terraced lowlands) + C.2 (visible bedrock) were the first
// intentional worldgen changes, so the oracle was re-aimed at a frozen
// reference (S.5's first slice). Build 1 itself stays guarded by
// planet-check.mjs; the A.4 tree-fix history lives in git.
import{readFileSync}from'node:fs';
import*as WG from'./src/worldgen.js';
import*as MESH from'./src/mesher.js';
import{snapshot}from'./ref-hash.mjs';

const seed=+(process.argv[2]??1337),N=+(process.argv[3]??128);
let fails=0;
const check=(ok,label)=>{console.log((ok?'  ok ':'FAIL ')+label);if(!ok)fails++;};

console.log(`— modular build vs reference-v2 (seed=${seed}, N=${N}) —`);
const ref=JSON.parse(readFileSync(new URL('./reference-v2.json',import.meta.url),'utf8'));
const want=ref[`${seed}:${N}`];

if(!want){
  console.log(`  (no reference baked for seed=${seed},N=${N} — integrity only)`);
}else{
  const got=snapshot(WG,MESH,seed,N);
  for(const k of Object.keys(want))
    check(got[k]===want[k],`${k} matches reference (${got[k]})`);
}

// ---- integrity battery (reference-independent) ----
const P=WG.init(seed,N);
const B=MESH.buildStatic(P);
const finite=a=>{for(let i=0;i<a.length;i++)if(!Number.isFinite(a[i]))return false;return true;};
const idxOK=m=>{const nv=m.n/10;for(let i=0;i<m.ni;i++)if(m.I[i]>=nv)return false;return true;};
check(finite(B.op.V.subarray(0,B.op.n)),'vertices finite');
check(idxOK(B.op),'indices in range');
check(B.op.ni===B.op.quads*6&&B.op.n===B.op.quads*4*10,'index/vertex bookkeeping consistent');
{let bad=0;for(let v=0;v<B.op.n;v+=10){
  const l=Math.hypot(B.op.V[v+7],B.op.V[v+8],B.op.V[v+9]);
  if(Math.abs(l-1)>1e-3)bad++;}
 check(bad===0,`vertex normals unit length (${bad} bad)`);}
check(P.treeCells.size>0,`treeCells populated (${P.treeCells.size} cells)`);

// A.4 regression: zero (near-)coincident quads, quantized to dr/8 bins
{const q8=P.dr/8,seen=new Set();let dup=0;
 for(let q=0;q<B.op.quads;q++){
   const ks=[];
   for(let v=0;v<4;v++){const o=(q*4+v)*10;
     ks.push(Math.round(B.op.V[o]/q8)+','+Math.round(B.op.V[o+1]/q8)+','+Math.round(B.op.V[o+2]/q8));}
   const k=ks.sort().join('|');
   if(seen.has(k))dup++;else seen.add(k);}
 check(dup===0,`zero coincident quads (${dup})`);}

// E.1 verifier: flat spots exist — count 5x5 single-height patches on land
{let flats=0,samples=0;
 for(let f=0;f<6;f++)for(let j=2;j<P.N-2;j+=5)for(let i=2;i<P.N-2;i+=5){
   const col=f*P.n2+j*P.N+i,h=P.H[col];
   if(h<P.SEA)continue;
   samples++;
   let flat=true;
   for(let dj=-2;dj<=2&&flat;dj++)for(let di=-2;di<=2;di++)
     if(P.H[f*P.n2+(j+dj)*P.N+(i+di)]!==h){flat=false;break;}
   if(flat)flats++;}
 const pct=(100*flats/Math.max(1,samples)).toFixed(1);
 console.log(`  flat 5x5 land patches: ${flats}/${samples} (${pct}%)`);
 check(flats/Math.max(1,samples)>0.10,'>10% of sampled land sits in a flat 5x5 patch (E.1)');}

console.log(fails?`\n${fails} FAILURES`:'\nall checks passed');
process.exit(fails?1:0);
