// main.js — glue: planet build + GL mesh state, UI wiring, frame loop, boot.
import*as MESH from'./mesher.js';
import{T}from'./worldgen.js';
import{buildAtlas}from'./textures.js';
import{S,SUNW}from'./state.js';
import{world,generate}from'./world.js';
import*as CH from'./chunks.js';
import*as INTERACT from'./interact.js';
import{player,move,stepPlayer}from'./player.js';
import{canvas,gl,mainP,U,starP,sU,sFade,sTint,sPosA,sSA,atmoP,aU,atmoPosA,atmoMesh,
       starMesh,sunMesh,ATM_R,upload,freeMesh,drawMesh,drawLines,resize}from'./gl.js';
import{perspective,mul,rotX,rotY,translate,scaleM,rotYv,rotXv,vdot,vcross,sstep,lookAtM}from'./math.js';
import{SET,saveSettings}from'./settings.js';
import{initHotbar}from'./hotbar.js';
import*as PERSIST from'./persistence.js';
import{reflectWorld}from'./menu.js';
import*as WG from'./worldgen.js';
import*as SYS from'./system.js';
import*as SHIP from'./ship.js';
import'./input.js';

// ===== planet build / GL mesh state =====
// terrain+water live in per-chunk meshes (B.1): CH.dirty holds chunk ids whose
// voxels changed; the frame loop re-meshes and re-uploads them.
let chunkMs=[],mCore=null,mCutOp=null,mCutWa=null,mDisc=null;
let mShip=null,shipRev=-1;              // F.1 parked-ship mesh
let cDirs=null;                         // per-chunk center directions (E.8 culling)
let mLodOp=null,mLodWa=null;            // orbit far-LOD (E.8), built lazily
let atlasTex=null,cutQuads=0,cutDirty=false;
const loadEl=document.getElementById('load');
const qvEl=document.getElementById('qv');
// F.1 pilot HUD: reference body, velocity readout, 6-axis thruster lights
const vBodyEl=document.getElementById('vbody'),vReadEl=document.getElementById('vread');
const thrEls=[...document.getElementById('vthr').children];
let apDoneT=0;                     // shows the ✓ stage-complete hint briefly

function freeChunks(){for(const c of chunkMs){freeMesh(c.op);freeMesh(c.wa);}chunkMs=[];}
function updateQv(){let q=0;for(const c of chunkMs)q+=c.op.quads+c.wa.quads;
  qvEl.textContent=q.toLocaleString();}

// F.2 far-body impostors: the inactive world renders as a baked mesh —
// buildStatic at small N, the E.8 LOD decimation at 256+ (edits invisible at
// range, deliberately). Cached per (seed,N,type) on the GPU: two entries max,
// so round trips between the bodies re-generate worldgen but never re-bake.
const impostors=new Map();
let mImp=null;
const impKey=s=>s.seed+':'+s.N+':'+s.type;
const bakeImpostor=P=>P.N>=256?MESH.buildLOD(P,P.N>>7):MESH.buildStatic(P);
function impostorFor(spec){
  let m=impostors.get(impKey(spec));
  if(!m){const src=bakeImpostor(WG.init(spec.seed,spec.N,spec.type));
    m={op:upload(src.op),wa:upload(src.wa)};impostors.set(impKey(spec),m);}
  return m;}
function cacheLiveImpostor(){ // bake the outgoing world before travel regen
  const k=world.seed+':'+world.P.N+':'+world.type;
  if(impostors.has(k))return;
  const src=bakeImpostor(world.P);
  impostors.set(k,{op:upload(src.op),wa:upload(src.wa)});}

