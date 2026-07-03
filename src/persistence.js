// persistence.js — B.5: a save is seed + edit deltas, nothing else.
// localStorage first (automatic, per-seed), export/import JSON file second,
// small saves ride a URL fragment (#save=...). Kept behind this narrow
// interface so a someday-server slots in without touching callers.
// openMask isn't saved: re-flooding every dig edit rebuilds it exactly.
import{world,setBlock,revealFrom}from'./world.js';

// v2 (E.2): a save records (seed, N) — edit keys encode column indices,
// which depend on N, so a save only loads into a matching world. v1 saves
// (pre-2026-07-03) are read as N=128, the only size that existed.
const key=(seed,N)=>N===128?'vs-save-'+seed:'vs-save-'+seed+':'+N;
const compat=d=>d&&Array.isArray(d.edits)&&
  (d.v===2||(d.v===1&&(d.N=128)))?d:null;
export function serialize(){
  return JSON.stringify({v:2,seed:world.seed,N:world.P.N,edits:[...world.edits]});}

export function saveDeltas(){
  try{if(world.edits.size)localStorage.setItem(key(world.seed,world.P.N),serialize());
    else localStorage.removeItem(key(world.seed,world.P.N));}catch(e){}}

// apply a save's edits onto a freshly generated world.P of the same seed
export function applyDeltas(edits){
  const P=world.P;
  for(const[k,t]of edits){const col=(k/P.SH)|0,s=k-col*P.SH;setBlock(col,s,t);}
  for(const[k,t]of edits)if(t<0){const col=(k/P.SH)|0,s=k-col*P.SH;revealFrom(col,s);}
}
export function loadDeltas(seed){
  try{const N=world.P.N;
    const raw=localStorage.getItem(key(seed,N))||
              (N===128?localStorage.getItem('vs-save-'+seed):null);
    if(!raw)return false;
    const d=compat(JSON.parse(raw));
    if(!d||d.seed!==seed||d.N!==N)return false;
    applyDeltas(d.edits);return true;
  }catch(e){return false;}}
export function clearSave(seed){
  try{localStorage.removeItem(key(seed,world.P.N));}catch(e){}}

// ---- sharing ----
export function exportFile(){
  const blob=new Blob([serialize()],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='voxel-sphere-'+world.seed+'.json';
  a.click();URL.revokeObjectURL(a.href);}
export function shareURL(){
  return location.origin+location.pathname+'#save='+btoa(serialize());}
export function fragmentSave(){ // {seed,N,edits} if the URL carries a save
  const m=location.hash.match(/^#save=(.+)$/);
  if(!m)return null;
  try{return compat(JSON.parse(atob(m[1])));}catch(e){return null;}}
