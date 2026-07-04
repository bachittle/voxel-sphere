// ship.js — F.1: the spaceship. DECIDED (2026-07-04): the ship is a
// free-flying ENTITY, not grid voxels — placing it edits no chunks; the hull
// is a 14-cell voxel model emitted straight into planet-frame coordinates
// through the terrain mesher (emitQuad), so the terrain shader lights it —
// terminator, sun, shade — with zero shader changes. The mesh is tiny, so it
// just rebuilds whenever the ship moves state (rev). One ship per world;
// placing again moves it. Parked state persists as save v3's `ship`
// (world.ship); a ship in flight belongs to no world and is not saved.
//
// Piloting is a free orthonormal frame (fwd/up/starboard) — mouse yaw spins
// around ship-up, pitch around starboard (Rodrigues), Z/X roll about fwd.
// Flight is NEWTONIAN (Outer Wilds model, 2026-07-04): thrust is pure
// acceleration, velocity persists, and both bodies pull inverse-square —
// see stepShip. Frames stay continuous across the F.2 world switch
// (translate+scale, no rotation), and velocity is planet-frame, so B
// (match velocity) brakes relative to the active body.
import{T}from'./worldgen.js';
import{MB,emitQuad}from'./mesher.js';
import{world,setShip}from'./world.js';
import{player,move,groundR}from'./player.js';
import{target,viewRay}from'./interact.js';
import{SET}from'./settings.js';
import{vnorm,vcross,vdot}from'./math.js';
import*as SYS from'./system.js';

export const ship={placed:false,piloting:false,rev:0,lcam:false,
  pos:[0,0,1.2],fwd:[0,0,1],up:[0,1,0],vel:[0,0,0],thr:[0,0,0]};

// ---- lock-on + STAGED autopilot (OW-style, 2026-07-04) ----
// T locks the far body (the only other planet; bodies are static in the
// co-rotating frame, so lock = a destination + HUD range/closing readout).
// G runs ONE stage per press (Bailey: learn spaceflight in stages), each
// ending in a stable state with a ✓ hint for the next key:
//   low & slow      → ORBIT: gravity-turn climb, circularize at ORBIT_R
//   in orbit + lock → TRANSFER: burn/cruise/flip-brake to the SOI, ride the
//                     world switch, then circularize into the NEW orbit
//   in orbit, no lock → LAND: kill drift, descend, level, touch down
// Any manual thrust key (WASD/space/shift/B) cancels it — OW rules.
export const ORBIT_R=1.6;      // parking-orbit radius, in active-body radii
export const AP={on:false,mode:'land',lock:false,txt:'',done:''};
export function toggleLock(){if(!ship.piloting)return;
  AP.lock=!AP.lock;
  if(!AP.lock&&AP.on&&AP.mode==='transfer'){AP.on=false;AP.txt='';}}
export function toggleAP(){if(!ship.piloting)return;
  if(AP.on){AP.on=false;AP.txt='';return;}
  const rl=Math.hypot(ship.pos[0],ship.pos[1],ship.pos[2]);
  const rd=[ship.pos[0]/rl,ship.pos[1]/rl,ship.pos[2]/rl];
  AP.mode=rl-restR(rd)<(ORBIT_R-1)*0.55?'orbit':AP.lock?'transfer':'land';
  AP.on=true;AP.txt='';AP.done='';}
export function apArrived(){ // main.js calls this from the travel handoff:
  if(AP.on){AP.mode='orbit';AP.lock=false;}} // arrive INTO orbit, not dirt

// ---- hull model: [fwd,starboard,up,tile] in block units ----
const CELLS=[
  [2,0,0,T.GOLD],                                          // nose
  [1,0,0,T.IRON],[0,0,0,T.IRON],[-1,0,0,T.IRON],[-2,0,0,T.IRON],
  [0,1,0,T.IRON],[0,-1,0,T.IRON],[-1,1,0,T.IRON],[-1,-1,0,T.IRON],
  [-1,2,0,T.IRON],[-1,-2,0,T.IRON],                        // swept wingtips
  [1,0,1,T.GLASS],[0,0,1,T.GLASS],                         // canopy
  [-2,0,1,T.IRON]];                                        // tail fin
const CSET=new Set(CELLS.map(c=>c[0]+','+c[1]+','+c[2]));
const ENGINE=new Set(['-2,0,0','-1,1,0','-1,-1,0']);       // lava-glow rears

