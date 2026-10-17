import {
 MeshBuilder,VertexBuffer,VertexData,PhysicsAggregate,PhysicsShapeType,PhysicsMotionType,Vector3
} from '@babylonjs/core';
import {reshapeCitySurfaceSkins,reshapeLooseDecorations} from './terrainSurface.js';
import {CITY_HALF_SIZE} from './cityLayout.js';
import {damageDistrictShells} from './cityDistricts.js';

const clamp=(x,lo,hi)=>Math.min(hi,Math.max(lo,x));
const dist=(x,z,c)=>Math.hypot(x-c.x,z-c.z);
export function groundHeightAt(x,z,craters){
 let height=-.035;
 for(const c of craters){
  const r=dist(x,z,c);
  if(r<c.radius){
   const t=r/c.radius;
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
// All non-physical objects use the same terrain elevation as Havok rather
// than standing at their original street height over the crater.
export const terrainDisplacement=(x,z,craters)=>
 groundHeightAt(x,z,craters)+.035;
export function applyCrater(world,x,z,power=1,kind='meteor'){
 if(world.terrainCraters.length>=7)world.terrainCraters.shift();
 const k=clamp(power,0,1);
 const c={x,z,radius:(kind==='quake'?6:3)+k*(kind==='quake'?13:16),
  depth:(kind==='quake'?.22:.65)+k*(kind==='quake'?1.3:2.7),kind};
 world.terrainCraters.push(c);
 const mesh=world.ground,craters=world.terrainCraters;
 const positions=mesh.getVerticesData(VertexBuffer.PositionKind,true);
 const colors=[];
 for(let i=0;i<positions.length;i+=3){
  const vx=positions[i],vz=positions[i+2];
  positions[i+1]=groundHeightAt(vx,vz,craters);
  // Soil within excavated terrain should look like exposed earth, not an
  // uninterrupted grassy field painted into the crater floor.
  let soil=0;
  for(const crater of craters){
   const t=dist(vx,vz,crater)/crater.radius;
   soil=Math.max(soil,clamp((1.16-t)*4,0,1));
  }
  colors.push(1-.43*soil,1-.44*soil,1-.57*soil,1);
 }
 const normals=[];
 VertexData.ComputeNormals(positions,mesh.getIndices(),normals);
 mesh.updateVerticesData(VertexBuffer.PositionKind,positions);
 mesh.updateVerticesData(VertexBuffer.NormalKind,normals);
 mesh.setVerticesData(VertexBuffer.ColorKind,colors,true);
 mesh.refreshBoundingInfo(true);
 // The Havok ground collision surface changes together with the visuals.
 world.groundPhysics?.dispose();
 world.groundPhysics=new PhysicsAggregate(mesh,PhysicsShapeType.MESH,
   {mass:0,friction:.85,restitution:0},world.scene);

 // Big asphalt boxes previously had only four horizontal corner vertices,
 // so their "deformation" couldn't affect anything in the center of a crater.
 // Tessellated terrain skins have metre-sized quads; excavate the inner region
 // completely, then deform the surrounding edges.
 const skinStats=reshapeCitySurfaceSkins(world,craters,groundHeightAt);
 world.terrainClippedTiles=skinStats.clipped;
 world.terrainWarpedVertices=skinStats.verticesMoved;
 reshapeLooseDecorations(world,craters,groundHeightAt);

 // Vegetation, stationary bodies and citizens share terrain coordinates too.
 for(const tree of world.trees){
  if(tree.root.isDisposed())continue;
  tree.root.position.y=.4+terrainDisplacement(tree.root.position.x,tree.root.position.z,craters);
 }
 for(const detail of world.scene.meshes){
  if(detail.isDisposed())continue;
  if(!['central fountain basin','fountain water','public sculpture',
    'pedestrian ground stain','building lobby','lobby marquee'].includes(detail.name))continue;
  if(detail.metadata?.terrainBaseY===undefined)detail.metadata={...detail.metadata,
   terrainBaseY:detail.position.y};
  detail.position.y=detail.metadata.terrainBaseY+
   terrainDisplacement(detail.position.x,detail.position.z,craters);
 }
 // Vehicles already driving into the freshly excavated footprint must lose
 // their kinematic target and fall into the hole as DYNAMIC Havok rigid bodies.
 for(const car of world.props){
  if(car.type!=='car'||car.traffic?.state!=='driving'||!car.aggregate)continue;
  const p=car.mesh.position;
  if(terrainDisplacement(p.x,p.z,craters)<-.85){
   car.traffic.state='released';
   const body=car.aggregate.body;
   body.setMotionType(PhysicsMotionType.DYNAMIC);
   body.setLinearVelocity(new Vector3(Math.cos(car.traffic.heading)*car.traffic.speed,
    body.getLinearVelocity().y,-Math.sin(car.traffic.heading)*car.traffic.speed));
  }
 }
 // An intact structure whose foundation is undermined must fracture normally.
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
 // The new low-cost peripheral structures must not remain suspended above
 // excavated foundations. A crater can topple their single rigid body.
 for(const shell of world.districtShells||[]){
  if(!shell.ruined&&Math.hypot(shell.x-x,shell.z-z)<c.radius*.72)
   shell.damage=Math.max(shell.damage,.86);
 }
 damageDistrictShells(world,kind,new Vector3(x,0,z),Math.max(.7,k),c.radius,.3);
 world.terrainDeformations=(world.terrainDeformations||0)+1;
 return c;
}
export function initializeTerrain(world){
 world.terrainCraters=[];
 world.terrainDeformations=0;
 world.terrainClippedTiles=0;
 world.terrainWarpedVertices=0;
 const old=world.ground;
 // A fairly fine terrain mesh keeps the visual crater close to Havok's shape.
 // About 6.5k vertices total — substantially cheaper than voxel excavation.
 const mesh=MeshBuilder.CreateGround('deformable Havok terrain',
   {width:CITY_HALF_SIZE*2,height:CITY_HALF_SIZE*2,subdivisions:132,updatable:true},world.scene);
 mesh.position.y=0;
 mesh.material=world.materials.island;
 mesh.receiveShadows=true;mesh.isPickable=true;
 const points=mesh.getVerticesData(VertexBuffer.PositionKind,true);
 const colors=[];
 for(let i=0;i<points.length;i+=3){points[i+1]=-.035;colors.push(1,1,1,1)}
 mesh.updateVerticesData(VertexBuffer.PositionKind,points);
 mesh.setVerticesData(VertexBuffer.ColorKind,colors,true);
 mesh.refreshBoundingInfo(true);
 world.ground=mesh;old.dispose();
 world.groundPhysics=new PhysicsAggregate(mesh,PhysicsShapeType.MESH,
   {mass:0,friction:.87,restitution:.05},world.scene);
 world.islandPhysics=null;
}
