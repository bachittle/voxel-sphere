// player.js — first-person player in the planet-fixed frame; up = radial.
// Heading is parallel-transported onto each new tangent plane. Ground height
// is edit-aware (B.1): untouched columns keep the fast worldgen-heightmap
// lookup (water surface walkable); edited or cave-opened columns search
// downward through real solidity, so you fall into dug pits and stand on
// placed blocks. Trees stay non-colliding and there's only a minimal ceiling
// check — full voxel AABB collision is B.3/B.4 territory.
import{vdot,vcross,vnorm,clampf}from'./math.js';
import{world,isSolid}from'./world.js';
import{SET}from'./settings.js';

export const player={dir:[0,0,1],r:1.3,head:[0,1,0],pitch:0,vr:0,grounded:false,fly:false};
// movement input state, written by input.js, read by stepPlayer
export const move={KEY:{},jumpHeld:false,downHeld:false,joyX:0,joyY:0};

const PLAYER_H=1.79;                     // blocks; eye sits at 1.62

// unit dir -> column (inverse cubed-sphere lookup)
export function colOf(d){
  const P=world.P;
  const ax=Math.abs(d[0]),ay=Math.abs(d[1]),az=Math.abs(d[2]);
  let axis=0;if(ay>=ax&&ay>=az)axis=1;else if(az>=ax&&az>=ay)axis=2;
  const s=d[axis]>0?1:-1,f=axis*2+(s>0?0:1),a1=(axis+1)%3,a2=(axis+2)%3;
  const inv=s/d[axis],N_=P.N;
  const i=clampf(Math.floor((d[a1]*inv+1)/2*N_),0,N_-1);
  const j=clampf(Math.floor((d[a2]*inv+1)/2*N_),0,N_-1);
  return f*P.n2+j*N_+i;
}
// radius -> shell containing it (feet at radius(s) sit in shell s)
export const shellOf=r=>Math.floor((r-1)/world.P.dr+world.P.SEA+1e-9);

// ground radius under dir d, searching downward from shell fromS
// (default: from the top — spawn/fly-over sees the highest solid)
export function groundR(d,fromS){
  const P=world.P,col=colOf(d);
  if(!world.editsByCol.has(col)&&!world.openMask.has(col))
    return Math.max(P.radius(P.H[col]+1),P.radius(P.SEA));
  let s=fromS===undefined?P.SH-1:Math.min(fromS,P.SH-1);
  for(;s>=0;s--)if(isSolid(col,s,false))return P.radius(s+1);
  return P.radius(0);
}

export function stepPlayer(dt){
  dt=Math.min(dt,0.05);
  const p=player,up=p.dir,KEY=move.KEY;
  // parallel-transport heading onto the current tangent plane
  let h=p.head;const hd=vdot(h,up);
  p.head=h=vnorm([h[0]-hd*up[0],h[1]-hd*up[1],h[2]-hd*up[2]]);
  const right=vcross(h,up);
  let mx=move.joyX,mz=move.joyY;
  if(KEY.KeyW||KEY.ArrowUp)mz+=1;if(KEY.KeyS||KEY.ArrowDown)mz-=1;
  if(KEY.KeyD||KEY.ArrowRight)mx+=1;if(KEY.KeyA||KEY.ArrowLeft)mx-=1;
  const ml=Math.hypot(mx,mz);if(ml>1){mx/=ml;mz/=ml;}
  const dr=world.P.dr,WALK=4.3*dr,FLYV=16*dr,G=30*dr,JV=8.4*dr;
  const jump=KEY.Space||move.jumpHeld,down=KEY.ShiftLeft||KEY.ShiftRight||KEY.KeyC||move.downHeld;
  if(p.fly){
    const cp=Math.cos(p.pitch),sp=Math.sin(p.pitch);
    const f3=[h[0]*cp+up[0]*sp,h[1]*cp+up[1]*sp,h[2]*cp+up[2]*sp];
    const k=FLYV*dt;
    const pos=[up[0]*p.r+(f3[0]*mz+right[0]*mx)*k,
               up[1]*p.r+(f3[1]*mz+right[1]*mx)*k,
               up[2]*p.r+(f3[2]*mz+right[2]*mx)*k];
    let r=Math.hypot(pos[0],pos[1],pos[2])+((jump?1:0)-(down?1:0))*k;
    p.dir=vnorm(pos);p.vr=0;
    const g=groundR(p.dir,shellOf(r));
    p.r=clampf(r,g,6);p.grounded=p.r<=g+1e-6;
  }else{
    if(mx||mz){ // horizontal walk, blocked by >half-block walls (jump to climb)
      const k=WALK*dt;
      const nd=vnorm([up[0]*p.r+(h[0]*mz+right[0]*mx)*k,
                      up[1]*p.r+(h[1]*mz+right[1]*mx)*k,
                      up[2]*p.r+(h[2]*mz+right[2]*mx)*k]);
      if(groundR(nd,shellOf(p.r)+1)<=p.r+0.55*dr)p.dir=nd;
    }
    if(jump&&p.grounded){p.vr=JV;p.grounded=false;}
    p.vr-=G*dt;p.r+=p.vr*dt;
    if(p.vr>0){ // ceiling: don't jump up through a dug tunnel's roof
      const col=colOf(p.dir);
      if(world.editsByCol.has(col)||world.openMask.has(col)){
        const hs=shellOf(p.r+PLAYER_H*dr);
        if(isSolid(col,hs,false)){p.r=world.P.radius(hs)-PLAYER_H*dr;p.vr=0;}}
    }
    const g=groundR(p.dir,shellOf(p.r));
    if(p.r<=g){p.r=g;p.vr=0;p.grounded=true;}
    else if(p.r-g>0.02*dr)p.grounded=false;
  }
}
export function fpLook(dx,dy){
  const k=0.0042*SET.sens,a=-dx*k,up=player.dir,h=player.head;
  const uxh=vcross(up,h),c=Math.cos(a),s=Math.sin(a);
  player.head=vnorm([h[0]*c+uxh[0]*s,h[1]*c+uxh[1]*s,h[2]*c+uxh[2]*s]);
  player.pitch=clampf(player.pitch-(SET.invertY?-dy:dy)*k,-1.45,1.45);}
