// worldgen.js — pure worldgen: seeded noise, terrain, biomes, trees, materials.
// No DOM, no GL. The planet is a pure function of (seed, cell): init(seed,N)
// precomputes per-column terrain; mat(P,col,s) answers any interior cell.
// (Edit overlay lives in world.js, on top of this.)

// ---- seeded rng + 3D Perlin ----
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;
  let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;
  return((t^t>>>14)>>>0)/4294967296;};}
function makePerlin(seed){
  const rnd=mulberry32(seed),p=new Uint8Array(512),src=new Uint8Array(256);
  for(let i=0;i<256;i++)src[i]=i;
  for(let i=255;i>0;i--){const j=(rnd()*(i+1))|0,t=src[i];src[i]=src[j];src[j]=t;}
  for(let i=0;i<512;i++)p[i]=src[i&255];
  const fade=t=>t*t*t*(t*(t*6-15)+10);
  function grad(h,x,y,z){const g=h&15;
    const u=g<8?x:y, v=g<4?y:(g===12||g===14?x:z);
    return((g&1)?-u:u)+((g&2)?-v:v);}
  return function(x,y,z){
    const X=Math.floor(x)&255,Y=Math.floor(y)&255,Z=Math.floor(z)&255;
    x-=Math.floor(x);y-=Math.floor(y);z-=Math.floor(z);
    const u=fade(x),v=fade(y),w=fade(z);
    const A=p[X]+Y,AA=p[A]+Z,AB=p[A+1]+Z,B=p[X+1]+Y,BA=p[B]+Z,BB=p[B+1]+Z;
    const l=(a,b,t)=>a+t*(b-a);
    return l(l(l(grad(p[AA],x,y,z),grad(p[BA],x-1,y,z),u),
               l(grad(p[AB],x,y-1,z),grad(p[BB],x-1,y-1,z),u),v),
             l(l(grad(p[AA+1],x,y,z-1),grad(p[BA+1],x-1,y,z-1),u),
               l(grad(p[AB+1],x,y-1,z-1),grad(p[BB+1],x-1,y-1,z-1),u),v),w);};
}
function hash01(a,b){let h=Math.imul(a^0x9E3779B9,0x85EBCA6B);h^=h>>>13;
  h=Math.imul(h^b,0xC2B2AE35);h^=h>>>16;return(h>>>0)/4294967296;}

// ---- atlas tiles (index into the 8x4 runtime atlas) ----
const T={GRASS_P:0,GRASS_F:1,GSIDE_P:2,GSIDE_F:3,DIRT:4,STONE:5,SAND:6,GRAVEL:7,
  SNOW:8,GSNOW:9,LOG:10,LOG_TOP:11,LEAF:12,WATER:13,LAVA:14,
  COAL:15,IRON:16,GOLD:17,DIAMOND:18};
// biomes
const B={OCEAN:0,BEACH:1,PLAINS:2,FOREST:3,DESERT:4,MOUNT:5,SNOWCAP:6,TUNDRA:7};
const BIOME_NAMES=['ocean','beach','plains','forest','desert','mountain','snowcap','tundra'];

const DI=[-1,1,0,0],DJ=[0,0,-1,1];

