import {strict as assert} from 'node:assert';
import {NullEngine,Scene,StandardMaterial,VertexBuffer} from '@babylonjs/core';
import {buildCitySurfaceSkins,reshapeCitySurfaceSkins} from '../src/terrainSurface.js';
import {groundHeightAt} from '../src/terrainDamage.js';

const engine=new NullEngine(),scene=new Scene(engine);
const mat=()=>new StandardMaterial('test surface',scene);
const world={scene,materials:{road:mat(),sidewalk:mat(),marking:mat(),grass:mat()}};
const skins=buildCitySurfaceSkins(world);
assert.equal(skins.length,4,'Road, pavement, paint and parks each need one batched mesh');
const initial=skins.map(m=>m.getIndices().length);
const c={x:-13,z:-13,radius:19,depth:3.2,kind:'meteor'};
const first=reshapeCitySurfaceSkins(world,[c],groundHeightAt);
assert(first.clipped>150,'No road and pavement cutout');
assert(first.verticesMoved>200,'Crater contour not followed');
for(let i=0;i<skins.length;i++){
 const m=skins[i],current=m.getIndices();
 assert(current.length<initial[i],m.name+' not excised');
 const orig=m.metadata.terrainOriginalPositions;
 // No remaining triangle can paint the center of the crater in 3D.
 for(let j=0;j<current.length;j+=3){
  const k=current[j]*3,n=current[j+1]*3,o=current[j+2]*3;
  const x=(orig[k]+orig[n]+orig[o])/3,z=(orig[k+2]+orig[n+2]+orig[o+2])/3;
  assert(Math.hypot(x-c.x,z-c.z)>c.radius*.82,
   m.name+' still covers the crater floor');
 }
 const points=m.getVerticesData(VertexBuffer.PositionKind);
 for(let j=0;j<points.length;j+=3){
  if(Math.hypot(points[j]-c.x,points[j+2]-c.z)>3)continue;
  // Even the hidden mesh vertices follow the excavated soil, not old road Y.
  assert(points[j+1]<-2,'Surface coordinate did not descend into crater');
  break;
 }
}
const second=reshapeCitySurfaceSkins(world,[c,
 {x:39,z:39,radius:8,depth:2,kind:'quake'}],groundHeightAt);
assert(second.clipped>first.clipped,'Two craters must remove more surface');
reshapeCitySurfaceSkins(world,[],groundHeightAt);
skins.forEach((m,i)=>assert.equal(m.getIndices().length,initial[i],
  m.name+' failed to restore after terrain reset'));
scene.dispose();engine.dispose();
console.log('CRATER_SKINS_PASS: asphalt, sidewalks, lane paint, grass all excavated and restorable');
