// chunk-check.mjs — B.1 verifier: chunked mask-based meshing vs the
// monolithic buildStatic() over the SAME worldgen (self-consistent — survives
// intentional worldgen changes), and incremental re-meshing vs full rebuild
// after edit scripts (the stale-geometry / holes oracle).
// Run: node chunk-check.mjs [seed] [N]
import*as WG from'./src/worldgen.js';
import*as MESH from'./src/mesher.js';
import*as CH from'./src/chunks.js';
import{world,generate,blockAt,isSolid,isOpen,clearEdits}from'./src/world.js';

const seed=+(process.argv[2]??1337),N=+(process.argv[3]??128);
let fails=0;
const check=(ok,label)=>{console.log((ok?'  ok ':'FAIL ')+label);if(!ok)fails++;};
console.log(`— chunked mesher (seed=${seed}, N=${N}, CS=${CH.CS}) —`);

const P=generate(seed);
CH.initChunks(P);
const NC=CH.numChunks(P);

// quad multiset: key = all 40 vertex floats of the quad (already float32)
function addQuads(map,mb,sign=1){
  for(let q=0;q<mb.quads;q++){
    const k=mb.V.subarray(q*40,q*40+40).join(',');
    const c=(map.get(k)||0)+sign;
    if(c===0)map.delete(k);else map.set(k,c);}
}
function msetOf(mbs){const m=new Map();for(const mb of mbs)addQuads(m,mb);return m;}
function msetEq(a,b){
  if(a.size!==b.size)return false;
  for(const[k,v]of a)if(b.get(k)!==v)return false;
  return true;}
function buildAll(){const out=[];for(let id=0;id<NC;id++)out.push(CH.buildChunk(P,id));return out;}

// ---- 1. unedited world: chunked face set == Build 1 face set ----
// terrain-only exact compare (with trees Build 1 leaves hidden faces inside
// trunks that hug cliffs — the mask build correctly culls those, so tree
// parity is checked as integrity + coincidence instead of set equality)
{
  const tc=P.treeCells,tr=P.trees;
  P.treeCells=new Map();P.trees=[];
  CH.initChunks(P);
  const ref=MESH.buildStatic(P);
  const chunksT=buildAll();
  check(msetEq(msetOf([ref.op]),msetOf(chunksT.map(c=>c.op))),
    'terrain-only opaque face set identical to buildStatic');
  check(msetEq(msetOf([ref.wa]),msetOf(chunksT.map(c=>c.wa))),
    'water face set identical to buildStatic');
  P.treeCells=tc;P.trees=tr;
  CH.initChunks(P);
}

// ---- 2. with trees: integrity battery ----
const chunks=buildAll();
{
  const refT=MESH.buildStatic(P);
  const nq=chunks.reduce((a,c)=>a+c.op.quads,0);
  console.log(`  opaque quads: buildStatic ${refT.op.quads} · chunked ${nq}`);
  check(nq>0&&nq<=refT.op.quads,'chunked quad count sane (<= buildStatic: culls trunk-in-cliff faces)');
  let finiteOK=true,idxOK=true,bookOK=true,normBad=0;
  for(const c of chunks){
    const m=c.op;
    for(let i=0;i<m.n;i++)if(!Number.isFinite(m.V[i]))finiteOK=false;
    const nv=m.n/10;
    for(let i=0;i<m.ni;i++)if(m.I[i]>=nv)idxOK=false;
    if(m.ni!==m.quads*6||m.n!==m.quads*40)bookOK=false;
    for(let v=0;v<m.n;v+=10){
      const l=Math.hypot(m.V[v+7],m.V[v+8],m.V[v+9]);
      if(Math.abs(l-1)>1e-3)normBad++;}
  }
  check(finiteOK,'vertices finite');
  check(idxOK,'indices in range');
  check(bookOK,'index/vertex bookkeeping consistent');
  check(normBad===0,`normals unit length (${normBad} bad)`);
  // no coincident quads across the whole planet (A.4 regression, chunked)
  const q8=P.dr/8,seen=new Set();let dup=0;
  for(const c of chunks)for(let q=0;q<c.op.quads;q++){
    const ks=[];
    for(let v=0;v<4;v++){const o=(q*4+v)*10;
      ks.push(Math.round(c.op.V[o]/q8)+','+Math.round(c.op.V[o+1]/q8)+','+Math.round(c.op.V[o+2]/q8));}
    const k=ks.sort().join('|');
    if(seen.has(k))dup++;else seen.add(k);}
  check(dup===0,`zero coincident quads with trees (${dup})`);
}

