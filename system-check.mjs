// system-check.mjs — F.1/F.2 verifier: the all-desert worldgen preset (the
// moon), the E.7 small-world depth fix, the two-body frame math (block-unit
// scaling, travel round-trip), ship mesh integrity, and save v3 shape.
// Reference safety (N=128 earth untouched) is game-check.mjs's job.
// Run: node system-check.mjs
import*as WG from'./src/worldgen.js';
import*as MESH from'./src/mesher.js';
import{layout,moonSeedOf,MOON_N,MOON_DIR,SWITCH_R}from'./src/system.js';
import{ship,buildShipMesh,stepShip,FLY,AP,ORBIT_R,toggleAP,apArrived}from'./src/ship.js';
import{move}from'./src/player.js';
import{world,generate,setShip}from'./src/world.js';
import{serialize,validSave}from'./src/persistence.js';

let fails=0;
const check=(ok,label)=>{console.log((ok?'  ok ':'FAIL ')+label);if(!ok)fails++;};

// ---- 1. all-desert preset (the moon's gen) ----
console.log('— desert preset (seed=1438, N=64, type=desert) —');
{
  const P=WG.init(moonSeedOf(1337),64,'desert');
  check(P.radius(0)>0,`crust fits the radius: radius(0)=${P.radius(0).toFixed(3)} (E.7 fix)`);
  check(P.SEA===28,`depth scaled with N (SEA=${P.SEA})`);
  let minH=1e9,allDesert=true;
  for(let c=0;c<P.cols;c++){if(P.H[c]<minH)minH=P.H[c];
    if(P.BI[c]!==WG.B.DESERT)allDesert=false;}
  check(minH>=P.SEA-1,`no column below sea level (min H=${minH}, SEA=${P.SEA}) — zero ocean`);
  check(allDesert,'every column is desert biome');
  check(P.treeCells.size===0,'no trees');
  const B=MESH.buildStatic(P);
  check(B.wa.quads===0,'water mesh empty');
  check(B.op.quads>0,`opaque mesh built (${B.op.quads} quads)`);
  let fin=true;for(let i=0;i<B.op.n;i++)if(!Number.isFinite(B.op.V[i]))fin=false;
  check(fin,'vertices finite');
}
// earth at N=64 gets the same depth fix
{
  const P=WG.init(1337,64);
  check(P.radius(0)>0,'earth N=64 crust also fits (E.7)');
}
// N=128 depth untouched (the reference oracle depends on it)
{
  const P=WG.init(1337,128);
  check(P.SEA===57,'N=128 SEA still 57 — reference-v2 oracle safe');
}

// ---- 2. two-body frame math ----
console.log('— system frame math —');
for(const Nh of[128,512]){
  const home=layout('home',Nh,Nh);         // active = home
  const moon=layout('moon',Nh,MOON_N);     // active = moon
  check(Math.abs(home.k-MOON_N/Nh)<1e-12,`impostor scale k=N_other/N_active (${home.k})`);
  // block-size invariance: far-body block = k*dr_other == dr_active
  const drH=Math.PI/(2*Nh),drM=Math.PI/(2*MOON_N);
  check(Math.abs(home.k*drM-drH)<1e-12,`blocks same physical size across worlds (Nh=${Nh})`);
  // centers are reciprocal in block units
  const db1=Math.hypot(...home.C)/drH,db2=Math.hypot(...moon.C)/drM;
  check(Math.abs(db1-db2)<1e-6,`center distance identical in block units (${db1.toFixed(1)})`);
  // travel round-trip: home-local -> moon-local -> home-local
  const X=[home.C[0]*0.7+0.1,home.C[1]*0.7,home.C[2]*0.7];
  const Xm=X.map((v,i)=>(v-home.C[i])*(Nh/MOON_N));  // out: home -> moon
  const Xh=Xm.map((v,i)=>(v-moon.C[i])*(MOON_N/Nh)); // back: moon -> home
  check(X.every((v,i)=>Math.abs(v-Xh[i])<1e-9),`travel transform round-trips (Nh=${Nh})`);
  // no ping-pong: arriving at SWITCH_R moon-radii, the home trigger is far
  const arriveHomeDist=Math.hypot(...moon.C)-SWITCH_R; // moon units
  check(arriveHomeDist>SWITCH_R*moon.k*1.5,'switch thresholds cannot ping-pong');
}

