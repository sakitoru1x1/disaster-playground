import {MeshBuilder,VertexBuffer,VertexData,Vector3,PhysicsAggregate,PhysicsShapeType} from '@babylonjs/core';
import {partitionSlab} from './slabs.js';
import {paintFragment} from './rubbleAppearance.js';

const V=(x,y,z)=>new Vector3(x,y,z);
const rand=(a,b)=>a+(b-a)*Math.random();
const MAX_GENERATION=2; // primary -> secondary -> tertiary, never recursive beyond this

function breakGeometry(part){
  const size=part.mesh.metadata?.fragmentSize;
  if(!size)return null;
  const axes=[0,1,2].sort((a,b)=>size[b]-size[a]);
  const [a,b]=axes,level=part.secondaryGeneration||0;
  const area=size[a]*size[b],minimumArea=level?2.0:3.3;
  if(area<minimumArea||Math.min(size[a],size[b])<(level?.58:.82))return null;
  return {size,a,b,area,level};
}

export function queueSecondaryFracture(world,fragment,contact=null,landing=false){
  if(!fragment.aggregate||fragment.secondaryQueued||fragment.secondaryGeneration>=MAX_GENERATION||
      fragment.age<(landing?.38:.19)||world.secondaryBreaks>=world.maxSecondaryBreaks)return;
  if(fragment.kind!=='slab'&&fragment.kind!=='wall')return;
  const geo=breakGeometry(fragment);if(!geo)return;
  // Do not discard impact events when per-window budgets are exhausted.
  // A priority queue retries them when the physics/visual budget recovers.
  const speed=fragment.aggregate.body.getLinearVelocity().length();
  const impulse=Math.abs(Number(contact?.impulse)||0);
  const fallen=(fragment.fallStartY??fragment.mesh.position.y)-fragment.mesh.position.y;
  const stored=fragment.impactEnergy||0;
  const hard=landing?Math.max(fallen,stored)>2.2:
    speed>(fragment.kind==='slab'?3.2:3.7)||impulse>22||fallen>2.3||stored>4.2;
  if(!hard)return;
  fragment.secondaryQueued=true;
  fragment.impactEnergy=Math.max(fragment.impactEnergy||0,fallen,speed*.75);
  const priority=geo.area*(geo.level?.72:1.4)+speed*.5+fallen*.8;
  world.pendingSecondary.push({fragment,impulse,speed:Math.max(speed,Math.sqrt(Math.max(0,fallen)*12)),
    priority,queuedAt:world.time,retries:0,nextAttempt:world.time});
  world.secondaryQueuePeak=Math.max(world.secondaryQueuePeak,world.pendingSecondary.length);
}