// ---- planet construction ----
function init(seed,N){
  const n2=N*N,cols=6*n2;
  const dr=Math.PI/(2*N);            // shell thickness = block width at surface
  const SEA=57;                      // shells below sea level (r=1)
  const SH=SEA+27;                   // max shells stored (mountain ceiling)
  const per=makePerlin(seed);
  const fbm=(x,y,z,f,oct)=>{let a=0.5,s=0,n=0;
    for(let o=0;o<oct;o++){s+=a*per(x*f,y*f,z*f);n+=a;f*=2;a*=0.5;}return s/n;};
  const radius=s=>1+(s-SEA)*dr;      // inner face radius of shell s
  const rc=s=>1+(s-SEA+0.5)*dr;      // block-center radius of shell s
  const BALLR=radius(0)-0.35*dr;     // lava core ball, tucked under the crust

  // corner direction cache: 6 faces x (N+1)^2 unit vectors
  const CN=N+1,corner=new Float32Array(6*CN*CN*3);
  for(let f=0;f<6;f++){const axis=f>>1,s=(f&1)?-1:1,a1=(axis+1)%3,a2=(axis+2)%3;
    for(let cj=0;cj<CN;cj++)for(let ci=0;ci<CN;ci++){
      const c=[0,0,0];c[axis]=s;c[a1]=ci/N*2-1;c[a2]=cj/N*2-1;
      const l=Math.hypot(c[0],c[1],c[2]),o=(f*CN*CN+cj*CN+ci)*3;
      corner[o]=c[0]/l;corner[o+1]=c[1]/l;corner[o+2]=c[2]/l;}}

  // column center directions + terrain + biome
  const dir=new Float32Array(cols*3),H=new Int16Array(cols),BI=new Uint8Array(cols);
  for(let f=0;f<6;f++){const axis=f>>1,s=(f&1)?-1:1,a1=(axis+1)%3,a2=(axis+2)%3;
    for(let j=0;j<N;j++)for(let i=0;i<N;i++){
      const c=[0,0,0];c[axis]=s;c[a1]=(i+0.5)/N*2-1;c[a2]=(j+0.5)/N*2-1;
      const l=Math.hypot(c[0],c[1],c[2]),col=f*n2+j*N+i;
      const x=c[0]/l,y=c[1]/l,z=c[2]/l;
      dir[col*3]=x;dir[col*3+1]=y;dir[col*3+2]=z;
      // continents + ridged mountains
      const cont=fbm(x,y,z,1.5,4);
      const mmask=fbm(x+31.4,y+47.2,z+12.9,3.1,3);
      const ridge=1-Math.abs(fbm(x+91.3,y+13.7,z+55.1,4.8,4));
      let hR=cont*26+1.2;
      const mm=Math.min(1,Math.max(0,(mmask-0.02)/0.5));
      hR+=mm*mm*ridge*ridge*22;
      const h=Math.max(4,Math.min(SEA+25,SEA-1+Math.round(hR)));
      H[col]=h;
      // climate
      const lat=Math.abs(y);
      const temp=1-1.25*Math.pow(lat,2.2)+fbm(x+7.7,y+3.3,z+9.1,4.1,2)*0.24
                 -Math.max(0,h-(SEA-1))*0.013;
      const moist=0.5+fbm(x+55.5,y+66.6,z+77.7,2.4,3)*0.6;
      const hRel=h-(SEA-1);
      let b;
      if(h<SEA-1)b=B.OCEAN;
      else if(hRel>15-(0.6-Math.min(0.6,temp))*8)b=B.SNOWCAP;
      else if(hRel>9)b=B.MOUNT;
      else if(temp<0.18)b=B.TUNDRA;
      else if(h<=SEA&&temp>0.3)b=B.BEACH;
      else if(temp>0.62&&moist<0.38)b=B.DESERT;
      else if(moist>0.5)b=B.FOREST;
      else b=B.PLAINS;
      BI[col]=b;}}

  // trees (block lists in column-local integer coords; lz=1 sits on the ground)
  const trees=[];
  for(let col=0;col<cols;col++){const b=BI[col];
    let dens=0;if(b===B.FOREST)dens=0.045;else if(b===B.PLAINS)dens=0.006;
    else if(b===B.TUNDRA)dens=0.004;
    if(!dens||hash01(col,seed)>=dens)continue;
    const th=4+(hash01(col,seed^0xBEEF)*2|0);      // trunk 4-5
    const blocks=new Map();                        // "x,y,z" -> tile
    for(let k=1;k<=th;k++)blocks.set('0,0,'+k,T.LOG);
    for(let lz=th-1;lz<=th;lz++)
      for(let a=-1;a<=1;a++)for(let bb=-1;bb<=1;bb++){
        if(a===0&&bb===0&&lz<th)continue;
        if(Math.abs(a)===1&&Math.abs(bb)===1&&hash01(col+lz*7+a*3+bb,seed^77)<0.4)continue;
        const k='' +a+','+bb+','+lz;if(!blocks.has(k))blocks.set(k,T.LEAF);}
    blocks.set('0,0,'+(th+1),T.LEAF);
    blocks.set('1,0,'+(th+1),T.LEAF);blocks.set('-1,0,'+(th+1),T.LEAF);
    blocks.set('0,1,'+(th+1),T.LEAF);blocks.set('0,-1,'+(th+1),T.LEAF);
    trees.push({col,blocks});}

  // resolve tree blocks onto the world cell grid: (col, shell) -> tile.
  // A shared map is what fixes A.4 — adjacent trees used to mesh in separate
  // tangent frames and interpenetrate (coincident coplanar faces, z-fighting).
  // On the grid, overlapping canopies merge like Minecraft's: trunks win over
  // leaves, duplicates collapse, and cells inside terrain are dropped.
  const PN={N,n2};                       // neighbor() only needs N,n2
  const stepCol=(c,lx,ly)=>{
    if(lx)c=neighbor(PN,c,lx>0?1:0);
    if(ly)c=neighbor(PN,c,ly>0?3:2);
    return c;};
  const treeCells=new Map();
  for(const pass of[T.LOG,T.LEAF])       // trunks first, then leaves
    for(const tr of trees){
      const base=H[tr.col];
      for(const[key,tile]of tr.blocks){
        if(tile!==pass)continue;
        const[lx,ly,lz]=key.split(',').map(Number);
        const c=stepCol(tr.col,lx,ly),s=base+lz;
        if(s<=H[c]||s>=SH)continue;      // inside terrain / above storage
        const ck=c*SH+s;
        if(!treeCells.has(ck))treeCells.set(ck,tile);}}

  const matCache=new Int8Array(cols*SH); // 0 unknown, 1 cave-air, else tile+2
  return{seed,N,n2,cols,dr,SEA,SH,radius,rc,BALLR,corner,CN,dir,H,BI,trees,
         treeCells,per,fbm,matCache};
}

