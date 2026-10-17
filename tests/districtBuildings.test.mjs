import {strict as assert} from 'node:assert';
import {Vector3} from '@babylonjs/core';
import {districtBuildingDesign} from '../src/cityDistricts.js';
import {DisasterSystem} from '../src/disasters.js';
import {CityWorld} from '../src/world.js';
const V=(x,y,z)=>new Vector3(x,y,z);
const districts=['downtown','residential','industrial','harbor','uptown'];
const kinds=new Set();
for(const district of districts){
 const heights=new Set();
 for(const [i,seed] of [.05,.37,.72,.96].entries()){
  const d=districtBuildingDesign({district,i:i+3,j:7+i},seed);
  kinds.add(d.kind);
  assert(d.levels>=2&&d.levels<=11,district+' invalid floors');
  assert(d.fh>3&&d.width>=10&&d.depth>=10);
  heights.add(d.levels);
 }
 assert(heights.size>1,district+' skyline is monotone');
}
assert(kinds.size>=12,'District architecture repeats the same block styles');
const fakeBuilding={id:109,floors:[]};
for(let i=0;i<6;i++){
 const mesh={position:V(104,.4+i*3.35+1.675,78),isEnabled:()=>true};
 mesh.getAbsolutePosition=()=>mesh.position;
 fakeBuilding.floors.push({mesh,size:V(11,3.2,11),building:fakeBuilding,storey:i,active:false});
}
const world={structures:fakeBuilding.floors,buildings:[],districtBuildings:[fakeBuilding]};
const engine={world};
const top=fakeBuilding.floors.at(-1).mesh.position;
const contact=DisasterSystem.prototype.findMeteorContact.call(engine,V(104,80,78),V(104,-2,78),1.8);
assert(contact&&contact.entry,'Meteor passed through a peripheral building');
assert.equal(contact.entry.storey,5,'Meteor should strike uppermost facade first');
assert(contact.point.y>top.y-4,'Meteor must hit near actual roof height');
const horizontal=DisasterSystem.prototype.findMeteorContact.call(engine,V(140,7,78),V(95,7,78),1);
assert(horizontal?.entry,'Horizontal meteor should hit the real wall');
const aimed=CityWorld.prototype.findBuildingAt.call(world,104,78,20);
assert(aimed&&aimed.building===fakeBuilding,'Overhead targeting must resolve district building');
assert.equal(CityWorld.prototype.findBuildingAt.call(world,0,0,0),null);
fakeBuilding.floors.at(-1).active=true;
const lower=DisasterSystem.prototype.findMeteorContact.call(engine,V(104,80,78),V(104,-2,78),1.8);
assert(lower?.entry.storey===4,'Meteor sweep must continue to intact floors after roof destruction');
const cosmetic={active:false,building:{district:'harbor',physicsActivated:false},
 health:100,maxHealth:100,damageTaken:0,damageMarks:0};
const touched=CityWorld.prototype.damageStructure.call({},cosmetic,10);
assert.equal(touched,false,'Light scratches should not destroy the storey');
assert.equal(cosmetic.health,90);
assert.equal(cosmetic.building.physicsActivated,false,
 'A cosmetic scratch should not replace a district building with multiple Havok colliders');
console.log('REAL_DISTRICT_BUILDINGS_PASS: full meteor collision and lazy physical activation');
