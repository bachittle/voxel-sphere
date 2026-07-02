// main.js — glue: planet build + GL mesh state, UI wiring, frame loop, boot.
import*as MESH from'./mesher.js';
import{T}from'./worldgen.js';
import{buildAtlas}from'./textures.js';
import{S,SUNW}from'./state.js';
import{world,generate}from'./world.js';
import{player,stepPlayer}from'./player.js';
import{canvas,gl,mainP,U,starP,sU,sFade,sPosA,sSA,atmoP,aU,atmoPosA,atmoMesh,
       starMesh,ATM_R,upload,freeMesh,drawMesh,resize}from'./gl.js';
import{perspective,mul,rotX,rotY,translate,rotYv,rotXv,vdot,sstep,lookAtM}from'./math.js';
import'./input.js';

// ===== planet build / GL mesh state =====
let mTerr=null,mWater=null,mCore=null,mCutOp=null,mCutWa=null,mDisc=null;
let atlasTex=null,cutQuads=0,cutDirty=false;
const loadEl=document.getElementById('load');

function regenerate(seed){
  loadEl.classList.remove('off');
  setTimeout(()=>{
    const P=generate(seed);
    const{op,wa}=MESH.buildStatic(P);
    freeMesh(mTerr);freeMesh(mWater);freeMesh(mCore);
    mTerr=upload(op);mWater=upload(wa);mCore=upload(MESH.buildCore(P));
    freeMesh(mCutOp);freeMesh(mCutWa);freeMesh(mDisc);
    mCutOp=mCutWa=mDisc=null;cutQuads=0;cutDirty=true;
    document.getElementById('qv').textContent=(mTerr.quads+mWater.quads).toLocaleString();
    document.getElementById('cols').textContent=P.cols.toLocaleString();
    document.getElementById('trees').textContent=P.trees.length;
    document.getElementById('cq').textContent='0';
    loadEl.classList.add('off');
  },30);}

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
  S.theta=(S.theta+S.omega*dt/1000)%(2*Math.PI);
  const sunM=rotYv(SUNW,-S.theta);
  if(!todDrag){todEl.value=Math.round(S.theta/(2*Math.PI)*240);
    const hh=S.theta/(2*Math.PI)*24;
    todVal.textContent=String(hh|0).padStart(2,'0')+':'+
      String((hh%1*60)|0).padStart(2,'0');}
  if(S.mode==='fp')stepPlayer(dt/1000);
  else if(spinEl.checked&&!S.drag)S.yaw+=0.0011*dt*0.06;
  if(cutDirty){cutDirty=false;rebuildCut();}
  const a=cutEl.value/100,clip=2-2*a;
  // per-mode matrices (terrain lives in the planet frame; stars in world frame)
  const aspect=canvas.width/canvas.height;
  let mvpT,mvpS,camP,starFade=1;
  if(S.mode==='orbit'){
    const proj=perspective(1.0,aspect,0.05,120);
    const view=mul(translate(S.panX,S.panY,-S.dist),mul(rotX(S.pitch),rotY(S.yaw)));
    mvpT=mul(mul(proj,view),rotY(S.theta));
    mvpS=mul(proj,view);
    camP=rotYv(rotYv(rotXv([-S.panX,-S.panY,S.dist],-S.pitch),-S.yaw),-S.theta);
    gl.clearColor(0.027,0.031,0.051,1);
  }else{
    const p=player,up=p.dir,eyeR=p.r+1.62*world.P.dr;
    const eye=[up[0]*eyeR,up[1]*eyeR,up[2]*eyeR];
    const cp=Math.cos(p.pitch),sp=Math.sin(p.pitch),h=p.head;
    const fwd=[h[0]*cp+up[0]*sp,h[1]*cp+up[1]*sp,h[2]*cp+up[2]*sp];
    const proj=perspective(1.15,aspect,0.006,80);
    const view=lookAtM(eye,fwd,up);
    mvpT=mul(proj,view);
    mvpS=mul(mul(proj,view),rotY(-S.theta)); // stars sweep the FP sky as we turn
    camP=eye;
    // sky + stars follow the local sun elevation (sunset from the ground)
    const dp=vdot(up,sunM);
    const day=sstep(-0.10,0.16,dp),warm=sstep(0.16,-0.02,dp)*day;
    const r=0.012+day*0.30+warm*0.58,g=0.015+day*0.47-warm*0.08,
          b=0.045+day*0.72-warm*0.48;
    gl.clearColor(r,Math.max(g,0.012),Math.max(b,0.03),1);
    starFade=1-0.95*day;
  }
  gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  // stars
  gl.useProgram(starP);gl.uniformMatrix4fv(sU,false,mvpS);
  gl.uniform1f(sFade,starFade);
  gl.depthMask(false);
  gl.bindBuffer(gl.ARRAY_BUFFER,starMesh.vbo);
  gl.enableVertexAttribArray(sPosA);gl.vertexAttribPointer(sPosA,3,gl.FLOAT,false,16,0);
  gl.enableVertexAttribArray(sSA);gl.vertexAttribPointer(sSA,1,gl.FLOAT,false,16,12);
  gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  gl.drawArrays(gl.POINTS,0,starMesh.count);
  gl.disable(gl.BLEND);gl.depthMask(true);
  // opaque
  gl.useProgram(mainP);
  gl.uniformMatrix4fv(U.uMVP,false,mvpT);
  gl.uniform3f(U.uSun,sunM[0],sunM[1],sunM[2]);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,atlasTex);
  gl.uniform1i(U.uT,0);
  const lr=MESH.tileRect(T.LAVA);
  gl.uniform4f(U.uTileRect,lr[0],lr[1],lr[2],lr[3]);
  drawMesh(mTerr,clip,0,1,0);                 // terrain+trees, block-clip
  drawMesh(mCutOp,10,0,1,0);                  // cutaway skin, no clip
  drawMesh(mCore,clip,1,1,1);                 // lava ball, fragment-clip, tiled
  if(a>0.001)drawMesh(mDisc,10,0,1,1);        // lava disc at the cut plane
  // water (translucent)
  gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  drawMesh(mWater,clip,0,0.72,0);
  drawMesh(mCutWa,10,0,0.72,0);
  gl.depthMask(true);gl.disable(gl.BLEND);
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

// debug/test handle (browser-automation smoke tests hook in here)
window.VS={S,world,player};

// ===== boot =====
(async()=>{
  const params=new URLSearchParams(location.search);
  if(params.has('seed'))seedEl.value=params.get('seed');
  atlasTex=await buildAtlas(gl);
  resize();
  window.addEventListener('resize',resize);
  regenerate(+seedEl.value);
  requestAnimationFrame(frame);
})();