function neighbor(P,col,d){
  const N=P.N,n2=P.n2;
  const f=(col/n2)|0,r=col-f*n2,j=(r/N)|0,i=r-j*N;
  const ni=i+DI[d],nj=j+DJ[d];
  if(ni>=0&&ni<N&&nj>=0&&nj<N)return f*n2+nj*N+ni;
  const axis=f>>1,s=(f&1)?-1:1,a1=(axis+1)%3,a2=(axis+2)%3;
  const c=[0,0,0];c[axis]=s;c[a1]=(ni+0.5)/N*2-1;c[a2]=(nj+0.5)/N*2-1;
  const k=Math.abs(c[a1])>1?a1:a2;
  const sg=c[k]>0?1:-1,eps=Math.abs(c[k])-1;
  c[k]=sg;c[axis]=s*(1-eps);
  const nf=k*2+(sg>0?0:1),b1=(k+1)%3,b2=(k+2)%3;
  const ui=Math.round((c[b1]+1)/2*N-0.5),vj=Math.round((c[b2]+1)/2*N-0.5);
  return nf*n2+vj*N+ui;
}

// surface block tiles by biome
function topTile(P,col){const b=P.BI[col],h=P.H[col];
  switch(b){case B.OCEAN:return h>=P.SEA-7?T.SAND:T.GRAVEL;
    case B.BEACH:case B.DESERT:return T.SAND;
    case B.PLAINS:return T.GRASS_P;case B.FOREST:return T.GRASS_F;
    case B.MOUNT:return T.STONE;case B.SNOWCAP:case B.TUNDRA:return T.SNOW;}}
function sideTile(P,col){const b=P.BI[col],h=P.H[col];
  switch(b){case B.OCEAN:return h>=P.SEA-7?T.SAND:T.GRAVEL;
    case B.BEACH:case B.DESERT:return T.SAND;
    case B.PLAINS:return T.GSIDE_P;case B.FOREST:return T.GSIDE_F;
    case B.MOUNT:return T.STONE;case B.SNOWCAP:return T.SNOW;
    case B.TUNDRA:return T.GSNOW;}}
function underTile(P,col){const b=P.BI[col];
  switch(b){case B.OCEAN:case B.BEACH:case B.DESERT:return T.SAND;
    case B.MOUNT:case B.SNOWCAP:return T.STONE;default:return T.DIRT;}}

// material of block (col, shell s), s<=H[col]. -1 = cave air. cached.
function mat(P,col,s){
  const ck=col*P.SH+s,cv=P.matCache[ck];
  if(cv!==0)return cv===1?-1:cv-2;
  const h=P.H[col],d=h-s;let t;
  if(s<=1)t=T.LAVA;
  else if(d===0)t=topTile(P,col);
  else if(d<=3)t=underTile(P,col);
  else{
    const r=P.rc(s),x=P.dir[col*3]*r,y=P.dir[col*3+1]*r,z=P.dir[col*3+2]*r;
    if(s>=3&&P.fbm(x+21.7,y+43.9,z+8.3,4.5,2)>0.34)t=-1;      // cave
    else if(s<12&&P.per((x+3.1)*15.1,(y+7.7)*15.1,(z+1.3)*15.1)>0.50)t=T.DIAMOND;
    else if(s<22&&P.per((x+9.2)*13.9,(y+2.8)*13.9,(z+6.6)*13.9)>0.48)t=T.GOLD;
    else if(d>=8&&d<=44&&P.per((x+1.9)*12.7,(y+8.4)*12.7,(z+4.2)*12.7)>0.42)t=T.IRON;
    else if(d>=4&&d<=26&&P.per((x+6.5)*11.3,(y+5.1)*11.3,(z+9.9)*11.3)>0.38)t=T.COAL;
    else t=T.STONE;
  }
  P.matCache[ck]=t===-1?1:t+2;
  return t;
}
function matSolid(P,col,s){const m=mat(P,col,s);return m<0?T.STONE:m;}

export{init,neighbor,mat,matSolid,topTile,sideTile,underTile,T,B,BIOME_NAMES};
