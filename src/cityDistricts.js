import {PhysicsAggregate,PhysicsShapeType,Vector3,Color3} from '@babylonjs/core';
import {districtPlots,planCity} from './cityLayout.js';
import {sectionResistance} from './structuralDamage.js';
import {makeFacadeWindows} from './perfGeometry.js';
import {detailBatch} from './cityDetail.js';

const V=(x,y,z)=>new Vector3(x,y,z);
const rgba=(hex)=>{const c=Color3.FromHexString(hex);return [c.r,c.g,c.b,1]};
const COLORS={
 metal:rgba('#516570'),steel:rgba('#81949a'),stone:rgba('#d1c3aa'),
 brick:rgba('#bc8675'),trim:rgba('#eee1ce'),blue:rgba('#7eaab8'),
 greenery:rgba('#628577'),gold:rgba('#d4b28a'),concrete:rgba('#a9a9a0'),
 roof:rgba('#434e59'),dark:rgba('#354551')
};
const hash=(i,j)=>{
 const n=Math.sin((i+13)*127.1+(j+7)*311.7)*43758.5453;
 return n-Math.floor(n);
};
const STYLES={
 downtown:['office-tower','art-deco','glass-tower'],
 residential:['apartments','townhouses','terraces'],
 industrial:['factory','warehouse','workshop'],
 harbor:['terminal','dockside','warehouse'],
 uptown:['hotel','apartments','tower']
};
export function districtBuildingDesign(p,seed=hash(p.i,p.j)){
 const kind=STYLES[p.district][Math.floor(seed*3)%3];
 const tall=['glass-tower','office-tower','tower','hotel','art-deco'].includes(kind);
 const industrial=p.district==='industrial';
 const levels=tall?7+Math.floor(hash(p.j,p.i)*4):
  industrial?2+Math.floor(hash(p.i+3,p.j)*2):
  p.district==='harbor'?3+Math.floor(hash(p.j+5,p.i)*3):
  4+Math.floor(hash(p.j,p.i+1)*3);
 const fh=industrial?4.6:3.35;
 const width=industrial?13.2:tall?10.6:11.5+seed*1.3;
 const depth=industrial?12.2:tall?10.2:11.7;
 const modern=tall||kind==='terminal'||kind==='dockside';
 return {kind,levels,fh,width,depth,modern,
  materialIndex:p.district==='industrial'?4:p.district==='harbor'?5:
   p.district==='uptown'?2:p.district==='residential'?1:0,
  // Only a few towers have visible crown/setback; every floor is still
  // individually solid, collidable and fracturable on demand.
  setbackStart:tall?levels-2:levels+1};
}
function floorDimensions(design,n){
 const tier=n>=design.setbackStart ? .79 : 1;
 return {w:design.width*tier,d:design.depth*tier};
}
// Architectural components are drawn with ONE vertex-color mesh per floor,
// parented to that exact destructible floor. Nothing is independently floating.
function floorDetails(world,entry,design,n){
 const {w,d}=floorDimensions(design,n),h=design.fh,parts=[];
 const add=(x,y,z,sx,sy,sz,color)=>parts.push([x,y,z,sx,sy,sz,color]);
 const industrial=design.kind==='factory'||design.kind==='warehouse'||design.kind==='workshop';
 const residential=['apartments','townhouses','terraces'].includes(design.kind);
 const accent=industrial?COLORS.steel:residential?COLORS.brick:COLORS.metal;
 // Continuous piers, horizontal spandrels and facade window subdivisions.
 for(const s of [-1,1]){
  for(const x of [-w*.40,0,w*.40])
   add(x,0,s*(d*.5+.058),.12,h*.90,.11,accent);
  for(const z of [-d*.40,0,d*.40])
   add(s*(w*.5+.058),0,z,.11,h*.90,.12,accent);
  add(0,h*.43,s*(d*.5+.085),w*.98,.14,.20,
    n%2===0?accent:COLORS.stone);
  add(s*(w*.5+.085),h*.43,0,.20,.14,d*.98,accent);
  if(residential&&n>0&&n%2===0&&!world.mobile){
   add(0,-h*.26,s*(d*.5+.5),w*.43,.13,.83,COLORS.concrete);
   add(0,-h*.06,s*(d*.5+.86),w*.42,.07,.06,COLORS.metal);
   for(const x of [-w*.16,0,w*.16])
    add(x,-h*.17,s*(d*.5+.87),.055,.38,.055,COLORS.metal);
  }
 }
 if(n===0){
  add(0,-h*.18,d*.5+.10,2.5,h*.56,.14,COLORS.dark);
  add(0,h*.11,d*.5+.50,4.2,.19,1,COLORS.gold);
  add(-.63,-h*.16,d*.5+.19,1.02,h*.47,.065,COLORS.blue);
  add(.63,-h*.16,d*.5+.19,1.02,h*.47,.065,COLORS.blue);
 }
 if(n===design.levels-1){
  // A parapet is present on every roof, while towers also receive a
  // recognizable antenna/HVAC silhouette without extra draw calls.
  for(const s of [-1,1]){
   add(0,h*.52,s*(d*.5-.09),w,.28,.19,COLORS.stone);
   add(s*(w*.5-.09),h*.52,0,.19,.28,d,COLORS.stone);
  }
  add(-w*.23,h*.83,-d*.14,2.5,1.55,2.4,COLORS.metal);
  if(design.modern){
   add(w*.21,h*1.2,d*.18,.13,3.3,.13,COLORS.steel);
   add(w*.21,h*1.92,d*.18,.55,.18,.55,COLORS.trim);
  }else if(industrial){
   add(w*.2,h*.85,-d*.22,1.45,1.8,1.45,COLORS.brick);
  }
 }
 return detailBatch(world,'district architecture: '+design.kind,parts,entry.mesh);
}
// One invisible static physics proxy per intact peripheral building. The
// individual structural floors have geometry from the very beginning and
// participate in meteor sweep / earthquake / tsunami / tornado / blast tests.
// On the FIRST hit the proxy is replaced with per-floor Havok colliders.
export function activateDistrictBuilding(world,b){
 if(b.physicsActivated)return false;
 if(b.proxy){b.proxy.aggregate?.dispose();b.proxy.mesh.dispose();b.proxy=null}
 b.physicsActivated=true;
 for(const entry of b.floors){
  if(entry.active||entry.mesh.isDisposed())continue;
  entry.aggregate=new PhysicsAggregate(entry.mesh,PhysicsShapeType.BOX,
    {mass:0,friction:.84,restitution:.08},world.scene);
 }
 return true;
}
export function buildDistrictBuildings(world){
 const reserved=new Set(planCity(30).map(p=>p.x+','+p.z));
 const result=[];
 for(const p of districtPlots()){
  if(reserved.has(p.x+','+p.z)||Math.hypot(p.x-73,p.z+53)<17)continue;
  const seed=hash(p.i,p.j);
  if(seed>(world.mobile?.48:.76))continue;
  const design=districtBuildingDesign(p,seed);
  const id=100+result.length,style=design.materialIndex;
  const b={id,x:p.x,z:p.z,name:design.kind+' '+(id-99),
   district:p.district,design,style,showcase:false,
   floors:[],destroyed:false,physicsActivated:false,proxy:null};
  result.push(b);
  for(let n=0;n<design.levels;n++){
   const {w,d}=floorDimensions(design,n),h=design.fh;
   const y=.4+n*h+h*.5;
   const wall=(n%4===3&&design.modern)?world.materials.wallsAccent[style]:
    world.materials.walls[style];
   const mesh=world.box('district floor '+id+'-'+n,[w,h-.13,d],V(p.x,y,p.z),wall);
   mesh.receiveShadows=true;
   mesh.metadata={districtFloor:true,district:p.district,
     buildingId:id,storey:n,architecture:design.kind};
   const entry={mesh,aggregate:null,building:b,storey:n,active:false,
    size:V(w,h-.13,d),materialClass:n===0?'foundation':
     n===design.levels-1?'roof':'concrete frame',
    maxHealth:sectionResistance(n,design.levels),
    health:sectionResistance(n,design.levels),damageTaken:0,damageMarks:0};
   b.floors.push(entry);
   world.structures.push(entry);world.totalFloors++;
   makeFacadeWindows(world.scene,mesh,world.windowMat,w,d,h);
   floorDetails(world,entry,design,n);
  }
  // A single cheap collider while intact (67 instead of ~350). The proxy
  // disappears completely before a floor can detach, avoiding ghost walls.
  const fullHeight=design.levels*design.fh;
  const proxy=world.box('district collision proxy',
   [design.width,fullHeight,design.depth],
   V(p.x,.4+fullHeight*.5,p.z),world.materials.walls[style]);
  proxy.isVisible=false;proxy.isPickable=false;
  b.proxy={mesh:proxy,aggregate:new PhysicsAggregate(proxy,PhysicsShapeType.BOX,
   {mass:0,friction:.85,restitution:0},world.scene)};
 }
 world.districtBuildings=result;
 return result;
}
