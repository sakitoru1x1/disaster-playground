import assert from 'node:assert/strict';
import {Vector3} from '@babylonjs/core';
import {civilianPosition,ragdollForce,launchCitizenRagdoll,
  pushCitizenRagdoll,animateCitizenRagdoll,settleCitizenRagdoll}
  from '../src/citizenRagdolls.js';

const v=(x,y,z)=>new Vector3(x,y,z);
const at=v(1,1,118),sea=v(0,0,0);
const flow=ragdollForce('tsunami',at,sea,.9,17);
assert(flow.falloff>.8&&flow.x>50,
 'The tsunami must carry victims across the ENTIRE Z width of the city');
const far=ragdollForce('tsunami',v(31,1,120),sea,.9,17);
assert.equal(far.falloff,0,'Wave must affect only its front strip');
const tornado=ragdollForce('tornado',v(5,0,3),sea,1,28);
assert(tornado.falloff>.6&&tornado.y>30&&tornado.z>0,
 'Tornado must have actual upward force and rotating airflow');
const outside=ragdollForce('tornado',v(100,0,100),sea,1,25);
assert.equal(outside.falloff,0,'Vortex cannot reach unrelated districts');

const root={position:v(3,.215,117),rotation:{x:0,y:0,z:0,set(a,b,c){
 this.x=a;this.y=b;this.z=c;}},setEnabled(v){this.enabled=v}};
const limbs=()=>[{rotation:{x:0}},{rotation:{x:0}}];
const person={root,state:'injured',legs:limbs(),arms:limbs()};
const world={civilians:[person],scene:null,mobile:true,terrainCraters:[]};
assert.equal(launchCitizenRagdoll(world,person,tornado),true);
assert(person.airborne&&!person.ragdoll,
 'Nonphysics emergency fallback should retain animated citizen');
assert.equal(civilianPosition(person),root.position);
assert.equal(pushCitizenRagdoll(world,person,'tsunami',v(3,0,0),1,16,.06),true,
 'Already-injured citizen must be accelerated by the wave');
const initialX=root.position.x,initialY=root.position.y;
for(let i=0;i<15;i++)animateCitizenRagdoll(person,world,.08);
assert(root.position.x>initialX+1&&root.position.y>initialY,
 'A stranded or injured civilian must visibly fly, not be stuck at the curb');
settleCitizenRagdoll(person,world,true);
assert.equal(person.state,'walking');
assert.equal(person.airborne,null);
assert.equal(root.rotation.z,0);
console.log('CITIZEN_RAGDOLLS_UNIT_PASS: cyclone lift, full-city tsunami sweep, fallback flight, settlement and rescue');
