import {strict as assert} from 'node:assert';
import {SIDEWALK_COORDS} from '../src/cityMotion.js';
import {CITY_DAY_SECONDS,cityClock,citizenIdentity,routineGoal,nearestSidewalkNode,
  nextTowardNode,distanceNodes,updateCitizenRoutine,citizenStats} from '../src/citizenRoutines.js';

assert.equal(CITY_DAY_SECONDS,120);
assert.equal(cityClock(0).day,1);
assert.equal(cityClock(121).day,2);
assert.equal(cityClock(60).hour,18);
const people=[];
const occupations=new Set(),home=new Set(),work=new Set();
for(let i=0;i<220;i++){
 const ident=citizenIdentity(i);
 occupations.add(ident.occupation);home.add(ident.home.join(','));work.add(ident.work.join(','));
 assert(ident.speed>=1.3&&ident.speed<=2.2);
 assert(distanceNodes(ident.home,ident.work)<=9,'Avoid 10-minute commutes on a 2-minute day');
 for(const goal of [ident.home,ident.work,ident.leisure]){
  assert(goal.length===2&&goal.every(v=>v>=0&&v<SIDEWALK_COORDS.length),'Off-grid home/work');
 }
 const sample=new Set();
 for(const time of [0,18,45,75,104]){
  const status=routineGoal(ident,time);
  sample.add(status.activity);
  assert([ident.home,ident.work,ident.leisure].some(node=>node.every((v,j)=>v===status.goal[j])));
 }
 assert(sample.size>=3,'Each NPC needs work, home and personal time');
 for(const target of [ident.work,ident.leisure,ident.home]){
  let node=ident.home,steps=0;
  while(distanceNodes(node,target)){
   const next=nextTowardNode(node,target,null,()=>.37);
   assert.equal(distanceNodes(next,target),distanceNodes(node,target)-1,'No shortest-path progress');
   node=next;
   assert(++steps<40,'Citizen pathfinding stuck');
  }
 }
 people.push({identity:ident,state:'walking',routineGoal:null,routineActivity:null});
}
assert.equal(occupations.size,6,'Missing job roles');
assert(home.size>15&&work.size>15,'Population is confined to one district');
const p=people[3];updateCitizenRoutine(p,10);
assert(p.routineActivity&&p.routineGoal);
p.state='injured';const activity=p.routineActivity;
updateCitizenRoutine(p,50);assert.equal(p.routineActivity,activity,'Injured person must not continue routine');
const stats=citizenStats(people);
assert.equal(stats.residents,219);assert.equal(stats.injured,1);
assert.equal(citizenIdentity(44).home.join(','),citizenIdentity(44).home.join(','),
 'Identity must be deterministic across reloads');
assert.deepEqual(nearestSidewalkNode(10000,-10000),[SIDEWALK_COORDS.length-1,0]);
console.log('CITIZEN_ROUTINES_PASS: 220 stable residents, six jobs, 3 destinations, day/night schedule, safe shortest paths');
