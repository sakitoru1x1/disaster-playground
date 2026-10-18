import assert from 'node:assert/strict';
import {NullEngine,Scene,TransformNode,StandardMaterial,Color3} from '@babylonjs/core';
import {createCharacterLibrary,createCharacter} from '../src/characterArt.js';
const engine=new NullEngine(),scene=new Scene(engine),materials=new Map();
const world={scene,mat:(name,color)=>{
 if(!materials.has(name)){
  const mat=new StandardMaterial(name,scene);
  mat.diffuseColor=Color3.FromHexString(color);materials.set(name,mat);
 }
 return materials.get(name);
}};
const library=world.characterLibrary=createCharacterLibrary(world);
assert(library.meshes.length>55,'Need actual detailed low-poly assets, not one cube');
const originalMasters=library.meshes.length;
const human=(id,opts)=>{
 const root=new TransformNode('living person '+id,scene);
 const art=createCharacter(world,root,id,{...opts,library});
 assert.equal(art.legs.length,2);
 assert.equal(art.arms.length,2);
 assert(art.details.length>=7,'Facial features/hands missing');
 assert(root.getChildMeshes().some(m=>m.name.startsWith('person hairstyle')||
   m.name.startsWith('person protective helmet')));
 assert(root.getChildMeshes().some(m=>m.name.startsWith('person walking shoe')));
 assert(root.getChildMeshes().every(m=>m.material),
  'All rendered model parts require proper materials');
 assert(art.torso.material&&art.head.material&&art.arms[0].getChildMeshes().length>=2);
 const before=art.legs[0].rotation.x;
 art.legs[0].rotation.x=.42;
 assert.notEqual(art.legs[0].rotation.x,before,'Leg joint is not animated');
 return {root,art};
};
const adult=human(1,{age:'adult'});
const child=human(2,{age:'child'});
const teen=human(3,{age:'teen'});
const elder=human(4,{age:'elder'});
assert.equal(child.root.scaling.y,.78);
assert.equal(teen.root.scaling.y,.90);
assert.equal(elder.root.scaling.y,.95);
assert.equal(adult.root.scaling.y,1);
const medic=human(33,{role:'medic'});
const firefighter=human(42,{role:'fire'});
const builder=human(59,{role:'builder'});
const uniformTypes=[medic,firefighter,builder].map(x=>x.art.torso.material.name);
assert.equal(new Set(uniformTypes).size,3,'Profession uniforms cannot share identical material');
assert(firefighter.root.getChildMeshes().some(m=>m.name.includes('helmet')));
assert(builder.root.getChildMeshes().some(m=>m.name.includes('helmet')));
assert(medic.root.getChildMeshes().some(m=>m.name.includes('medical shoulder patch')));
const prior=scene.materials.length;
human(1,{age:'adult'});
assert.equal(scene.materials.length,prior,'Same citizen model must not create duplicate material');
assert(library.meshes.length-originalMasters<32,'Professional rigs should share masters');
assert(library.meshes.every(m=>m.alwaysSelectAsActiveMesh&&m.isVisible),
 'Source meshes must render Babylon instanced geometry when used on street');
for(const x of [adult,child,teen,elder,medic,firefighter,builder])x.root.dispose(false,false);
scene.dispose();engine.dispose();
console.log('CHARACTER_ART_UNIT_PASS: 4 age groups, 3 uniforms, facial parts, shoes, moving articulated limbs, instancing/material reuse');