// hull quads in PLANET-FRAME coords (positions AND normals), so main.js
// draws it exactly like a chunk. cx=-10: never eaten by the cutaway clip.
export function buildShipMesh(P){
  const m=MB(),dr=P.dr,p=ship.pos,F=ship.fwd,U=ship.up,R=vnorm(vcross(F,U));
  const AX=[F,R,U];
  const pt=(a,b,c)=>[p[0]+(F[0]*a+R[0]*b+U[0]*c)*dr,
                     p[1]+(F[1]*a+R[1]*b+U[1]*c)*dr,
                     p[2]+(F[2]*a+R[2]*b+U[2]*c)*dr];
  for(const[cf,cr,cu,tile]of CELLS)
    for(let k=0;k<3;k++)for(let s=-1;s<=1;s+=2){
      const nb=[cf,cr,cu];nb[k]+=s;
      if(CSET.has(nb[0]+','+nb[1]+','+nb[2]))continue;     // interior face
      const u1=(k+1)%3,u2=(k+2)%3,base=[cf,cr,cu];base[k]+=0.5*s;
      const mk=(d1,d2)=>{const q=[base[0],base[1],base[2]];
        q[u1]+=d1;q[u2]+=d2;return pt(q[0],q[1],q[2]);};
      const A=mk(-.5,-.5),Bq=mk(.5,-.5),Cq=mk(.5,.5),Dq=mk(-.5,.5);
      const eng=k===0&&s<0&&ENGINE.has(cf+','+cr+','+cu);
      const ax=AX[k];
      emitQuad(m,A,Bq,Cq,Dq,ax[0]*s,ax[1]*s,ax[2]*s,
        eng?T.LAVA:tile,eng?1.5:(k===2&&s>0?1.0:0.82),-10);
    }
  return m;
}

// ---- frame helpers ----
function rotAx(v,ax,a){ // Rodrigues
  const c=Math.cos(a),s=Math.sin(a),d=vdot(ax,v)*(1-c);
  return[v[0]*c+(ax[1]*v[2]-ax[2]*v[1])*s+ax[0]*d,
         v[1]*c+(ax[2]*v[0]-ax[0]*v[2])*s+ax[1]*d,
         v[2]*c+(ax[0]*v[1]-ax[1]*v[0])*s+ax[2]*d];}
function orthonorm(){ // re-square the frame, fwd primary
  ship.fwd=vnorm(ship.fwd);
  const sb=vnorm(vcross(ship.fwd,ship.up));
  ship.up=vnorm(vcross(sb,ship.fwd));}
export function pilotLook(dx,dy){ // same feel constants as fpLook (B.4)
  const k=0.0042*SET.sens;
  ship.fwd=rotAx(ship.fwd,ship.up,-dx*k);
  const sb=vnorm(vcross(ship.fwd,ship.up)),pit=-(SET.invertY?-dy:dy)*k;
  ship.fwd=rotAx(ship.fwd,sb,pit);ship.up=rotAx(ship.up,sb,pit);
  orthonorm();}

// the surface the hull rests/skims on: solid ground, or the sea surface —
// groundR is the ocean FLOOR (C.3), and the ship is a boat, not a submarine
function restR(d){const P=world.P;
  return Math.max(groundR(d),P.radius(P.SEA))+0.55*P.dr;}
// drop the hull onto the ground under unit direction d, heading preserved
function settle(d){
  const g=restR(d);                       // hull bottom kisses the surface
  ship.pos=[d[0]*g,d[1]*g,d[2]*g];
  ship.up=[d[0],d[1],d[2]];
  const hd=vdot(ship.fwd,d);
  let f=[ship.fwd[0]-hd*d[0],ship.fwd[1]-hd*d[1],ship.fwd[2]-hd*d[2]];
  if(Math.hypot(f[0],f[1],f[2])<0.1)f=vcross(d,[0,1,0]);
  ship.fwd=vnorm(f);orthonorm();}
const park=()=>({pos:[...ship.pos],fwd:[...ship.fwd],up:[...ship.up]});

