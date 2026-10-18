import assert from 'node:assert/strict';
import {NullEngine,Scene,MeshBuilder,TransformNode,StandardMaterial} from '@babylonjs/core';
import {attractNewResidents} from '../src/cityLife.js';
import {citizenIdentity} from '../src/citizenRoutines.js';
const engine=new NullEngine(),scene=new Scene(engine);
const material=()=>new StandardMaterial('residents',scene);
const m={shirts:[],arms:[],head:MeshBuilder.CreateSphere('head',{diameter:.4},scene),
 leg:MeshBuilder.CreateBox('leg',{size:.18},scene)};
for(let i=0;i<6;i++){m.shirts.push(MeshBuilder.CreateBox('shirt',{size:.6},scene));m.arms.push(MeshBuilder.CreateBox('arm',{size:.2},scene))}
const world={scene,mobile:false,materials:{helpSign:material()},
 citizenMasterRefs:m,civilians:[],nextCitizenId:210};
const dead=[];
for(let i=0;i<5;i++){
 const root=new TransformNode('dead-resident',scene);
 dead.push(root);world.civilians.push({root,identity:citizenIdentity(i),state:'dead'});
}
for(let i=5;i<210;i++)world.civilians.push({identity:citizenIdentity(i),state:'walking'});
assert.equal(attractNewResidents(world,3),3);
assert.equal(world.civilians.length,210,'Vacant spots should be filled, not overcrowded');
assert.equal(world.civilians.filter(p=>p.state==='dead').length,2);
assert.equal(world.civilians.filter(p=>p.state==='walking').length,208);
assert.equal(world.returnedResidents,3);
assert(dead.slice(0,3).every(root=>root.isDisposed()),'Old deceased identities must be disposed');
assert(world.civilians.filter(p=>p.identity.id>=210).length===3,
 'New residents must have NEW identities');
assert.equal(attractNewResidents(world,10),2,'No new arrivals when city capacity reached');
assert.equal(attractNewResidents(world,10),0);
scene.dispose();engine.dispose();
console.log('RETURNING_RESIDENTS_PASS: rebuilt homes attract new citizens without resurrecting dead residents');
