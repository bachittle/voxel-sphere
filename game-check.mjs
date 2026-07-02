// game-check.mjs — verifies the modular build (src/) against Build 1's frozen
// GEN block: same terrain (H/BI), same materials, same trees, same meshes.
// Run: node game-check.mjs [seed] [N]
import{readFileSync}from'node:fs';
import*as WG from'./src/worldgen.js';
import*as MESH from'./src/mesher.js';

const html=readFileSync(new URL('./cubed-sphere-planet.html',import.meta.url),'utf8');
const m=html.match(/\/\*==GEN==\*\/([\s\S]*?)\/\*==ENDGEN==\*\//);
if(!m){console.error('FAIL: GEN block not found');process.exit(1);}
const GEN=new Function(m[1]+'\nreturn GEN;')();

const seed=+(process.argv[2]??1337),N=+(process.argv[3]??128);
let fails=0;
const check=(ok,label)=>{console.log((ok?'  ok ':'FAIL ')+label);if(!ok)fails++;};

console.log(`— modular vs Build 1 (seed=${seed}, N=${N}) —`);
const P1=GEN.init(seed,N);
const P2=WG.init(seed,N);

const eqArr=(a,b)=>{if(a.length!==b.length)return false;
  for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;return true;};
check(eqArr(P1.H,P2.H),'terrain heights identical');
check(eqArr(P1.BI,P2.BI),'biomes identical');
check(eqArr(P1.dir,P2.dir),'column directions identical');
check(P1.trees.length===P2.trees.length,
  `tree count identical (${P1.trees.length} vs ${P2.trees.length})`);
{let same=true;
 for(let i=0;i<Math.min(P1.trees.length,P2.trees.length);i++){
   const a=P1.trees[i],b=P2.trees[i];
   if(a.col!==b.col||a.blocks.size!==b.blocks.size){same=false;break;}
   for(const[k,v]of a.blocks)if(b.blocks.get(k)!==v){same=false;break;}}
 check(same,'tree placement + block lists identical');}

// materials: sample the interior
{let same=true,n=0;
 for(let c=0;c<P1.cols;c+=53)for(let s=0;s<P1.H[c];s+=2){n++;
   if(GEN.mat(P1,c,s)!==WG.mat(P2,c,s)){same=false;break;}}
 check(same,`interior materials identical (${n} samples)`);}

// static shell mesh — trees differ by design (A.4 grid-aligned tree fix),
// everything else must be byte-identical to Build 1.
const A=GEN.buildStatic(P1),B=MESH.buildStatic(P2);
const eqMB=(a,b)=>a.quads===b.quads&&a.n===b.n&&a.ni===b.ni&&
  eqArr(a.V.subarray(0,a.n),b.V.subarray(0,b.n))&&
  eqArr(a.I.subarray(0,a.ni),b.I.subarray(0,b.ni));
console.log(`  opaque quads: Build1 ${A.op.quads} · modular ${B.op.quads} (trees differ by design)`);
check(eqMB(A.wa,B.wa),'water mesh identical');
check(eqMB(GEN.buildCore(P1),MESH.buildCore(P2)),'core mesh identical');
check(eqMB(GEN.buildDisc(P1,0.5),MESH.buildDisc(P2,0.5)),'disc mesh identical');
{const c1=GEN.buildCut(P1,0.8),c2=MESH.buildCut(P2,0.8);
 check(eqMB(c1.op,c2.op)&&eqMB(c1.wa,c2.wa),'cutaway meshes identical');}

// non-tree opaque geometry must match exactly: rebuild both without trees
{const t1=P1.trees.splice(0),t2=P2.trees.splice(0),tc=P2.treeCells;
 P2.treeCells=new Map();
 const na=GEN.buildStatic(P1),nb=MESH.buildStatic(P2);
 P1.trees.push(...t1);P2.trees.push(...t2);P2.treeCells=tc;
 check(eqMB(na.op,nb.op),'terrain-only opaque mesh identical (trees excluded)');}

// A.4 regression: the opaque mesh must contain no (near-)coincident quads.
// (Build 1's tangent-frame trees emitted nearly-overlapping coplanar faces
// wherever two trees stood in adjacent columns — the visible z-fighting bug.
// "Nearly": each tree's frame differs slightly, so quantize to dr/8 bins.)
function dupQuads(m,dr){
  const q8=dr/8,seen=new Set();let dup=0;
  for(let q=0;q<m.quads;q++){
    const ks=[];
    for(let v=0;v<4;v++){const o=(q*4+v)*10;
      ks.push(Math.round(m.V[o]/q8)+','+Math.round(m.V[o+1]/q8)+','+Math.round(m.V[o+2]/q8));}
    const k=ks.sort().join('|');
    if(seen.has(k))dup++;else seen.add(k);}
  return dup;}
const d1=dupQuads(A.op,P1.dr),d2=dupQuads(B.op,P2.dr);
console.log(`  coincident quads: Build1 ${d1} · modular ${d2}`);
check(d2===0,'modular opaque mesh has zero coincident quads');
check(d1>0,'(sanity) Build 1 exhibits the tree bug this fix removes');

// modular mesh integrity (same battery planet-check runs on Build 1)
const finite=a=>{for(let i=0;i<a.length;i++)if(!Number.isFinite(a[i]))return false;return true;};
const idxOK=m=>{const nv=m.n/10;for(let i=0;i<m.ni;i++)if(m.I[i]>=nv)return false;return true;};
check(finite(B.op.V.subarray(0,B.op.n)),'modular vertices finite');
check(idxOK(B.op),'modular indices in range');
check(B.op.ni===B.op.quads*6&&B.op.n===B.op.quads*4*10,'modular index/vertex bookkeeping consistent');
{let bad=0;for(let v=0;v<B.op.n;v+=10){
  const l=Math.hypot(B.op.V[v+7],B.op.V[v+8],B.op.V[v+9]);
  if(Math.abs(l-1)>1e-3)bad++;}
 check(bad===0,`modular vertex normals unit length (${bad} bad)`);}
check(P2.treeCells.size>0,`treeCells populated (${P2.treeCells.size} cells)`);

console.log(fails?`\n${fails} FAILURES`:'\nall checks passed');
process.exit(fails?1:0);
