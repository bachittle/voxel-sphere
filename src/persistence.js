// persistence.js — B.5: a save is seed + edit deltas, nothing else.
// localStorage first (automatic, per-seed), export/import JSON file second,
// small saves ride a URL fragment (#save=...). Kept behind this narrow
// interface so a someday-server slots in without touching callers.
// openMask isn't saved: re-flooding every dig edit rebuilds it exactly.
import{world,setBlock,revealFrom}from'./world.js';

const key=seed=>'vs-save-'+seed;
export function serialize(){
  return JSON.stringify({v:1,seed:world.seed,edits:[...world.edits]});}

export function saveDeltas(){
  try{if(world.edits.size)localStorage.setItem(key(world.seed),serialize());
    else localStorage.removeItem(key(world.seed));}catch(e){}}

// apply a save's edits onto a freshly generated world.P of the same seed
export function applyDeltas(edits){
  const P=world.P;
  for(const[k,t]of edits){const col=(k/P.SH)|0,s=k-col*P.SH;setBlock(col,s,t);}
  for(const[k,t]of edits)if(t<0){const col=(k/P.SH)|0,s=k-col*P.SH;revealFrom(col,s);}
}
export function loadDeltas(seed){
  try{const raw=localStorage.getItem(key(seed));
    if(!raw)return false;
    const d=JSON.parse(raw);
    if(d.v!==1||d.seed!==seed||!Array.isArray(d.edits))return false;
    applyDeltas(d.edits);return true;
  }catch(e){return false;}}
export function clearSave(seed){try{localStorage.removeItem(key(seed));}catch(e){}}

// ---- sharing ----
export function exportFile(){
  const blob=new Blob([serialize()],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='voxel-sphere-'+world.seed+'.json';
  a.click();URL.revokeObjectURL(a.href);}
export function shareURL(){
  return location.origin+location.pathname+'#save='+btoa(serialize());}
export function fragmentSave(){ // {seed,edits} if the URL carries a save
  const m=location.hash.match(/^#save=(.+)$/);
  if(!m)return null;
  try{const d=JSON.parse(atob(m[1]));
    return d.v===1&&Array.isArray(d.edits)?d:null;}catch(e){return null;}}