// seed is always the HOME seed; SET.at picks which body actually generates.
// importD: a full validSave()'d blob (edits + parked ship) that wins over
// the local save. after: runs once the new world is live (F.2 travel).
function regenerate(seed,importD,after){
  loadEl.classList.remove('off');
  seedEl.value=seed;reflectWorld(seed,SET.worldN);   // keep both UIs in sync
  setTimeout(()=>{
    const spec=SYS.specFor(SET.at,seed,SET.worldN);
    const P=generate(spec.seed,spec.N,spec.type);
    // B.5: imported edits win (and become this world's save); else local save
    if(importD){PERSIST.applySave(importD);PERSIST.saveDeltas();}
    else PERSIST.loadDeltas(world.seed);
    CH.initChunks(P);CH.dirty.clear();
    freeChunks();freeMesh(mCore);
    const NC=CH.numChunks(P),M=P.N/CH.CS;
    cDirs=new Float32Array(NC*3);
    for(let id=0;id<NC;id++){
      const{op,wa}=CH.buildChunk(P,id);
      chunkMs.push({op:upload(op),wa:upload(wa)});
      const f=(id/(M*M))|0,rr=id-f*M*M,cy=(rr/M)|0,cx0=rr-cy*M;
      const col=f*P.n2+(cy*CH.CS+CH.CS/2)*P.N+cx0*CH.CS+CH.CS/2;
      cDirs[id*3]=P.dir[col*3];cDirs[id*3+1]=P.dir[col*3+1];
      cDirs[id*3+2]=P.dir[col*3+2];}
    mCore=upload(MESH.buildCore(P));
    freeMesh(mCutOp);freeMesh(mCutWa);freeMesh(mDisc);
    freeMesh(mLodOp);freeMesh(mLodWa);mLodOp=mLodWa=null;
    mCutOp=mCutWa=mDisc=null;cutQuads=0;cutDirty=true;
    updateQv();
    document.getElementById('cols').textContent=P.cols.toLocaleString();
    document.getElementById('trees').textContent=P.trees.length;
    document.getElementById('cq').textContent='0';
    mImp=impostorFor(SYS.otherSpec());  // the far body hangs in this sky
    SHIP.syncFromWorld();
    if(after)after();
    loadEl.classList.add('off');
  },30);}

// re-mesh edited chunks, a bounded batch per frame (a cave reveal can dirty
// dozens; typical edits dirty <=5)
function rebuildDirty(){
  if(!CH.dirty.size)return;
  let n=0;
  for(const id of CH.dirty){
    if(n++>=8)break;
    CH.dirty.delete(id);
    const{op,wa}=CH.buildChunk(world.P,id);
    freeMesh(chunkMs[id].op);freeMesh(chunkMs[id].wa);
    chunkMs[id]={op:upload(op),wa:upload(wa)};}
  if(!CH.dirty.size)updateQv();
}

// ===== UI wiring =====
const cutEl=document.getElementById('cut'),cutVal=document.getElementById('cutval');
cutEl.addEventListener('input',()=>{cutVal.textContent=cutEl.value+'%';cutDirty=true;});
const seedEl=document.getElementById('seed');
document.getElementById('dice').onclick=()=>{
  seedEl.value=(Math.random()*1e6)|0;regenerate(+seedEl.value);};
seedEl.addEventListener('change',()=>regenerate(+seedEl.value));
const spinEl=document.getElementById('spin');
// sun & time
const todEl=document.getElementById('tod'),todVal=document.getElementById('todval');
const spdEl=document.getElementById('spd'),spdVal=document.getElementById('spdval');
let todDrag=false;
todEl.addEventListener('pointerdown',()=>todDrag=true);
window.addEventListener('pointerup',()=>todDrag=false);
todEl.addEventListener('input',()=>{S.theta=todEl.value/240*2*Math.PI;});
function setOmega(){const v=spdEl.value/100;S.omega=v*v*0.8;
  spdVal.textContent=S.omega>0?(2*Math.PI/S.omega).toFixed(0)+'s/day':'paused';}
spdEl.addEventListener('input',setOmega);setOmega();

// ===== frame loop =====
gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);
gl.clearColor(0.027,0.031,0.051,1);
let lastT=0,fpsEMA=60,fpsTick=0;
const fpsEl=document.getElementById('fps'),cqEl=document.getElementById('cq');

function rebuildCut(){
  const a=cutEl.value/100,clip=2-2*a;
  freeMesh(mCutOp);freeMesh(mCutWa);freeMesh(mDisc);
  if(a<=0.001){mCutOp=mCutWa=mDisc=null;cutQuads=0;cqEl.textContent='0';return;}
  const{op,wa}=MESH.buildCut(world.P,clip);
  mCutOp=upload(op);mCutWa=upload(wa);
  mDisc=upload(MESH.buildDisc(world.P,clip));
  cutQuads=op.quads+wa.quads;
  cqEl.textContent=cutQuads.toLocaleString();}

