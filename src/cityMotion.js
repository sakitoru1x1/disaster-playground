// Simple, deterministic, bounded-cost city navigation on the existing road grid.
// No per-agent pathfinding or physics bodies are required for pedestrians.
import {ROAD_COORDS} from './cityLayout.js';
export const ROADS=ROAD_COORDS;
export const SIDEWALK_OFFSET=5.65;
export const SIDEWALK_COORDS=Object.freeze(ROADS.flatMap(v=>[
  v-SIDEWALK_OFFSET,v+SIDEWALK_OFFSET]));
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
export const pedestrianNode=(i,j)=>({x:SIDEWALK_COORDS[i],z:SIDEWALK_COORDS[j],i,j});
export function pedestrianNeighbors(i,j){
  const out=[];
  if(i>0)out.push([i-1,j]);
  if(i+1<SIDEWALK_COORDS.length)out.push([i+1,j]);
  if(j>0)out.push([i,j-1]);
  if(j+1<SIDEWALK_COORDS.length)out.push([i,j+1]);
  return out;
}
export function choosePedestrianNext(i,j,previous=null,threat=null,panic=false,rng=Math.random){
  const all=pedestrianNeighbors(i,j);
  const nonBack=all.filter(([x,z])=>!previous||x!==previous[0]||z!==previous[1]);
  const options=nonBack.length?nonBack:all;
  if(!panic||!threat)return options[Math.floor(clamp(rng(),0,.99999)*options.length)];
  const ranked=options.map(([x,z])=>({
    next:[x,z],
    distance:Math.hypot(SIDEWALK_COORDS[x]-threat.x,SIDEWALK_COORDS[z]-threat.z)
  })).sort((a,b)=>b.distance-a.distance);
  return ranked[0].next;
}

// All traffic drives on the RIGHT-hand lane of its travel direction.
// Ten streets per axis make 100 navigable blocks across the expanded island.
function roundedRectangle(x0,z0,x1,z1){
  const corners=[
    [x0+1.55,z0+1.55],
    [x0+1.55,z1-1.55],
    [x1-1.55,z1-1.55],
    [x1-1.55,z0+1.55]
  ];
  const points=[];
  for(let i=0;i<corners.length;i++){
    const curr=corners[i],prev=corners[(i+3)%4],next=corners[(i+1)%4];
    const prevDx=prev[0]-curr[0],prevDz=prev[1]-curr[1];
    const nextDx=next[0]-curr[0],nextDz=next[1]-curr[1];
    const prevLen=Math.hypot(prevDx,prevDz),nextLen=Math.hypot(nextDx,nextDz);
    const radius=Math.min(3,prevLen*.22,nextLen*.22);
    const from=[curr[0]+prevDx/prevLen*radius,curr[1]+prevDz/prevLen*radius];
    const to=[curr[0]+nextDx/nextLen*radius,curr[1]+nextDz/nextLen*radius];
    for(let s=0;s<=5;s++){
      const t=s/5,u=1-t;
      points.push([u*u*from[0]+2*u*t*curr[0]+t*t*to[0],
        u*u*from[1]+2*u*t*curr[1]+t*t*to[1]]);
    }
  }
  return points;
}
export function makeTrafficRoute(xIndex,zIndex){
  const a=clamp(xIndex,0,ROADS.length-2),b=clamp(zIndex,0,ROADS.length-2);
  const points=roundedRectangle(ROADS[a],ROADS[b],ROADS[a+1],ROADS[b+1]);
  const segments=[];
  let length=0;
  for(let i=0;i<points.length;i++){
    const p=points[i],q=points[(i+1)%points.length];
    const dist=Math.hypot(q[0]-p[0],q[1]-p[1]);
    segments.push({from:p,to:q,start:length,length:dist});
    length+=dist;
  }
  return {points,segments,length};
}
export function positionOnRoute(route,distance){
  let d=((distance%route.length)+route.length)%route.length;
  for(const segment of route.segments){
    if(d<=segment.start+segment.length){
      const t=(d-segment.start)/segment.length;
      return {x:segment.from[0]+(segment.to[0]-segment.from[0])*t,
        z:segment.from[1]+(segment.to[1]-segment.from[1])*t};
    }
  }
  return {x:route.points[0][0],z:route.points[0][1]};
}
export function trafficHeading(route,distance){
  const a=positionOnRoute(route,distance-.5),b=positionOnRoute(route,distance+.5);
  return Math.atan2(-(b.z-a.z),b.x-a.x); // car local +X is its nose
}
export function trafficRoutes(count,rng=Math.random){
  const routes=[];
  // Scatter traffic across ALL districts, not just the south-west corner.
  // 37 is coprime with 100: each route appears before any is repeated.
  const blocks=ROADS.length-1,total=blocks*blocks;
  for(let i=0;i<total;i++){
    const index=(i*37+44)%total;
    routes.push(makeTrafficRoute(Math.floor(index/blocks),index%blocks));
  }
  const result=[];
  for(let i=0;i<count;i++){
    const route=routes[i%routes.length];
    const inLoop=Math.floor(i/routes.length),loops=Math.ceil((count-i%routes.length)/routes.length);
    const spacing=(inLoop+.22)/loops;
    result.push({route,distance:route.length*spacing,
      speed:7+rng()*4.5,loop:i%routes.length});
  }
  return result;
}