function shardMesh(world,size,material){
  const mesh=MeshBuilder.CreateBox('impact fracture piece',{width:size[0],height:size[1],depth:size[2]},world.scene);
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
function piecesFrom(world,part,geometry,count,velocity,angular,dynamic,grounded=false){
  const {size,a,b,level}=geometry,mesh=part.mesh;
  mesh.computeWorldMatrix(true);
  const matrix=mesh.getWorldMatrix().clone();
  const rectangles=partitionSlab(size[a],size[b],count);
  const children=[];
  for(const rect of rectangles){
    const local=[0,0,0];local[a]=rect.x;local[b]=rect.z;
    const next=size.slice();next[a]=Math.max(.14,rect.w-.04);next[b]=Math.max(.14,rect.d-.04);
    const shard=shardMesh(world,next,mesh.material);
    shard.metadata={kind:part.kind,fragmentSize:next.slice()};
    paintFragment(world,shard,mesh.metadata?.rubbleAppearance,level+1);
    shard.position=Vector3.TransformCoordinates(V(...local),matrix);
    shard.rotation.copyFrom(mesh.rotation);
    if(mesh.rotationQuaternion)shard.rotationQuaternion=mesh.rotationQuaternion.clone();
    shard.metadata={...shard.metadata,fragmentSize:next.slice(),kind:part.kind,
      secondaryGeneration:level+1,fragmentGeneration:level+1,secondaryShard:true};
    const kick=V(rand(-1.3,1.3),rand(-.17,.04),rand(-1.3,1.3));
    if(dynamic){
      const agg=new PhysicsAggregate(shard,PhysicsShapeType.BOX,{
        mass:Math.max(1.25,next[0]*next[1]*next[2]*2.4),
        friction:.88,restitution:0.005
      },world.scene);
      agg.body.setLinearDamping(.35);agg.body.setAngularDamping(.52);
      agg.body.setLinearVelocity(velocity.scale(.72).add(kick.scale(.2)));
      agg.body.setAngularVelocity(angular.add(V(rand(-2,2),rand(-2,2),rand(-2,2))));
      const child={mesh:shard,aggregate:agg,age:0,kind:part.kind,
        slabId:part.slabId,building:part.building,secondaryGeneration:level+1,
        secondaryQueued:false,fallStartY:shard.position.y,
        impactEnergy:(part.impactEnergy||0)*.65};
      if(level+1<MAX_GENERATION)attachSecondaryCollision(world,child);
      children.push(child);
    }else if(grounded){
      // Contact has ALREADY happened. Do not launch a new physics body into
      // the pavement or replay its fall: both cause fake springy rebounds.
      shard.computeWorldMatrix(true);
      const bottom=shard.getBoundingInfo().boundingBox.minimumWorld.y;
      shard.position.y+=Math.max(0,.34-bottom);
      shard.metadata.settled=true;shard.metadata.visualFalling=false;
      world.rubble.push(shard);world.groundedFracturePieces++;
      const child={mesh:shard,kind:part.kind,secondaryGeneration:level+1,
        fallStartY:shard.position.y,impactEnergy:(part.impactEnergy||0)*.68};
      if(level+1<MAX_GENERATION&&part.impactEnergy>4.6&&world.queueVisualFracture){
        world.queueVisualFracture(child,.5+Math.random()*.25);
      }
    }else{
      world.visualFragments.push({mesh:shard,kind:part.kind,
        secondaryGeneration:level+1,velocity:velocity.scale(.45).add(kick.scale(.2)),
        angular:V(rand(-.8,.8),rand(-.8,.8),rand(-.8,.8)),
        floorY:.43+next[1]*.5,fallStartY:shard.position.y,
        impactEnergy:(part.impactEnergy||0)*.7,settled:false});
    }
  }
  return children;
}
export function attachSecondaryCollision(world,part){
  if(!part.aggregate||part.secondaryGeneration>=MAX_GENERATION)return;
  const geo=breakGeometry(part);if(!geo)return;
  part.aggregate.body.setCollisionCallbackEnabled(true);
  const observable=part.aggregate.body.getCollisionObservable();
  part.collisionObservable=observable;
  part.collisionObserver=observable.add(info=>{
    if(info.type==='COLLISION_STARTED')queueSecondaryFracture(world,part,info);
  });
}
export function splitOnCollision(world,part){
  if(!part.aggregate||!part.mesh||part.secondaryGeneration>=MAX_GENERATION)return false;
  const geometry=breakGeometry(part);if(!geometry)return false;
  if(world.secondaryBreaks>=world.maxSecondaryBreaks)return false;
  const count=geometry.level?2:(geometry.area>12?4:3);
  const tertiary=geometry.level>0;
  part.mesh.computeWorldMatrix(true);
  const grounded=part.mesh.getBoundingInfo().boundingBox.minimumWorld.y<1.15;
  const dynamic=!grounded&&(!tertiary||!world.mobile)&&
    world.secondaryWindowCount<world.maxSecondaryPerWindow &&
    world.fragments.length-1+count<=world.maxFragmentBodies;
  const visual=!dynamic&&
    (tertiary?world.tertiaryWindowCount<world.maxTertiaryPerWindow:
      world.secondaryVisualWindow<world.maxVisualSecondaryPerWindow)&&
    (grounded||world.visualFragments.length+count<=world.maxVisualFragments);
  if(!dynamic&&!visual)return false;
  const body=part.aggregate.body;
  const velocity=body.getLinearVelocity().clone(),angular=body.getAngularVelocity().clone();
  const contactPoint=part.mesh.position.clone();
  part.impactEnergy=Math.max(part.impactEnergy||0,Math.max(0,(part.fallStartY||contactPoint.y)-contactPoint.y),velocity.length()*.65);
  const children=piecesFrom(world,part,geometry,count,velocity,angular,dynamic,grounded);
  if(grounded)world.groundContactFractures++;
  body.setCollisionCallbackEnabled(false);
  if(part.collisionObservable&&part.collisionObserver)part.collisionObservable.remove(part.collisionObserver);
  part.aggregate.dispose();part.mesh.dispose();
  const index=world.fragments.indexOf(part);
  if(index>=0)world.fragments.splice(index,1,...children);
  else world.fragments.push(...children);
  world.activeBodies=Math.max(0,world.activeBodies+children.length-1);
  world.secondaryBreaks++;world.secondaryPieces+=count;
  if(geometry.level){world.tertiaryBreaks++;world.tertiaryWindowCount++;}
  else if(dynamic)world.secondaryWindowCount++;
  else {world.secondaryVisualWindow++;world.secondaryWallVisualWindow++;}
  if(part.kind==='wall')world.secondaryWallBreaks++;
  if(world.secondaryBreaks%5===0)world.createBurst(contactPoint,'dust',10,.18);
  return true;
}

export function canVisuallyFracture(part){
  const geometry=breakGeometry(part);
  if(!geometry||geometry.level>=MAX_GENERATION)return false;
  const fall=(part.fallStartY??part.mesh.position.y)-part.mesh.position.y;
  return Math.max(fall,part.impactEnergy||0)>=(geometry.level?3.8:2.1);
}

export function splitVisualOnLanding(world,part){
  const geometry=breakGeometry(part);
  if(!geometry||geometry.level>=MAX_GENERATION||
    world.secondaryBreaks>=world.maxSecondaryBreaks||
    (geometry.level?world.tertiaryWindowCount>=world.maxTertiaryPerWindow:
      world.secondaryVisualWindow>=world.maxVisualSecondaryPerWindow))return false;
  // A large piece that fell from several metres should not remain a perfect intact slab.
  const fall=part.fallStartY-part.mesh.position.y;
  if(Math.max(fall,part.impactEnergy||0)<(geometry.level?3.8:2.1))return false;
  const count=geometry.level?2:3;
  // A landed slab is split in place; no new flying fragments are needed.
  part.impactEnergy=Math.max(fall,part.impactEnergy||0);
  piecesFrom(world,part,geometry,count,V(0,0,0),V(0,0,0),false,true);
  part.mesh.dispose();
  world.secondaryBreaks++;world.secondaryPieces+=count;
  if(geometry.level){world.tertiaryBreaks++;world.tertiaryWindowCount++}
  else {world.secondaryVisualWindow++;world.secondaryWallVisualWindow++;}
  if(part.kind==='wall')world.secondaryWallBreaks++;
  return true; // visual children were appended to world.visualFragments
}