// ---- 3. ship mesh integrity ----
console.log('— ship mesh —');
{
  generate(1337,64,'desert');              // any real P: dr + groundR domain
  ship.pos=[0,0,1.2];ship.fwd=[1,0,0];ship.up=[0,0,1];
  const m=buildShipMesh(world.P);
  check(m.quads>0,`hull quads emitted (${m.quads})`);
  check(m.ni===m.quads*6&&m.n===m.quads*40,'index/vertex bookkeeping consistent');
  let fin=true;for(let i=0;i<m.n;i++)if(!Number.isFinite(m.V[i]))fin=false;
  check(fin,'vertices finite');
  let normBad=0;
  for(let v=0;v<m.n;v+=10){
    const l=Math.hypot(m.V[v+7],m.V[v+8],m.V[v+9]);
    if(Math.abs(l-1)>1e-3)normBad++;}
  check(normBad===0,`normals unit length (${normBad} bad)`);
  // every vertex within the hull's bounding sphere around ship.pos
  const R=4*world.P.dr;let out=0;
  for(let v=0;v<m.n;v+=10){
    const d=Math.hypot(m.V[v]-ship.pos[0],m.V[v+1]-ship.pos[1],m.V[v+2]-ship.pos[2]);
    if(d>R)out++;}
  check(out===0,'hull within 4 blocks of the ship center');
}

