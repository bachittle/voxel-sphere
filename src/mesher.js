// mesher.js — turns worldgen columns into quad meshes: static surface shell,
// cutaway cross-sections, lava core ball + cut disc. No DOM, no GL.
import{T,neighbor,mat,matSolid,topTile,sideTile,underTile}from'./worldgen.js';

// ---- mesh builder: interleaved [x y z u v shade cx nx ny nz], u32 indices ----
// shade is a pure AO-ish multiplier (1.0 top, 0.82 side); >1.2 marks emissive
// (lava). Sun lighting is NOT baked — the shader lights per-vertex from the
// normal + a live sun-direction uniform, so the terminator can sweep.
const ATLAS_COLS=8,ATLAS_ROWS=4;
function tileRect(t){const c=t%ATLAS_COLS,r=(t/ATLAS_COLS)|0;
  return[(c*16+0.5)/(ATLAS_COLS*16),(r*16+0.5)/(ATLAS_ROWS*16),
         15/(ATLAS_COLS*16),15/(ATLAS_ROWS*16)];}
function MB(){return{V:new Float32Array(1<<14),n:0,I:new Uint32Array(1<<13),ni:0,quads:0};}
function mbGrowV(m,need){if(m.n+need<=m.V.length)return;
  let c=m.V.length;while(c<m.n+need)c*=2;const nv=new Float32Array(c);nv.set(m.V.subarray(0,m.n));m.V=nv;}
function mbGrowI(m,need){if(m.ni+need<=m.I.length)return;
  let c=m.I.length;while(c<m.ni+need)c*=2;const ni2=new Uint32Array(c);ni2.set(m.I.subarray(0,m.ni));m.I=ni2;}
// quad corners a,b,c,d (order = uv order: a=(u0,v0) b=(u1,v0) c=(u1,v1) d=(u0,v1)),
// ox..oz outward hint for winding, tileMode: uv given raw (block units, fract-tiled)
function emitQuad(m,a,b,c,d,ox,oy,oz,tile,shadeMul,cx,tileMode,rawUV){
  let n0x=(b[0]-a[0]),n0y=(b[1]-a[1]),n0z=(b[2]-a[2]);
  const e2x=(c[0]-a[0]),e2y=(c[1]-a[1]),e2z=(c[2]-a[2]);
  let nx=n0y*e2z-n0z*e2y,ny=n0z*e2x-n0x*e2z,nz=n0x*e2y-n0y*e2x;
  let flip=false;
  if(nx*ox+ny*oy+nz*oz<0){flip=true;nx=-nx;ny=-ny;nz=-nz;}
  const nl=Math.hypot(nx,ny,nz)||1;
  const nX=nx/nl,nY=ny/nl,nZ=nz/nl;
  let uvs;
  if(tileMode)uvs=rawUV;
  else{const[u0,v0,du,dv]=tileRect(tile);
    uvs=[[u0,v0],[u0+du,v0],[u0+du,v0+dv],[u0,v0+dv]];}
  const P4=[a,b,c,d];
  mbGrowV(m,40);mbGrowI(m,6);
  const base=m.n/10;
  for(let k=0;k<4;k++){const p=P4[k],uv=uvs[k];
    m.V[m.n++]=p[0];m.V[m.n++]=p[1];m.V[m.n++]=p[2];
    m.V[m.n++]=uv[0];m.V[m.n++]=uv[1];
    m.V[m.n++]=shadeMul;m.V[m.n++]=cx;
    m.V[m.n++]=nX;m.V[m.n++]=nY;m.V[m.n++]=nZ;}
  if(!flip){m.I[m.ni++]=base;m.I[m.ni++]=base+1;m.I[m.ni++]=base+2;
    m.I[m.ni++]=base;m.I[m.ni++]=base+2;m.I[m.ni++]=base+3;}
  else{m.I[m.ni++]=base;m.I[m.ni++]=base+2;m.I[m.ni++]=base+1;
    m.I[m.ni++]=base;m.I[m.ni++]=base+3;m.I[m.ni++]=base+2;}
  m.quads++;
}
function cornerAt(P,f,ci,cj,r,out){const o=(f*P.CN*P.CN+cj*P.CN+ci)*3;
  out[0]=P.corner[o]*r;out[1]=P.corner[o+1]*r;out[2]=P.corner[o+2]*r;return out;}

