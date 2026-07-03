// world.js — the world = pure worldgen (seed) + an edit overlay on top.
// The overlay is the seam that mutable chunks (B.1) and persistence (B.5)
// build on: worldgen answers any cell from the seed; edits win over worldgen.
//
// B.1 adds two pieces of derived state:
//  - editsByCol: the same edits grouped per column, so the chunk mesher can
//    build per-column solidity masks without scanning the whole edit map.
//  - openMask: which natural cave cells are "open" (revealed). Caves start
//    closed — rendered as solid, exactly Build 1's papered-over caves — and
//    digging into a pocket floods the whole connected component open.
import*as WG from'./worldgen.js';

export const N=128;
export const world={seed:0,P:null,edits:new Map(),editsByCol:new Map(),openMask:new Map(),
  rev:0};                              // bumped per edit; autosave watches it (B.5)

export function generate(seed){
  world.seed=seed;
  world.P=WG.init(seed,N);
  world.edits.clear();world.editsByCol.clear();world.openMask.clear();
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
export function setBlock(col,s,tile){
  world.edits.set(key(col,s),tile);
  let ec=world.editsByCol.get(col);
  if(!ec){ec=new Map();world.editsByCol.set(col,ec);}
  ec.set(s,tile);
  world.rev++;
}
export function clearEdits(){
  world.edits.clear();world.editsByCol.clear();world.openMask.clear();}

// ---- open-cave bookkeeping (B.1) ----
export function isOpen(col,s){const m=world.openMask.get(col);
  return m!==undefined&&(m[s>>>5]&(1<<(s&31)))!==0;}
function open(col,s){let m=world.openMask.get(col);
  if(!m){m=new Uint32Array(3);world.openMask.set(col,m);}
  m[s>>>5]|=1<<(s&31);}
// a cell the mesher still renders as solid but worldgen says is cave air
function closedCave(col,s){const P=world.P;
  if(s<2||s>P.H[col]||isOpen(col,s))return false;
  if(world.edits.get(key(col,s))!==undefined)return false;
  return WG.mat(P,col,s)<0;}
// after (col,s) became air: flood any adjoining closed cave pocket open.
// Returns the newly opened cells (packed col*SH+s) so callers can dirty
// their chunks. Bounded in practice: measured pockets top out ~20k cells.
export function revealFrom(col,s){
  const P=world.P,out=[],stack=[];
  const push=(c,t)=>{if(closedCave(c,t)){open(c,t);out.push(c*P.SH+t);stack.push(c*P.SH+t);}};
  push(col,s+1);push(col,s-1);
  for(let d=0;d<4;d++)push(WG.neighbor(P,col,d),s);
  while(stack.length){const ck=stack.pop(),c=(ck/P.SH)|0,t=ck-c*P.SH;
    push(c,t+1);push(c,t-1);
    for(let d=0;d<4;d++)push(WG.neighbor(P,c,d),t);}
  return out;
}

// solidity as the *mesher* sees it (closed caves are solid, open ones air).
// Raycasts must use this — blockAt() would tunnel through the visible wall
// into a hidden pocket. withTrees=false gives the collision variant (walking
// through trees is Build 1 behavior, kept until real voxel collision).
export function isSolid(col,s,withTrees=true){
  const P=world.P;
  if(s<0||s>=P.SH)return false;
  const e=world.edits.get(key(col,s));
  if(e!==undefined)return e>=0&&e!==WG.T.TORCH; // torch: walk through (B.3)
  if(s>P.H[col])return withTrees&&P.treeCells.has(key(col,s));
  return !(isOpen(col,s)&&WG.mat(P,col,s)<0);
}