// ---- hotbar place (B.3-style): settle onto the aimed column's ground ----
export function placeShip(){
  if(ship.piloting)return false;
  const P=world.P,t=target.cur;
  let d;
  if(t){const c=(t.prev||t.hit).col;d=[P.dir[c*3],P.dir[c*3+1],P.dir[c*3+2]];}
  else{const{eye,fwd}=viewRay();    // aiming at sky: 4 blocks ahead
    d=vnorm([eye[0]+fwd[0]*4*P.dr,eye[1]+fwd[1]*4*P.dr,eye[2]+fwd[2]*4*P.dr]);}
  ship.fwd=[...player.head];        // parked facing the way you face
  settle(vnorm(d));
  ship.placed=true;ship.rev++;
  setShip(park());
  return true;
}

// ---- enter / exit ----
export function nearShip(){
  if(!ship.placed||ship.piloting)return false;
  const P=world.P,p=player;
  const dx=p.dir[0]*p.r-ship.pos[0],dy=p.dir[1]*p.r-ship.pos[1],
        dz=p.dir[2]*p.r-ship.pos[2],reach=4*P.dr;
  return dx*dx+dy*dy+dz*dz<reach*reach;
}
export function interact(){ // E key (desktop) / the ✈ button near a ship (touch)
  if(ship.piloting){exitShip();return true;}
  if(nearShip()){enterShip();return true;}
  return false;
}
function enterShip(){
  ship.piloting=true;ship.vel=[0,0,0];ship.lcam=false;
  AP.on=false;AP.lock=false;AP.txt='';
  // adopt the player's current view as the flight frame — no camera snap
  const up=player.dir,h=player.head,
        cp=Math.cos(player.pitch),sp=Math.sin(player.pitch);
  ship.fwd=vnorm([h[0]*cp+up[0]*sp,h[1]*cp+up[1]*sp,h[2]*cp+up[2]*sp]);
  ship.up=[...up];orthonorm();
  player.fly=false;document.body.classList.remove('fly');
  setShip(null);                    // in flight the ship is parked nowhere
  ship.rev++;
  document.body.classList.add('pilot');
}
export function exitShip(){
  if(!ship.piloting)return;
  ship.piloting=false;ship.lcam=false;
  AP.on=false;AP.lock=false;AP.txt='';
  settle(vnorm(ship.pos));          // the ship settles; you step out beside it
  ship.placed=true;
  const P=world.P,sb=vnorm(vcross(ship.fwd,ship.up));
  const pd=vnorm([ship.pos[0]+sb[0]*2.2*P.dr,ship.pos[1]+sb[1]*2.2*P.dr,
                  ship.pos[2]+sb[2]*2.2*P.dr]);
  player.dir=pd;player.vr=0;player.grounded=true;
  player.r=Math.max(groundR(pd),P.radius(P.SEA)); // over ocean: step out afloat
  player.fly=false;document.body.classList.remove('fly');
  const hd=vdot(ship.fwd,pd);
  let h=[ship.fwd[0]-hd*pd[0],ship.fwd[1]-hd*pd[1],ship.fwd[2]-hd*pd[2]];
  if(Math.hypot(h[0],h[1],h[2])<0.1)h=vcross(pd,[0,1,0]);
  player.head=vnorm(h);player.pitch=0;
  setShip(park());ship.rev++;
  document.body.classList.remove('pilot');
}
// after generate/load: adopt the new world's parked ship. A piloted ship
// rides THROUGH world switches (F.2 travel), so it is left alone.
export function syncFromWorld(){
  if(ship.piloting)return;
  const sh=world.ship;
  if(sh){ship.placed=true;ship.pos=[...sh.pos];ship.fwd=[...sh.fwd];ship.up=[...sh.up];}
  else ship.placed=false;
  ship.rev++;
}

// ---- flight step (replaces stepPlayer while piloting) ----
// NEWTONIAN (Outer Wilds pivot, 2026-07-04 — Bailey): thrust is pure
// acceleration in the ship frame, velocity persists — no drag, no altitude
// throttle — and BOTH bodies pull inverse-square, each with the player's
// surface gravity (FLY.G blocks/s², stepPlayer's G) at its own surface. So
// the ship falls, orbits, slingshots, and lands by flip-and-burn. Z/X roll;
// B matches velocity to the active planet (retro-burn assist). Ground
// contact kills inward velocity and strut friction bleeds the rest. The
// previous arcade model (40→400 blocks/s throttle, auto-roll, gravity
// detached) lasted one session.
// tuned down 2026-07-04 after Bailey's first flight (75/500/1.6 was "too
// fast, too powerful"): TWR 1.5 makes takeoffs deliberate and taps nudge
export const FLY={ACC:45,G:30,MAXV:180,ROLL:1.2}; // blocks/s², blocks/s², blocks/s, rad/s

