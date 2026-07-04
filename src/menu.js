// menu.js — ESC pause/settings menu + debug-panel visibility (B.4).
// Real pause: the frame loop keeps rendering but time and the player freeze
// while S.paused (decided 2026-07-03). The backtick debug panel does NOT pause.
import{S}from'./state.js';
import{canvas}from'./gl.js';
import{SET,saveSettings,inputMode}from'./settings.js';
import{exportFile,shareURL,validSave}from'./persistence.js';

const menuEl=document.getElementById('menu');
const uiEl=document.getElementById('ui');
let debugShown=false;   // desktop: hidden until backtick; touch: always shown

export function menuOpen(){return!menuEl.classList.contains('off');}
export function openMenu(){
  if(menuOpen())return;
  menuEl.classList.remove('off');S.paused=true;
  if(document.pointerLockElement)document.exitPointerLock();}
export function closeMenu(){
  menuEl.classList.add('off');S.paused=false;
  // re-capture on resume; may be rejected by the browser's ESC cooldown —
  // clicking the canvas re-locks (input.js), so a silent failure is fine
  if(S.mode==='fp'&&inputMode()==='desktop')
    canvas.requestPointerLock?.()?.catch?.(()=>{});}
export function toggleDebug(){debugShown=!debugShown;applyInputMode();}

// desktop: hide touch FABs + debug panel (backtick reveals); touch: show both
export function applyInputMode(){
  const m=inputMode();
  document.body.classList.toggle('desktop',m==='desktop');
  uiEl.classList.toggle('hidden',m==='desktop'&&!debugShown);}

// ===== settings bindings =====
const sens=document.getElementById('mSens'),sensV=document.getElementById('mSensV');
const inv=document.getElementById('mInv');
const fov=document.getElementById('mFov'),fovV=document.getElementById('mFovV');
const inp=document.getElementById('mInput');
const seedI=document.getElementById('mSeed'),sizeI=document.getElementById('mSize');
function reflect(){
  sens.value=Math.round(SET.sens*100);sensV.textContent=SET.sens.toFixed(2)+'×';
  inv.checked=SET.invertY;
  fov.value=SET.fov;fovV.textContent=SET.fov+'°';
  inp.value=SET.input;
  sizeI.value=String(SET.worldN);}
sens.addEventListener('input',()=>{SET.sens=sens.value/100;
  sensV.textContent=SET.sens.toFixed(2)+'×';saveSettings();});
inv.addEventListener('change',()=>{SET.invertY=inv.checked;saveSettings();});
fov.addEventListener('input',()=>{SET.fov=+fov.value;
  fovV.textContent=SET.fov+'°';saveSettings();});
inp.addEventListener('change',()=>{SET.input=inp.value;saveSettings();
  applyInputMode();});
document.getElementById('mResume').addEventListener('click',closeMenu);

// ===== world save/share (B.5) — regenerate lives in main.js, reached by event
const statusEl=document.getElementById('mStatus');
const status=m=>{statusEl.textContent=m;setTimeout(()=>{
  if(statusEl.textContent===m)statusEl.textContent='';},4000);};
document.getElementById('mExport').addEventListener('click',()=>{
  exportFile();status('save downloaded');});
document.getElementById('mShare').addEventListener('click',()=>{
  const url=shareURL();
  if(url.length>8000){status('too many edits for a link — use export');return;}
  navigator.clipboard.writeText(url)
    .then(()=>status('link copied'))
    .catch(()=>status('clipboard blocked — use export'));});
document.getElementById('mReset').addEventListener('click',()=>{
  window.dispatchEvent(new CustomEvent('vs-reset'));status('world reset');});
// world shaping (E.2): seed + size regenerate; each (seed,N) keeps its own save
const reshape=()=>window.dispatchEvent(new CustomEvent('vs-world',
  {detail:{seed:+seedI.value,N:+sizeI.value}}));
seedI.addEventListener('change',reshape);
// E.8: 512 warns and proceeds; 1024 must be selected twice (arm-to-confirm)
let armT=0;
sizeI.addEventListener('change',()=>{
  const N=+sizeI.value;
  if(N===1024&&Date.now()-armT>15000){
    armT=Date.now();
    sizeI.value=String(SET.worldN);
    status('⚠ 1024 is experimental: long freeze + heavy memory. Select it again to confirm.');
    return;}
  if(N>=512)status(N===512?'huge world — generating takes a few seconds…'
                          :'⚠ colossal world — hold on, this will freeze for a while…');
  reshape();});
document.getElementById('mDice').addEventListener('click',()=>{
  seedI.value=(Math.random()*1e6)|0;reshape();});
export function reflectWorld(seed,N){seedI.value=seed;sizeI.value=String(N);}
const fileEl=document.getElementById('mFile');
document.getElementById('mImport').addEventListener('click',()=>fileEl.click());
fileEl.addEventListener('change',async()=>{
  const f=fileEl.files[0];fileEl.value='';
  if(!f)return;
  try{
    // bug fix rode along with v3: this used to demand v===1, so every v2
    // export failed to import; persistence's validator is the one truth now
    const d=validSave(JSON.parse(await f.text()));
    if(!d)throw 0;
    window.dispatchEvent(new CustomEvent('vs-import',{detail:d}));
    status('imported seed '+d.seed);
  }catch(e){status('not a voxel-sphere save');}});

reflect();applyInputMode();