function frame(t){
  requestAnimationFrame(frame);
  if(!world.P||!atlasTex)return;
  const dt=Math.min(100,t-lastT);lastT=t;
  if(dt>0){fpsEMA+=(1000/dt-fpsEMA)*0.06;
    if((fpsTick+=dt)>500){fpsTick=0;fpsEl.textContent=fpsEMA.toFixed(0);}}
  // planet rotation: theta spins the world; sun stays fixed in world space,
  // so in the planet frame the sun direction is rotY(-theta)*SUNW
  if(!S.paused)S.theta=(S.theta+S.omega*dt/1000)%(2*Math.PI);
  const sunM=rotYv(SUNW,-S.theta);
  if(!todDrag){todEl.value=Math.round(S.theta/(2*Math.PI)*240);
    const hh=S.theta/(2*Math.PI)*24;
    todVal.textContent=String(hh|0).padStart(2,'0')+':'+
      String((hh%1*60)|0).padStart(2,'0');}
  // F.1: piloting swaps the player sim for the ship's. While a travel regen
  // is pending (the 30ms overlay gap), SET.at is already flipped but the old
  // world is still live — freeze the ship so it never steps in that
  // mismatched frame; the regen callback hands it into the new frame.
  if(S.mode==='fp'&&!S.paused){
    if(SHIP.ship.piloting){if(!traveling)SHIP.stepShip(dt/1000);}
    else stepPlayer(dt/1000);}
  else if(!S.drag&&!S.paused){
    if(spinEl.checked)S.yaw+=0.0011*dt*0.06;
    // E.6: auto-orbit off = planet-fixed camera. Camera yaw and planet theta
    // are both Y-rotations, so yaw+theta const ⇔ terrain frozen; the sun and
    // stars sweep instead — you're standing still over a spinning planet.
    else S.yaw-=S.omega*dt/1000;
  }
  INTERACT.updateTarget(S.mode==='fp'&&!S.paused&&!SHIP.ship.piloting); // B.2 outline
  rebuildDirty();
  // F.1 pilot HUD (Outer Wilds instruments): which body you're over +
  // altitude, planet-frame speed + vertical rate, and the 6-axis thruster
  // lights that show exactly which way you're pushing
  if(SHIP.ship.piloting){
    const s=SHIP.ship,idr=1/world.P.dr;
    const srl=Math.hypot(s.pos[0],s.pos[1],s.pos[2]);
    const vr=(s.vel[0]*s.pos[0]+s.vel[1]*s.pos[1]+s.vel[2]*s.pos[2])/srl;
    const sp=Math.hypot(s.vel[0],s.vel[1],s.vel[2]);
    const{C,k}=SYS.otherLayout();
    const dO=Math.hypot(s.pos[0]-C[0],s.pos[1]-C[1],s.pos[2]-C[2]);
    const nearA=srl<dO/k;              // nearer body, measured in own radii
    const names=world.type==='desert'?['the moon','the home planet']
                                     :['the home planet','the moon'];
    if(SHIP.AP.on){                    // autopilot status owns the top line
      apDoneT=0;
      vBodyEl.textContent='AP '+SHIP.AP.txt+
        (SHIP.AP.mode==='transfer'?' → '+names[1]:'');}
    else if(SHIP.AP.done){             // stage complete: hint the next key
      if(!apDoneT)apDoneT=t;
      if(t-apDoneT>4000){SHIP.AP.done='';apDoneT=0;}
      else vBodyEl.textContent=SHIP.AP.done;}
    else if(SHIP.AP.lock){             // lock readout: range + closing rate
      const cls=(s.vel[0]*(C[0]-s.pos[0])+s.vel[1]*(C[1]-s.pos[1])+
                 s.vel[2]*(C[2]-s.pos[2]))/dO;
      vBodyEl.textContent='◎ '+names[1]+' · '+
        Math.max(0,Math.round((dO-k)*idr))+' bl · '+
        (cls>=0?'▶':'◀')+Math.abs(cls*idr).toFixed(0);}
    else vBodyEl.textContent=(nearA?srl<2.5:dO<2.5*k)
      ?'over '+(nearA?names[0]:names[1])+' · alt '+
        Math.max(0,Math.round((nearA?srl-1:dO-k)*idr))
      :'deep space';
    vReadEl.textContent=(sp*idr).toFixed(0)+' bl/s · '+
      (vr<0?'↓':'↑')+Math.abs(vr*idr).toFixed(0)+(s.lcam?' · ⬇CAM':'');
    // lights show actual thruster demand (ship.thr), so autopilot burns
    // light up too; ⏹ is the manual match-velocity key
    const[tf,ts,tu]=s.thr,e=0.05;
    const on=[tf>e,tf<-e,ts<-e,ts>e,tu>e,tu<-e,!!move.KEY.KeyB];
    for(let i=0;i<7;i++)thrEls[i].classList.toggle('on',on[i]);}
  // F.1 parked-ship mesh: rebuilt on state change only; hidden while piloting
  // (you're in the cockpit — the hull would fill the camera)
  if(SHIP.ship.rev!==shipRev){shipRev=SHIP.ship.rev;
    freeMesh(mShip);mShip=null;
    if(SHIP.ship.placed&&!SHIP.ship.piloting)
      mShip=upload(SHIP.buildShipMesh(world.P));}
  autosave(t);
  if(cutDirty){cutDirty=false;rebuildCut();}
  const a=cutEl.value/100,clip=2-2*a;
  // per-mode matrices (terrain lives in the planet frame; stars in world frame)
  const aspect=canvas.width/canvas.height;
  let mvpT,mvpS,camP,starFade=1,fpFwd=null;
  if(S.mode==='orbit'){
    const proj=perspective(1.0,aspect,0.05,120);
    const view=mul(translate(S.panX,S.panY,-S.dist),mul(rotX(S.pitch),rotY(S.yaw)));
    mvpT=mul(mul(proj,view),rotY(S.theta));
    mvpS=mul(proj,view);
    camP=rotYv(rotYv(rotXv([-S.panX,-S.panY,S.dist],-S.pitch),-S.yaw),-S.theta);
    gl.clearColor(0.027,0.031,0.051,1);
  }else{
    let eye,fwd,up;
    if(SHIP.ship.piloting&&SHIP.ship.lcam){ // V: landing camera — belly view
      // straight down, screen-up = ship-forward, so drift reads on screen
      const s=SHIP.ship,dr=world.P.dr;
      const rl2=Math.hypot(s.pos[0],s.pos[1],s.pos[2]);
      const rd2=[s.pos[0]/rl2,s.pos[1]/rl2,s.pos[2]/rl2];
      fwd=fpFwd=[-rd2[0],-rd2[1],-rd2[2]];
      const fu=vdot(s.fwd,rd2);
      let u2=[s.fwd[0]-fu*rd2[0],s.fwd[1]-fu*rd2[1],s.fwd[2]-fu*rd2[2]];
      if(Math.hypot(u2[0],u2[1],u2[2])<0.1){ // nose straight up/down: use wing
        const sb=vcross(s.fwd,s.up),su=vdot(sb,rd2);
        u2=[sb[0]-su*rd2[0],sb[1]-su*rd2[1],sb[2]-su*rd2[2]];}
      const ul=Math.hypot(u2[0],u2[1],u2[2]);
      up=[u2[0]/ul,u2[1]/ul,u2[2]/ul];
      eye=[s.pos[0]-rd2[0]*0.5*dr,s.pos[1]-rd2[1]*0.5*dr,s.pos[2]-rd2[2]*0.5*dr];
    }else if(SHIP.ship.piloting){ // F.1 cockpit camera: the ship's free frame
      const s=SHIP.ship;up=s.up;fwd=fpFwd=s.fwd;
      const dr=world.P.dr;
      eye=[s.pos[0]+up[0]*dr,s.pos[1]+up[1]*dr,s.pos[2]+up[2]*dr];
    }else{
      const p=player,eyeR=p.r+1.62*world.P.dr;up=p.dir;
      eye=[up[0]*eyeR,up[1]*eyeR,up[2]*eyeR];
      const cp=Math.cos(p.pitch),sp=Math.sin(p.pitch),h=p.head;
      fwd=fpFwd=[h[0]*cp+up[0]*sp,h[1]*cp+up[1]*sp,h[2]*cp+up[2]*sp];
    }
    const proj=perspective(SET.fov*Math.PI/180,aspect,0.0025,80); // near ~0.2 blocks: standing in a 1×1 shaft must not clip through its walls
    const view=lookAtM(eye,fwd,up);
    mvpT=mul(proj,view);
    mvpS=mul(mul(proj,view),rotY(-S.theta)); // stars sweep the FP sky as we turn
    camP=eye;
    // sky + stars follow the local sun elevation (sunset from the ground);
    // altitude thins the atmosphere out to black space (F.1 flying)
    const rl=Math.hypot(eye[0],eye[1],eye[2]),ru=[eye[0]/rl,eye[1]/rl,eye[2]/rl];
    const dp=vdot(ru,sunM),space=sstep(1.12,1.45,rl);
    const day=sstep(-0.10,0.16,dp),warm=sstep(0.16,-0.02,dp)*day;
    let r=0.012+day*0.30+warm*0.58,g=0.015+day*0.47-warm*0.08,
        b=0.045+day*0.72-warm*0.48;
    r+=(0.027-r)*space;g+=(0.031-g)*space;b+=(0.051-b)*space;
    gl.clearColor(r,Math.max(g,0.012),Math.max(b,0.03),1);
    starFade=1-0.95*day*(1-space);
  }
  gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  // stars
  gl.useProgram(starP);gl.uniformMatrix4fv(sU,false,mvpS);
  gl.uniform1f(sFade,starFade);gl.uniform3f(sTint,0.85,0.88,1.0);
  gl.depthMask(false);
  gl.bindBuffer(gl.ARRAY_BUFFER,starMesh.vbo);
  gl.enableVertexAttribArray(sPosA);gl.vertexAttribPointer(sPosA,3,gl.FLOAT,false,16,0);
  gl.enableVertexAttribArray(sSA);gl.vertexAttribPointer(sSA,1,gl.FLOAT,false,16,12);
  gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  gl.drawArrays(gl.POINTS,0,starMesh.count);
  // D.2 sun disc: same pass/frame as the stars, at the true light direction —
  // terrain drawn later paints over it, so it sets behind the horizon for free
  gl.bindBuffer(gl.ARRAY_BUFFER,sunMesh.vbo);
  gl.enableVertexAttribArray(sPosA);gl.vertexAttribPointer(sPosA,3,gl.FLOAT,false,16,0);
  gl.enableVertexAttribArray(sSA);gl.vertexAttribPointer(sSA,1,gl.FLOAT,false,16,12);
  gl.uniform3f(sTint,1.0,0.85,0.60);gl.uniform1f(sFade,0.30);
  gl.drawArrays(gl.POINTS,0,1);              // wide warm glow
  gl.uniform3f(sTint,1.0,0.97,0.88);gl.uniform1f(sFade,1.0);
  gl.drawArrays(gl.POINTS,1,1);              // tight bright core
  gl.disable(gl.BLEND);gl.depthMask(true);
  // opaque
  gl.useProgram(mainP);
  gl.uniformMatrix4fv(U.uMVP,false,mvpT);
  gl.uniform3f(U.uSun,sunM[0],sunM[1],sunM[2]);
  // C.1: the 8 nearest placed torches as warm point lights (planet frame)
  {const P=world.P,tl=[];
   if(world.torches.size){
     const arr=[];
     for(const k of world.torches){const col=(k/P.SH)|0,s=k-col*P.SH;
       const r=P.rc(s),x=P.dir[col*3]*r,y=P.dir[col*3+1]*r,z=P.dir[col*3+2]*r;
       const ex=x-camP[0],ey=y-camP[1],ez=z-camP[2];
       arr.push([ex*ex+ey*ey+ez*ez,x,y,z]);}
     arr.sort((a,b)=>a[0]-b[0]);
     for(let i=0;i<Math.min(8,arr.length);i++)tl.push(arr[i][1],arr[i][2],arr[i][3]);}
   gl.uniform1f(U.uPtN,tl.length/3);
   gl.uniform1f(U.uPtR,6.5*P.dr);
   if(tl.length){while(tl.length<24)tl.push(0);gl.uniform3fv(U.uPt,tl);}}
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,atlasTex);
  gl.uniform1i(U.uT,0);
  const lr=MESH.tileRect(T.LAVA);
  gl.uniform4f(U.uTileRect,lr[0],lr[1],lr[2],lr[3]);
  // E.8 v1 culling: a chunk beyond the planet's limb (occluder sphere at the
  // lowest terrain) can't be seen; in FP, chunks behind the eye can't either.
  // 24,576 chunks at N=1024 → a few thousand actual draws.
  const cdist=Math.hypot(camP[0],camP[1],camP[2]);
  const Rocc=world.P.radius(4),Rmax=1+30*world.P.dr;
  let cosLim=-1;
  if(cdist>Rocc){
    const a=Math.acos(Math.min(1,Rocc/cdist))+Math.acos(Math.min(1,Rocc/Rmax))
           +(CH.CS/world.P.N)*Math.PI;       // chunk angular pad
    if(a<Math.PI)cosLim=Math.cos(a);}
  const icd=1/cdist,cdx=camP[0]*icd,cdy=camP[1]*icd,cdz=camP[2]*icd;
  const span=CH.CS*world.P.dr*1.6;           // behind-the-eye pad (FP only)
  const visible=id=>{
    const o=id*3,dx2=cDirs[o],dy2=cDirs[o+1],dz2=cDirs[o+2];
    if(dx2*cdx+dy2*cdy+dz2*cdz<cosLim)return false;
    if(fpFwd&&(dx2-camP[0])*fpFwd[0]+(dy2-camP[1])*fpFwd[1]
             +(dz2-camP[2])*fpFwd[2]<-span)return false;
    return true;};
  // E.8 far-LOD (Bailey's design): zoomed-out orbit swaps the full block mesh
  // for a nearest-neighbor decimated one (k = N/128 → always ~a 128-planet's
  // quads) — kills sub-pixel triangle shimmer AND the 15k-draw-call orbit.
  // Full mesh returns when zooming in, when the cutaway opens, or in FP.
  const lodK=world.P.N>>7;
  const lodOn=S.mode==='orbit'&&lodK>1&&a<=0.001&&
    (S.dist-1)*1.0/canvas.height>world.P.dr*0.75; // block < ~1.3px
  if(lodOn&&!mLodOp){
    const l=MESH.buildLOD(world.P,lodK);
    mLodOp=upload(l.op);mLodWa=upload(l.wa);}
  let drawn=0;
  if(lodOn){drawMesh(mLodOp,clip,0,1,0);drawn=-1;} // -1 marks LOD active
  else for(let id=0;id<chunkMs.length;id++)
    if(visible(id)){drawMesh(chunkMs[id].op,clip,0,1,0);drawn++;}
  VS._drawnChunks=drawn;
  drawMesh(mShip,clip,0,1,0);                 // F.1 parked ship (cx=-10: unclipped)
  // F.2 far body: baked impostor at its system spot, scaled so blocks match.
  // Same shader — the sun uniform is valid in both frames (geostationary).
  let mvpI=null;
  if(mImp){
    const{C,k}=SYS.otherLayout();
    mvpI=mul(mvpT,mul(translate(C[0],C[1],C[2]),scaleM(k)));
    gl.uniformMatrix4fv(U.uMVP,false,mvpI);
    drawMesh(mImp.op,10,0,1,0);
    gl.uniformMatrix4fv(U.uMVP,false,mvpT);}
  drawMesh(mCutOp,10,0,1,0);                  // cutaway skin, no clip
  drawMesh(mCore,clip,1,1,1);                 // lava ball, fragment-clip, tiled
  if(a>0.001)drawMesh(mDisc,10,0,1,1);        // lava disc at the cut plane
  // water (translucent)
  gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  if(lodOn)drawMesh(mLodWa,clip,0,0.72,0);
  else for(let id=0;id<chunkMs.length;id++)
    if(visible(id))drawMesh(chunkMs[id].wa,clip,0,0.72,0);
  if(mImp&&mvpI){ // far body's oceans (home seen from the moon)
    gl.uniformMatrix4fv(U.uMVP,false,mvpI);
    drawMesh(mImp.wa,10,0,0.72,0);
    gl.uniformMatrix4fv(U.uMVP,false,mvpT);}
  drawMesh(mCutWa,10,0,0.72,0);
  gl.depthMask(true);gl.disable(gl.BLEND);
  // block-target outline (B.2)
  if(S.mode==='fp'&&INTERACT.target.verts)
    drawLines(INTERACT.target.verts,mvpT,[0.02,0.02,0.05,1]);
  // atmosphere rim glow (orbital only; additive)
  if(S.mode==='orbit'){
    gl.useProgram(atmoP);
    gl.uniformMatrix4fv(aU.uMVP,false,mvpT);gl.uniform1f(aU.uR,ATM_R);
    gl.uniform3f(aU.uSun,sunM[0],sunM[1],sunM[2]);
    gl.uniform3f(aU.uCam,camP[0],camP[1],camP[2]);
    gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE);gl.depthMask(false);
    gl.bindBuffer(gl.ARRAY_BUFFER,atmoMesh.vbo);
    gl.enableVertexAttribArray(atmoPosA);
    gl.vertexAttribPointer(atmoPosA,3,gl.FLOAT,false,12,0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,atmoMesh.ibo);
    gl.drawElements(gl.TRIANGLES,atmoMesh.count,gl.UNSIGNED_SHORT,0);
    gl.depthMask(true);gl.disable(gl.BLEND);
  }
}