// side-face corner pairs per direction (corner grid coords of cell i,j)
function edgeCorners(i,j,d){switch(d){
  case 0:return[[i,j],[i,j+1]];case 1:return[[i+1,j],[i+1,j+1]];
  case 2:return[[i,j],[i+1,j]];case 3:return[[i,j+1],[i+1,j+1]];}}

// ---- static surface mesh (hidden-face culled shell) ----
function buildStatic(P){
  const{N,n2,cols,H,SEA}=P;
  const op=MB(),wa=MB();
  const A=[0,0,0],Bp=[0,0,0],C=[0,0,0],D=[0,0,0];
  for(let col=0;col<cols;col++){
    const f=(col/n2)|0,r0=col-f*n2,j=(r0/N)|0,i=r0-j*N;
    const h=H[col],dx=P.dir[col*3],dy=P.dir[col*3+1],dz=P.dir[col*3+2];
    // top face
    const rt=P.radius(h+1);
    cornerAt(P,f,i,j,rt,A);cornerAt(P,f,i+1,j,rt,Bp);
    cornerAt(P,f,i+1,j+1,rt,C);cornerAt(P,f,i,j+1,rt,D);
    emitQuad(op,A,Bp,C,D,dx,dy,dz,topTile(P,col),1.0,Math.fround(dx*P.rc(h)));
    // ocean water surface
    if(h<SEA-1){
      const rw=P.radius(SEA);
      cornerAt(P,f,i,j,rw,A);cornerAt(P,f,i+1,j,rw,Bp);
      cornerAt(P,f,i+1,j+1,rw,C);cornerAt(P,f,i,j+1,rw,D);
      emitQuad(wa,A,Bp,C,D,dx,dy,dz,T.WATER,1.0,Math.fround(dx*P.rc(SEA-1)));}
    // exposed cliff sides (emitted by the taller column only)
    for(let d=0;d<4;d++){
      const n=neighbor(P,col,d),hn=H[n];
      if(hn>=h)continue;
      const[[c0i,c0j],[c1i,c1j]]=edgeCorners(i,j,d);
      const ox=P.dir[n*3]-dx,oy=P.dir[n*3+1]-dy,oz=P.dir[n*3+2]-dz;
      for(let s=hn+1;s<=h;s++){
        const tile=s===h?sideTile(P,col):(h-s<=3?underTile(P,col):matSolid(P,col,s));
        const ro=P.radius(s+1),ri=P.radius(s);
        cornerAt(P,f,c0i,c0j,ro,A);cornerAt(P,f,c1i,c1j,ro,Bp);
        cornerAt(P,f,c1i,c1j,ri,C);cornerAt(P,f,c0i,c0j,ri,D);
        emitQuad(op,A,Bp,C,D,ox,oy,oz,tile,0.82,Math.fround(dx*P.rc(s)));}
    }
  }
  // trees — grid-aligned world cells (col, shell) from P.treeCells (A.4 fix):
  // faces cull against other tree cells AND terrain, across trees, so adjacent
  // canopies merge instead of interpenetrating. Same face construction as the
  // terrain: radial caps from cell corners, cliff-style side walls.
  const TC=P.treeCells,SH=P.SH;
  for(const[ck,tile]of TC){
    const col=(ck/SH)|0,s=ck-col*SH;
    const f=(col/n2)|0,r0=col-f*n2,j=(r0/N)|0,i=r0-j*N;
    const dx=P.dir[col*3],dy=P.dir[col*3+1],dz=P.dir[col*3+2];
    const cxA=Math.fround(dx*P.rc(s));
    const capTile=tile===T.LOG?T.LOG_TOP:tile;
    const ro=P.radius(s+1),ri=P.radius(s);
    // top cap (radial out)
    if(!TC.has(col*SH+s+1)){
      cornerAt(P,f,i,j,ro,A);cornerAt(P,f,i+1,j,ro,Bp);
      cornerAt(P,f,i+1,j+1,ro,C);cornerAt(P,f,i,j+1,ro,D);
      emitQuad(op,A,Bp,C,D,dx,dy,dz,capTile,1.0,cxA);}
    // bottom cap (radial in) — culled against the tree cell or ground below
    if(!TC.has(col*SH+s-1)&&s-1>H[col]){
      cornerAt(P,f,i,j,ri,A);cornerAt(P,f,i+1,j,ri,Bp);
      cornerAt(P,f,i+1,j+1,ri,C);cornerAt(P,f,i,j+1,ri,D);
      emitQuad(op,A,Bp,C,D,-dx,-dy,-dz,capTile,0.82,cxA);}
    // 4 side walls — culled against neighbor tree cells and neighbor terrain
    for(let d=0;d<4;d++){
      const n=neighbor(P,col,d);
      if(TC.has(n*SH+s)||H[n]>=s)continue;
      const[[c0i,c0j],[c1i,c1j]]=edgeCorners(i,j,d);
      const ox=P.dir[n*3]-dx,oy=P.dir[n*3+1]-dy,oz=P.dir[n*3+2]-dz;
      cornerAt(P,f,c0i,c0j,ro,A);cornerAt(P,f,c1i,c1j,ro,Bp);
      cornerAt(P,f,c1i,c1j,ri,C);cornerAt(P,f,c0i,c0j,ri,D);
      emitQuad(op,A,Bp,C,D,ox,oy,oz,tile,0.82,cxA);}
  }
  return{op,wa};
}