// rotate fwd (and up with it) toward dir, rate-limited — the autopilot's
// nose steering; thrust itself is omnidirectional, this is for the cockpit
function aimAt(dir,dt,rate){
  const c=vdot(ship.fwd,dir),ax=vcross(ship.fwd,dir),al=Math.hypot(ax[0],ax[1],ax[2]);
  if(al<1e-6)return;
  const ang=Math.min(Math.atan2(al,c),rate*dt);
  const u=[ax[0]/al,ax[1]/al,ax[2]/al];
  ship.fwd=rotAx(ship.fwd,u,ang);ship.up=rotAx(ship.up,u,ang);orthonorm();}

// autopilot step: returns thrust demand [tf,ts,tu] in [-1,1] per ship axis.
// A velocity-tracking controller with gravity feedforward: aim the desired
// velocity at the goal, thrust (vDes - vel)*gain - g, capped to the same
// FLY.ACC budget the keys get. `g` is this step's gravity accel vector.
function apStep(dt,g){
  const P=world.P,dr=P.dr,TH=FLY.ACC*dr;
  const rl=Math.hypot(ship.pos[0],ship.pos[1],ship.pos[2]);
  const rd=[ship.pos[0]/rl,ship.pos[1]/rl,ship.pos[2]/rl];
  let vDes,nose;
  if(AP.mode==='transfer'){
    const{C,k}=SYS.otherLayout();
    const dx=[C[0]-ship.pos[0],C[1]-ship.pos[1],C[2]-ship.pos[2]];
    const dC=Math.hypot(dx[0],dx[1],dx[2]),u=[dx[0]/dC,dx[1]/dC,dx[2]/dC];
    // planet avoidance: if the straight line to the target clips the active
    // body, steer along the tangent with an up bias (strong near the ground
    // so the climb-out beats gravity)
    let dirT=u,climb=false;
    const t=-vdot(ship.pos,u);
    if(t>0&&t<dC){
      const cp=[ship.pos[0]+u[0]*t,ship.pos[1]+u[1]*t,ship.pos[2]+u[2]*t];
      if(Math.hypot(cp[0],cp[1],cp[2])<1.25){
        climb=true;
        const ur=vdot(u,rd);
        let tg=[u[0]-ur*rd[0],u[1]-ur*rd[1],u[2]-ur*rd[2]];
        if(Math.hypot(tg[0],tg[1],tg[2])<0.05)tg=vcross(rd,[0,1,0]); // antipode
        tg=vnorm(tg);
        const alt=(rl-restR(rd))/dr,b=alt<20?1.5:0.35;
        dirT=vnorm([tg[0]+rd[0]*b,tg[1]+rd[1]*b,tg[2]+rd[2]*b]);}}
    // speed budget: full brake (60% margin) must stop it by the SOI line,
    // arriving ~15 blocks/s; the world switch then flips this to landing
    const dS=Math.max(dC-1.5*k,1e-4);
    const vTgt=Math.min(Math.sqrt(2*0.6*TH*dS)+15*dr,FLY.MAXV*dr);
    vDes=[dirT[0]*vTgt,dirT[1]*vTgt,dirT[2]*vTgt];
    const closing=vdot(ship.vel,dirT);
    AP.txt=climb?'climb':closing>vTgt*1.1?'brake':closing<vTgt*0.9?'burn':'cruise';
    nose=closing>vTgt*1.1?vnorm([-ship.vel[0],-ship.vel[1],-ship.vel[2]]):dirT;
  }else if(AP.mode==='orbit'){ // stage: reach a circular parking orbit.
    // Gravity turn: climb radially while the tangential target ramps with
    // altitude, then hold the ORBIT_R shell and trim to circular speed.
    const G0=FLY.G*dr,vOrb=Math.sqrt(G0/ORBIT_R);
    const vr=vdot(ship.vel,rd);
    let tg=[ship.vel[0]-rd[0]*vr,ship.vel[1]-rd[1]*vr,ship.vel[2]-rd[2]*vr];
    if(Math.hypot(tg[0],tg[1],tg[2])<5*dr){ // no drift yet: go where the nose points
      const fr=vdot(ship.fwd,rd);
      tg=[ship.fwd[0]-fr*rd[0],ship.fwd[1]-fr*rd[1],ship.fwd[2]-fr*rd[2]];}
    if(Math.hypot(tg[0],tg[1],tg[2])<0.05)tg=vcross(rd,[0,1,0]);
    tg=vnorm(tg);
    if(rl<ORBIT_R-0.03){
      AP.ct=0;
      const f=Math.max(0,(rl-1)/(ORBIT_R-1));
      vDes=[0,0,0];
      for(let i=0;i<3;i++)vDes[i]=rd[i]*28*dr*(1-0.6*f)+tg[i]*vOrb*f;
      AP.txt='climb · alt '+Math.max(0,((rl-restR(rd))/dr)|0);
    }else{
      vDes=[0,0,0];
      for(let i=0;i<3;i++)vDes[i]=tg[i]*vOrb+rd[i]*(ORBIT_R-rl)*2;
      AP.txt='circularize';
      // "circular" is approximate here — the other body's tide (~6% of
      // surface g) perturbs any orbit, so accept a near window, or a loose
      // one once it has settled for a few seconds
      AP.ct=(AP.ct||0)+dt;
      const vt=vdot(ship.vel,tg);
      if((Math.abs(rl-ORBIT_R)<0.06&&Math.abs(vr)<6*dr&&
          Math.abs(vt-vOrb)<0.2*vOrb)||
         (AP.ct>8&&Math.abs(rl-ORBIT_R)<0.12&&Math.abs(vr)<8*dr)){
        AP.on=false;AP.txt='';
        AP.done='✓ orbit — '+(AP.lock?'G: transfer':'T: lock target · G: land');}}
    nose=vnorm(vDes);
  }else{ // land on the active body, straight down, gentler as ground nears
    const gR=restR(rd),alt=(rl-gR)/dr;
    const vrT=-(4+Math.min(alt*0.3,26))*dr;
    vDes=[rd[0]*vrT,rd[1]*vrT,rd[2]*vrT];
    AP.txt='land · alt '+Math.max(0,alt|0);
    nose=null; // level out instead: ease ship-up toward radial
    const e=1-Math.exp(-2*dt);
    ship.up=vnorm([ship.up[0]+(rd[0]-ship.up[0])*e,
                   ship.up[1]+(rd[1]-ship.up[1])*e,
                   ship.up[2]+(rd[2]-ship.up[2])*e]);
    const fd=vdot(ship.fwd,ship.up);
    const f=[ship.fwd[0]-fd*ship.up[0],ship.fwd[1]-fd*ship.up[1],
             ship.fwd[2]-fd*ship.up[2]];
    if(Math.hypot(f[0],f[1],f[2])>0.1)ship.fwd=vnorm(f);else orthonorm();
    if(alt<0.8&&Math.hypot(ship.vel[0],ship.vel[1],ship.vel[2])<4*dr){
      AP.on=false;AP.txt='';AP.done='✓ touchdown — E: step out';}}
  if(nose)aimAt(nose,dt,1.5);
  // demand = tracking + gravity feedforward, capped to the thruster budget
  let a=[0,0,0];
  for(let i=0;i<3;i++)a[i]=(vDes[i]-ship.vel[i])*3-g[i];
  const al=Math.hypot(a[0],a[1],a[2]);
  if(al>TH)for(let i=0;i<3;i++)a[i]*=TH/al;
  const F=ship.fwd,U=ship.up,sb=vnorm(vcross(F,U));
  const cl=v=>Math.max(-1,Math.min(1,v));
  return[cl(vdot(a,F)/TH),cl(vdot(a,sb)/TH),cl(vdot(a,U)/TH)];}
