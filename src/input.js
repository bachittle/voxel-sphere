// input.js — all input wiring: orbital mouse/touch camera, FP look, keyboard,
// touch joystick + jump/down/fly buttons, and orbit<->FP mode switching.
// Side-effect module: import once from main.js.
import{S}from'./state.js';
import{canvas}from'./gl.js';
import{world}from'./world.js';
import{player,move,fpLook,groundR}from'./player.js';
import{dig,place}from'./interact.js';
import{vnorm,clampf,rotYv}from'./math.js';

// ===== camera (orbital controls identical to demo.html; drag = look in FP) ====
// In FP a click that barely moved = dig (throwaway pre-B.2 interaction);
// a drag = look. Right-click = place.
let lx=0,ly=0,downT=0,moved=1e9;
canvas.addEventListener('mousedown',e=>{S.drag=true;lx=e.clientX;ly=e.clientY;
  downT=performance.now();moved=0;});
window.addEventListener('mouseup',e=>{S.drag=false;
  if(S.mode==='fp'&&e.button===0&&moved<5&&performance.now()-downT<300)dig();
  moved=1e9;});
canvas.addEventListener('contextmenu',e=>{e.preventDefault();
  if(S.mode==='fp'&&moved<5)place();});
window.addEventListener('mousemove',e=>{if(!S.drag)return;
  const dx=e.clientX-lx,dy=e.clientY-ly;lx=e.clientX;ly=e.clientY;
  moved+=Math.abs(dx)+Math.abs(dy);
  if(S.mode==='fp'){fpLook(dx,dy);return;}
  S.yaw+=dx*0.01;S.pitch=Math.max(-1.5,Math.min(1.5,S.pitch+dy*0.01));});
canvas.addEventListener('wheel',e=>{e.preventDefault();if(S.mode==='fp')return;
  S.dist=Math.max(1.6,Math.min(9,S.dist*(1+e.deltaY*0.001)));},{passive:false});

// touch on canvas: orbital = rotate/pan/pinch · FP = look (joystick is separate)
let pinch=0,cx=0,cy=0;
function tdist(t){const dx=t[0].clientX-t[1].clientX,dy=t[0].clientY-t[1].clientY;
  return Math.hypot(dx,dy);}
function tcen(t){return[(t[0].clientX+t[1].clientX)/2,(t[0].clientY+t[1].clientY)/2];}
canvas.addEventListener('touchstart',e=>{e.preventDefault();const t=e.touches;
  if(t.length===1){S.drag=true;lx=t[0].clientX;ly=t[0].clientY;}
  else if(t.length===2){S.drag=false;pinch=tdist(t);[cx,cy]=tcen(t);}},{passive:false});
canvas.addEventListener('touchmove',e=>{e.preventDefault();const t=e.touches;
  if(t.length===1&&S.drag){const dx=t[0].clientX-lx,dy=t[0].clientY-ly;
    lx=t[0].clientX;ly=t[0].clientY;
    if(S.mode==='fp'){fpLook(dx,dy);return;}
    S.yaw+=dx*0.01;S.pitch=Math.max(-1.5,Math.min(1.5,S.pitch+dy*0.01));}
  else if(t.length===2&&S.mode==='orbit'){const d=tdist(t),[nx,ny]=tcen(t);
    if(pinch)S.dist=Math.max(1.6,Math.min(9,S.dist*(pinch/d)));
    S.panX+=(nx-cx)*S.dist*0.002;S.panY-=(ny-cy)*S.dist*0.002;
    pinch=d;cx=nx;cy=ny;}},{passive:false});
canvas.addEventListener('touchend',e=>{S.drag=false;pinch=0;
  if(e.touches.length===1){S.drag=true;lx=e.touches[0].clientX;ly=e.touches[0].clientY;}});

// keyboard (FP movement + fly toggle)
window.addEventListener('keydown',e=>{if(e.target.tagName==='INPUT')return;
  move.KEY[e.code]=true;
  if(S.mode==='fp'){
    if(e.code==='KeyF')toggleFly();
    if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))
      e.preventDefault();}});
window.addEventListener('keyup',e=>{move.KEY[e.code]=false;});

