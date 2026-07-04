// hotbar.js — B.3 creative hotbar: 9 slots, keys 1-9 / scroll / click select.
// Water & lava stay off the bar until S.2 gives them flow. Icons are cut from
// the composed texture atlas, so tinted tiles (leaves) look right.
import{T}from'./worldgen.js';
import{ICONS}from'./textures.js';

export const SHIP_ITEM='ship'; // F.1: not a tile — right-click plants the ship
export const SLOTS=[T.DIRT,T.STONE,T.SAND,T.LOG,T.LEAF,T.GLASS,T.TORCH,SHIP_ITEM,null];
const NAMES={[T.DIRT]:'dirt',[T.STONE]:'stone',[T.SAND]:'sand',[T.LOG]:'log',
  [T.LEAF]:'leaves',[T.GLASS]:'glass',[T.TORCH]:'torch',[SHIP_ITEM]:'spaceship'};
let sel=0;
const bar=document.getElementById('hotbar'),cells=[];

export function initHotbar(){ // call after buildAtlas has filled ICONS
  bar.innerHTML='';cells.length=0;
  SLOTS.forEach((t,k)=>{
    const d=document.createElement('div');d.className='slot';
    if(t===SHIP_ITEM){d.textContent='🚀';d.style.fontSize='22px';d.title=NAMES[t];}
    else if(t!==null){
      const im=new Image();im.src=ICONS[t];im.alt=NAMES[t];im.title=NAMES[t];
      d.appendChild(im);}
    d.addEventListener('click',()=>select(k));
    bar.appendChild(d);cells.push(d);});
  select(0);
}
export function select(k){sel=((k%9)+9)%9;
  cells.forEach((c,i)=>c.classList.toggle('sel',i===sel));}
export function cycle(d){select(sel+d);}
export const selectedTile=()=>SLOTS[sel];
