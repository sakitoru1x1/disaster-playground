import {FreeCamera, Vector3} from '@babylonjs/core';
import {PlayerSurvival} from './playerSurvival.js';
import {CITY_HALF_SIZE} from './cityLayout.js';
import {applyLevelLook} from './cameraHorizon.js';

// Ground-level spectator: no Havok character body (preserves the rubble physics budget).
// Match the normal standing eye line when activating WALK / RESPAWN.
const EYE_HEIGHT=2.08;
const PLAYER_RADIUS=.56;
const MOVE_SPEED=7.2;
const SPRINT_MULTIPLIER=1.65;
const LIMIT=CITY_HALF_SIZE-5;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));

export class WalkController {
  constructor(scene,canvas,orbit,world,mobile=false){
    this.scene=scene;
    this.canvas=canvas;
    this.orbit=orbit;
    this.world=world;
    this.mobile=mobile;
    this.enabled=false;
    this.started=false;
    this.keys=new Set();
    this.stickX=0;
    this.stickY=0;
    this.lookPointer=null;
    this.joystickPointer=null;
    this.yaw=1.18;
    this.pitch=0;
    this.camera=new FreeCamera('street level spectator',new Vector3(-13,EYE_HEIGHT,-10),scene);
    this.camera.minZ=.07;
    this.camera.maxZ=1000;
    this.camera.fov=1.18;
    applyLevelLook(this.camera,this.yaw,0);
    this.camera.speed=0; // Havok survivor capsule drives camera positioning.
    this.survival=new PlayerSurvival(this);
    this.onMove=e=>{
      if(!this.enabled||document.pointerLockElement!==canvas)return;
      this.rotate(e.movementX,e.movementY);
    };
    this.onLockChange=()=>document.documentElement.classList.toggle(
      'walk-locked',this.enabled&&document.pointerLockElement===canvas
    );
    this.onBlur=()=>{this.keys.clear();this.releaseJoystick(null,document.getElementById('walkStick'));this.lookPointer=null};
    document.addEventListener('mousemove',this.onMove);
    document.addEventListener('pointerlockchange',this.onLockChange);
    window.addEventListener('blur',this.onBlur);
  }
  dispose(){
    if(document.pointerLockElement===this.canvas)document.exitPointerLock?.();
    document.removeEventListener('mousemove',this.onMove);
    document.removeEventListener('pointerlockchange',this.onLockChange);
    window.removeEventListener('blur',this.onBlur);
    this.survival.dispose();
    this.camera.dispose();
  }
  // Choose a clear street corner rather than spawning into a random parked car.
  findSpawn(){
    const spots=[[-13,-13],[13,-13],[-13,13],[13,13],
      [0,-13],[0,13],[-13,0],[13,0],[-39,-13],[39,-13],[-39,13],[39,13],
      [-13,-39],[13,-39],[-13,39],[13,39]];
    let best=spots[0],bestScore=-Infinity;
    for(const [x,z] of spots){
      if(!this.canStand(x,z))continue;
      const yaw=Math.atan2(-x,-z);
      const fx=Math.sin(yaw),fz=Math.cos(yaw);
      let score=-Math.hypot(x,z)*.03;
      for(const distance of [1.5,3.5,5.5]){
        if(this.canStand(x+fx*distance,z+fz*distance))score+=2;
        if(this.canStand(x-fz*distance,z+fx*distance))score++;
        if(this.canStand(x+fz*distance,z-fx*distance))score++;
      }
      if(score>bestScore){best=[x,z];bestScore=score}
    }
    return best;
  }
  setEnabled(next){
    if(this.enabled===next)return;
    this.enabled=next;
    this.keys.clear();this.releaseJoystick(null,document.getElementById('walkStick'));this.lookPointer=null;
    if(next){
      this.orbit.detachControl();
      this.scene.activeCamera=this.camera;
      if(!this.started||!this.canStand(this.camera.position.x,this.camera.position.z)){
        const [x,z]=this.findSpawn();
        this.camera.position.set(x,EYE_HEIGHT,z);
        this.yaw=Math.atan2(-x,-z);this.pitch=0;
        applyLevelLook(this.camera,this.yaw,0);
      }
      this.started=true;
      this.survival.spawn(this.camera.position.x,this.camera.position.z);
    }else{
      this.survival.dispose();
      if(document.pointerLockElement===this.canvas)document.exitPointerLock?.();
      this.scene.activeCamera=this.orbit;
      this.orbit.attachControl(this.canvas,true);
    }
    document.documentElement.classList.toggle('walk-mode',next);
    this.onLockChange();
  }
  lockPointer(){
    if(!this.enabled||this.mobile||document.pointerLockElement===this.canvas)return;
    const result=this.canvas.requestPointerLock?.();
    result?.catch?.(()=>{});
  }
  rotate(dx,dy){
    if(!this.enabled)return;
    const sensitivity=this.mobile?.0043:.00215;
    this.yaw+=dx*sensitivity;
    this.pitch=clamp(this.pitch+dy*sensitivity,-1.43,1.43);
    applyLevelLook(this.camera,this.yaw,this.pitch);
  }
  key(code,pressed){
    if(!this.enabled)return false;
    if(!['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight',
      'ShiftLeft','ShiftRight'].includes(code))return false;
    if(pressed)this.keys.add(code);else this.keys.delete(code);
    return true;
  }
  beginTouchLook(e){
    if(!this.enabled||e.pointerType!=='touch'||this.lookPointer!==null)return;
    this.lookPointer=e.pointerId;
    this.lastLookX=e.clientX;
    this.lastLookY=e.clientY;
  }
  moveTouchLook(e){
    if(!this.enabled||e.pointerId!==this.lookPointer)return;
    this.rotate(e.clientX-this.lastLookX,e.clientY-this.lastLookY);
    this.lastLookX=e.clientX;
    this.lastLookY=e.clientY;
  }
  endTouchLook(e){if(e.pointerId===this.lookPointer)this.lookPointer=null}
  startJoystick(e,element,thumb){
    if(!this.enabled||this.joystickPointer!==null)return;
    e.preventDefault();
    e.stopPropagation();
    this.joystickPointer=e.pointerId;
    element.setPointerCapture?.(e.pointerId);
    this.updateJoystick(e,element,thumb);
  }
  updateJoystick(e,element,thumb){
    if(e.pointerId!==this.joystickPointer)return;
    const rect=element.getBoundingClientRect();
    const radius=Math.max(30,Math.min(rect.width,rect.height)*.36);
    let x=(e.clientX-(rect.left+rect.width/2))/radius;
    let y=(e.clientY-(rect.top+rect.height/2))/radius;
    const mag=Math.hypot(x,y);
    if(mag>1){x/=mag;y/=mag}
    this.stickX=Math.abs(x)<.09?0:x;
    this.stickY=Math.abs(y)<.09?0:y;
    thumb.style.transform='translate('+Math.round(this.stickX*radius)+'px,'+
      Math.round(this.stickY*radius)+'px)';
  }
  releaseJoystick(e=null,thumb=null){
    if(e&&e.pointerId!==this.joystickPointer)return;
    this.joystickPointer=null;
    this.stickX=this.stickY=0;
    if(thumb)thumb.style.transform='translate(0,0)';
  }
  // Manual spectator collisions only: standing facades, cars and visible debris.
  // Check X and Z independently for natural sliding around obstacles.
  canStand(x,z){
    if(Math.abs(x)>LIMIT||Math.abs(z)>LIMIT)return false;
    for(const b of [...this.world.buildings,...this.world.districtBuildings]){
      const floor=b.floors[0];
      if(!floor||floor.active||floor.mesh.isDisposed())continue;
      const p=floor.mesh.position,s=floor.size;
      if(Math.abs(x-p.x)<s.x/2+PLAYER_RADIUS&&
         Math.abs(z-p.z)<s.z/2+PLAYER_RADIUS)return false;
    }
    for(const car of this.world.props){
      if(car.type!=='car'||car.mesh.isDisposed())continue;
      const p=car.mesh.position;
      if(Math.abs(x-p.x)<2.45&&Math.abs(z-p.z)<1.53)return false;
    }
    const obstacles=[...this.world.fragments,...this.world.rubble];
    for(const obj of obstacles){
      const mesh=obj.mesh||obj;
      if(!mesh||mesh.isDisposed()||!mesh.isEnabled())continue;
      const p=mesh.getAbsolutePosition();
      if(Math.abs(x-p.x)>5||Math.abs(z-p.z)>5)continue;
      const bounds=mesh.getBoundingInfo().boundingBox;
      if(bounds.maximumWorld.y<.3||bounds.minimumWorld.y>2.5)continue;
      if(x>bounds.minimumWorld.x-PLAYER_RADIUS&&x<bounds.maximumWorld.x+PLAYER_RADIUS&&
         z>bounds.minimumWorld.z-PLAYER_RADIUS&&z<bounds.maximumWorld.z+PLAYER_RADIUS)return false;
    }
    return true;
  }
  update(dt,disasters){
    if(!this.enabled)return;
    const k=this.keys;
    const forward=Number(k.has('KeyW')||k.has('ArrowUp'))-
      Number(k.has('KeyS')||k.has('ArrowDown'))-this.stickY;
    const right=Number(k.has('KeyD')||k.has('ArrowRight'))-
      Number(k.has('KeyA')||k.has('ArrowLeft'))+this.stickX;
    this.survival.step(dt,disasters,{forward,right,yaw:this.yaw,
      sprint:k.has('ShiftLeft')||k.has('ShiftRight')});
  }
  respawn(){
    const [x,z]=this.findSpawn();
    this.camera.position.set(x,EYE_HEIGHT,z);
    this.survival.revive(x,z);
    return this.survival.dieState();
  }
  info(){return {enabled:this.enabled,x:+this.camera.position.x.toFixed(2),
    y:+this.camera.position.y.toFixed(2),z:+this.camera.position.z.toFixed(2),
    yaw:+this.yaw.toFixed(3),pitch:+this.pitch.toFixed(3),
    pointerLocked:document.pointerLockElement===this.canvas,
    ...this.survival.dieState()};}
}
