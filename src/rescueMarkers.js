// High-contrast HTML SOS markers; no broken black billboard texture planes.
import {Vector3,Matrix} from '@babylonjs/core';
import {civilianPosition} from './citizenRagdolls.js';
export class RescueMarkers{
 constructor(canvas){
  this.canvas=canvas;this.pool=[];this.last=0;
  this.layer=document.createElement('div');
  this.layer.className='rescue-sign-layer';
  document.querySelector('#app').appendChild(this.layer);
  for(let i=0;i<12;i++){
   const tag=document.createElement('div');
   tag.className='rescue-tag';
   tag.innerHTML='<b>✚</b> HELP <span>!</span>';
   tag.style.display='none';
   this.layer.appendChild(tag);this.pool.push(tag);
  }
 }
 update(world,scene,now=performance.now()){
  if(now-this.last<55)return;
  this.last=now;
  const camera=scene?.activeCamera,canvas=this.canvas;
  if(!camera||!world){this.hide();return}
  const w=canvas.clientWidth,h=canvas.clientHeight;
  const renderW=scene.getEngine().getRenderWidth(),renderH=scene.getEngine().getRenderHeight();
  const viewport=camera.viewport.toGlobal(renderW,renderH);
  const forward=camera.getForwardRay(1).direction;
  const origin=camera.position;
  const victims=[];
  for(const p of world.civilians){
   if(p.state!=='injured')continue;
   const pos=civilianPosition(p);
   const dx=pos.x-origin.x,dy=pos.y-origin.y,dz=pos.z-origin.z;
   if(dx*forward.x+dy*forward.y+dz*forward.z<=.4)continue;
   const projection=Vector3.Project(
    new Vector3(pos.x,pos.y+2.4,pos.z),
    Matrix.Identity(),scene.getTransformMatrix(),viewport);
   if(projection.z<0||projection.z>1)continue;
   const x=projection.x/renderW*w,y=projection.y/renderH*h;
   if(x<22||y<90||x>w-22||y>h-64)continue;
   const distance=Math.hypot(dx,dy,dz);
   victims.push({x,y,distance,p});
  }
  victims.sort((a,b)=>a.distance-b.distance);
  const total=Math.min(this.pool.length,world.mobile?6:12,victims.length);
  for(let i=0;i<this.pool.length;i++){
   const el=this.pool[i];
   if(i>=total){el.style.display='none';continue}
   const v=victims[i];
   el.style.display='block';el.style.left=v.x+'px';el.style.top=v.y+'px';
   el.style.opacity=String(Math.max(.63,Math.min(1,145/v.distance)));
   el.classList.toggle('rescue-tag-near',v.distance<9);
  }
 }
 hide(){for(const el of this.pool)el.style.display='none'}
 dispose(){this.layer.remove();this.pool.length=0}
}