// ---- 3. edit scripts: incremental remesh == full rebuild ----
const meshes=chunks;                    // live per-chunk meshes, updated incrementally
function applyAndCheck(label,edits){
  CH.dirty.clear();
  for(const[col,s,t]of edits)CH.editBlock(col,s,t);
  const touched=[...CH.dirty];
  for(const id of touched)meshes[id]=CH.buildChunk(P,id);
  const full=buildAll();
  const okOp=msetEq(msetOf(meshes.map(c=>c.op)),msetOf(full.map(c=>c.op)));
  const okWa=msetEq(msetOf(meshes.map(c=>c.wa)),msetOf(full.map(c=>c.wa)));
  check(okOp&&okWa,`${label} (dirtied ${touched.length} chunks)`);
}

// helper: column from face/i/j
const colAt=(f,i,j)=>f*P.n2+j*P.N+i;

// (a) dig the surface block of a mid-face column
{const col=colAt(0,40,40);applyAndCheck('dig surface block',[[col,P.H[col],-1]]);}
// (b) dig a 3-deep pit (stacked edits in one column)
{const col=colAt(1,70,70),h=P.H[col];
 applyAndCheck('dig 3-deep pit',[[col,h,-1],[col,h-1,-1],[col,h-2,-1]]);}
// (c) dig at a cube-face seam (i=0 edge)
{const col=colAt(2,0,64);applyAndCheck('dig at cube-face seam',[[col,P.H[col],-1]]);}
// (d) dig at a face corner (i=0,j=0 — three faces meet)
{const col=colAt(3,0,0);applyAndCheck('dig at cube corner',[[col,P.H[col],-1]]);}
// (e) dig at a chunk border inside a face
{const col=colAt(0,CH.CS-1,CH.CS);applyAndCheck('dig at chunk border',[[col,P.H[col],-1]]);}
// (f) place a floating block two shells above ground
{const col=colAt(4,30,90);applyAndCheck('place floating block',[[col,P.H[col]+2,5]]);}
// (g) place then re-dig (edit overwrite path)
{const col=colAt(4,90,30),h=P.H[col];
 applyAndCheck('place then re-dig same cell',[[col,h+1,5],[col,h+1,-1]]);}
// (h) dig into a cave pocket: find a solid cell whose lower neighbor is cave
{let found=null;
 outer:for(let col=0;col<P.cols;col+=7){
   const h=P.H[col];
   for(let s=h;s>h-4&&s>3;s--)
     if(WG.mat(P,col,s)>=0&&WG.mat(P,col,s-1)<0){found=[col,s];break outer;}}
 check(!!found,'found a cave-roof cell to dig');
 if(found){
   const[col,s]=found;
   const before=world.openMask.size;
   applyAndCheck('dig through cave roof (pocket reveal)',[[col,s,-1],[col,s-1,-1]]);
   let opened=0;
   for(const m of world.openMask.values())for(const w of m)opened+=popcnt(w);
   console.log(`  pocket revealed: ${opened} cells open (openMask cols ${before}→${world.openMask.size})`);
   check(opened>0,'reveal flood opened the pocket');
   // hole oracle: every open cell's solid neighbors have a face — implied by
   // incremental==full, plus masks agree with isSolid on/around the pocket
   let agree=true;
   for(const[c,m]of world.openMask){
     const w=new Uint32Array(3);CH.solidMask(P,c,w);
     for(let s2=0;s2<P.SH;s2++){
       const bit=(w[s2>>>5]&(1<<(s2&31)))!==0;
       if(bit!==isSolid(c,s2)){agree=false;break;}}}
   check(agree,'solidMask agrees with isSolid across revealed columns');
 }}
// (i) seal a revealed pocket entrance back up (place into edit-air)
{const someEdit=[...world.edits.keys()][0];
 const col=(someEdit/P.SH)|0,s=someEdit-col*P.SH;
 applyAndCheck('seal an edit back up',[[col,s,5]]);}

function popcnt(v){v-=(v>>>1)&0x55555555;v=(v&0x33333333)+((v>>>2)&0x33333333);
  return((v+(v>>>4)&0x0F0F0F0F)*0x01010101)>>>24;}

// ---- 4. blockAt / isSolid sanity on closed caves ----
{
  // find a closed cave cell: isSolid says solid (papered), blockAt says air
  let found=false;
  outer2:for(let col=0;col<P.cols;col+=101){
    for(let s=4;s<P.H[col]-4;s++)
      if(WG.mat(P,col,s)<0&&!isOpen(col,s)&&world.edits.get(col*P.SH+s)===undefined){
        found=isSolid(col,s)&&blockAt(col,s)<0;break outer2;}}
  check(found,'closed caves: isSolid=true (raycast-safe), blockAt=air');
}

console.log(fails?`\n${fails} FAILURES`:'\nall checks passed');
process.exit(fails?1:0);
