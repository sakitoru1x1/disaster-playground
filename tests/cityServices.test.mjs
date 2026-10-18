import assert from 'node:assert/strict';
import {Vector3} from '@babylonjs/core';
import {petDisasterForce,affectPets} from '../src/cityPets.js';
import {recoverySiteStatus} from '../src/parallelRecovery.js';
import {outsideCity,OUT_OF_PLAY,cullOutOfBounds} from '../src/worldReclamation.js';
const V=(x,y,z)=>new Vector3(x,y,z);
const surge=petDisasterForce('tsunami',V(0,.2,122),V(0,0,0),1,17);
assert(surge.falloff>.9&&surge.x>27&&surge.y>4,
 'Tsunami must push pets across the entire city width, not near Z=0 only');
assert.equal(petDisasterForce('tsunami',V(40,.2,122),V(0,0,0),1,17).falloff,0);
const vortex=petDisasterForce('tornado',V(5,.2,3),V(0,0,0),.9,27);
assert(vortex.falloff>.5&&vortex.y>5&&vortex.z>0,'Vortex must spin and lift pets');
const pet={kind:'dog',root:{position:V(0,.23,110)},velocity:V(0,0,0),
 airborne:false,state:'wandering',age:0};
const logs=[];
affectPets({pets:[pet],audio:{play:(...x)=>logs.push(x)}},'tsunami',V(0,0,0),1,17,.13);
assert(pet.airborne&&pet.velocity.x>20,'Dog must float in breaking wave');
assert(logs.length===1&&logs[0][0]==='dogPanic','Pet must yelp from a CC0 recorded sample');
assert.equal(recoverySiteStatus({cleared:true,craters:1,damaged:true,fire:false,victims:false}),'concrete');
assert.equal(recoverySiteStatus({cleared:true,craters:0,damaged:true,fire:false,victims:false}),'construction');
assert.equal(recoverySiteStatus({cleared:false,craters:1,damaged:true,fire:true}),'blocked');
assert.equal(recoverySiteStatus({cleared:false,craters:1,damaged:true,victims:false}),'cleanup');
assert.equal(recoverySiteStatus({cleared:true,craters:0,damaged:false}),'complete');
assert.equal(outsideCity(V(OUT_OF_PLAY+1,0,0)),true);
assert.equal(outsideCity(V(0,0,OUT_OF_PLAY+1)),true);
assert.equal(outsideCity(V(0,-70,0)),true);
assert.equal(outsideCity(V(0,20,0)),false);
const dead=v=>({position:V(v,1,0),removed:false,
 isDisposed(){return this.removed},dispose(){this.removed=true},
 getAbsolutePosition(){return this.position}});
let releases=0;
const fragment=dead(OUT_OF_PLAY+5),loose=dead(OUT_OF_PLAY+8);
const aggregate={dispose(){releases++}};
const world={fragments:[{mesh:fragment,aggregate}],debris:[],rubble:[loose],
 props:[],trees:[],pets:[],civilians:[],visualFragments:[],staticRubbleBatches:[],
 pendingSecondary:[{fragment:{mesh:fragment}}],visualFractureQueue:[],pendingFailures:[],
 activeBodies:1};
const result=cullOutOfBounds(world);
assert.equal(result.removed,2);
assert.equal(result.bodies,1);
assert.equal(world.activeBodies,0);
assert.equal(world.fragments.length,0);
assert.equal(world.rubble.length,0);
assert.equal(world.pendingSecondary.length,0);
assert(fragment.isDisposed()&&loose.isDisposed());
console.log('CITY_SERVICES_UNIT_PASS: pets in tsunami/tornado, local pipeline, out-of-world debris and Havok freeing');
