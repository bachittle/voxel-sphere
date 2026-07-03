// gl.js — WebGL context, shader programs, mesh upload/draw, star field and
// atmosphere shell. One canvas, module-level singletons (same as Build 1).
export const canvas=document.getElementById('gl');
export const gl=canvas.getContext('webgl',{antialias:true});
if(!gl)alert('WebGL not available');
if(!gl.getExtension('OES_element_index_uint'))alert('OES_element_index_uint missing');
function sh(t,s){const o=gl.createShader(t);gl.shaderSource(o,s);gl.compileShader(o);
  if(!gl.getShaderParameter(o,gl.COMPILE_STATUS))throw gl.getShaderInfoLog(o);return o;}
function prog(vs,fs){const p=gl.createProgram();gl.attachShader(p,sh(gl.VERTEX_SHADER,vs));
  gl.attachShader(p,sh(gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw gl.getProgramInfoLog(p);return p;}

export const mainP=prog(`
  attribute vec3 aPos;attribute vec2 aUV;attribute vec2 aSC;attribute vec3 aNrm;
  uniform mat4 uMVP;uniform float uClip,uMode;uniform vec3 uSun;
  varying vec2 vUV;varying float vX;varying vec3 vL;varying vec3 vPos;
  void main(){
    if(uMode<0.5&&aSC.y>uClip){gl_Position=vec4(2.,2.,2.,1.);vUV=aUV;vL=vec3(0.);vX=0.;vPos=vec3(0.);return;}
    vUV=aUV;vX=aPos.x;vPos=aPos;
    // day/night: radial dir vs sun sets the terminator; face normal sets diffuse
    vec3 rd=normalize(aPos);
    float dd=dot(rd,uSun);
    float dayA=smoothstep(-0.10,0.14,dd);
    vec3 sunCol=mix(vec3(1.30,0.60,0.26),vec3(1.04,1.00,0.94),smoothstep(0.02,0.34,dd));
    float dif=max(dot(aNrm,uSun),0.0);
    vec3 amb=mix(vec3(0.055,0.075,0.14),vec3(0.34,0.36,0.40),dayA);
    vL=(amb+sunCol*(dif*0.95*dayA))*min(aSC.x,1.0);
    if(aSC.x>1.2)vL=vec3(1.15);   // emissive lava (and torch sprites)
    gl_Position=uMVP*vec4(aPos,1.);}`,`
  #ifdef GL_FRAGMENT_PRECISION_HIGH
  precision highp float;
  #else
  precision mediump float;
  #endif
  uniform sampler2D uT;uniform float uClip,uMode,uAlpha,uTileMode;uniform vec4 uTileRect;
  uniform vec3 uPt[8];uniform float uPtN,uPtR; // C.1 torch point lights
  varying vec2 vUV;varying float vX;varying vec3 vL;varying vec3 vPos;
  void main(){
    if(uMode>0.5&&vX>uClip)discard;
    vec2 uv=uTileMode>0.5?uTileRect.xy+fract(vUV)*uTileRect.zw:vUV;
    vec4 c=texture2D(uT,uv);
    if(c.a<0.5)discard;
    vec3 pt=vec3(0.);
    for(int i=0;i<8;i++){
      if(float(i)>=uPtN)break;
      float f=max(0.,1.-distance(vPos,uPt[i])/uPtR);
      pt+=vec3(1.00,0.72,0.40)*(f*f*1.1);}
    // MC-style: block light doesn't add to daylight, the brighter one wins
    gl_FragColor=vec4(c.rgb*max(vL,pt),uAlpha);}`);
export const U={};
for(const n of['uMVP','uClip','uMode','uAlpha','uTileMode','uTileRect','uT','uSun',
               'uPt','uPtN','uPtR'])
  U[n]=gl.getUniformLocation(mainP,n);
const aPos=gl.getAttribLocation(mainP,'aPos'),aUV=gl.getAttribLocation(mainP,'aUV'),
      aSC=gl.getAttribLocation(mainP,'aSC'),aNrm=gl.getAttribLocation(mainP,'aNrm');

export const starP=prog(`
  attribute vec3 aPos;attribute float aS;uniform mat4 uMVP;varying float vS;
  void main(){gl_Position=uMVP*vec4(aPos,1.);gl_PointSize=aS;vS=aS;}`,`
  precision mediump float;varying float vS;uniform float uFade;
  void main(){vec2 d=gl_PointCoord-vec2(0.5);float r=dot(d,d);
    if(r>0.25)discard;gl_FragColor=vec4(0.85,0.88,1.0,(1.0-r*2.6)*uFade);}`);
export const sU=gl.getUniformLocation(starP,'uMVP'),sFade=gl.getUniformLocation(starP,'uFade');
export const sPosA=gl.getAttribLocation(starP,'aPos'),sSA=gl.getAttribLocation(starP,'aS');

// atmosphere rim glow: an icosphere shell, additive fresnel tinted by sun side
export const atmoP=prog(`
  attribute vec3 aPos;uniform mat4 uMVP;uniform float uR;varying vec3 vN;
  void main(){vN=aPos;gl_Position=uMVP*vec4(aPos*uR,1.);}`,`
  precision mediump float;varying vec3 vN;uniform vec3 uSun,uCam;
  uniform highp float uR; // must match the vertex shader's default-highp uR
  void main(){
    vec3 n=normalize(vN);
    vec3 vd=normalize(uCam-n*uR);
    float fr=pow(1.0-abs(dot(vd,n)),3.0);
    float d=dot(n,uSun);
    float day=smoothstep(-0.28,0.06,d);
    vec3 col=mix(vec3(0.08,0.15,0.38),
      mix(vec3(1.00,0.42,0.15),vec3(0.30,0.55,1.00),smoothstep(0.0,0.38,d)),day);
    gl_FragColor=vec4(col*fr*(0.10+0.85*day),1.0);}`);
export const aU={uMVP:gl.getUniformLocation(atmoP,'uMVP'),uR:gl.getUniformLocation(atmoP,'uR'),
  uSun:gl.getUniformLocation(atmoP,'uSun'),uCam:gl.getUniformLocation(atmoP,'uCam')};
export const atmoPosA=gl.getAttribLocation(atmoP,'aPos');

export const atmoMesh=(()=>{ // unit icosphere, 2 subdivisions (320 tris)
  const PHI=(1+Math.sqrt(5))/2,nm=v=>{const l=Math.hypot(...v);return[v[0]/l,v[1]/l,v[2]/l];};
  let v=[[-1,PHI,0],[1,PHI,0],[-1,-PHI,0],[1,-PHI,0],[0,-1,PHI],[0,1,PHI],
    [0,-1,-PHI],[0,1,-PHI],[PHI,0,-1],[PHI,0,1],[-PHI,0,-1],[-PHI,0,1]].map(nm);
  let f=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],
    [10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],
    [6,2,10],[8,6,7],[9,8,1]];
  for(let s=0;s<2;s++){const mid=new Map(),nf=[];
    const gm=(a,b)=>{const k=a<b?a*65536+b:b*65536+a;if(mid.has(k))return mid.get(k);
      const m=nm([v[a][0]+v[b][0],v[a][1]+v[b][1],v[a][2]+v[b][2]]);v.push(m);
      mid.set(k,v.length-1);return v.length-1;};
    for(const[a,b,c]of f){const ab=gm(a,b),bc=gm(b,c),ca=gm(c,a);
      nf.push([a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca]);}f=nf;}
  const V=new Float32Array(v.length*3);v.forEach((p,i)=>V.set(p,i*3));
  const I=new Uint16Array(f.length*3);f.forEach((t,i)=>I.set(t,i*3));
  const vbo=gl.createBuffer(),ibo=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,vbo);gl.bufferData(gl.ARRAY_BUFFER,V,gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ibo);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,I,gl.STATIC_DRAW);
  return{vbo,ibo,count:I.length};})();
