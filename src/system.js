// system.js — F.2: the world is a two-body system. The HOME planet (the
// menu's seed/N, current earth gen) and a small all-desert MOON (N=64,
// seed = home seed + 101). Only one body is fully generated and editable at
// a time — the "active" world, which IS world.js exactly as before; the far
// body renders as a baked impostor mesh (main.js).
//
// Frame contract: each world's local frame has planet radius 1 and block
// size dr = pi/2N. The shared physical unit is the BLOCK, so positions map
// between local frames by X_new = (X_old - C_old) * (N_old/N_new) —
// translation + uniform scale, NEVER rotation: the moon is geostationary,
// pinned at a fixed direction in the co-rotating frame. Both worlds share
// S.theta/S.omega, so the sun sweeps both consistently and the sun uniform
// is valid in either frame unchanged. (Tidally locked both ways: canon.)
//
// The far body's impostor scale k = N_other/N_active — blocks are the same
// physical size in both worlds, so a small-N world IS a small planet.
import{vnorm}from'./math.js';
import{SET}from'./settings.js';
import{world}from'./world.js';

export const MOON_N=64,MOON_TYPE='desert';
export const moonSeedOf=s=>s+101;          // derived + invertible (import flow)
export const MOON_DIR=vnorm([-0.35,0.42,0.84]); // fixed, well off the sun axis
export const SWITCH_R=1.5;                 // sphere of influence, in far radii

// center distance in home-local units: looms at default size, still a real
// flight; shrinks a little as home grows so a colossal home keeps the moon
// findable. =4.0 at N=128.
export const homeDist=Nh=>2.5+3*(MOON_N/Nh);

// pure frame math (node-testable): center + scale of the far body, given
// which body is active. Returns {C:[x,y,z] active-local, k: impostor scale}.
export function layout(at,homeN,activeN){
  const D=homeDist(homeN)*(at==='moon'?homeN/MOON_N:1),s=at==='moon'?-1:1;
  return{C:[MOON_DIR[0]*D*s,MOON_DIR[1]*D*s,MOON_DIR[2]*D*s],
         k:(at==='moon'?homeN:MOON_N)/activeN};}

// ---- stateful wrappers over the active world ----
export const homeSeed=()=>SET.at==='moon'?world.seed-101:world.seed;
export const homeN=()=>SET.at==='moon'?SET.worldN:world.P.N;
export function specFor(at,hSeed,hN){
  return at==='moon'?{seed:moonSeedOf(hSeed),N:MOON_N,type:MOON_TYPE}
                    :{seed:hSeed,N:hN,type:'earth'};}
export const otherSpec=()=>specFor(SET.at==='moon'?'home':'moon',homeSeed(),homeN());
export const otherLayout=()=>layout(SET.at,homeN(),world.P.N);
