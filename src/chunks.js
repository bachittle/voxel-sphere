// chunks.js — B.1 mutable chunks: the planet cut into CS×CS column tiles per
// cube face (full depth), each meshed independently and re-meshed when edited.
// Pure (no GL) so node tests can drive it; main.js owns upload/draw.
//
// Meshing is mask-based: each column gets a 96-bit solidity mask (SH=84 fits
// in 3 words) = natural terrain 0..H, minus open caves, plus tree cells, then
// edits applied on top. A face exists wherever a solid bit meets an air bit —
// laterally against the 4 neighbor columns (neighbor() already handles cube-
// face seams), radially against the shifted mask. Structurally hole-free:
// closed caves are *in* the mask (solid), so nothing is culled against
// invisible air; the unedited world meshes to the same face set as Build 1.
import{T,neighbor,matSolid,topTile,sideTile}from'./worldgen.js';
import{world,setBlock,revealFrom}from'./world.js';
import{MB,emitQuad,cornerAt,edgeCorners}from'./mesher.js';

export const CS=16;                    // chunk = CS×CS columns × all shells
export const numChunks=P=>6*(P.N/CS)*(P.N/CS);
export function chunkOfCol(P,col){
  const f=(col/P.n2)|0,r=col-f*P.n2,j=(r/P.N)|0,i=r-j*P.N,M=P.N/CS;
  return f*M*M+((j/CS)|0)*M+((i/CS)|0);}

// per-planet caches: fill-mask LUT + tree cells grouped per column
let FILL=null,treeMasks=null;
export function initChunks(P){
  if(P.N%CS)throw new Error('N must be a multiple of CS');
  FILL=new Uint32Array(P.SH*3);
  for(let h=0;h<P.SH;h++)for(let wi=0;wi<3;wi++){
    const lo=wi*32;
    FILL[h*3+wi]=h>=lo+31?0xFFFFFFFF:(h<lo?0:((1<<(h-lo+1))-1))>>>0;}
  treeMasks=new Map();
  for(const ck of P.treeCells.keys()){
    const col=(ck/P.SH)|0,s=ck-col*P.SH;
    let m=treeMasks.get(col);
    if(!m){m=new Uint32Array(3);treeMasks.set(col,m);}
    m[s>>>5]|=1<<(s&31);}
}

// 96-bit solidity mask for a column, written into w (Uint32Array(3))
export function solidMask(P,col,w){
  const o=P.H[col]*3;
  w[0]=FILL[o];w[1]=FILL[o+1];w[2]=FILL[o+2];
  const om=world.openMask.get(col);
  if(om){w[0]&=~om[0];w[1]&=~om[1];w[2]&=~om[2];}
  const tm=treeMasks.get(col);
  if(tm){w[0]|=tm[0];w[1]|=tm[1];w[2]|=tm[2];}
  const ec=world.editsByCol.get(col);
  if(ec)for(const[s,t]of ec){const wi=s>>>5,b=1<<(s&31);
    // glass & torch are non-occluding (B.3): out of the mask so the terrain
    // behind them still meshes; they emit their own geometry in buildChunk
    if(t<0||t===T.GLASS||t===T.TORCH)w[wi]&=~b;else w[wi]|=b;}
}
const bit=(m,s)=>(m[s>>>5]&(1<<(s&31)))!==0;
const glassAt=(col,s)=>{const ec=world.editsByCol.get(col);
  return ec!==undefined&&ec.get(s)===T.GLASS;};

// explicit tile if the (solid) cell is an edit or tree cell, else -1 (natural)
function ovTile(P,col,s){
  const ec=world.editsByCol.get(col);
  if(ec){const e=ec.get(s);if(e!==undefined)return e;}
  if(s>P.H[col]){const t=P.treeCells.get(col*P.SH+s);return t===undefined?-1:t;}
  return -1;
}