export const ATM_R=1.42;

export const starMesh=(()=>{
  const R=50,COUNT=750,rnd=(s=>()=>{s|=0;s=s+0x6D2B79F5|0;
    let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;
    return((t^t>>>14)>>>0)/4294967296;})(99);
  const V=new Float32Array(COUNT*4);
  for(let i=0;i<COUNT;i++){
    const z=rnd()*2-1,a=rnd()*2*Math.PI,r=Math.sqrt(1-z*z);
    V[i*4]=Math.cos(a)*r*R;V[i*4+1]=z*R;V[i*4+2]=Math.sin(a)*r*R;
    V[i*4+3]=1+rnd()*2;}
  const vbo=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,vbo);gl.bufferData(gl.ARRAY_BUFFER,V,gl.STATIC_DRAW);
  return{vbo,count:COUNT};})();

// ---- line overlay (B.2 block-target outline) ----
const lineP=prog(`
  attribute vec3 aPos;uniform mat4 uMVP;
  void main(){gl_Position=uMVP*vec4(aPos,1.);}`,`
  precision mediump float;uniform vec4 uCol;
  void main(){gl_FragColor=uCol;}`);
const lU={uMVP:gl.getUniformLocation(lineP,'uMVP'),uCol:gl.getUniformLocation(lineP,'uCol')};
const lPosA=gl.getAttribLocation(lineP,'aPos');
const lineVbo=gl.createBuffer();
export function drawLines(verts,mvp,col){
  gl.useProgram(lineP);
  gl.uniformMatrix4fv(lU.uMVP,false,mvp);
  gl.uniform4f(lU.uCol,col[0],col[1],col[2],col[3]);
  gl.bindBuffer(gl.ARRAY_BUFFER,lineVbo);
  gl.bufferData(gl.ARRAY_BUFFER,verts,gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(lPosA);gl.vertexAttribPointer(lPosA,3,gl.FLOAT,false,12,0);
  gl.drawArrays(gl.LINES,0,verts.length/3);}

// ---- mesh upload / draw ----
export function upload(mb){
  const vbo=gl.createBuffer(),ibo=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,vbo);
  gl.bufferData(gl.ARRAY_BUFFER,mb.V.subarray(0,mb.n),gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,mb.I.subarray(0,mb.ni),gl.STATIC_DRAW);
  return{vbo,ibo,count:mb.ni,quads:mb.quads};}
