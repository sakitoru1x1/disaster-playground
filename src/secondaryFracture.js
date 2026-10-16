import {
  MeshBuilder, VertexBuffer, VertexData, Vector3, PhysicsAggregate, PhysicsShapeType
} from '@babylonjs/core';
import {partitionSlab} from './slabs.js';

const V=(x,y,z)=>new Vector3(x,y,z);
const random=(a,b)=>a+(b-a)*Math.random();

// Secondary cracking is triggered ONLY by actual Havok COLLISION_STARTED callbacks.
// Processing happens later in the scene update, never inside the physics callback.
export function queueSecondaryFracture(world,fragment,contact){
  if(fragment.secondaryQueued||fragment.secondaryGeneration||fragment.age<.18)return;
  if(fragment.kind!=='slab'||world.secondaryBreaks>=world.maxSecondaryBreaks||
     world.secondaryWindowCount>=world.maxSecondaryPerWindow)return;
  const size=fragment.mesh.metadata?.fragmentSize;
  if(!size||size[0]*size[2]<3.2||Math.min(size[0],size[2])<.98)return;
  const speed=fragment.aggregate.body.getLinearVelocity().length();
  const impulse=Math.abs(Number(contact?.impulse)||0);
  // Havok impulse alone can reflect a high-mass impact that stops the body.
  if(speed<5.2&&impulse<32)return;
  fragment.secondaryQueued=true;
  world.pendingSecondary.push({fragment,impulse,speed});
}

function unevenShard(world,size,material){
  const mesh=MeshBuilder.CreateBox('secondary cracked concrete',{width:size[0],height:size[1],depth:size[2]},world.scene);
  const positions=mesh.getVerticesData(VertexBuffer.PositionKind);
  const displacements=new Map();
  for(let i=0;i<positions.length;i+=3){
    const key=(positions[i]>=0?'1':'0')+(positions[i+1]>=0?'1':'0')+(positions[i+2]>=0?'1':'0');
    if(!displacements.has(key))displacements.set(key,[random(-.065,.065),random(-.025,.025),random(-.065,.065)]);
    const delta=displacements.get(key);
    positions[i]+=delta[0];positions[i+1]+=delta[1];positions[i+2]+=delta[2];
  }
  mesh.setVerticesData(VertexBuffer.PositionKind,positions);
  const normals=[];VertexData.ComputeNormals(positions,mesh.getIndices(),normals);
  mesh.setVerticesData(VertexBuffer.NormalKind,normals);
  mesh.material=material;mesh.receiveShadows=true;mesh.isPickable=false;
  return mesh;
}

export function splitOnCollision(world,part,collision){
  if(!part.aggregate||!part.mesh||part.secondaryGeneration)return false;
  if(world.secondaryBreaks>=world.maxSecondaryBreaks||
     world.secondaryWindowCount>=world.maxSecondaryPerWindow)return false;
  const size=part.mesh.metadata?.fragmentSize;
  if(!size||Math.min(size[0],size[2])<.98)return false;
  const count=(size[0]*size[2]>8&&Math.random()<.45)?3:2;
  // Replacing one physics body with 2-3 has net cost 1-2 bodies.
  if(world.fragments.length-1+count>world.maxFragmentBodies)return false;
  const parentMesh=part.mesh,parentBody=part.aggregate.body;
  parentMesh.computeWorldMatrix(true);
  const transform=parentMesh.getWorldMatrix().clone();
  const oldVelocity=parentBody.getLinearVelocity().clone();
  const oldRotationVelocity=parentBody.getAngularVelocity().clone();
  const pieces=partitionSlab(size[0],size[2],count);
  const birth=[];
  for(const rect of pieces){
    const childSize=[Math.max(.18,rect.w-.035),Math.max(.14,size[1]*random(.93,1.04)),Math.max(.18,rect.d-.035)];
    const mesh=unevenShard(world,childSize,parentMesh.material);
    mesh.position=Vector3.TransformCoordinates(V(rect.x,0,rect.z),transform);
    mesh.rotation.copyFrom(parentMesh.rotation);
    if(parentMesh.rotationQuaternion)mesh.rotationQuaternion=parentMesh.rotationQuaternion.clone();
    mesh.metadata={
      ...parentMesh.metadata,kind:'slab',fragmentSize:childSize,
      secondaryGeneration:1,secondaryShard:true
    };
    const body=new PhysicsAggregate(mesh,PhysicsShapeType.BOX,{
      mass:Math.max(2,childSize[0]*childSize[1]*childSize[2]*3.0),
      friction:.82,restitution:.055
    },world.scene);
    body.body.setLinearDamping(.17);
    body.body.setAngularDamping(.33);
    body.body.setLinearVelocity(oldVelocity);
    body.body.setAngularVelocity(oldRotationVelocity);
    const spread=V(rect.x*.25+random(-.5,.5),random(.15,.9),rect.z*.25+random(-.5,.5));
    body.body.applyImpulse(spread.scale(2+Math.min(2,collision.speed*.18)),mesh.position);
    birth.push({mesh,aggregate:body,age:0,kind:'slab',
      slabId:part.slabId,building:part.building,secondaryGeneration:1,secondaryQueued:false});
  }
  // Remove the old collider AFTER replacements have been constructed.
  part.aggregate.body.setCollisionCallbackEnabled(false);
  if(part.collisionObservable&&part.collisionObserver)part.collisionObservable.remove(part.collisionObserver);
  part.aggregate.dispose();
  part.mesh.dispose();
  const index=world.fragments.indexOf(part);
  if(index!==-1)world.fragments.splice(index,1,...birth);
  else world.fragments.push(...birth);
  world.activeBodies+=birth.length-1;
  world.secondaryBreaks++;
  world.secondaryWindowCount++;
  world.secondaryPieces+=birth.length;
  if(world.secondaryBreaks<=4)world.createBurst(birth[0].mesh.position,'dust',36,.35);
  return true;
}