// ---- 4. Newtonian flight (Outer Wilds model, 2026-07-04) ----
console.log('— newtonian flight —');
{
  // stepShip fires vs-travel through window; stub it for node
  const travels=[];
  globalThis.window={dispatchEvent:e=>travels.push(e.type)};
  if(typeof globalThis.CustomEvent==='undefined')
    globalThis.CustomEvent=class{constructor(t){this.type=t;}};
  generate(1337,128);                      // home world, moon in the sky
  const dr=world.P.dr,G0=FLY.G*dr,TH=FLY.ACC*dr,DT=1/60;
  const clearKeys=()=>{for(const k in move.KEY)delete move.KEY[k];};
  const setShipState=(pos,vel,fwd,up)=>{
    ship.pos=[...pos];ship.vel=[...vel];ship.fwd=[...fwd];ship.up=[...up];};
  const speed=()=>Math.hypot(ship.vel[0],ship.vel[1],ship.vel[2]);

  // gravity pulls a coasting ship down (start opposite the moon: pure test)
  clearKeys();
  const away=MOON_DIR.map(v=>-v);
  setShipState(away.map(v=>v*1.5),[0,0,0],[0,0,1],[1,0,0]);
  stepShip(DT);
  const vr=ship.vel[0]*away[0]+ship.vel[1]*away[1]+ship.vel[2]*away[2];
  check(vr<0,'coasting ship falls (gravity on)');
  check(Math.abs(-vr-G0/2.25*DT)<G0*DT*0.05,
    `surface-g/r² magnitude at r=1.5 (vr=${(vr/dr).toFixed(2)} bl/s)`);

  // thrust is acceleration; velocity persists (accumulates, no cap chasing)
  clearKeys();move.KEY.KeyW=true;
  const tang=[0,MOON_DIR[2],-MOON_DIR[1]].map((v,_,a)=>v/Math.hypot(...a));
  setShipState(away.map(v=>v*2.5),[0,0,0],tang,away);
  for(let t=0;t<1;t+=DT)stepShip(DT);
  check(speed()>0.8*TH,`1s of thrust ≈ ACC accumulated (${(speed()/dr).toFixed(0)} bl/s)`);
  clearKeys();
  const s1=speed();
  for(let t=0;t<1;t+=DT)stepShip(DT);
  check(Math.abs(speed()-s1)<0.1*s1,'no drag: coasting keeps speed (± gravity)');

  // orbit at r=1.5: stays bound and conserves energy over one period. The
  // moon's tug makes it eccentric (real two-center dynamics — very Outer
  // Wilds), so circularity is NOT asserted; energy conservation is the
  // no-drag/no-integrator-bug oracle (a central-only sim holds circular
  // to ±0.3%, measured 2026-07-04).
  clearKeys();
  const vorb=Math.sqrt(G0/1.5);
  setShipState(away.map(v=>v*1.5),tang.map(v=>v*vorb),tang,away);
  const{C:Ch,k:kh}=layout('home',128,128);
  const energy=()=>{
    const r=Math.hypot(ship.pos[0],ship.pos[1],ship.pos[2]);
    const dO=Math.hypot(Ch[0]-ship.pos[0],Ch[1]-ship.pos[1],Ch[2]-ship.pos[2]);
    return 0.5*speed()**2-G0/r-G0*kh*kh/dO;};
  const E0=energy();
  let rMin=9,rMax=0;
  for(let t=0;t<19;t+=DT){stepShip(DT);
    const r=Math.hypot(ship.pos[0],ship.pos[1],ship.pos[2]);
    if(r<rMin)rMin=r;if(r>rMax)rMax=r;}
  check(rMin>1.2&&rMax<3,
    `orbit stays bound one period (r ${rMin.toFixed(3)}..${rMax.toFixed(3)})`);
  check(Math.abs(energy()-E0)<0.01*Math.abs(E0),
    `orbital energy conserved (dE/E=${((energy()-E0)/Math.abs(E0)).toExponential(1)})`);

  // B match-velocity kills planet-frame speed (2s: brake ≈ ACC, tuned low)
  clearKeys();move.KEY.KeyB=true;
  setShipState(away.map(v=>v*2.5),tang.map(v=>v*0.5),tang,away);
  for(let t=0;t<2;t+=DT)stepShip(DT);
  check(speed()<0.05,`match velocity brakes to a stop (${(speed()/dr).toFixed(1)} bl/s left)`);

  // landed: ground contact + strut friction bleed tangential speed
  clearKeys();
  setShipState(away,tang.map(v=>v*0.1),tang,away);   // at r=1, on/under ground
  for(let t=0;t<2;t+=DT)stepShip(DT);
  const rl=Math.hypot(ship.pos[0],ship.pos[1],ship.pos[2]);
  check(speed()<0.005&&rl>=1,'landing: struts grip, ship rests on the surface');

  // crossing the far SOI fires vs-travel
  clearKeys();
  const{C,k}=layout('home',128,128);
  setShipState([C[0]-MOON_DIR[0]*k,C[1]-MOON_DIR[1]*k,C[2]-MOON_DIR[2]*k],
    [0,0,0],tang,away);
  stepShip(DT);
  check(travels.includes('vs-travel'),'crossing the SOI fires vs-travel');

  // ---- staged autopilot: the full G·G·G beginner ladder, hands-off ----
  // stage 1 — surface -> parking orbit (worst case: the anti-moon point)
  clearKeys();travels.length=0;ship.piloting=true;
  setShipState(away.map(v=>v*1.01),[0,0,0],tang,away);
  AP.lock=true;toggleAP();
  check(AP.on&&AP.mode==='orbit','G on the ground stages to-orbit (even locked)');
  let apT=0;
  while(apT<120&&AP.on){stepShip(DT);apT+=DT;}
  const dr128=world.P.dr;
  let arl=Math.hypot(ship.pos[0],ship.pos[1],ship.pos[2]);
  let avr=(ship.vel[0]*ship.pos[0]+ship.vel[1]*ship.pos[1]+ship.vel[2]*ship.pos[2])/arl;
  const vOrb=Math.sqrt(30*dr128/ORBIT_R);
  const vt=Math.hypot(ship.vel[0]-ship.pos[0]/arl*avr,ship.vel[1]-ship.pos[1]/arl*avr,
                      ship.vel[2]-ship.pos[2]/arl*avr);
  check(!AP.on&&Math.abs(arl-ORBIT_R)<0.05&&Math.abs(vt-vOrb)<0.15*vOrb,
    `stage 1: surface -> circular orbit (${apT.toFixed(0)}s, r=${arl.toFixed(2)}, vt=${(vt/dr128).toFixed(0)} bl/s)`);
  check(AP.done.includes('orbit'),'stage complete hint set');
  // orbit holds unpowered for 10s (bound, no thrust)
  for(let t2=0;t2<10;t2+=DT)stepShip(DT);
  arl=Math.hypot(ship.pos[0],ship.pos[1],ship.pos[2]);
  check(arl>1.15&&arl<2.8,`parking orbit holds unpowered — eccentric from the moon's tide (r=${arl.toFixed(2)})`);
  // stage 2 — orbit -> the moon's SOI (G again, still locked)
  toggleAP();
  check(AP.on&&AP.mode==='transfer','G in orbit + lock stages transfer');
  apT=0;
  while(apT<240&&!travels.length){stepShip(DT);apT+=DT;}
  check(travels.length>0,`stage 2: orbit -> moon SOI hands-off (${apT.toFixed(0)}s sim)`);
  check(AP.on,'autopilot rides through the switch');
  // emulate main.js's travel handoff: home frame -> moon frame, then the
  // arrival hook — the autopilot should circularize into the NEW orbit
  {
    const{C:Ch}=layout('home',128,128);
    const ratio=128/MOON_N;
    generate(moonSeedOf(1337),MOON_N,'desert');
    for(let i=0;i<3;i++){ship.pos[i]=(ship.pos[i]-Ch[i])*ratio;ship.vel[i]*=ratio;}
    apArrived();
  }
  check(AP.mode==='orbit'&&!AP.lock,'arrival flips to orbit mode, lock cleared');
  apT=0;
  while(apT<120&&AP.on){stepShip(DT);apT+=DT;}
  const drM=world.P.dr;
  arl=Math.hypot(ship.pos[0],ship.pos[1],ship.pos[2]);
  check(!AP.on&&Math.abs(arl-ORBIT_R)<0.15,
    `stage 2 ends in MOON orbit (${apT.toFixed(0)}s, r=${arl.toFixed(2)})`);
  // stage 3 — orbit -> touchdown (G again, no lock)
  toggleAP();
  check(AP.on&&AP.mode==='land','G in orbit without lock stages landing');
  apT=0;
  while(apT<120&&AP.on){stepShip(DT);apT+=DT;}
  arl=Math.hypot(ship.pos[0],ship.pos[1],ship.pos[2]);
  const lsp=Math.hypot(ship.vel[0],ship.vel[1],ship.vel[2])/drM;
  check(!AP.on&&lsp<5&&arl>=1,
    `stage 3: orbit -> touchdown on the moon (${apT.toFixed(0)}s, ${lsp.toFixed(1)} bl/s)`);
  ship.piloting=false;
  delete globalThis.window;
}

// ---- 5. save v3 shape ----
console.log('— save v3 —');
{
  generate(1337,64,'desert');              // own world: don't lean on section 4's
  setShip({pos:[0,0,1.2],fwd:[1,0,0],up:[0,0,1]});
  const d=validSave(JSON.parse(serialize()));
  check(!!d&&d.v===3&&d.type==='desert'&&!!d.ship,'serialize -> validSave round-trip (type + ship)');
  check(validSave({v:1,edits:[]}).N===128,'v1 saves still read (N=128, earth)');
  check(validSave({v:2,edits:[],seed:1,N:256}).type==='earth','v2 saves still read (earth)');
  check(validSave({v:9,edits:[]})===null,'unknown versions rejected');
}

console.log(fails?`\n${fails} FAILURES`:'\nall checks passed');
process.exit(fails?1:0);