export function freeMesh(m){if(!m)return;gl.deleteBuffer(m.vbo);gl.deleteBuffer(m.ibo);}
export function drawMesh(m,clip,mode,alpha,tileMode){
  if(!m||!m.count)return;
  gl.uniform1f(U.uClip,clip);gl.uniform1f(U.uMode,mode);
  gl.uniform1f(U.uAlpha,alpha);gl.uniform1f(U.uTileMode,tileMode);
  gl.bindBuffer(gl.ARRAY_BUFFER,m.vbo);
  gl.enableVertexAttribArray(aPos);gl.vertexAttribPointer(aPos,3,gl.FLOAT,false,40,0);
  gl.enableVertexAttribArray(aUV);gl.vertexAttribPointer(aUV,2,gl.FLOAT,false,40,12);
  gl.enableVertexAttribArray(aSC);gl.vertexAttribPointer(aSC,2,gl.FLOAT,false,40,20);
  gl.enableVertexAttribArray(aNrm);gl.vertexAttribPointer(aNrm,3,gl.FLOAT,false,40,28);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,m.ibo);
  gl.drawElements(gl.TRIANGLES,m.count,gl.UNSIGNED_INT,0);}

export function resize(){const dpr=Math.min(devicePixelRatio||1,2);
  canvas.width=innerWidth*dpr;canvas.height=innerHeight*dpr;
  gl.viewport(0,0,canvas.width,canvas.height);}
