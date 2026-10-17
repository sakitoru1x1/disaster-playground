import {strict as assert} from 'node:assert';
import {Vector3} from '@babylonjs/core';
import {PlayerSurvival} from '../src/playerSurvival.js';
const V=(x,y,z)=>new Vector3(x,y,z);
function rig(){
 let impulses=[],forces=[],deaths=0;
 const world={fragments:[],debris:[],props:[],visualFragments:[]};
 const walk={world,scene:null,camera:{},yaw:0,pitch:0};
 const s=new PlayerSurvival(walk);
 s.mesh={position:V(0,1.05,0),getAbsolutePosition:()=>V(0,1.05,0)};
 s.body={getLinearVelocity:()=>V(0,0,0),applyForce:v=>forces.push(v),
  applyImpulse:v=>impulses.push(v),setLinearVelocity:()=>{}};
 s.onDeath=()=>deaths++;
 return {s,world,impulses,forces,get deaths(){return deaths}};
}
// METEOR: wave hits near player, skips outside radius and not before wave arrives.
{
 const a=rig(),now=10;
 a.s.environment(.016,{time:now,meteorHistory:[{
  x:0,y:1,z:0,explosionTime:now-.1,strength:1,impactTime:8
 }],effects:[]});
 assert.equal(a.s.dead,true,'100% direct meteor hit must kill');
 assert.equal(a.s.health,0); assert.equal(a.deaths,1);
 assert.equal(a.impulses.length,1);
 a.s.environment(.016,{time:now+.1,meteorHistory:[{
  x:0,y:1,z:0,explosionTime:now-.1,strength:1,impactTime:8
 }],effects:[]});
 assert.equal(a.deaths,1,'wave must hit only once');
}
{
 const a=rig(),m={x:80,y:1,z:0,explosionTime:10,strength:1,impactTime:10};
 a.s.environment(.016,{time:10.01,meteorHistory:[m],effects:[]});
 assert.equal(a.s.health,100,'distant meteor must not hit instantly');
 a.s.environment(.016,{time:11.2,meteorHistory:[m],effects:[]});
 assert(a.s.health<100,'expanding pressure front must reach player');
 const after=a.s.health;a.s.environment(.016,{time:11.3,meteorHistory:[m],effects:[]});
 assert.equal(a.s.health,after,'blast cannot double-damage');
}
{
 const a=rig();
 a.s.environment(.016,{time:12,meteorHistory:[],effects:[
  {type:'quake',origin:V(0,0,0),age:1,strength:.1}]});
 assert.equal(a.s.health,100,'weak quake is non-lethal');
 a.s.environment(.016,{time:12.1,meteorHistory:[],effects:[
  {type:'quake',origin:V(0,0,0),age:1.2,strength:1}]});
 assert(a.s.health<100&&a.s.knockdown>0,'strong quake must cause imbalance / damage');
}
{
 const a=rig();
 a.s.environment(.016,{time:3,meteorHistory:[],effects:[
  {type:'tornado',root:{position:V(2,1,0)},strength:1}]});
 assert(a.forces.length>0,'tornado must impart force to physics capsule');
 assert(a.forces.at(-1).y>0,'tornado must lift player');
 assert(a.s.knockdown>0,'strong tornado must unbalance player');
}
{
 const a=rig();
 for(let i=0;i<15;i++){
  a.s.cooldown=0;
  a.s.environment(.25,{time:4+i*.25,meteorHistory:[],effects:[
    {type:'tsunami',root:{position:V(1,0,0)},age:i*.25,strength:1,waveHeight:27}]});
 }
 assert(a.s.drowning>2,'immersed survivor must accumulate drowning exposure');
 assert(a.s.health<100,'tsunami must damage survivor');
 assert(a.forces.at(-1).x>0,'tsunami must move survivor with the wave');
}
{
 const a=rig();
 const v=V(0,0,0);
 const mesh={uniqueId:101,isDisposed:()=>false,isEnabled:()=>true,
  getAbsolutePosition:()=>V(0,1,0),getBoundingInfo:()=>({boundingBox:{
  minimumWorld:V(-1,0,-1),maximumWorld:V(1,3,1)}})};
 const car={type:'car',mesh,aggregate:{body:{getLinearVelocity:()=>v}}};
 a.world.props.push(car);
 a.s.debrisHits();
 assert.equal(a.s.health,100,'stationary car cannot cause flying-debris damage');
 v.x=12;a.s.debrisHits();
 assert(a.s.health<100,'fast vehicle collision must hurt');
 assert.equal(a.s.impacts,1);
}
console.log('SURVIVAL_UNIT_PASS: meteor near/far, quake weak/strong, tornado lift, tsunami drowning, debris damage');
