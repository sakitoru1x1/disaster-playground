import {strict as assert} from 'node:assert';
import {planStoreyFracture} from '../src/fracture.js';
const make=(dynamicRoom,visualRoom,mass=false)=>({
 maxFragmentBodies:40,maxPrimaryFragmentBodies:30,fragments:{length:30-dynamicRoom},
 maxVisualFragments:50,visualFragments:{length:50-visualRoom},massBlastActive:mass
});
const cases=[
 {room:[0,0],desired:10,expected:[0,0]},
 {room:[0,1],desired:10,expected:[1,0]},
 {room:[1,0],desired:10,expected:[1,0]},
 {room:[2,2],desired:10,expected:[4,0]},
 {room:[12,1],desired:10,expected:[10,2]},
 {room:[18,20],desired:5,expected:[5,5]},
 {room:[0,15],desired:10,expected:[10,0]}
];
for(const {room,desired,expected} of cases){
 const world=make(...room),plan=planStoreyFracture(world,desired);
 assert.deepEqual([plan.slabCount,plan.wallCount],expected);
 assert(plan.slabCount+plan.wallCount<=plan.dynamicSlots+plan.visualSlots);
 assert(plan.slabCount<=desired);
 assert(plan.slabCount>0||room[0]+room[1]===0);
}
console.log('FRACTURE_BUDGET_PASS: prevents static suspended shards at zero/limited headroom');
