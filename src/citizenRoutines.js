import {SIDEWALK_COORDS,pedestrianNeighbors} from './cityMotion.js';
import {districtPlots} from './cityLayout.js';

const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const hash=(i,salt=0)=>{const x=Math.sin((i+13)*93.9898+salt*78.233)*43758.5453;return x-Math.floor(x)};
const clone=node=>[node[0],node[1]];
export const CITY_DAY_SECONDS=120;
export function cityClock(seconds){
 const second=((seconds%CITY_DAY_SECONDS)+CITY_DAY_SECONDS)%CITY_DAY_SECONDS;
 return {day:1+Math.floor(Math.max(0,seconds)/CITY_DAY_SECONDS),
  hour:(6+second*.2)%24,phase:second};
}
export function nearestSidewalkNode(x,z){
 let a=0,b=0,dx=Infinity,dz=Infinity;
 for(let i=0;i<SIDEWALK_COORDS.length;i++){
  const xi=Math.abs(SIDEWALK_COORDS[i]-x),zi=Math.abs(SIDEWALK_COORDS[i]-z);
  if(xi<dx){dx=xi;a=i}
  if(zi<dz){dz=zi;b=i}
 }
 return [a,b];
}
export function distanceNodes(a,b){
 return Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1]);
}
// Route toward a real place by the shortest crossing count. Never teleport.
// No A* allocations per agent: Manhattan movement on a 20x20 graph.
export function nextTowardNode(node,goal,previous=null,rng=Math.random){
 const options=pedestrianNeighbors(node[0],node[1]);
 const sorted=options
  .map(p=>({p,steps:distanceNodes(p,goal),back:!!previous&&p[0]===previous[0]&&p[1]===previous[1]}))
  .sort((a,b)=>a.steps-b.steps||Number(a.back)-Number(b.back));
 const min=sorted[0].steps;
 const choices=sorted.filter(x=>x.steps===min);
 return clone(choices[Math.floor(clamp(rng(),0,.99999)*choices.length)].p);
}
const sites=districtPlots();
const zones={
 home:sites.filter(p=>['residential','uptown','downtown'].includes(p.district)),
 work:sites.filter(p=>['downtown','industrial','harbor','uptown'].includes(p.district)),
 leisure:sites.filter(p=>['downtown','harbor','residential'].includes(p.district))
};
const homeNodes=zones.home.map(p=>nearestSidewalkNode(p.x+7.3,p.z+7.3));
const workNodes=zones.work.map(p=>nearestSidewalkNode(p.x-7.3,p.z+7.3));
const leisureNodes=zones.leisure.map(p=>nearestSidewalkNode(p.x-7.3,p.z-7.3));
function locationNear(nodes,anchor,i,salt,maxSteps){
 const list=nodes.filter(p=>distanceNodes(p,anchor)<=maxSteps);
 const choices=list.length?list:nodes;
 return clone(choices[Math.floor(hash(i,salt)*choices.length)]);
}
export function citizenIdentity(id){
 const home=clone(homeNodes[Math.floor(hash(id,3)*homeNodes.length)]);
 const work=locationNear(workNodes,home,id,5,4);
 const leisure=locationNear(leisureNodes,work,id,7,4);
 return {id,home,work,leisure,shift:hash(id,8)*12-6,
  occupation:['office','factory','retail','delivery','health','harbor'][Math.floor(hash(id,9)*6)],
  hobby:['shopping','park','meeting','walking'][Math.floor(hash(id,11)*4)],
  social:hash(id,13),speed:1.3+hash(id,18)*.9};
}
export function routineGoal(identity,elapsed){
 const phase=((elapsed+identity.shift)%CITY_DAY_SECONDS+CITY_DAY_SECONDS)%CITY_DAY_SECONDS;
 // Begin each simulated day with a visible rush hour, not ten seconds
 // of motionless NPCs waiting outside their homes at startup.
 if(phase<34)return {activity:'commuting to work',goal:identity.work};
 if(phase<58)return {activity:'working',goal:identity.work};
 if(phase<82)return {activity:identity.hobby,goal:identity.leisure};
 if(phase<109)return {activity:'commuting home',goal:identity.home};
 return {activity:'resting at home',goal:identity.home};
}
export function updateCitizenRoutine(person,time){
 if(!person.identity||person.state==='dead'||person.state==='injured')return null;
 const routine=routineGoal(person.identity,time);
 const goal=routine.goal;
 const previous=person.routineGoal;
 const changed=!previous||goal[0]!==previous[0]||goal[1]!==previous[1]||
  person.scheduleActivity!==routine.activity;
 if(changed){
  person.routineGoal=clone(goal);
  person.scheduleActivity=routine.activity;
  person.routineActivity=routine.activity;
  person.waitTime=0;
 }
 return routine;
}
export function citizenStats(civilians){
 const stats={residents:0,working:0,commuting:0,socializing:0,home:0,leisure:0,injured:0,dead:0};
 for(const p of civilians){
  if(p.state==='dead'){stats.dead++;continue}
  if(p.state==='injured'){stats.injured++;continue}
  stats.residents++;
  if(p.routineActivity==='socializing')stats.socializing++;
  else if(p.routineActivity==='working')stats.working++;
  else if(p.routineActivity?.startsWith('commuting'))stats.commuting++;
  else if(p.routineActivity==='resting at home'||p.routineActivity==='breakfast')stats.home++;
  else stats.leisure++;
 }
 return stats;
}
