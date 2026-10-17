import {strict as assert} from 'node:assert';
import {
  ROADS,SIDEWALK_COORDS,pedestrianNode,pedestrianNeighbors,choosePedestrianNext,
  makeTrafficRoute,positionOnRoute,trafficHeading,trafficRoutes
} from '../src/cityMotion.js';

assert.equal(SIDEWALK_COORDS.length,8);
for(let i=0;i<SIDEWALK_COORDS.length;i++){
  for(let j=0;j<SIDEWALK_COORDS.length;j++){
    const p=pedestrianNode(i,j);
    assert.equal(p.x,SIDEWALK_COORDS[i]);
    assert.equal(p.z,SIDEWALK_COORDS[j]);
    const neighbors=pedestrianNeighbors(i,j);
    assert(neighbors.length>=2&&neighbors.length<=4);
    for(const [a,b] of neighbors)assert(Math.abs(a-i)+Math.abs(b-j)===1);
    const next=choosePedestrianNext(i,j,null,null,false,()=>.25);
    assert(neighbors.some(n=>n[0]===next[0]&&n[1]===next[1]));
  }
}
const threat={x:0,z:0};
for(let i=1;i<7;i++)for(let j=1;j<7;j++){
  const picked=choosePedestrianNext(i,j,null,threat,true);
  const longest=Math.max(...pedestrianNeighbors(i,j).map(([a,b])=>
    Math.hypot(SIDEWALK_COORDS[a],SIDEWALK_COORDS[b])));
  assert(Math.abs(Math.hypot(SIDEWALK_COORDS[picked[0]],SIDEWALK_COORDS[picked[1]])-longest)<.001);
}
for(let xi=0;xi<3;xi++)for(let zi=0;zi<3;zi++){
  const loop=makeTrafficRoute(xi,zi);
  assert(loop.length>50&&loop.length<180,'Unexpected car route length');
  const a=positionOnRoute(loop,0),b=positionOnRoute(loop,loop.length);
  assert(Math.hypot(a.x-b.x,a.z-b.z)<1e-8,'Traffic loop not closed');
  for(let d=0;d<loop.length;d+=.35){
    const p=positionOnRoute(loop,d),q=positionOnRoute(loop,d+.35);
    assert(Math.hypot(q.x-p.x,q.z-p.z)<.41,'Traffic route jumps');
    assert(Number.isFinite(trafficHeading(loop,d)),'Heading must be finite');
    const nearRoad=Math.min(...ROADS.map(r=>Math.abs(p.x-r)),
      ...ROADS.map(r=>Math.abs(p.z-r)));
    assert(nearRoad<3.2,'Traffic escaped the road');
  }
}
for(const count of [12,19,20]){
  const cars=trafficRoutes(count,()=>.5);
  assert.equal(cars.length,count);
  for(const a of cars){
    assert(a.speed>=7&&a.speed<=11.5);
    assert(a.route.length>50);
  }
  for(let i=0;i<cars.length;i++)for(let j=i+1;j<cars.length;j++){
    if(cars[i].route!==cars[j].route)continue;
    const p=positionOnRoute(cars[i].route,cars[i].distance);
    const q=positionOnRoute(cars[j].route,cars[j].distance);
    assert(Math.hypot(p.x-q.x,p.z-q.z)>15,'Cars overlap at spawn');
  }
}
console.log('CITY_MOTION_PASS: pedestrians navigate 8x8 footpaths; cars follow 9 roundabout-free road circuits');
