import {MeshBuilder, PhysicsAggregate, PhysicsShapeType, Vector3, VertexBuffer, VertexData} from '@babylonjs/core';
import {chooseSlabSplitCount,partitionSlab} from './slabs.js';
import {queueSecondaryFracture} from './secondaryFracture.js';

// Destructible modular buildings: panels, columns, and individually fractured slabs.
// Havok handles rigid-body motion and collisions, not concrete stress propagation.
const V=(x,y,z)=>new Vector3(x,y,z);
const rand=(a,b)=>a+Math.random()*(b-a);
const pick=(a,b)=>Math.random()<.76?a:b;

function jaggedBlock(scene,size,material,name){
  const mesh=MeshBuilder.CreateBox(name,{width:size[0],height:size[1],depth:size[2]},scene);
  const positions=mesh.getVerticesData(VertexBuffer.PositionKind),offsets=new Map();
  // Give geometrically shared corners identical offsets to avoid tearing UV seams.
  for(let i=0;i<positions.length;i+=3){
    const x=positions[i],y=positions[i+1],z=positions[i+2];
    const key=(x>=0?'1':'0')+(y>=0?'1':'0')+(z>=0?'1':'0');
    if(!offsets.has(key))offsets.set(key,[
      rand(-.12,.12)*Math.min(1,size[0]),
      rand(-.11,.11)*Math.min(1,size[1]),
      rand(-.12,.12)*Math.min(1,size[2])
    ]);
    const a=offsets.get(key);
    positions[i]+=a[0];positions[i+1]+=a[1];positions[i+2]+=a[2];
  }
  mesh.setVerticesData(VertexBuffer.PositionKind,positions);
  const normals=[];
  VertexData.ComputeNormals(positions,mesh.getIndices(),normals);
  mesh.setVerticesData(VertexBuffer.NormalKind,normals);
  mesh.material=material;mesh.isPickable=false;mesh.receiveShadows=true;
  return mesh;
}

function makeWindowShard(world,mesh,side,length,height){
  if(!world.windowMat||Math.random()>.64)return;
  const pane=world.windowMaster.createInstance('broken glass facade');
  pane.parent=mesh;
  pane.scaling.set(Math.max(.22,length*.73),Math.max(.22,height*.52),1);
  if(side==='front')pane.position=V(0,0,mesh.metadata.depth*.5+.03);
  else if(side==='back')pane.position=V(0,0,-mesh.metadata.depth*.5-.03);
  else {
    pane.rotation.y=Math.PI/2;
    pane.position=V((side==='right'?1:-1)*(mesh.metadata.width*.5+.03),0,0);
  }
  pane.isPickable=false;
}

function spawnPhysical(world,entry,origin,local,size,kind,face,impulse,slabId=null){
  if(world.fragments.length>=world.maxPrimaryFragmentBodies)return false;
  const accent=world.materials.wallsAccent[entry.building.style||0];
  const material=kind==='slab'?world.materials.concrete:
    kind==='column'?accent:pick(entry.mesh.material,accent);
  const shard=jaggedBlock(world.scene,size,material,'fractured '+kind);
  shard.position=origin.add(local);
  shard.rotation=V(rand(-.055,.055),rand(-.07,.07),rand(-.055,.055));
  shard.metadata={width:size[0],depth:size[2],kind,slabId,fragmentSize:size.slice(),buildingId:entry.building.id,storey:entry.storey};
  if(face)makeWindowShard(world,shard,face,
    face==='front'||face==='back'?size[0]:size[2],size[1]);
  // Keep enough shadow casting to ground fragments without filling the shadow atlas.
  if(world.shadow&&Math.random()<.19)world.shadow.addShadowCaster(shard);
  const volume=size[0]*size[1]*size[2];
  const mass=kind==='slab'?Math.max(3,volume*rand(2,3.2)):
    kind==='column'?rand(9,25):rand(7,22);
  const aggregate=new PhysicsAggregate(shard,PhysicsShapeType.BOX,{
    mass,friction:.83,restitution:.055
  },world.scene);
  aggregate.body.setLinearDamping(.14);
  aggregate.body.setAngularDamping(.28);
  const outward=V(local.x*.9,0,local.z*.9);
  const push=impulse.scale(rand(.35,.77)).add(outward).add(V(
    rand(-3,3),kind==='slab'?rand(1,4):rand(2,6),rand(-3,3)));
  aggregate.body.applyImpulse(push,shard.position);
  aggregate.body.setAngularVelocity(V(rand(-1.6,1.6),rand(-2,2),rand(-1.6,1.6)));
  const fragment={mesh:shard,aggregate,age:0,kind,slabId,building:entry.building,secondaryQueued:false,secondaryGeneration:0};
  world.fragments.push(fragment);
  if(kind==='slab'&&size[0]*size[2]>3.2&&Math.min(size[0],size[2])>.98){
    aggregate.body.setCollisionCallbackEnabled(true);
    const observable=aggregate.body.getCollisionObservable();
    fragment.collisionObservable=observable;
    fragment.collisionObserver=observable.add(info=>{
      if(info.type==='COLLISION_STARTED')queueSecondaryFracture(world,fragment,info);
    });
  }
  world.activeBodies++;
  return true;
}

