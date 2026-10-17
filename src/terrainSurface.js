import {Mesh,VertexData,VertexBuffer} from '@babylonjs/core';

// Original streets were long, six-sided boxes. With only 8 vertices apiece,
// their center stayed completely flat across a crater. These are tessellated
// surface skins, batched by material for mobile performance.
const cell=1.65;
const rect=(x,z,w,l,y)=>({x,z,w,l,y});
const hasHole=(x,z,craters)=>{
 for(const c of craters){
  const dx=x-c.x,dz=z-c.z,theta=Math.atan2(dz,dx);
  const rough=.895+.036*Math.sin(theta*7+c.x*.19)+.020*Math.sin(theta*13-c.z*.13);
  if(dx*dx+dz*dz<Math.pow(c.radius*rough,2))return true;
 }
 return false;
};
export function roadSurfaceSpecs(){
 const roads=[-39,-13,13,39],asphalt=[],sidewalk=[],paint=[],grass=[];
 for(const x of roads){
  asphalt.push(rect(x,0,7,161,.102));
  paint.push(rect(x-3.34,0,.12,161,.124),rect(x+3.34,0,.12,161,.124));
  for(let z=-77;z<79;z+=12)paint.push(rect(x,z,.16,4.3,.14));
 }
 for(const z of roads){
  asphalt.push(rect(0,z,161,7,.154));
  paint.push(rect(0,z-3.34,161,.12,.165),rect(0,z+3.34,161,.12,.165));
  for(let x=-77;x<79;x+=12)paint.push(rect(x,z,4.3,.15,.194));
 }
 for(const x of [-52,-26,0,26,52])for(const z of [-52,-26,0,26,52]){
  sidewalk.push(rect(x,z,18.6,18.6,.28));
  if((x===-26&&z===26)||(x===26&&z===-26)||(x===0&&z===0))
   grass.push(rect(x,z,16,16,.405));
 }
 return {asphalt,sidewalk,paint,grass};
}
function makeSurface(world,name,regions,material){
 const vertices=[],uv=[],triangles=[];
 for(const r of regions){
  const sx=Math.max(1,Math.ceil(r.w/cell)),sz=Math.max(1,Math.ceil(r.l/cell));
  for(let j=0;j<sz;j++)for(let i=0;i<sx;i++){
   const x0=r.x-r.w/2+i*r.w/sx,x1=r.x-r.w/2+(i+1)*r.w/sx;
   const z0=r.z-r.l/2+j*r.l/sz,z1=r.z-r.l/2+(j+1)*r.l/sz;
   const b=vertices.length/3;
   vertices.push(x0,r.y,z0,x0,r.y,z1,x1,r.y,z1,x1,r.y,z0);
   uv.push(i/sx,j/sz,i/sx,(j+1)/sz,(i+1)/sx,(j+1)/sz,(i+1)/sx,j/sz);
   // Babylon's ground faces use the opposite winding from the initial
   // street-skin implementation. The old order made all normals point DOWN
   // and back-face culling hid every road when viewed from above.
   triangles.push(b,b+2,b+1,b,b+3,b+2);
  }
 }
 const data=new VertexData();
 data.positions=vertices;data.uvs=uv;data.indices=triangles;
 const normals=[];
 VertexData.ComputeNormals(vertices,triangles,normals);data.normals=normals;
 const mesh=new Mesh(name,world.scene);
 data.applyToMesh(mesh,true);
 mesh.material=material;mesh.isPickable=false;mesh.receiveShadows=true;
 mesh.metadata={terrainSkin:true,terrainOriginalPositions:Float32Array.from(vertices),
  terrainOriginalIndices:Uint32Array.from(triangles)};
 mesh.freezeWorldMatrix();
 return mesh;
}
export function buildCitySurfaceSkins(world){
 const {asphalt,sidewalk,paint,grass}=roadSurfaceSpecs();
 world.terrainSkins=[
  makeSurface(world,'deformable asphalt',asphalt,world.materials.road),
  makeSurface(world,'deformable sidewalks',sidewalk,world.materials.sidewalk),
  makeSurface(world,'deformable road markings',paint,world.materials.marking),
  makeSurface(world,'deformable park lawns',grass,world.materials.grass)
 ];
 return world.terrainSkins;
}
// Triangles disappear inside the excavated region instead of resurfacing as
// floating material. Border segments follow the terrain at meter resolution.
export function reshapeCitySurfaceSkins(world,craters,heightAt){
 let clipped=0,verticesMoved=0;
 for(const mesh of world.terrainSkins||[]){
  if(mesh.isDisposed())continue;
  mesh.unfreezeWorldMatrix();
  const original=mesh.metadata.terrainOriginalPositions;
  const positions=new Float32Array(original.length);
  for(let i=0;i<original.length;i+=3){
   const x=original[i],z=original[i+2];
   positions[i]=x;positions[i+1]=original[i+1]+heightAt(x,z,craters)+.035;
   positions[i+2]=z;
   if(Math.abs(positions[i+1]-original[i+1])>.01)verticesMoved++;
  }
  const triangles=[],old=mesh.metadata.terrainOriginalIndices;
  // Four vertices / quad, six indices / quad.
  for(let i=0;i<old.length;i+=6){
   // Vertex 0 and 2 are the diagonal of each four-vertex paving quad;
   // winding order must not change which area gets clipped out.
   const a=old[i]*3,b=(old[i]+2)*3;
   const centerX=(original[a]+original[b])*.5;
   const centerZ=(original[a+2]+original[b+2])*.5;
   if(hasHole(centerX,centerZ,craters)){clipped++;continue}
   for(let k=0;k<6;k++)triangles.push(old[i+k]);
  }
  const normals=[];
  VertexData.ComputeNormals(positions,triangles,normals);
  mesh.updateVerticesData(VertexBuffer.PositionKind,positions);
  mesh.updateVerticesData(VertexBuffer.NormalKind,normals);
  mesh.setIndices(triangles);
  mesh.refreshBoundingInfo(true);
  mesh.freezeWorldMatrix();
 }
 return {clipped,verticesMoved};
}
export function reshapeLooseDecorations(world,craters,heightAt){
 // Decorative details have their own fine-sized boxes; they must not hover
 // above a crater after the asphalt under them has disappeared.
 const names=new Set(['batched road crosswalks drains and planting',
  'showcase central plaza details','batched soft building footprint shadows',
  'batched street furniture','batched static city geometry']);
 for(const mesh of world.scene.meshes){
  if(mesh.isDisposed()||!mesh.isEnabled()||!names.has(mesh.name))continue;
  mesh.unfreezeWorldMatrix();
  const orig=mesh.metadata?.terrainOriginalPositions||
    mesh.getVerticesData(VertexBuffer.PositionKind,true);
  if(!orig)continue;
  if(!mesh.metadata)mesh.metadata={};
  if(!mesh.metadata.terrainOriginalPositions)
    mesh.metadata.terrainOriginalPositions=Float32Array.from(orig);
  const before=mesh.metadata.terrainOriginalPositions;
  if(!mesh.metadata.terrainOriginalIndices)
    mesh.metadata.terrainOriginalIndices=Uint32Array.from(mesh.getIndices()||[]);
  const oldIdx=mesh.metadata.terrainOriginalIndices;
  const positions=new Float32Array(before.length);
  // Most merged boxes use global coordinates. The showcase contact quad is
  // handled below because its vertices are in local coordinates.
  for(let i=0;i<before.length;i+=3){
   const x=before[i],z=before[i+2];
   positions[i]=x;positions[i+1]=before[i+1]+heightAt(x,z,craters)+.035;positions[i+2]=z;
  }
  const indices=[];
  for(let i=0;i<oldIdx.length;i+=3){
   const a=oldIdx[i]*3,b=oldIdx[i+1]*3,c=oldIdx[i+2]*3;
   const cx=(before[a]+before[b]+before[c])/3,cz=(before[a+2]+before[b+2]+before[c+2])/3;
   if(hasHole(cx,cz,craters))continue;
   indices.push(oldIdx[i],oldIdx[i+1],oldIdx[i+2]);
  }
  const normals=[];
  VertexData.ComputeNormals(positions,indices,normals);
  // Decorative vertex buffers from batching can be non-updatable: explicitly
  // mark the original buffer dynamic once, then update it in place.
  mesh.setVerticesData(VertexBuffer.PositionKind,positions,true);
  mesh.setVerticesData(VertexBuffer.NormalKind,normals,true);
  mesh.setIndices(indices);mesh.refreshBoundingInfo(true);mesh.freezeWorldMatrix();
 }
 for(const m of world.scene.meshes){
  if(m.name!=='showcase ambient contact'||m.isDisposed())continue;
  const dx=m.position.x,dz=m.position.z;
  const hole=craters.some(c=>Math.hypot(dx-c.x,dz-c.z)<c.radius+2);
  m.setEnabled(!hole);
 }
}
