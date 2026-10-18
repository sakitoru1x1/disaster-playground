import {Vector3,PhysicsAggregate,PhysicsShapeType} from '@babylonjs/core';
const V=(x,y,z)=>new Vector3(x,y,z);
const water=(p,front,height,span=9)=>Math.abs(p.x-front)<span&&p.y<height+2;
export function uprootTree(world,tree,kind,strength,center){
 if(tree.airborne||tree.root.isDisposed())return false;
 const dx=tree.x-center.x,dz=tree.z-center.z,d=Math.max(1,Math.hypot(dx,dz));
 if(kind==='tornado'){
  const scale=Math.min(1.2,strength);
  tree.velocity=V((-dz/d*21-dx/d*5)*scale,7+14*scale,
    (dx/d*21-dz/d*5)*scale);
 }else{
  tree.velocity=V(18+strength*36,6+strength*14,(Math.sin(tree.z*.8)*8)*strength);
 }
 tree.airborne=true;tree.age=0;
 tree.root.rotation.x=.2;
 world.uprootedTrees=(world.uprootedTrees||0)+1;
 world.audio?.play('collapse',tree.root.position,.35);
 return true;
}
export function updateFlyingTrees(world,dt){
 for(const tree of world.trees||[]){
  if(!tree.airborne)continue;
  tree.age=(tree.age||0)+dt;
  const p=tree.root.position,v=tree.velocity;
  v.y-=15*dt;
  p.x+=v.x*dt;p.y+=v.y*dt;p.z+=v.z*dt;
  tree.root.rotation.x+=dt*.85;
  tree.root.rotation.z+=dt*1.35;
  if(p.y<.35&&tree.age>1.2){
   p.y=.35;tree.airborne=false;
   tree.root.rotation.x=1.36;tree.root.rotation.z=.4;
   tree.velocity=V(0,0,0);
  }
 }
}
export function liftWaveRubble(world,front,height,k,max=5){
 if(k<.25)return 0;
 let released=0;
 for(let i=world.rubble.length-1;i>=0&&released<max;i--){
  if(world.fragments.length>=world.maxFragmentBodies)break;
  const mesh=world.rubble[i];
  if(!mesh||mesh.isDisposed()||mesh.metadata?.pendingVisualFracture)continue;
  const p=mesh.getAbsolutePosition();
  if(!water(p,front,height,9))continue;
  const size=mesh.metadata?.fragmentSize||[1.3,.5,1.1];
  const mass=Math.max(1.2,Math.min(14,size[0]*size[1]*size[2]*2.6));
  const aggregate=new PhysicsAggregate(mesh,PhysicsShapeType.BOX,
    {mass,friction:.36,restitution:.12},world.scene);
  aggregate.body.setLinearDamping(.07);
  aggregate.body.setLinearVelocity(V(12+43*k,6+14*k,(Math.random()-.5)*8));
  aggregate.body.setAngularVelocity(V(2*k,1*k,3*k));
  world.fragments.push({mesh,aggregate,kind:mesh.metadata?.kind||'rubble',
    age:0,building:null,secondaryGeneration:1,secondaryQueued:false,
    fallStartY:p.y+3,windReactivated:true});
  world.rubble.splice(i,1);world.activeBodies++;released++;
 }
 world.waveRubbleLifted=(world.waveRubbleLifted||0)+released;
 return released;
}
export function sweepLooseObjects(world,front,height,k,dt,previousFront=front){
 const min=Math.min(previousFront,front)-4,max=Math.max(previousFront,front)+8;
 const inWave=p=>p.x>=min&&p.x<=max&&p.y<height+2;
 for(const part of world.fragments||[]){
  if(!part.aggregate)continue;
  const p=part.mesh.getAbsolutePosition();
  if(inWave(p))part.aggregate.body.applyForce(
    V((95+850*k*k),160*k*k,(Math.random()-.5)*110*k),p);
 }
 for(const part of world.debris||[]){
  if(!part.aggregate)continue;
  const p=part.mesh.position;
  if(inWave(p))part.aggregate.body.applyForce(
    V((105+760*k*k),120*k*k,(Math.random()-.5)*120*k),p);
 }
 for(const part of world.visualFragments||[]){
  const p=part.mesh.position;
  if(inWave(p)){
   part.velocity.x+=dt*(13+58*k);
   part.velocity.y+=dt*(16+25*k);
   part.angular.z+=dt*4*k;
   part.settled=false;
  }
 }
 for(const tree of world.trees||[]){
  if(!tree.airborne&&inWave(tree.root.position)&&k>.36)
   uprootTree(world,tree,'tsunami',k,{x:front,z:tree.z});
 }
 return true;
}
export function tossStormTrees(world,center,radius,k){
 let count=0;
 for(const tree of world.trees||[]){
  if(tree.airborne)continue;
  const dist=Math.hypot(tree.x-center.x,tree.z-center.z);
  if(dist<radius*.65&&k>.48&&count<(world.mobile?1:3)){
   if(uprootTree(world,tree,'tornado',k,center))count++;
  }
 }
 return count;
}
