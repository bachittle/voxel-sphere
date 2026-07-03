// interact.js — block targeting + edits (B.2). A fine sampling raycast along
// the FP view direction walks (col, shell) cells and records the air cell it
// entered the hit from, which yields the aimed face. main.js refreshes
// `target` every FP frame and renders its outline; dig()/place() consume the
// SAME cached target, so the outlined cell is always the one that breaks.
// (True DDA on a curved cubed-sphere grid isn't worth it — dr/16 sampling at
// 5-block reach is 80 cheap lookups, and faces come free from cell deltas.)
import{world,isSolid}from'./world.js';
import{player,colOf,shellOf}from'./player.js';
import{T,neighbor}from'./worldgen.js';
import{editBlock}from'./chunks.js';
import{cornerAt}from'./mesher.js';

// world position -> cell, or null outside stored shells
export function cellAt(pos){
  const P=world.P,r=Math.hypot(pos[0],pos[1],pos[2]);
  const s=Math.floor((r-1)/P.dr+P.SEA);
  if(s<0||s>=P.SH)return null;
  const l=1/r;
  return{col:colOf([pos[0]*l,pos[1]*l,pos[2]*l]),s};
}
// eye + forward in the planet frame (matches main.js's FP camera)
export function viewRay(){
  const p=player,up=p.dir,P=world.P,eyeR=p.r+1.62*P.dr;
  const cp=Math.cos(p.pitch),sp=Math.sin(p.pitch),h=p.head;
  return{eye:[up[0]*eyeR,up[1]*eyeR,up[2]*eyeR],
         fwd:[h[0]*cp+up[0]*sp,h[1]*cp+up[1]*sp,h[2]*cp+up[2]*sp]};
}
// which face of `hit` was entered from air cell `prev`:
// 'out'/'in' radial caps, 0..3 the lateral neighbor directions, null unknown
function faceFrom(hit,prev){
  if(!prev)return null;
  if(prev.col===hit.col)return prev.s>hit.s?'out':'in';
  if(prev.s===hit.s){const P=world.P;
    for(let d=0;d<4;d++)if(neighbor(P,hit.col,d)===prev.col)return d;}
  return prev.s>hit.s?'out':'in'; // corner crossing: radial wins
}
// first solid cell along the view ray (raycast against *visual* solidity —
// closed caves count as solid, so you target the wall you see, not behind it)
export function raycast(maxBlocks=5){
  const P=world.P,{eye,fwd}=viewRay(),step=P.dr/16,maxT=maxBlocks*P.dr;
  let prev=null;
  for(let t=step;t<=maxT;t+=step){
    const pos=[eye[0]+fwd[0]*t,eye[1]+fwd[1]*t,eye[2]+fwd[2]*t];
    const c=cellAt(pos);
    if(!c)continue;
    if(isSolid(c.col,c.s))return{hit:c,prev,face:faceFrom(c,prev)};
    if(!prev||prev.col!==c.col||prev.s!==c.s)prev=c;
  }
  return null;
}

// ===== per-frame target cache (aimed cell + outline mesh) =====
export const target={cur:null,verts:null};
const EDGES=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],
             [0,4],[1,5],[2,6],[3,7]];
// 12-edge line list of the cell's 8 corners, inflated 2% to dodge z-fighting
export function outlineVerts(cell){
  const P=world.P,{col,s}=cell;
  const f=(col/P.n2)|0,r0=col-f*P.n2,j=(r0/P.N)|0,i=r0-j*P.N;
  const cij=[[i,j],[i+1,j],[i+1,j+1],[i,j+1]],tmp=[0,0,0],pts=[];
  for(const r of[P.radius(s+1),P.radius(s)])
    for(const[ci,cj]of cij){cornerAt(P,f,ci,cj,r,tmp);pts.push([...tmp]);}
  const ctr=[0,0,0];
  for(const p of pts){ctr[0]+=p[0]/8;ctr[1]+=p[1]/8;ctr[2]+=p[2]/8;}
  const v=new Float32Array(72);let o=0;
  for(const[a,b]of EDGES)for(const p of[pts[a],pts[b]])
    for(let k=0;k<3;k++)v[o++]=p[k]+(p[k]-ctr[k])*0.02;
  return v;
}
export function updateTarget(active){
  const r=active?raycast():null;
  const prev=target.cur;
  target.cur=r;
  if(!r){target.verts=null;return;}
  if(!target.verts||!prev||prev.hit.col!==r.hit.col||prev.hit.s!==r.hit.s)
    target.verts=outlineVerts(r.hit);
}

export function dig(){
  const r=target.cur;
  if(!r)return false;
  editBlock(r.hit.col,r.hit.s,-1);
  updateTarget(true);
  return true;
}
export function place(tile=T.STONE){
  const r=target.cur;
  if(!r||!r.prev)return false;
  const pc=colOf(player.dir),ps=shellOf(player.r+1e-9);
  if(r.prev.col===pc&&(r.prev.s===ps||r.prev.s===ps+1))return false; // inside player
  editBlock(r.prev.col,r.prev.s,tile);
  updateTarget(true);
  return true;
}
