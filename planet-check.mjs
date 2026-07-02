// planet-check.mjs — browser-free sanity check for planet.html.
// Extracts the pure /*==GEN==*/ block and verifies: cubed-sphere adjacency
// (symmetric, 4-regular, geometrically local), terrain/biome distribution,
// block & quad counts of the static shell, and the cutaway re-mesh.
// Run: node planet-check.mjs [seed] [N]
import{readFileSync}from'node:fs';

const html=readFileSync(new URL('./planet.html',import.meta.url),'utf8');
const m=html.match(/\/\*==GEN==\*\/([\s\S]*?)\/\*==ENDGEN==\*\//);
if(!m){console.error('FAIL: GEN block not found');process.exit(1);}
const GEN=new Function(m[1]+'\nreturn GEN;')();

const seed=+(process.argv[2]??1337),N=+(process.argv[3]??128);
let fails=0;
const check=(ok,label)=>{console.log((ok?'  ok ':'FAIL ')+label);if(!ok)fails++;};

console.log(`— init(seed=${seed}, N=${N}) —`);
let t0=performance.now();
const P=GEN.init(seed,N);
console.log(`  init: ${(performance.now()-t0).toFixed(0)}ms · ${P.cols} columns · dr=${P.dr.toFixed(5)} · SEA=${P.SEA}`);

// ---- adjacency ----
t0=performance.now();
let sym=0,asym=0,self=0,dup=0,far=0;
const maxAng=3*P.dr; // neighbors must be ~one cell apart
for(let c=0;c<P.cols;c++){
  const ns=[0,1,2,3].map(d=>GEN.neighbor(P,c,d));
  if(new Set(ns).size!==4)dup++;
  for(const n of ns){
    if(n===c){self++;continue;}
    let back=false;
    for(let d=0;d<4;d++)if(GEN.neighbor(P,n,d)===c)back=true;
    if(back)sym++;else asym++;
    const dot=P.dir[c*3]*P.dir[n*3]+P.dir[c*3+1]*P.dir[n*3+1]+P.dir[c*3+2]*P.dir[n*3+2];
    if(Math.acos(Math.min(1,dot))>maxAng)far++;
  }
}
console.log(`— adjacency (${(performance.now()-t0).toFixed(0)}ms) —`);
check(asym===0,`symmetric: ${sym} links, ${asym} asymmetric`);
check(self===0&&dup===0,`4 distinct non-self neighbors everywhere (self=${self}, dup=${dup})`);
check(far===0,`all neighbors within ${maxAng.toFixed(4)} rad (${far} too far)`);

// ---- terrain / biomes ----
const hist=new Array(8).fill(0);
let hMin=1e9,hMax=-1e9;
for(let c=0;c<P.cols;c++){hist[P.BI[c]]++;
  if(P.H[c]<hMin)hMin=P.H[c];if(P.H[c]>hMax)hMax=P.H[c];}
const pct=i=>(hist[i]/P.cols*100).toFixed(1)+'%';
console.log('— terrain —');
console.log('  biomes: '+GEN.BIOME_NAMES.map((n,i)=>`${n} ${pct(i)}`).join(' · '));
console.log(`  height shells: ${hMin}..${hMax} (sea top = ${P.SEA-1})`);
const ocean=hist[0]/P.cols;
check(ocean>0.2&&ocean<0.65,`ocean fraction ${(ocean*100).toFixed(1)}% in [20,65]%`);
check(hist[3]>0&&hist[5]+hist[6]>0&&hist[7]+hist[6]>0,'has forest, mountains, snow');
check(hMin>=4&&hMax<=P.SEA+25,'heights within crust bounds');
console.log(`  trees: ${P.trees.length}`);
check(P.trees.length>100&&P.trees.length<3000,'tree count in [100,3000]');

// ---- material function ----
let cave=0,ore=0,stone=0,lava=0,samples=0;
for(let c=0;c<P.cols;c+=97){const h=P.H[c];
  for(let s=2;s<h-4;s+=3){const t=GEN.mat(P,c,s);samples++;
    if(t<0)cave++;else if(t===GEN.T.LAVA)lava++;
    else if(t>=GEN.T.COAL)ore++;else stone++;}}
console.log(`— materials (${samples} samples) — cave ${(cave/samples*100).toFixed(1)}% · ore ${(ore/samples*100).toFixed(1)}% · stone ${(stone/samples*100).toFixed(1)}%`);
check(cave/samples>0.02&&cave/samples<0.30,'cave density in [2,30]%');
check(ore/samples>0.005&&ore/samples<0.15,'ore density in [0.5,15]%');

// ---- static shell mesh ----
t0=performance.now();
const{op,wa}=GEN.buildStatic(P);
const dt=(performance.now()-t0).toFixed(0);
const finite=a=>{for(let i=0;i<a.length;i++)if(!Number.isFinite(a[i]))return false;return true;};
const idxOK=m=>{const nv=m.n/10;for(let i=0;i<m.ni;i++)if(m.I[i]>=nv)return false;return true;};
console.log(`— static mesh (${dt}ms) — opaque ${op.quads} quads · water ${wa.quads} quads · total ${op.quads+wa.quads}`);
check(op.quads>50000&&op.quads<1200000,'opaque quad count sane');
check(wa.quads>5000,'water quads present');
check(finite(op.V.subarray(0,op.n))&&finite(wa.V.subarray(0,wa.n)),'no NaN/Inf vertices');
check(idxOK(op)&&idxOK(wa),'indices in range');
check(op.ni===op.quads*6&&op.n===op.quads*4*10,'opaque index/vertex bookkeeping consistent');
// normals unit-length (stride 10, normal at offset 7)
{let bad=0;for(let v=0;v<op.n;v+=10){
  const l=Math.hypot(op.V[v+7],op.V[v+8],op.V[v+9]);
  if(Math.abs(l-1)>1e-3)bad++;}
 check(bad===0,`vertex normals unit length (${bad} bad)`);}

// ---- cutaway meshes ----
for(const a of[0.5,1.0]){
  t0=performance.now();
  const cut=GEN.buildCut(P,2-2*a);
  const ms=(performance.now()-t0).toFixed(0);
  console.log(`— cut a=${a} (${ms}ms) — opaque ${cut.op.quads} · water ${cut.wa.quads}`);
  check(cut.op.quads>1000,`cut a=${a} produces cross-section quads`);
  check(finite(cut.op.V.subarray(0,cut.op.n)),`cut a=${a} vertices finite`);
  // re-run to measure warm (mat-cache) rebuild cost
  t0=performance.now();GEN.buildCut(P,2-2*a);
  console.log(`  warm rebuild: ${(performance.now()-t0).toFixed(0)}ms`);
}
const core=GEN.buildCore(P),disc=GEN.buildDisc(P,0.1);
check(core.quads===1280,'core ball 1280 tris');
check(disc.quads===48,'core disc 48 tris');

console.log(fails?`\n${fails} FAILURES`:'\nall checks passed');
process.exit(fails?1:0);
