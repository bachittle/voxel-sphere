// math.js — hand-rolled mat4 + vec3 helpers (same math as demo.html / Build 1).
export function perspective(f,a,n,fr){const t=1/Math.tan(f/2),nf=1/(n-fr);
  return[t/a,0,0,0,0,t,0,0,0,0,(fr+n)*nf,-1,0,0,2*fr*n*nf,0];}
export function mul(a,b){const o=new Array(16);for(let r=0;r<4;r++)for(let c=0;c<4;c++)
  o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o;}
export function rotX(a){const c=Math.cos(a),s=Math.sin(a);return[1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1];}
export function rotY(a){const c=Math.cos(a),s=Math.sin(a);return[c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1];}
export function translate(x,y,z){return[1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1];}
export const scaleM=k=>[k,0,0,0,0,k,0,0,0,0,k,0,0,0,0,1];

export const vdot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export const vcross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const vnorm=a=>{const l=Math.hypot(a[0],a[1],a[2])||1;return[a[0]/l,a[1]/l,a[2]/l];};
export const clampf=(v,a,b)=>Math.max(a,Math.min(b,v));
export const sstep=(a,b,x)=>{const t=clampf((x-a)/(b-a),0,1);return t*t*(3-2*t);};
// rotate a vec by rotY(a)/rotX(a) (same convention as the matrices above)
export const rotYv=(v,a)=>{const c=Math.cos(a),s=Math.sin(a);
  return[c*v[0]+s*v[2],v[1],-s*v[0]+c*v[2]];};
export const rotXv=(v,a)=>{const c=Math.cos(a),s=Math.sin(a);
  return[v[0],c*v[1]-s*v[2],s*v[1]+c*v[2]];};
export function lookAtM(eye,f,up){ // view matrix from eye + forward + up (all vec3)
  const s=vnorm(vcross(f,up)),u=vcross(s,f);
  return[s[0],u[0],-f[0],0, s[1],u[1],-f[1],0, s[2],u[2],-f[2],0,
    -vdot(s,eye),-vdot(u,eye),vdot(f,eye),1];}
