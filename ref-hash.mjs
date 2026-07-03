// ref-hash.mjs — worldgen snapshot hashing shared by make-reference.mjs
// (writes reference-v2.json) and game-check.mjs (compares against it).
// The snapshot covers terrain, biomes, materials, trees, and every mesh the
// game builds — any unintentional worldgen drift flips a hash.
export function fnv(bytes,h=0x811c9dc5){
  for(let i=0;i<bytes.length;i++){h^=bytes[i];h=Math.imul(h,0x01000193);}
  return h>>>0;}
export const hashArr=a=>fnv(new Uint8Array(a.buffer,a.byteOffset,a.byteLength));
export const hashMB=m=>hashArr(m.V.subarray(0,m.n))+':'+
  hashArr(m.I.subarray(0,m.ni))+':'+m.quads;

export function snapshot(WG,MESH,seed,N){
  const P=WG.init(seed,N);
  const st=MESH.buildStatic(P);
  const cut=MESH.buildCut(P,0.8);
  const mats=[];
  for(let c=0;c<P.cols;c+=53)for(let s=0;s<P.H[c];s+=2)mats.push(WG.mat(P,c,s)+2);
  return{
    H:hashArr(P.H),BI:hashArr(P.BI),dir:hashArr(P.dir),
    trees:P.trees.length,treeCells:P.treeCells.size,
    mats:fnv(Uint8Array.from(mats)),
    op:hashMB(st.op),wa:hashMB(st.wa),
    core:hashMB(MESH.buildCore(P)),disc:hashMB(MESH.buildDisc(P,0.5)),
    cutOp:hashMB(cut.op),cutWa:hashMB(cut.wa),
  };
}
