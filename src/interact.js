// interact.js — throwaway pre-B.2 block interaction: a sampling raycast along
// the FP view direction, click = dig, right-click = place. B.2 replaces this
// with a proper voxel DDA + targeted-face highlight; keep this dumb.
import{world,isSolid}from'./world.js';
import{player,colOf,shellOf}from'./player.js';
import{T}from'./worldgen.js';
import{editBlock}from'./chunks.js';

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
// first solid cell along the view ray (raycast against *visual* solidity —
// closed caves count as solid, so you dig the wall you see, not behind it)
export function raycast(maxBlocks=5){
  const P=world.P,{eye,fwd}=viewRay(),step=P.dr/8,maxT=maxBlocks*P.dr;
  let prev=null;
  for(let t=step;t<=maxT;t+=step){
    const pos=[eye[0]+fwd[0]*t,eye[1]+fwd[1]*t,eye[2]+fwd[2]*t];
    const c=cellAt(pos);
    if(!c)continue;
    if(isSolid(c.col,c.s))return{hit:c,prev};
    if(!prev||prev.col!==c.col||prev.s!==c.s)prev=c;
  }
  return null;
}
export function dig(){
  const r=raycast();
  if(!r)return false;
  editBlock(r.hit.col,r.hit.s,-1);
  return true;
}
export function place(tile=T.STONE){
  const r=raycast();
  if(!r||!r.prev)return false;
  const pc=colOf(player.dir),ps=shellOf(player.r+1e-9);
  if(r.prev.col===pc&&(r.prev.s===ps||r.prev.s===ps+1))return false; // inside player
  editBlock(r.prev.col,r.prev.s,tile);
  return true;
}