// B.5 autosave: write the save 1.2s after the last edit settles
let lastRev=0,saveAt=0;
function autosave(t){
  if(world.rev!==lastRev){lastRev=world.rev;saveAt=t+1200;}
  if(saveAt&&t>=saveAt){saveAt=0;PERSIST.saveDeltas();}}
// import/reset/reshape requests from the pause menu (it can't reach regenerate)
window.addEventListener('vs-import',e=>{
  const d=e.detail;                    // a full validSave()'d blob
  // a desert save IS a moon world — rejoin its system (moon seed = home+101)
  if(d.type==='desert')SET.at='moon';
  else{SET.at='home';SET.worldN=d.N;}
  saveSettings();
  regenerate(d.type==='desert'?d.seed-101:d.seed,d);});
window.addEventListener('vs-reset',()=>{
  PERSIST.clearSave(world.seed);regenerate(SYS.homeSeed());});
window.addEventListener('vs-world',e=>{         // E.2: seed/size shape HOME
  SET.at='home';SET.worldN=e.detail.N;saveSettings();
  regenerate(e.detail.seed);});
// F.2 travel: the ship crossed into the far body's sphere of influence.
// Save + bake the outgoing world, regenerate the destination, then hand the
// ship into the new local frame (translate + scale by N_old/N_new — never a
// rotation, so the flight is seamless).
let traveling=false;
window.addEventListener('vs-travel',()=>{
  if(traveling)return;traveling=true;
  PERSIST.saveDeltas();
  cacheLiveImpostor();
  const oldN=world.P.N,{C}=SYS.otherLayout(),hs=SYS.homeSeed();
  SET.at=SET.at==='moon'?'home':'moon';saveSettings();
  regenerate(hs,null,()=>{
    const ratio=oldN/world.P.N,s=SHIP.ship;
    for(let i=0;i<3;i++){s.pos[i]=(s.pos[i]-C[i])*ratio;s.vel[i]*=ratio;}
    SHIP.apArrived();               // a locked autopilot flips to landing
    s.rev++;traveling=false;});});

// debug/test handle (browser-automation smoke tests hook in here)
window.VS={S,world,player,chunks:CH,interact:INTERACT,persist:PERSIST,
  ship:SHIP,sys:SYS,
  edit:(col,s,tile)=>CH.editBlock(col,s,tile)};

// ===== boot =====
(async()=>{
  const params=new URLSearchParams(location.search);
  if(params.has('seed'))seedEl.value=params.get('seed');
  atlasTex=await buildAtlas(gl);
  initHotbar();
  sunMesh.set(SUNW);                     // sun is fixed in world space
  resize();
  window.addEventListener('resize',resize);
  const frag=PERSIST.fragmentSave();     // B.5: a share link loads its world
  if(frag){
    if(frag.type==='desert')SET.at='moon';
    else{SET.at='home';SET.worldN=frag.N;}
    regenerate(frag.type==='desert'?frag.seed-101:frag.seed,frag);}
  else regenerate(+seedEl.value);        // SET.at persists: resume on your body
  requestAnimationFrame(frame);
})();
