import {FreeCamera,Vector3} from '@babylonjs/core';

const V=(x,y,z)=>new Vector3(x,y,z);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
// Six-direction cinematic spectator, independent of Havok/player survival.
// Unlike an ArcRotateCamera it has no forced orbit pivot, radius or sky limit.
export class FlyController{
 constructor(scene,canvas,orbit){
  this.scene=scene;this.canvas=canvas;this.orbit=orbit;
  this.camera=new FreeCamera('unrestricted flying spectator',V(0,140,-210),scene);
  this.camera.minZ=.12;this.camera.maxZ=6000;this.camera.fov=1.05;
  this.camera.speed=0;
  this.enabled=false;this.yaw=0;this.pitch=.3;this.speed=32;
  this.keys=new Set();this.buttons=new Set();this.drag=null;
  this.onBlur=()=>{this.keys.clear();this.buttons.clear();this.drag=null};
  this.onDown=e=>{
   if(!this.enabled||e.button!==0&&e.button!==2)return;
   this.drag={id:e.pointerId,x:e.clientX,y:e.clientY};
  };
  this.onMove=e=>{
   if(!this.enabled||this.drag?.id!==e.pointerId)return;
   const dx=e.clientX-this.drag.x,dy=e.clientY-this.drag.y;
   this.drag.x=e.clientX;this.drag.y=e.clientY;
   this.look(dx,dy);
  };
  this.onUp=e=>{if(this.drag?.id===e.pointerId)this.drag=null};
  this.onWheel=e=>{
   if(!this.enabled)return;
   e.preventDefault();
   this.speed=clamp(this.speed*Math.exp(-e.deltaY*.0016),5,250);
  };
  this.canvas.addEventListener('pointerdown',this.onDown);
  this.canvas.addEventListener('pointermove',this.onMove);
  this.canvas.addEventListener('pointerup',this.onUp);
  this.canvas.addEventListener('pointercancel',this.onUp);
  this.canvas.addEventListener('wheel',this.onWheel,{passive:false});
  window.addEventListener('blur',this.onBlur);
 }
 look(dx,dy){
  this.yaw-=dx*.0033;
  this.pitch=clamp(this.pitch-dy*.0033,-Math.PI*.49,Math.PI*.49);
  this.camera.rotation.set(this.pitch,this.yaw,0);
 }
 setEnabled(enabled){
  if(this.enabled===enabled)return;
  this.enabled=enabled;this.keys.clear();this.buttons.clear();this.drag=null;
  if(enabled){
   // Continue from the exact current orbit view, not a jarring teleport.
   const origin=this.orbit.globalPosition||this.orbit.position;
   this.camera.position.copyFrom(origin);
   const direction=this.orbit.getForwardRay(1).direction;
   this.yaw=Math.atan2(direction.x,direction.z);
   this.pitch=-Math.asin(clamp(direction.y,-1,1));
   this.camera.rotation.set(this.pitch,this.yaw,0);
   this.orbit.detachControl();
   this.scene.activeCamera=this.camera;
  }else{
   this.scene.activeCamera=this.orbit;
   this.orbit.attachControl(this.canvas,true);
  }
 }
 key(code,pressed){
  if(!this.enabled)return false;
  if(!['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ShiftLeft','ShiftRight','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(code))return false;
  if(pressed)this.keys.add(code);else this.keys.delete(code);
  return true;
 }
 button(direction,pressed){
  if(pressed)this.buttons.add(direction);else this.buttons.delete(direction);
 }
 update(dt){
  if(!this.enabled)return;
  const on=(key,alt)=>this.keys.has(key)||!!alt&&this.buttons.has(alt);
  const forward=Number(on('KeyW','forward')||on('ArrowUp'))-
    Number(on('KeyS','back')||on('ArrowDown'));
  const side=Number(on('KeyD','right')||on('ArrowRight'))-
    Number(on('KeyA','left')||on('ArrowLeft'));
  const vertical=Number(on('KeyE','up'))-Number(on('KeyQ','down'));
  const magnitude=Math.hypot(forward,side,vertical);
  if(magnitude<.01)return;
  // True fly controls: W follows camera pitch, A/D strafe, E/Q rise/fall.
  const forwardVector=this.camera.getForwardRay(1).direction;
  const right=V(Math.cos(this.yaw),0,-Math.sin(this.yaw));
  const move=forwardVector.scale(forward).addInPlace(right.scale(side))
    .addInPlaceFromFloats(0,vertical,0);
  move.normalize();
  const turbo=this.keys.has('ShiftLeft')||this.keys.has('ShiftRight')?3.4:1;
  const step=Math.min(dt,.10)*this.speed*turbo;
  this.camera.position.addInPlace(move.scale(step));
 }
 position(){const p=this.camera.position;return {x:p.x,y:p.y,z:p.z}}
 dispose(){
  this.setEnabled(false);
  this.canvas.removeEventListener('pointerdown',this.onDown);
  this.canvas.removeEventListener('pointermove',this.onMove);
  this.canvas.removeEventListener('pointerup',this.onUp);
  this.canvas.removeEventListener('pointercancel',this.onUp);
  this.canvas.removeEventListener('wheel',this.onWheel);
  window.removeEventListener('blur',this.onBlur);
  this.camera.dispose();
 }
}
