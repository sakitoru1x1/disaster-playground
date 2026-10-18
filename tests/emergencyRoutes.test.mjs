import assert from 'node:assert/strict';
import {ROAD_COORDS,CITY_HALF_SIZE} from '../src/cityLayout.js';
import {EMERGENCY_DEPOT,emergencyRoadRoute} from '../src/cityEmergency.js';
import {needsHeavyRebuild,recoverySiteStatus} from '../src/parallelRecovery.js';
const onRoad=c=>ROAD_COORDS.some(x=>Math.abs(x-c)<.01);
assert(onRoad(EMERGENCY_DEPOT.x)&&onRoad(EMERGENCY_DEPOT.z));
for(const target of [{x:-130,z:-130},{x:130,z:130},{x:-78,z:52},{x:0,z:0}]){
 const road=emergencyRoadRoute(EMERGENCY_DEPOT,target);
 assert(road.length>0);
 let previous=EMERGENCY_DEPOT;
 for(const waypoint of road){
  assert(Math.abs(waypoint.x)<CITY_HALF_SIZE&&Math.abs(waypoint.z)<CITY_HALF_SIZE,
   'Responder route leaves city');
  assert(onRoad(waypoint.x)&&onRoad(waypoint.z),
   'Responder route leaves legal street lattice');
  assert(previous.x===waypoint.x||previous.z===waypoint.z,
   'Responder route cuts diagonally through buildings');
  previous=waypoint;
 }
 assert(Math.hypot(previous.x-target.x,previous.z-target.z)<19,
  'Parking point is too far from victim/fire for medics to reach');
}
const intact={floors:[{active:false,health:53,maxHealth:100},
 {active:false,health:98,maxHealth:100}]};
assert.equal(needsHeavyRebuild(intact),false,'No cranes on a cosmetically damaged facade');
assert.equal(recoverySiteStatus({cleared:true,craters:0,damaged:needsHeavyRebuild(intact)}),'complete');
const collapsed={floors:[...intact.floors,{active:true,health:0,maxHealth:100}]};
assert.equal(needsHeavyRebuild(collapsed),true);
console.log('ROUTE_CRANE_UNIT_PASS: depots and routes stay on streets, cosmetic damage never summons tower cranes');
