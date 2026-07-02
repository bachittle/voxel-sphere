// world.js — the world = pure worldgen (seed) + an edit overlay on top.
// The overlay is the seam that mutable chunks (B.1) and persistence (B.5)
// build on: worldgen answers any cell from the seed; edits win over worldgen.
import*as WG from'./worldgen.js';

export const N=128;
export const world={seed:0,P:null,edits:new Map()};

export function generate(seed){
  world.seed=seed;
  world.P=WG.init(seed,N);
  world.edits.clear();
  return world.P;
}

const key=(col,s)=>col*world.P.SH+s;
// material at (col, shell s): edit overlay first, then pure worldgen —
// below ground mat(), above ground tree cells. -1 = air (cave or dug out).
export function blockAt(col,s){
  const P=world.P,e=world.edits.get(key(col,s));
  if(e!==undefined)return e;
  if(s>P.H[col]){const t=P.treeCells.get(key(col,s));return t===undefined?-1:t;}
  return WG.mat(P,col,s);
}
export function setBlock(col,s,tile){world.edits.set(key(col,s),tile);}
export function clearEdits(){world.edits.clear();}
