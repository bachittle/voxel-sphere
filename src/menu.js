// menu.js — ESC pause/settings menu + debug-panel visibility (B.4).
// Real pause: the frame loop keeps rendering but time and the player freeze
// while S.paused (decided 2026-07-03). The backtick debug panel does NOT pause.
import{S}from'./state.js';
import{canvas}from'./gl.js';
import{SET,saveSettings,inputMode}from'./settings.js';

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
function reflect(){
  sens.value=Math.round(SET.sens*100);sensV.textContent=SET.sens.toFixed(2)+'×';
  inv.checked=SET.invertY;
  fov.value=SET.fov;fovV.textContent=SET.fov+'°';
  inp.value=SET.input;}
sens.addEventListener('input',()=>{SET.sens=sens.value/100;
  sensV.textContent=SET.sens.toFixed(2)+'×';saveSettings();});
inv.addEventListener('change',()=>{SET.invertY=inv.checked;saveSettings();});
fov.addEventListener('input',()=>{SET.fov=+fov.value;
  fovV.textContent=SET.fov+'°';saveSettings();});
inp.addEventListener('change',()=>{SET.input=inp.value;saveSettings();
  applyInputMode();});
document.getElementById('mResume').addEventListener('click',closeMenu);
reflect();applyInputMode();
