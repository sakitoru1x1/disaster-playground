import {PhysicsAggregate,PhysicsShapeType,Vector3} from '@babylonjs/core';
const V=(x,y,z)=>new Vector3(x,y,z);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

// Stage 1: draw loose bodies inward and accelerate them around a real orbit.
// Stage 2: eject them tangentially + radially and STOP applying the tornado
// velocity. Momentum and Havok gravity take over, so objects fly out and fall.
export function blowBody(body,position,center,radius,intensity,dt,category='rubble',fx=null){
  const dx=position.x-center.x,dz=position.z-center.z;
  let distance=Math.hypot(dx,dz);
  if(distance>=radius)return false;
  distance=Math.max(.8,distance);
  const strength=clamp(intensity,.15,1);
  const tangent=V(-dz/distance,0,dx/distance);
  const inward=V(-dx/distance,0,-dz/distance);
  let state=null;
  if(fx){
    if(!fx.windTracks)fx.windTracks=new Map();
    state=fx.windTracks.get(body);
    if(!state){
      state={age:0,lastAngle:Math.atan2(dz,dx),sweep:0,
        releaseAfter:1.75+Math.random()*1.3,ejected:false};
      fx.windTracks.set(body,state);
    }
    if(state.ejected)return false;
    state.age+=dt;
    const angle=Math.atan2(dz,dx);
    let diff=angle-state.lastAngle;
    while(diff>Math.PI)diff-=Math.PI*2;
    while(diff< -Math.PI)diff+=Math.PI*2;
    state.sweep+=Math.abs(diff);
    state.lastAngle=angle;
  }
  const heavy=category==='car';
  const orbitRadius=heavy?10:7.4+Math.min(7,position.y*.16);
  const idealHeight=heavy?13:category==='wall'?21:17;
  const falloff=clamp((radius-distance)/Math.max(8,radius*.45),.28,1);
  const angularSpeed=(heavy?20:25)*strength*falloff+6;
  if(state && state.age>=state.releaseAfter &&
     (state.sweep>2.15||state.age>4.4)){
    // Radial momentum takes the piece OUT of the wind field. Adding a strong
    // tangential component makes its trajectory clearly curved at release.
    const launch=tangent.scale((heavy?23:28)*strength+6)
      .add(inward.scale(-(24+21*strength)))
      .add(V(0,6+7*strength,0));
    body.setLinearVelocity(launch);
    body.setAngularVelocity(V(3+Math.random()*3,5+Math.random()*4,2+Math.random()*4));
    state.ejected=true;
    if(fx.world)fx.world.windEjected++;
    return false;
  }
  const radialSpeed=clamp((distance-orbitRadius)*1.65,-9,18);
  const vertical=clamp((idealHeight-position.y)*1.9,-13,18);
  const target=tangent.scale(angularSpeed)
    .add(inward.scale(radialSpeed))
    .add(V(0,vertical+2.6*strength,0));
  const current=body.getLinearVelocity();
  const blend=clamp(dt*(heavy?4.0:5.1),0,.42);
  const next=Vector3.Lerp(current,target,blend);
  if(next.length()>44)next.normalize().scaleInPlace(44);
  body.setLinearVelocity(next);
  const spin=V(heavy?1.2:2.4,heavy?2.4:4.2,heavy?1.6:2.8);
  body.setAngularVelocity(Vector3.Lerp(body.getAngularVelocity(),spin,clamp(dt*2,0,.18)));
  return true;
}

// After a debris rigid-body comes to rest we normally recycle its collider.
// A tornado temporarily reactivates that collider so the debris can be
// picked up, orbit and fly out again.
export function activateWindRubble(world,center,radius,intensity,limit=4){
  let lifted=0;
  for(let i=world.rubble.length-1;i>=0&&lifted<limit;i--){
    if(world.fragments.length>=world.maxFragmentBodies)break;
    const mesh=world.rubble[i];
    if(!mesh?.isEnabled()||mesh.isDisposed())continue;
    const p=mesh.getAbsolutePosition();
    const distance=Math.hypot(p.x-center.x,p.z-center.z);
    if(distance>radius*.86||p.y>5.8)continue;
    const kind=mesh.metadata?.kind||'rubble';
    const size=mesh.metadata?.fragmentSize||[1.2,.45,1.2];
    const mass=Math.max(1.3,Math.min(16,size[0]*size[1]*size[2]*2.5));
    const aggregate=new PhysicsAggregate(mesh,PhysicsShapeType.BOX,{
      mass,friction:.5,restitution:.13
    },world.scene);
    aggregate.body.setLinearDamping(.045);
    aggregate.body.setAngularDamping(.08);
    const fragment={mesh,aggregate,age:0,kind,building:null,
      secondaryGeneration:1,secondaryQueued:false,windReactivated:true};
    world.fragments.push(fragment);world.rubble.splice(i,1);
    world.activeBodies++;
    const d=Math.max(1,distance);
    aggregate.body.setLinearVelocity(V(
      -(p.z-center.z)/d*(13+12*intensity),
      8+8*intensity,
      (p.x-center.x)/d*(13+12*intensity)
    ));
    aggregate.body.setAngularVelocity(V(2,4,2));
    lifted++;world.windLifted++;
  }
  return lifted;
}
