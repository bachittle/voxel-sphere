// Fair, browser-free comparison of sphere point schemes.
//
// Metric (same for every scheme so it's apples-to-apples): for each point,
// the mean great-circle distance to its k=6 nearest neighbors. The distortion
// score is max(spacing) / min(spacing) across all points — 1.0 = perfectly even.
//
// Run:  node measure-all.mjs

const TARGET = 1944; // aim for a similar point count across all schemes
const K = 6;

const PHI = (1 + Math.sqrt(5)) / 2;
function norm(p){const l=Math.hypot(p[0],p[1],p[2]);return [p[0]/l,p[1]/l,p[2]/l];}
function ang(a,b){
  const cx=a[1]*b[2]-a[2]*b[1], cy=a[2]*b[0]-a[0]*b[2], cz=a[0]*b[1]-a[1]*b[0];
  return Math.atan2(Math.hypot(cx,cy,cz), a[0]*b[0]+a[1]*b[1]+a[2]*b[2]);
}

// --- schemes: each returns an array of unit-vector points ---
function latLong(){
  const pts=[], latB=31, lonB=62;
  for(let i=0;i<latB;i++){
    const theta=(i+0.5)/latB*Math.PI, y=Math.cos(theta), r=Math.sin(theta);
    for(let j=0;j<lonB;j++){
      const phi=(j+0.5)/lonB*2*Math.PI;
      pts.push([r*Math.cos(phi), y, r*Math.sin(phi)]);
    }
  }
  return pts;
}
function cubedSphere(){
  const pts=[], N=18;
  for(let axis=0;axis<3;axis++)for(let s=-1;s<=1;s+=2)
    for(let i=0;i<N;i++)for(let j=0;j<N;j++){
      const u=((i+0.5)/N)*2-1, v=((j+0.5)/N)*2-1;
      const p=[0,0,0]; p[axis]=s; p[(axis+1)%3]=u; p[(axis+2)%3]=v;
      pts.push(norm(p));
    }
  return pts;
}
function fibonacci(){
  const pts=[], n=TARGET, ga=2*Math.PI*(1-1/PHI);
  for(let i=0;i<n;i++){
    const y=1-(i+0.5)/n*2, r=Math.sqrt(Math.max(0,1-y*y)), t=i*ga;
    pts.push([r*Math.cos(t), y, r*Math.sin(t)]);
  }
  return pts;
}
function icosphere(){
  // subdivide an icosahedron, normalize verts -> near-uniform geodesic points
  const t=PHI;
  let verts=[[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],
    [0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]].map(norm);
  let faces=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],
    [11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],
    [4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
  const SUB=4; // -> 10*4^4+2 = 2562 verts
  for(let s=0;s<SUB;s++){
    const mid=new Map(), nf=[];
    const getMid=(a,b)=>{
      const key=a<b?a*100000+b:b*100000+a;
      if(mid.has(key))return mid.get(key);
      const m=norm([(verts[a][0]+verts[b][0]),(verts[a][1]+verts[b][1]),(verts[a][2]+verts[b][2])]);
      verts.push(m); const idx=verts.length-1; mid.set(key,idx); return idx;
    };
    for(const [a,b,c] of faces){
      const ab=getMid(a,b), bc=getMid(b,c), ca=getMid(c,a);
      nf.push([a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca]);
    }
    faces=nf;
  }
  return verts;
}

function ratio(pts){
  const n=pts.length, spacing=new Array(n);
  for(let i=0;i<n;i++){
    const d=[];
    for(let j=0;j<n;j++) if(j!==i) d.push(ang(pts[i],pts[j]));
    d.sort((a,b)=>a-b);
    let sum=0; for(let k=0;k<K;k++) sum+=d[k];
    spacing[i]=sum/K;
  }
  let mn=Infinity,mx=-Infinity;
  for(const s of spacing){ if(s<mn)mn=s; if(s>mx)mx=s; }
  return {n, mn, mx, r:mx/mn};
}

const schemes=[['Lat/Long',latLong],['Cubed sphere',cubedSphere],
  ['Fibonacci',fibonacci],['Icosphere (hex)',icosphere]];
console.log(`metric: mean dist to ${K} nearest neighbors; score = max/min (1.0 = perfect)\n`);
console.log('scheme'.padEnd(18), 'points'.padStart(7), 'score'.padStart(9));
for(const [name,fn] of schemes){
  const {n,r}=ratio(fn());
  console.log(name.padEnd(18), String(n).padStart(7), r.toFixed(3).padStart(9));
}