// ---- cutaway cross-section mesh for clip plane x=clip ----
function buildCut(P,clip){
  const{N,n2,cols,H,SEA}=P;
  const op=MB(),wa=MB();
  const clipF=Math.fround(clip);
  const removed=(col,s)=>Math.fround(P.dir[col*3]*P.rc(s))>clipF;
  // effective solid top per column (post cave descent); -1 = fully cut away
  const E=new Int16Array(cols);
  const skmA=new Int16Array(cols);
  for(let col=0;col<cols;col++){
    const h=H[col],dx=P.dir[col*3];
    if(dx<=0||!removed(col,h)){E[col]=h;skmA[col]=32000;continue;}
    // top-most kept shell
    let s=Math.min(h,Math.floor((clip/dx-1)/P.dr+SEA-0.5));
    while(s>=0&&removed(col,s))s--;
    while(s+1<=h&&!removed(col,s+1))s++;
    skmA[col]=s;
    while(s>=0&&mat(P,col,s)<0)s--;   // cave: descend to floor
    E[col]=s;
  }
  const A=[0,0,0],Bp=[0,0,0],C=[0,0,0],D=[0,0,0];
  for(let col=0;col<cols;col++){
    const h=H[col],e=E[col],skm=skmA[col];
    const f=(col/n2)|0,r0=col-f*n2,j=(r0/N)|0,i=r0-j*N;
    const dx=P.dir[col*3],dy=P.dir[col*3+1],dz=P.dir[col*3+2];
    // cap face on truncated columns
    if(e<h&&e>=0){
      const rt=P.radius(e+1),m=matSolid(P,col,e);
      cornerAt(P,f,i,j,rt,A);cornerAt(P,f,i+1,j,rt,Bp);
      cornerAt(P,f,i+1,j+1,rt,C);cornerAt(P,f,i,j+1,rt,D);
      emitQuad(op,A,Bp,C,D,dx,dy,dz,m,m===T.LAVA?1.5:1.0,-10);}
    // water cap where the sea got sliced
    if(h<SEA-1&&skm<SEA-1&&skm>=h+1){
      const rw=P.radius(skm+1);
      cornerAt(P,f,i,j,rw,A);cornerAt(P,f,i+1,j,rw,Bp);
      cornerAt(P,f,i+1,j+1,rw,C);cornerAt(P,f,i,j+1,rw,D);
      emitQuad(wa,A,Bp,C,D,dx,dy,dz,T.WATER,1.0,-10);}
    // step walls: this column's newly-exposed solid flank vs each lower neighbor,
    // only at/below the neighbor's original ground (above it, base cliffs remain)
    for(let d=0;d<4;d++){
      const n=neighbor(P,col,d),en=E[n];
      if(en>=e)continue;
      const hi=Math.min(e,H[n]);
      if(hi<en+1)continue;
      const[[c0i,c0j],[c1i,c1j]]=edgeCorners(i,j,d);
      const ox=P.dir[n*3]-dx,oy=P.dir[n*3+1]-dy,oz=P.dir[n*3+2]-dz;
      for(let s=en+1;s<=hi;s++){
        const tile=matSolid(P,col,s);
        const ro=P.radius(s+1),ri=P.radius(s);
        cornerAt(P,f,c0i,c0j,ro,A);cornerAt(P,f,c1i,c1j,ro,Bp);
        cornerAt(P,f,c1i,c1j,ri,C);cornerAt(P,f,c0i,c0j,ri,D);
        emitQuad(op,A,Bp,C,D,ox,oy,oz,tile,tile===T.LAVA?1.5:0.82,-10);}
    }
  }
  return{op,wa};
}