// touch joystick (movement) + jump / down / fly buttons
const joyEl=document.getElementById('joy'),joyK=document.getElementById('joyk');
let joyId=null;
function joySet(t){const r=joyEl.getBoundingClientRect();
  let dx=(t.clientX-(r.left+r.width/2))/(r.width/2),
      dy=(t.clientY-(r.top+r.height/2))/(r.height/2);
  const l=Math.hypot(dx,dy);if(l>1){dx/=l;dy/=l;}
  move.joyX=dx;move.joyY=-dy;
  joyK.style.transform=`translate(${dx*34}px,${dy*34}px)`;}
function joyEnd(){joyId=null;move.joyX=move.joyY=0;joyK.style.transform='';}
joyEl.addEventListener('touchstart',e=>{e.preventDefault();e.stopPropagation();
  const t=e.changedTouches[0];joyId=t.identifier;joySet(t);},{passive:false});
joyEl.addEventListener('touchmove',e=>{e.preventDefault();e.stopPropagation();
  for(const t of e.changedTouches)if(t.identifier===joyId)joySet(t);},{passive:false});
joyEl.addEventListener('touchend',e=>{e.preventDefault();joyEnd();},{passive:false});
joyEl.addEventListener('touchcancel',joyEnd);
joyEl.addEventListener('mousedown',e=>{e.preventDefault();joyId='m';joySet(e);
  const mv=ev=>{if(joyId==='m')joySet(ev);},
        upv=()=>{joyEnd();window.removeEventListener('mousemove',mv);
                 window.removeEventListener('mouseup',upv);};
  window.addEventListener('mousemove',mv);window.addEventListener('mouseup',upv);});
function hold(el,set){ // press-and-hold buttons (touch + mouse)
  el.addEventListener('touchstart',e=>{e.preventDefault();set(true);},{passive:false});
  el.addEventListener('touchend',e=>{e.preventDefault();set(false);},{passive:false});
  el.addEventListener('touchcancel',()=>set(false));
  el.addEventListener('mousedown',e=>{e.preventDefault();set(true);});
  window.addEventListener('mouseup',()=>set(false));}
hold(document.getElementById('btnJump'),v=>move.jumpHeld=v);
hold(document.getElementById('btnDown'),v=>move.downHeld=v);
function toggleFly(){player.fly=!player.fly;player.vr=0;
  document.body.classList.toggle('fly',player.fly);}
document.getElementById('btnFly').addEventListener('click',toggleFly);

// mode switching: FP spawns at the point under the orbital camera and back
const modeBtn=document.getElementById('modeBtn'),hintEl=document.getElementById('hint');
function enterFP(){
  const dW=[-Math.sin(S.yaw)*Math.cos(S.pitch),Math.sin(S.pitch),Math.cos(S.yaw)*Math.cos(S.pitch)];
  const d=vnorm(rotYv(dW,-S.theta));     // planet-frame point facing the camera
  player.dir=d;player.r=groundR(d);player.vr=0;player.pitch=0;
  player.grounded=true;player.fly=false;document.body.classList.remove('fly');
  let h=[0-d[1]*d[0],1-d[1]*d[1],0-d[1]*d[2]]; // world-north projected to tangent
  if(Math.hypot(...h)<0.1)h=[1-d[0]*d[0],-d[0]*d[1],-d[0]*d[2]];
  player.head=vnorm(h);
  S.mode='fp';document.body.classList.add('fp');
  modeBtn.textContent='🛰 orbit view';
  hintEl.textContent='WASD walk · drag look · space jump · F fly · click dig · right-click place';}
function exitFP(){
  const d=rotYv(player.dir,S.theta);     // back to world frame for the orbit cam
  S.pitch=clampf(Math.asin(clampf(d[1],-1,1)),-1.5,1.5);
  S.yaw=Math.atan2(-d[0],d[2]);S.panX=S.panY=0;S.dist=Math.max(S.dist,2.2);
  S.mode='orbit';document.body.classList.remove('fp');
  modeBtn.textContent='🚶 explore surface';
  hintEl.textContent='drag to rotate · scroll or pinch to zoom · two-finger drag to pan';}
modeBtn.addEventListener('click',()=>{if(!world.P)return;S.mode==='orbit'?enterFP():exitFP();});
