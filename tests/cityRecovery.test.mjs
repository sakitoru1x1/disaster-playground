import {strict as assert} from 'node:assert';
import {recoverySite,clearRecoverySite,RecoveryConvoy} from '../src/cityRecovery.js';
function mesh(x,z,baked=false){
 let disposed=false;
 const p={x,y:0,z};
 return {name:'TEST RUBBLE',metadata:baked?{bakedRubble:true}:null,
  position:p,isDisposed(){return disposed},dispose(){disposed=true},
  getAbsolutePosition(){return p},
  getBoundingInfo(){return {boundingBox:{centerWorld:p}}}};
}
const b={id:109,x:26,z:52,name:'BUILDING 109',floors:[
 {active:true,health:0,maxHealth:100},{active:true,health:0,maxHealth:100},
 {active:false,health:100,maxHealth:100}]};
const truck=mesh(25,51),loose=mesh(28,49),far=mesh(-100,72),baked=mesh(27,53,true);
let removedPhysics=0;
const f={mesh:loose,aggregate:{dispose(){removedPhysics++}}};
const world={buildings:[],districtBuildings:[b],rubble:[truck,far],
 staticRubbleBatches:[baked],fragments:[f],visualFragments:[],debris:[],activeBodies:1,
 pendingSecondary:[{fragment:f}],visualFractureQueue:[{part:{mesh:loose}}],terrainCraters:[]};
const site=recoverySite(world);
assert(site&&site.building===b,'Must prioritize damaged homes over random debris');
assert.equal(clearRecoverySite(world,site),3,'Helicopter must remove all loose, baked and live debris in one sortie');
assert.equal(removedPhysics,1,'Havok body must be released on cleanup');
assert.equal(world.activeBodies,0);
assert.equal(world.rubble.length,1,'Only distant rubble should remain');
assert.equal(world.pendingSecondary.length,0);
assert.equal(world.visualFractureQueue.length,0);
const visited=new Set([site.key]);
const other=recoverySite(world,visited);
assert(other&&!other.building&&other.x===-100,'After wrecked homes, clear stray road rubble');
assert.equal(clearRecoverySite(world,other),1);
visited.add(other.key);
assert.equal(recoverySite(world,visited),null);
assert(!far.isDisposed()===false);
const initial=new RecoveryConvoy(world,{rebuilt:0});
assert.equal(initial.stage,'sweep');
initial.event();
assert.equal(initial.phase,'idle');
assert.equal(initial.currentState().stage,'sweep');
console.log('CITY_RECOVERY_PASS: house-first helicopter, one-sortie cleanup, Havok disposal, baked debris, loose roads, reset');