function spawnVisualRubble(world,entry,origin,local,size,kind,impulse,slabId=null){
  if(world.visualFragments.length>=world.maxVisualFragments)return false;
  const material=kind==='slab'?world.materials.concrete:entry.mesh.material;
  const shard=jaggedBlock(world.scene,size,material,'visually simulated falling '+kind);
  shard.position=origin.add(local);
  shard.rotation=V(rand(-.09,.09),rand(-.19,.19),rand(-.09,.09));
  shard.metadata={kind,slabId,visualFalling:true};
  // Visual fallback starts at its actual height, and falls rather than teleporting.
  const velocity=impulse.scale(rand(.018,.055)).add(V(rand(-1.8,1.8),rand(-1,2),rand(-1.8,1.8)));
  world.visualFragments.push({
    mesh:shard,velocity,angular:V(rand(-1.2,1.2),rand(-2,2),rand(-1.2,1.2)),
    floorY:.42+size[1]*.5,settled:false
  });
  return true;
}

export function fractureStorey(world,entry,impulse,impactAt){
  const original=entry.mesh,origin=original.getAbsolutePosition().clone();
  const {x:w,y:h,z:d}=entry.size;
  // Never remove an intact storey if we have no capacity to show its fragments.
  if(world.fragments.length>=world.maxFragmentBodies&&
     world.visualFragments.length>=world.maxVisualFragments)return false;
  entry.aggregate?.dispose();entry.aggregate=null;
  original.setEnabled(false);entry.active=true;world.brokenFloors++;

  // Each floor plate is independently fractured into a RANDOM 2/3/5/8/10 pieces.
  // A few non-slab fragments get priority to keep the walls recognizable.
  const selectedCount=chooseSlabSplitCount();
  const room=Math.max(0,world.maxFragmentBodies-world.fragments.length);
  const wallCount=Math.min(5,Math.max(0,room-selectedCount));
  const panels=[
    {local:V(-w*.25,0,-d*.49),size:[w*.43,h*.88,.31],face:'back'},
    {local:V(w*.25,0,-d*.49),size:[w*.43,h*.78,.31],face:'back'},
    {local:V(-w*.25,0,d*.49),size:[w*.43,h*.81,.31],face:'front'},
    {local:V(w*.25,0,d*.49),size:[w*.43,h*.86,.31],face:'front'},
    {local:V(-w*.49,0,0),size:[.32,h*.79,d*.78],face:'left'},
    {local:V(w*.49,0,0),size:[.32,h*.83,d*.77],face:'right'}
  ];
  // Randomize which facade panels break, avoiding cookie-cutter damage patterns.
  for(let i=panels.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [panels[i],panels[j]]=[panels[j],panels[i]];
  }
  for(let i=0;i<wallCount;i++){
    const p=panels[i];
    spawnPhysical(world,entry,origin,p.local,p.size,'wall',p.face,impulse);
  }

  // Subdivide the entire floor plate by recursive non-uniform cuts.
  const slabId=world.slabFractures.length;
  const slabWidth=w*.91,slabDepth=d*.91;
  const cells=partitionSlab(slabWidth,slabDepth,selectedCount);
  const plateY=-h*.5+.20;
  let physicalParts=0,staticParts=0;
  for(const cell of cells){
    const thickness=rand(.23,.35);
    const size=[Math.max(.16,cell.w-.055),thickness,Math.max(.16,cell.d-.055)];
    const local=V(cell.x,plateY+rand(-.06,.06),cell.z);
    const outward=V(cell.x*1.1,rand(0,2.5),cell.z*1.1);
    const push=impulse.add(outward);
    if(spawnPhysical(world,entry,origin,local,size,'slab','',push,slabId)){
      physicalParts++;
    }else if(spawnVisualRubble(world,entry,origin,local,size,'slab',push,slabId)){
      // Retain slab fragments at their real height and animate gravitational fall.
      staticParts++;
    }else{
      // Max both budgets: retain a single visible piece of the floor in place.
      // It is intentionally NOT teleported away.
      const mesh=jaggedBlock(world.scene,size,world.materials.concrete,'retained slab shard');
      mesh.position=origin.add(local);mesh.metadata={kind:'slab',slabId,retained:true};
      world.rubble.push(mesh);staticParts++;
    }
  }
  world.slabFractures.push({
    id:slabId,buildingId:entry.building.id,storey:entry.storey,
    requestedParts:selectedCount,physicalParts,staticParts
  });

  return true;
}