export function stepShip(dt){
  dt=Math.min(dt,0.05);
  const P=world.P,dr=P.dr,KEY=move.KEY;
  let tf=move.joyY,ts=move.joyX,tu=0;
  if(KEY.KeyW||KEY.ArrowUp)tf+=1;if(KEY.KeyS||KEY.ArrowDown)tf-=1;
  if(KEY.KeyD||KEY.ArrowRight)ts+=1;if(KEY.KeyA||KEY.ArrowLeft)ts-=1;
  if(KEY.Space||move.jumpHeld)tu+=1;
  if(KEY.ShiftLeft||KEY.ShiftRight||KEY.KeyC||move.downHeld)tu-=1;
  const tl=Math.hypot(tf,ts,tu);if(tl>1){tf/=tl;ts/=tl;tu/=tl;}
  const roll=(KEY.KeyZ?1:0)-(KEY.KeyX?1:0);
  if(roll){ship.up=rotAx(ship.up,ship.fwd,roll*FLY.ROLL*dt);orthonorm();}
  const TH=FLY.ACC*dr,G0=FLY.G*dr,g=[0,0,0];
  // gravity: the active body (surface radius 1)...
  let rl=Math.hypot(ship.pos[0],ship.pos[1],ship.pos[2]);
  const g1=G0/(rl*rl*rl);           // /r³: folds in the direction normalize
  for(let i=0;i<3;i++)g[i]-=ship.pos[i]*g1;
  // ...and the far body (surface radius k in active-local units)
  const{C,k}=SYS.otherLayout();
  const dx=[C[0]-ship.pos[0],C[1]-ship.pos[1],C[2]-ship.pos[2]];
  const dO=Math.hypot(dx[0],dx[1],dx[2]);
  const g2=G0*k*k/(dO*dO*dO);
  for(let i=0;i<3;i++)g[i]+=dx[i]*g2;
  // autopilot: any manual thrust takes the stick back (OW rules); otherwise
  // it drives the same thrusters the keys do
  if(AP.on&&(tf||ts||tu||KEY.KeyB)){AP.on=false;AP.txt='';}
  if(AP.on)[tf,ts,tu]=apStep(dt,g);
  ship.thr=[tf,ts,tu];              // HUD thruster lights read actual demand
  const F=ship.fwd,U=ship.up,sb=vnorm(vcross(F,U)); // after apStep's aiming
  const a=[g[0],g[1],g[2]];
  for(let i=0;i<3;i++)a[i]+=(F[i]*tf+sb[i]*ts+U[i]*tu)*TH;
  // B: match velocity — retro-burn against the planet-frame velocity,
  // clamped so it never overshoots zero
  if(KEY.KeyB){const sp=Math.hypot(ship.vel[0],ship.vel[1],ship.vel[2]);
    if(sp>1e-9){const br=Math.min(TH,sp/dt)/sp;
      for(let i=0;i<3;i++)a[i]-=ship.vel[i]*br;}}
  // semi-implicit Euler: stable orbits
  for(let i=0;i<3;i++)ship.vel[i]+=a[i]*dt;
  const sp=Math.hypot(ship.vel[0],ship.vel[1],ship.vel[2]),cap=FLY.MAXV*dr;
  if(sp>cap)for(let i=0;i<3;i++)ship.vel[i]*=cap/sp;
  for(let i=0;i<3;i++)ship.pos[i]+=ship.vel[i]*dt;
  rl=Math.hypot(ship.pos[0],ship.pos[1],ship.pos[2]);
  const rd=[ship.pos[0]/rl,ship.pos[1]/rl,ship.pos[2]/rl];
  // ground contact: touch down — kill inward velocity, struts grip the rest
  const gR=restR(rd);
  if(rl<gR){
    for(let i=0;i<3;i++)ship.pos[i]=rd[i]*gR;
    const vr=vdot(ship.vel,rd);
    if(vr<0)for(let i=0;i<3;i++)ship.vel[i]-=rd[i]*vr;
    const fr=Math.exp(-6*dt);
    for(let i=0;i<3;i++)ship.vel[i]*=fr;
    rl=gR;}
  const maxR=Math.hypot(C[0],C[1],C[2])+3;   // the system bubble
  if(rl>maxR){
    for(let i=0;i<3;i++)ship.pos[i]*=maxR/rl;
    const vr=vdot(ship.vel,rd);
    if(vr>0)for(let i=0;i<3;i++)ship.vel[i]-=rd[i]*vr;}
  // F.2 travel: crossing into the far body's sphere of influence swaps the
  // active world — main.js owns the save + regen + frame handoff
  if(Math.hypot(ship.pos[0]-C[0],ship.pos[1]-C[1],ship.pos[2]-C[2])<SYS.SWITCH_R*k)
    window.dispatchEvent(new CustomEvent('vs-travel'));
}
