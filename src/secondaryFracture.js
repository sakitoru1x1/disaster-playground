import {
  MeshBuilder,VertexBuffer,VertexData,Vector3,PhysicsAggregate,PhysicsShapeType
} from '@babylonjs/core';
import {partitionSlab} from './slabs.js';

const V=(x,y,z)=>new Vector3(x,y,z);
const rand=(a,b)=>a+(b-a)*Math.random();

export function queueSecondaryFracture(world,fragment,contact){
  if(fragment.secondaryQueued||fragment.secondaryGeneration||fragment.age<.22)return;
  if(world.secondaryBreaks>=world.maxSecondaryBreaks)return;
  if(fragment.kind!=='slab'&&fragment.kind!=='wall')return;
  if(world.secondaryWindowCount>=world.maxSecondaryPerWindow &&
     (fragment.kind!=='wall'||world.secondaryWallVisualWindow>=world.maxWallVisualPerWindow))return;
  const size=fragment.mesh.metadata?.fragmentSize;
  if(!size)return;
  const plane=[...size].sort((a,b)=>b-a);
  if(plane[0]*plane[1]<3.3||plane[1]<.85)return;
  const impactSpeed=fragment.aggregate.body.getLinearVelocity().length();
  const contactImpulse=Math.abs(Number(contact?.impulse)||0);
  const fallen=(fragment.fallStartY||0)-fragment.mesh.position.y;
  const groundStrike=fragment.mesh.position.y<Math.max(4.2,size[1]+.5);
  // A rigid panel can already be stationary when a Havok collision event
  // fires, so include kinetic energy acquired while falling from its height.
  const hardCollision=impactSpeed>(fragment.kind==='wall'?3.7:5.2)||
    contactImpulse>30||(fallen>3.1&&groundStrike);
  if(!hardCollision)return;
  fragment.secondaryQueued=true;
  world.pendingSecondary.push({fragment,impulse:contactImpulse,
    speed:Math.max(impactSpeed,Math.sqrt(Math.max(0,fallen)*14))});
}

function damagedBox(world,size,material){
  const mesh=MeshBuilder.CreateBox('secondary impact shard',{
    width:size[0],height:size[1],depth:size[2]
  },world.scene);
  const positions=mesh.getVerticesData(VertexBuffer.PositionKind),offsets=new Map();
  for(let i=0;i<positions.length;i+=3){
    const key=(positions[i]>=0?'1':'0')+(positions[i+1]>=0?'1':'0')+(positions[i+2]>=0?'1':'0');
    if(!offsets.has(key))offsets.set(key,[rand(-.06,.06),rand(-.04,.04),rand(-.06,.06)]);
    const delta=offsets.get(key);
    positions[i]+=delta[0];positions[i+1]+=delta[1];positions[i+2]+=delta[2];
  }
  mesh.setVerticesData(VertexBuffer.PositionKind,positions);
  const normals=[];
  VertexData.ComputeNormals(positions,mesh.getIndices(),normals);
  mesh.setVerticesData(VertexBuffer.NormalKind,normals);
  mesh.material=material;mesh.receiveShadows=true;mesh.isPickable=false;
  return mesh;
}

export function splitOnCollision(world,part,collision){
  if(!part.aggregate||!part.mesh||part.secondaryGeneration)return false;
  if(world.secondaryBreaks>=world.maxSecondaryBreaks)return false;
  if(world.secondaryWindowCount>=world.maxSecondaryPerWindow &&
     (part.kind!=='wall'||world.secondaryWallVisualWindow>=world.maxWallVisualPerWindow))return false;
  const size=part.mesh.metadata?.fragmentSize;
  if(!size)return false;
  const axes=[0,1,2].sort((a,b)=>size[b]-size[a]);
  const [a,b]=axes,area=size[a]*size[b];
  if(area<3.3||Math.min(size[a],size[b])<.85)return false;
  const count=part.kind==='wall'?(area>12?4:3):(area>8?3:2);
  const dynamic=world.secondaryWindowCount<world.maxSecondaryPerWindow &&
    world.fragments.length-1+count<=world.maxFragmentBodies;
  const visual=!dynamic&&part.kind==='wall' &&
    world.secondaryWallVisualWindow<world.maxWallVisualPerWindow &&
    world.visualFragments.length+count<=world.maxVisualFragments;
  if(!dynamic&&!visual)return false;

  const mesh=part.mesh,body=part.aggregate.body;
  mesh.computeWorldMatrix(true);
  const worldMatrix=mesh.getWorldMatrix().clone();
  const velocity=body.getLinearVelocity().clone();
  const angular=body.getAngularVelocity().clone();
  const rectangles=partitionSlab(size[a],size[b],count);
  const children=[];
  for(const rect of rectangles){
    const local=[0,0,0];local[a]=rect.x;local[b]=rect.z;
    const childSize=size.slice();
    childSize[a]=Math.max(.18,rect.w-.045);
    childSize[b]=Math.max(.18,rect.d-.045);
    const shard=damagedBox(world,childSize,mesh.material);
    shard.position=Vector3.TransformCoordinates(V(...local),worldMatrix);
    shard.rotation.copyFrom(mesh.rotation);
    if(mesh.rotationQuaternion)shard.rotationQuaternion=mesh.rotationQuaternion.clone();
    shard.metadata={...mesh.metadata,fragmentSize:childSize.slice(),
      kind:part.kind,secondaryGeneration:1,secondaryShard:true};
    const spread=V(rand(-3,3),rand(1.4,4.2),rand(-3,3));
    if(dynamic){
      const mass=Math.max(1.5,childSize[0]*childSize[1]*childSize[2]*2.6);
      const agg=new PhysicsAggregate(shard,PhysicsShapeType.BOX,{
        mass,friction:.79,restitution:.055
      },world.scene);
      agg.body.setLinearDamping(.17);
      agg.body.setAngularDamping(.32);
      agg.body.setLinearVelocity(velocity.add(spread.scale(.38)));
      agg.body.setAngularVelocity(angular.add(V(rand(-2,2),rand(-3,3),rand(-2,2))));
      children.push({mesh:shard,aggregate:agg,age:0,
        kind:part.kind,slabId:part.slabId,building:part.building,
        secondaryGeneration:1,secondaryQueued:false});
    }else{
      world.visualFragments.push({mesh:shard,
        velocity:velocity.scale(.48).add(spread.scale(.2)),
        angular:V(rand(-2,2),rand(-3,3),rand(-2,2)),
        floorY:.42+childSize[1]*.5,settled:false});
    }
  }
  body.setCollisionCallbackEnabled(false);
  if(part.collisionObservable&&part.collisionObserver)
    part.collisionObservable.remove(part.collisionObserver);
  part.aggregate.dispose();part.mesh.dispose();
  const index=world.fragments.indexOf(part);
  if(index>=0)world.fragments.splice(index,1,...children);
  else world.fragments.push(...children);
  world.activeBodies+=children.length-1;
  world.secondaryBreaks++;
  if(dynamic)world.secondaryWindowCount++;
  else world.secondaryWallVisualWindow++;
  world.secondaryPieces+=count;
  if(part.kind==='wall')world.secondaryWallBreaks++;
  if(world.secondaryBreaks%4===0)world.createBurst(
    children[0]?.mesh.position||world.visualFragments.at(-1)?.mesh.position,
    'dust',14,.22);
  return true;
}