// ---- lava core ball (fract-tiled lava, fragment-clipped) + cut disc ----
function buildCore(P){
  const PHI=(1+Math.sqrt(5))/2,nm=v=>{const l=Math.hypot(...v);return[v[0]/l,v[1]/l,v[2]/l];};
  let v=[[-1,PHI,0],[1,PHI,0],[-1,-PHI,0],[1,-PHI,0],[0,-1,PHI],[0,1,PHI],
    [0,-1,-PHI],[0,1,-PHI],[PHI,0,-1],[PHI,0,1],[-PHI,0,-1],[-PHI,0,1]].map(nm);
  let f=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],
    [10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],
    [6,2,10],[8,6,7],[9,8,1]];
  for(let s=0;s<3;s++){const mid=new Map(),nf=[];
    const gm=(a,b)=>{const k=a<b?a*65536+b:b*65536+a;if(mid.has(k))return mid.get(k);
      const m=nm([v[a][0]+v[b][0],v[a][1]+v[b][1],v[a][2]+v[b][2]]);v.push(m);
      mid.set(k,v.length-1);return v.length-1;};
    for(const[a,b,c]of f){const ab=gm(a,b),bc=gm(b,c),ca=gm(c,a);
      nf.push([a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca]);}f=nf;}
  const m=MB(),R=P.BALLR,K=1/P.dr;
  for(const[a,b,c]of f){
    const pa=v[a].map(x=>x*R),pb=v[b].map(x=>x*R),pc=v[c].map(x=>x*R);
    // dominant-axis planar UV in block units (fract-tiled in the shader)
    const nx=(v[a][0]+v[b][0]+v[c][0])/3,ny=(v[a][1]+v[b][1]+v[c][1])/3,
          nz=(v[a][2]+v[b][2]+v[c][2])/3;
    const ax=Math.abs(nx),ay=Math.abs(ny),az=Math.abs(nz);
    const uv=p=>ax>=ay&&ax>=az?[p[1]*K,p[2]*K]:(ay>=az?[p[0]*K,p[2]*K]:[p[0]*K,p[1]*K]);
    mbGrowV(m,30);mbGrowI(m,3);
    const base=m.n/10;
    for(const p of[pa,pb,pc]){const u=uv(p);
      m.V[m.n++]=p[0];m.V[m.n++]=p[1];m.V[m.n++]=p[2];
      m.V[m.n++]=u[0];m.V[m.n++]=u[1];m.V[m.n++]=1.5;m.V[m.n++]=-10;
      m.V[m.n++]=p[0]/R;m.V[m.n++]=p[1]/R;m.V[m.n++]=p[2]/R;}
    m.I[m.ni++]=base;m.I[m.ni++]=base+1;m.I[m.ni++]=base+2;m.quads++;
  }
  return m;
}
function buildDisc(P,clip){
  const m=MB();if(clip>=P.BALLR)return m;
  const rd=Math.sqrt(Math.max(0,P.BALLR*P.BALLR-clip*clip)),K=1/P.dr;
  const x0=clip-P.dr*0.05,SEG=48;
  mbGrowV(m,(SEG+2)*10);mbGrowI(m,SEG*3);
  const base=m.n/10;
  m.V[m.n++]=x0;m.V[m.n++]=0;m.V[m.n++]=0;m.V[m.n++]=0;m.V[m.n++]=0;
  m.V[m.n++]=1.5;m.V[m.n++]=-10;m.V[m.n++]=1;m.V[m.n++]=0;m.V[m.n++]=0;
  for(let k=0;k<=SEG;k++){const a=k/SEG*2*Math.PI,y=Math.cos(a)*rd,z=Math.sin(a)*rd;
    m.V[m.n++]=x0;m.V[m.n++]=y;m.V[m.n++]=z;m.V[m.n++]=y*K;m.V[m.n++]=z*K;
    m.V[m.n++]=1.5;m.V[m.n++]=-10;m.V[m.n++]=1;m.V[m.n++]=0;m.V[m.n++]=0;}
  for(let k=0;k<SEG;k++){ // wound to face +x
    m.I[m.ni++]=base;m.I[m.ni++]=base+2+k;m.I[m.ni++]=base+1+k;m.quads++;}
  return m;
}

export{tileRect,MB,emitQuad,buildStatic,buildCut,buildCore,buildDisc};