// ---- chunk mesh: same quad construction as Build 1's buildStatic ----
export function buildChunk(P,id){
  const M=P.N/CS,f=(id/(M*M))|0,rr=id-f*M*M,cy=(rr/M)|0,cx0=rr-cy*M;
  const{N,n2,SEA,SH}=P;
  const op=MB(),wa=MB();
  const A=[0,0,0],Bp=[0,0,0],C=[0,0,0],D=[0,0,0];
  const w=new Uint32Array(3),nw=new Uint32Array(4*3);
  for(let lj=0;lj<CS;lj++)for(let li=0;li<CS;li++){
    const i=cx0*CS+li,j=cy*CS+lj,col=f*n2+j*N+i;
    const h=P.H[col],dx=P.dir[col*3],dy=P.dir[col*3+1],dz=P.dir[col*3+2];
    solidMask(P,col,w);
    // ocean surface (static until S.2 fluid flow)
    if(h<SEA-1){
      const rw=P.radius(SEA);
      cornerAt(P,f,i,j,rw,A);cornerAt(P,f,i+1,j,rw,Bp);
      cornerAt(P,f,i+1,j+1,rw,C);cornerAt(P,f,i,j+1,rw,D);
      emitQuad(wa,A,Bp,C,D,dx,dy,dz,T.WATER,1.0,Math.fround(dx*P.rc(SEA-1)));}
    // radial caps: up-face where solid(s) && !solid(s+1), down-face vs s-1
    // (below shell 0 counts as solid — nothing faces the core ball)
    const up0=w[0]&~((w[0]>>>1)|(w[1]<<31)),
          up1=w[1]&~((w[1]>>>1)|(w[2]<<31)),
          up2=w[2]&~(w[2]>>>1);
    const dn0=w[0]&~((w[0]<<1)|1),
          dn1=w[1]&~((w[1]<<1)|(w[0]>>>31)),
          dn2=w[2]&~((w[2]<<1)|(w[1]>>>31));
    for(let wi=0;wi<3;wi++){
      let bits=wi===0?up0:wi===1?up1:up2;
      while(bits){
        const b=bits&-bits;bits=(bits^b)>>>0;
        const s=wi*32+31-Math.clz32(b);
        const t=ovTile(P,col,s);
        const tile=t>=0?(t===T.LOG?T.LOG_TOP:t):(s===h?topTile(P,col):matSolid(P,col,s));
        const ro=P.radius(s+1);
        cornerAt(P,f,i,j,ro,A);cornerAt(P,f,i+1,j,ro,Bp);
        cornerAt(P,f,i+1,j+1,ro,C);cornerAt(P,f,i,j+1,ro,D);
        emitQuad(op,A,Bp,C,D,dx,dy,dz,tile,tile===T.LAVA?1.5:1.0,Math.fround(dx*P.rc(s)));}
      bits=wi===0?dn0:wi===1?dn1:dn2;
      while(bits){
        const b=bits&-bits;bits=(bits^b)>>>0;
        const s=wi*32+31-Math.clz32(b);
        const t=ovTile(P,col,s);
        const tile=t>=0?(t===T.LOG?T.LOG_TOP:t):matSolid(P,col,s);
        const ri=P.radius(s);
        cornerAt(P,f,i,j,ri,A);cornerAt(P,f,i+1,j,ri,Bp);
        cornerAt(P,f,i+1,j+1,ri,C);cornerAt(P,f,i,j+1,ri,D);
        emitQuad(op,A,Bp,C,D,-dx,-dy,-dz,tile,tile===T.LAVA?1.5:0.82,Math.fround(dx*P.rc(s)));}
    }
    // side walls vs the 4 lateral neighbors (each cell emits its own faces,
    // so seams between chunks/cube faces need no coordination)
    for(let d=0;d<4;d++){
      const n=neighbor(P,col,d),nm=nw.subarray(d*3,d*3+3);
      solidMask(P,n,nm);
      const ox=P.dir[n*3]-dx,oy=P.dir[n*3+1]-dy,oz=P.dir[n*3+2]-dz;
      const[[c0i,c0j],[c1i,c1j]]=edgeCorners(i,j,d);
      for(let wi=0;wi<3;wi++){
        let bits=w[wi]&~nm[wi];
        while(bits){
          const b=bits&-bits;bits=(bits^b)>>>0;
          const s=wi*32+31-Math.clz32(b);
          const t=ovTile(P,col,s);
          const tile=t>=0?t:(s===h?sideTile(P,col):matSolid(P,col,s));
          const ro=P.radius(s+1),ri=P.radius(s);
          cornerAt(P,f,c0i,c0j,ro,A);cornerAt(P,f,c1i,c1j,ro,Bp);
          cornerAt(P,f,c1i,c1j,ri,C);cornerAt(P,f,c0i,c0j,ri,D);
          emitQuad(op,A,Bp,C,D,ox,oy,oz,tile,tile===T.LAVA?1.5:0.82,Math.fround(dx*P.rc(s)));}
      }
    }
    // non-occluding edit blocks (B.3): glass cubes + torch cross-sprites.
    // These sit outside the solidity mask, so they emit their own geometry
    // here; w / nw above still hold this column's and its neighbors' masks.
    const ec=world.editsByCol.get(col);
    if(ec)for(const[s,t]of ec){
      if(t!==T.GLASS&&t!==T.TORCH)continue;
      const ro=P.radius(s+1),ri=P.radius(s),cxv=Math.fround(dx*P.rc(s));
      if(t===T.GLASS){
        // radial caps, culled against solid or glass above/below
        if(s+1>=SH||(!bit(w,s+1)&&!glassAt(col,s+1))){
          cornerAt(P,f,i,j,ro,A);cornerAt(P,f,i+1,j,ro,Bp);
          cornerAt(P,f,i+1,j+1,ro,C);cornerAt(P,f,i,j+1,ro,D);
          emitQuad(op,A,Bp,C,D,dx,dy,dz,T.GLASS,1.0,cxv);}
        if(s-1<0||(!bit(w,s-1)&&!glassAt(col,s-1))){
          cornerAt(P,f,i,j,ri,A);cornerAt(P,f,i+1,j,ri,Bp);
          cornerAt(P,f,i+1,j+1,ri,C);cornerAt(P,f,i,j+1,ri,D);
          emitQuad(op,A,Bp,C,D,-dx,-dy,-dz,T.GLASS,0.82,cxv);}
        // 4 sides, culled against solid or glass neighbors
        for(let d=0;d<4;d++){
          const n=neighbor(P,col,d),nm=nw.subarray(d*3,d*3+3);
          if(bit(nm,s)||glassAt(n,s))continue;
          const ox=P.dir[n*3]-dx,oy=P.dir[n*3+1]-dy,oz=P.dir[n*3+2]-dz;
          const[[c0i,c0j],[c1i,c1j]]=edgeCorners(i,j,d);
          cornerAt(P,f,c0i,c0j,ro,A);cornerAt(P,f,c1i,c1j,ro,Bp);
          cornerAt(P,f,c1i,c1j,ri,C);cornerAt(P,f,c0i,c0j,ri,D);
          emitQuad(op,A,Bp,C,D,ox,oy,oz,T.GLASS,0.82,cxv);}
      }else{
        // torch: two diagonal quads, each emitted both-sided (CULL_FACE on)
        const q=(ai,aj,bi,bj)=>{
          cornerAt(P,f,ai,aj,ro,A);cornerAt(P,f,bi,bj,ro,Bp);
          cornerAt(P,f,bi,bj,ri,C);cornerAt(P,f,ai,aj,ri,D);
          const e1=[Bp[0]-A[0],Bp[1]-A[1],Bp[2]-A[2]],
                e2=[C[0]-A[0],C[1]-A[1],C[2]-A[2]],
                n=[e1[1]*e2[2]-e1[2]*e2[1],e1[2]*e2[0]-e1[0]*e2[2],
                   e1[0]*e2[1]-e1[1]*e2[0]];
          emitQuad(op,A,Bp,C,D,n[0],n[1],n[2],T.TORCH,1.0,cxv);
          emitQuad(op,A,Bp,C,D,-n[0],-n[1],-n[2],T.TORCH,1.0,cxv);};
        q(i,j,i+1,j+1);q(i+1,j,i,j+1);
      }
    }
  }
  return{op,wa};
}

// ---- edits → dirty chunks ----
export const dirty=new Set();
function dirtyAround(P,col){
  dirty.add(chunkOfCol(P,col));
  for(let d=0;d<4;d++)dirty.add(chunkOfCol(P,neighbor(P,col,d)));
}
// the one entry point for changing a block: applies the edit, floods any
// adjoining cave pocket open, and marks every affected chunk dirty
export function editBlock(col,s,tile){
  const P=world.P;
  setBlock(col,s,tile);
  dirtyAround(P,col);
  if(tile<0)for(const ck of revealFrom(col,s))dirtyAround(P,(ck/P.SH)|0);
}
