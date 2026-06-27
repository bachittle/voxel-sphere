// Radial (depth) distortion — browser-free.
//
// A solid sphere is a stack of shells from a small lava core out to r=1.
// Two strategies for how many cells each shell carries:
//   naive  — every shell gets the SAME count  -> cells crowd toward the core
//   onion  — count ∝ r² (constant areal density) -> spacing stays even
//
// Metric: for every 3D cell, distance to its nearest neighbor among all cells.
// Score = max / min (1.0 = perfectly cubic everywhere). Run: node depth-measure.mjs

const PHI=(1+Math.sqrt(5))/2;
const CORE=0.18;        // lava-core radius (bedrock cap)
const TOP_M=560;        // surface points on the outer shell
// shell thickness ~ surface tangential spacing so cells aim for cubic
const surfSpacing=Math.sqrt(4*Math.PI/TOP_M);   // ≈ mean nn arc on unit sphere
const SHELLS=Math.max(2,Math.round((1-CORE)/surfSpacing));
const DR=(1-CORE)/SHELLS;

function fibShell(m,r){const pts=[],ga=2*Math.PI*(1-1/PHI);
  for(let i=0;i<m;i++){const y=1-(i+0.5)/m*2,rr=Math.sqrt(Math.max(0,1-y*y)),t=i*ga;
    pts.push([r*rr*Math.cos(t), r*y, r*rr*Math.sin(t)]);}
  return pts;}

function build(mode){
  const all=[];
  for(let s=0;s<SHELLS;s++){
    const r=CORE+(s+0.5)*DR;
    const m = mode==='naive' ? TOP_M : Math.max(12, Math.round(TOP_M*(r*r)));
    for(const p of fibShell(m,r)) all.push(p);
  }
  return all;
}
function score(pts){
  const n=pts.length; let mn=Infinity,mx=-Infinity;
  for(let i=0;i<n;i++){let best=Infinity;
    for(let j=0;j<n;j++){if(j===i)continue;
      const dx=pts[i][0]-pts[j][0],dy=pts[i][1]-pts[j][1],dz=pts[i][2]-pts[j][2];
      const d=dx*dx+dy*dy+dz*dz; if(d<best)best=d;}
    const nn=Math.sqrt(best); if(nn<mn)mn=nn; if(nn>mx)mx=nn;}
  return {n,mn,mx,r:mx/mn};
}

console.log(`core=${CORE}  shells=${SHELLS}  dr=${DR.toFixed(4)}  surfSpacing=${surfSpacing.toFixed(4)}\n`);
console.log('mode'.padEnd(8),'cells'.padStart(7),'minNN'.padStart(9),'maxNN'.padStart(9),'score'.padStart(8));
for(const mode of ['naive','onion']){
  const {n,mn,mx,r}=score(build(mode));
  console.log(mode.padEnd(8),String(n).padStart(7),mn.toFixed(4).padStart(9),mx.toFixed(4).padStart(9),r.toFixed(2).padStart(8));
}
