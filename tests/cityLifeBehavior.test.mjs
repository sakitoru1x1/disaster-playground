import assert from 'node:assert/strict';
import {walkPedestrian} from '../src/cityLife.js';
import {SIDEWALK_COORDS} from '../src/cityMotion.js';
import {citizenIdentity} from '../src/citizenRoutines.js';
import {CityWorld} from '../src/world.js';
const axis = n => SIDEWALK_COORDS[n];
function citizen(id=5){
 const identity=citizenIdentity(id),[i,j]=identity.home;
 return {identity,state:'walking',node:[i,j],target:[i,j],previous:null,
  root:{position:{x:axis(i),z:axis(j),y:.215},rotation:{x:0,y:0,z:0}},
  legs:[{rotation:{x:0}},{rotation:{x:0}}],
  arms:[{rotation:{x:0}},{rotation:{x:0}}],
  panic:0,speed:identity.speed,walkPhase:0,walked:0,
  routineGoal:null,pathGoal:null,routineActivity:'breakfast',
  waitTime:0,socialUntil:0,threat:{x:0,z:0}};
}
const c=citizen(12),counts=new Map();
let lastX=c.root.position.x,lastZ=c.root.position.z,maxJump=0;
for(let t=0;t<360;t+=.05){
 walkPedestrian(c,.05,t);
 const jump=Math.hypot(c.root.position.x-lastX,c.root.position.z-lastZ);
 maxJump=Math.max(jump,maxJump);
 lastX=c.root.position.x;lastZ=c.root.position.z;
 counts.set(c.routineActivity,(counts.get(c.routineActivity)||0)+.05);
 assert(jump<=c.speed*.05*3+1e-5, 'NPC teleported');
 assert(Number.isFinite(c.root.position.x)&&Number.isFinite(c.root.position.z),'Invalid citizen position');
}
console.log('ROUTINE_SECONDS',Object.fromEntries(counts),'MAX_JUMP',maxJump);
assert(counts.get('commuting to work')>1&&counts.get('working')>1&&counts.get('commuting home')>1,'No daily commute');
const greeter=citizen(27);
greeter.node=[...greeter.identity.work];greeter.target=[...greeter.node];
greeter.root.position.x=axis(greeter.node[0]);greeter.root.position.z=axis(greeter.node[1]);
greeter.routineGoal=[...greeter.node];greeter.pathGoal=[...greeter.node];
greeter.socialUntil=50;greeter.routineActivity='socializing';
for(let t=46;t<48;t+=.05)walkPedestrian(greeter,.05,t);
console.log('GREETING_ACTIVITY',greeter.routineActivity,'WAIT',greeter.waitTime);
assert.equal(greeter.routineActivity,'socializing','Socializing state was overwritten');
const injured=citizen(22);injured.state='injured';const pos={...injured.root.position};
walkPedestrian(injured,4,16);assert.deepEqual(injured.root.position,pos,'Injured NPC must stay still');
const panic=citizen(13);panic.panic=1;for(let t=0;t<50;t+=.05)walkPedestrian(panic,.05,t);
assert.equal(panic.state,'walking');
const floors=[{health:100,maxHealth:100,active:false},{health:1,maxHealth:100,active:false}];
assert.equal(CityWorld.prototype.integrity.call({structures:floors}),51,
 'Integrity must account for weakened floors, not only collapsed floors');
floors[1].active=true;
assert.equal(CityWorld.prototype.integrity.call({structures:floors}),50);
floors[0].active=true;
assert.equal(CityWorld.prototype.integrity.call({structures:floors}),0);
console.log('CITIZEN_BEHAVIOR_PASS: full daily routine, greetings, panic and damage-based integrity');
