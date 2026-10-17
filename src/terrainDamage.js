import {MeshBuilder,Mesh,VertexBuffer,VertexData,PhysicsAggregate,PhysicsShapeType,Vector3,Color3} from '@babylonjs/core';

const clamp=(x,lo,hi)=>Math.min(hi,Math.max(lo,x));
const dist=(x,z,c)=>Math.hypot(x-c.x,z-c.z);
export function groundHeightAt(x,z,craters){
 let height=-.035;
 for(const c of craters){
  const r=dist(x,z,c);
  if(r<c.radius){
   const t=r/c.radius;
   // Flat-ish floor, steep outer walls and raised ejecta rim.
   const depression=-c.depth*(1-t*t)*(1-t*t);
   const rim=c.depth*.16*Math.exp(-Math.pow((t-.90)*7,2));
   height+=depression+rim;
  }else if(r<c.radius*1.35){
   const t=(r/c.radius-1)/.35;
   height+=c.depth*.07*(1-t)*(1-t);
  }
 }
 return clamp(height,-3.5,2.4);
}
export function applyCrater(world,x,z,power=1,kind='meteor'){
 if(world.terrainCraters.length>=7)world.terrainCraters.shift();
 const k=clamp(power,0,1);
 const c={x,z,radius:(kind==='quake'?6:3)+k*(kind==='quake'?13:16),
  depth:(kind==='quake'?.22:.65)+k*(kind==='quake'?1.3:2.7),kind};
 world.terrainCraters.push(c);
 const mesh=world.ground;
 const positions=mesh.getVerticesData(VertexBuffer.PositionKind,true);
 for(let i=0;i<positions.length;i+=3){
  positions[i+1]=groundHeightAt(positions[i],positions[i+2],world.terrainCraters);
 }
 const indices=mesh.getIndices(),normals=[];
 VertexData.ComputeNormals(positions,indices,normals);
 mesh.updateVerticesData(VertexBuffer.PositionKind,positions);
 mesh.updateVerticesData(VertexBuffer.NormalKind,normals);
 mesh.refreshBoundingInfo(true);
 // Replace the Havok static mesh so the crater is also a walkable/slideable
 // depression; this is not merely a decal.
 world.groundPhysics?.dispose();
 world.groundPhysics=new PhysicsAggregate(mesh,PhysicsShapeType.MESH,
   {mass:0,friction:.85,restitution:0},world.scene);
 // Baked road paint/sidewalks aren't colliders; sink their vertices locally
 // to prevent floating asphalt planes across a crater.
 for(const road of world.scene.meshes){
  if(road.name!=='batched static city geometry'&&!/batched road crosswalk/.test(road.name))continue;
  if(!road.isEnabled()||road.isDisposed())continue;
  road.unfreezeWorldMatrix();
  const points=road.getVerticesData(VertexBuffer.PositionKind,true);
  if(!points)continue;
  if(!road.metadata)road.metadata={};
  if(!road.metadata.originalStreetPositions)road.metadata.originalStreetPositions=points.slice();
  const original=road.metadata.originalStreetPositions;
  for(let i=0;i<points.length;i+=3){
   const target=groundHeightAt(original[i],original[i+2],world.terrainCraters)+.035;
   points[i+1]=original[i+1]+target;
  }
  road.updateVerticesData(VertexBuffer.PositionKind,points);
  road.refreshBoundingInfo(true);
  road.freezeWorldMatrix();
 }
 // Avoid a floating intact building over a crater: destabilize its foundation.
 for(const b of world.buildings){
  const foundation=b.floors[0];
  if(foundation.active)continue;
  const distance=Math.hypot(foundation.mesh.position.x-x,foundation.mesh.position.z-z);
  if(distance<c.radius*.8){
   const amount=foundation.maxHealth*(.5+1.8*k)*(1-distance/(c.radius*1.25));
   world.damageStructure(foundation,amount,new Vector3(0,6*k,0),
     foundation.mesh.position,'terrain');
  }
 }
 world.terrainDeformations=(world.terrainDeformations||0)+1;
 return c;
}
export function initializeTerrain(world){
 world.terrainCraters=[];
 world.terrainDeformations=0;
 const old=world.ground;
 const mesh=MeshBuilder.CreateGround('deformable Havok terrain',
   {width:172,height:172,subdivisions:48,updatable:true},world.scene);
 mesh.position.y=0;
 mesh.material=world.materials.island;
 mesh.receiveShadows=true;
 mesh.isPickable=true;
 const points=mesh.getVerticesData(VertexBuffer.PositionKind,true);
 for(let i=1;i<points.length;i+=3)points[i]=-.035;
 mesh.updateVerticesData(VertexBuffer.PositionKind,points);
 mesh.refreshBoundingInfo(true);
 world.ground=mesh;
 old.dispose();
 world.groundPhysics=new PhysicsAggregate(mesh,PhysicsShapeType.MESH,
   {mass:0,friction:.87,restitution:.05},world.scene);
 // The old solid island box had its collision roof at y=-0.1: keeping that
 // collider would invisibly fill every crater. The new terrain is the ground.
 world.islandPhysics=null;
}
