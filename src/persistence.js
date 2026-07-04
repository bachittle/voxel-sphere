// persistence.js — B.5: a save is seed + edit deltas, nothing else.
// localStorage first (automatic, per-seed), export/import JSON file second,
// small saves ride a URL fragment (#save=...). Kept behind this narrow
// interface so a someday-server slots in without touching callers.
// openMask isn't saved: re-flooding every dig edit rebuilds it exactly.
import{world,setBlock,revealFrom}from'./world.js';

// v2 (E.2): a save records (seed, N) — edit keys encode column indices,
// which depend on N, so a save only loads into a matching world. v1 saves
// (pre-2026-07-03) are read as N=128, the only size that existed.
// v3 (F.1/F.2): adds world `type` ('earth'/'desert' — the moon keys its own
// saves) and the parked ship {pos,fwd,up}; both optional, older saves read
// as earth/no-ship.
const key=(seed,N,type)=>'vs-save-'+seed+(N===128&&type==='earth'?'':':'+N)+
  (type==='earth'?'':':'+type);
export const validSave=d=>{
  if(!d||!Array.isArray(d.edits))return null;
  if(d.v===1){d.N=128;d.type='earth';return d;}
  if(d.v===2||d.v===3){d.type=d.type||'earth';return d;}
  return null;};
export function serialize(){
  const o={v:3,seed:world.seed,N:world.P.N,type:world.type,edits:[...world.edits]};
  if(world.ship)o.ship=world.ship;
  return JSON.stringify(o);}

export function saveDeltas(){
  try{const k=key(world.seed,world.P.N,world.type);
    if(world.edits.size||world.ship)localStorage.setItem(k,serialize());
    else localStorage.removeItem(k);}catch(e){}}

// apply a save's edits onto a freshly generated world.P of the same seed
export function applyDeltas(edits){
  const P=world.P;
  for(const[k,t]of edits){const col=(k/P.SH)|0,s=k-col*P.SH;setBlock(col,s,t);}
  for(const[k,t]of edits)if(t<0){const col=(k/P.SH)|0,s=k-col*P.SH;revealFrom(col,s);}
}
export function applySave(d){ // edits + parked ship from a validSave()'d blob
  applyDeltas(d.edits);
  if(d.ship)world.ship=d.ship;
}
export function loadDeltas(seed){
  try{const raw=localStorage.getItem(key(seed,world.P.N,world.type));
    if(!raw)return false;
    const d=validSave(JSON.parse(raw));
    if(!d||d.seed!==seed||d.N!==world.P.N||d.type!==world.type)return false;
    applySave(d);return true;
  }catch(e){return false;}}
export function clearSave(seed){
  try{localStorage.removeItem(key(seed,world.P.N,world.type));}catch(e){}}

// ---- sharing ----
export function exportFile(){
  const blob=new Blob([serialize()],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='voxel-sphere-'+world.seed+'.json';
  a.click();URL.revokeObjectURL(a.href);}
export function shareURL(){
  return location.origin+location.pathname+'#save='+btoa(serialize());}
export function fragmentSave(){ // {seed,N,type,edits,ship?} if the URL carries a save
  const m=location.hash.match(/^#save=(.+)$/);
  if(!m)return null;
  try{return validSave(JSON.parse(atob(m[1])));}catch(e){return null;}}
