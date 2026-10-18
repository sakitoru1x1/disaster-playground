// Actual six-body Havok ragdolls for citizens hit by strong winds/water.
// Budgeted on mobile; excess casualties use a lightweight flying animated
// puppet until they settle, so entire crowds remain visibly responsive.
import {Vector3} from '@babylonjs/core';
import {PhysicalRagdoll} from './physicalRagdoll.js';
import {terrainDisplacement} from './terrainDamage.js';

const V=(x,y,z)=>new Vector3(x,y,z);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function civilianPosition(person){
 return person.ragdoll?.torso?.position||person.root.position;
}
export function ragdollForce(kind,position,center,strength,radius){
 const dx=position.x-center.x,dz=position.z-center.z;
 const dist=Math.max(.7,kind==='tsunami'?Math.abs(dx):Math.hypot(dx,dz));
 const falloff=clamp(1-dist/radius,0,1);
 if(kind==='tornado'){
  const f=strength*falloff;
  return {x:(-dx/dist*45-dz/dist*66)*f,y:(37+110*f)*f,
   z:(-dz/dist*45+dx/dist*66)*f,falloff};
 }
 if(kind==='tsunami'){
  const f=strength*falloff;
  return {x:(38+100*strength)*f,y:(8+38*strength)*f,
   z:Math.sin(position.z*.43+position.x*.2)*18*f,falloff};
 }
 return {x:0,y:0,z:0,falloff};
}
function canUsePhysics(world){
 return !!world.scene?.getPhysicsEngine?.()&&
  (world.civilians?.filter(p=>p.ragdoll).length||0)<(world.mobile?6:15);
}
function styleOf(person){
 const t=person.root?.getChildMeshes?.()||[];
 return {torso:t.find(m=>m.name.startsWith('person torso'))?.material,
  arms:t.find(m=>m.name.startsWith('person arm'))?.material,
  legs:t.find(m=>m.name.startsWith('person leg'))?.material,
  head:t.find(m=>m.name.startsWith('person head'))?.material,
  hair:t.find(m=>m.name.startsWith('person hairstyle')||
    m.name.startsWith('person protective helmet'))?.material};
}
export function launchCitizenRagdoll(world,person,force){
 if(person.ragdoll||person.airborne)return false;
 const p=civilianPosition(person);
 const impulse=V(clamp(force.x*.26,-22,22),clamp(force.y*.22,6,22),
   clamp(force.z*.26,-22,22));
 const initial=V(p.x,Math.max(p.y+1.1,2.1),p.z);
 if(canUsePhysics(world)){
  try{
   person.ragdoll=new PhysicalRagdoll(world.scene,initial,impulse,styleOf(person));
   person.root.setEnabled(false);
   person.ragdollAge=0;
   person.physicsThrown=(person.physicsThrown||0)+1;
   return true;
  }catch(err){
   person.ragdoll?.dispose();person.ragdoll=null;
   console.warn('Citizens: articulated physics fallback',err);
  }
 }
 // This fallback deliberately keeps the six independently animated avatar
 // limbs rather than launching a featureless box.
 person.airborne={vx:impulse.x*.48,vy:Math.max(7,impulse.y*.48),
  vz:impulse.z*.48,age:0};
 person.root.rotation.z=0;
 person.legs?.forEach((l,i)=>l.rotation.x=(i?-.9:.9));
 person.arms?.forEach((a,i)=>a.rotation.x=i?.9:-.9);
 return true;
}
export function pushCitizenRagdoll(world,person,kind,center,strength,radius,dt){
 const pos=civilianPosition(person);
 const field=ragdollForce(kind,pos,center,strength,radius);
 if(!field.falloff)return false;
 if(!person.ragdoll&&!person.airborne&&strength*field.falloff>.22){
  launchCitizenRagdoll(world,person,field);
 }
 if(person.ragdoll){
  // Physics constraint ragdoll receives distributed aerodynamic force on
  // each body part, rather than resetting the original NPC position to ground.
  const parts=person.ragdoll.parts;
  const masses=[12,3,3,3,6,6];
  for(let i=0;i<parts.length;i++){
   const {aggregate,mesh}=parts[i];if(!aggregate)continue;
   const k=masses[i]||3;
   aggregate.body.applyForce(V(field.x*k,field.y*k,field.z*k),mesh.position);
  }
  person.ragdollAge=0;
 }else if(person.airborne){
  // More survivors than the Havok budget: animate momentum with gravity.
  person.airborne.vx+=field.x*dt*1.5;
  person.airborne.vy+=field.y*dt*1.4;
  person.airborne.vz+=field.z*dt*1.5;
  person.airborne.age=0;
 }
 return !!(person.ragdoll||person.airborne);
}
function landPose(person,position){
 const root=person.root;
 root.position.copyFrom(position);
 root.position.y=.15+terrainDisplacement(root.position.x,root.position.z,
   person._citizenWorld?.terrainCraters||[]);
 root.rotation.x=0;root.rotation.z=person.state==='dead'?-1.5:-1.16;
 person.legs?.forEach((leg,i)=>leg.rotation.x=i?.25:-.25);
 person.arms?.forEach((arm,i)=>arm.rotation.x=i?.36:-.43);
 root.setEnabled(true);
}
export function settleCitizenRagdoll(person,world,revive=false){
 const p=civilianPosition(person).clone();
 if(person.ragdoll){person.ragdoll.dispose();person.ragdoll=null}
 person.airborne=null;
 person._citizenWorld=world;
 landPose(person,p);
 if(revive){
  person.root.rotation.set(0,0,0);
  person.root.position.y=.215+terrainDisplacement(person.root.position.x,person.root.position.z,
    world?.terrainCraters||[]);
  person.legs?.forEach(x=>x.rotation.x=0);
  person.arms?.forEach(x=>x.rotation.x=0);
  person.state='walking';person.exposure=0;person.panic=0;
 }
 person._citizenWorld=null;
}
export function animateCitizenRagdoll(person,world,dt){
 if(person.ragdoll){
  person.ragdoll.update(dt);
  person.ragdollAge=(person.ragdollAge||0)+dt;
  const torso=person.ragdoll.torso;
  // A sustained tornado/tsunami can keep the person in the air; once the
  // wave passes and motion subsides the resident remains visibly injured.
  const v=person.ragdoll.parts[0].aggregate.body.getLinearVelocity();
  const slow=Math.hypot(v.x,v.z,v.y)<3&&torso.position.y<3;
  if((person.ragdollAge>3.0&&slow)||person.ragdoll.age>23)
   settleCitizenRagdoll(person,world);
  return true;
 }
 if(person.airborne){
  const a=person.airborne;a.age+=dt;
  a.vy-=18*dt;
  person.root.position.x+=a.vx*dt;
  person.root.position.y+=a.vy*dt;
  person.root.position.z+=a.vz*dt;
  person.root.rotation.z+=dt*2.8;
  person.root.rotation.x+=dt*1.2;
  person.arms?.forEach((arm,i)=>arm.rotation.x=Math.sin(a.age*11+i)*1.4);
  person.legs?.forEach((leg,i)=>leg.rotation.x=Math.sin(a.age*12+i)*1.1);
  const minY=.18+terrainDisplacement(person.root.position.x,person.root.position.z,
    world?.terrainCraters||[]);
  if(person.root.position.y<minY&&a.age>.5){
   person.root.position.y=minY;
   settleCitizenRagdoll(person,world);
  }
  return true;
 }
 return false;
}
