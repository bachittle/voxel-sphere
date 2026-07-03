// settings.js — user preferences persisted to localStorage under 'vs-settings'
// (B.4). Deliberately separate from world saves (B.5): these are knobs, not
// world state. localStorage-first is the project's persistence principle.
export const SET={sens:1,invertY:false,fov:66,input:'auto'};
const KEY='vs-settings';
try{Object.assign(SET,JSON.parse(localStorage.getItem(KEY)||'{}'));}catch(e){}
export function saveSettings(){
  try{localStorage.setItem(KEY,JSON.stringify(SET));}catch(e){}}
// effective input mode: explicit override wins, else pointer heuristic
export function inputMode(){
  if(SET.input==='desktop'||SET.input==='touch')return SET.input;
  return matchMedia('(pointer: coarse)').matches?'touch':'desktop';
}
