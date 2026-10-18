import {MeshBuilder,TransformNode,Vector3,PhysicsAggregate,PhysicsShapeType} from '@babylonjs/core';
import {CITY_HALF_SIZE} from './cityLayout.js';
import {fillCrater} from './terrainDamage.js';
import {attractNewResidents} from './cityLife.js';

const V=(x,y,z)=>new Vector3(x,y,z);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const allBuildings=w=>[...w.buildings,...(w.districtBuildings||[])];
const activeDamage=b=>b.floors.some(e=>e.active);
const anyDamage=b=>b.floors.some(e=>e.active||e.health<e.maxHealth);
const alive=m=>m&&!m.isDisposed();
const location=m=>m.metadata?.bakedRubble
  ?m.getBoundingInfo().boundingBox.centerWorld
  :m.getAbsolutePosition?m.getAbsolutePosition():m.position;
const looseMeshes=w=>[
 ...(w.rubble||[]),...(w.staticRubbleBatches||[]),
 ...(w.fragments||[]).map(f=>f.mesh),
 ...(w.visualFragments||[]).map(f=>f.mesh),
 ...(w.debris||[]).map(f=>f.mesh)
].filter(alive);

export function recoverySite(world,visited=new Set()){
 const buildings=allBuildings(world).filter(b=>!visited.has('b'+b.id)&&activeDamage(b));
 if(buildings.length){
  buildings.sort((a,b)=>b.floors.filter(e=>e.active).length-a.floors.filter(e=>e.active).length);
  const b=buildings[0];
  return {key:'b'+b.id,x:b.x,z:b.z,building:b,radius:17};
 }
 // Also clear impact rubble on roads and parks before concrete work starts.
 for(const mesh of looseMeshes(world)){
  const p=location(mesh);
  if(!Number.isFinite(p.x)||!Number.isFinite(p.z))continue;
  const key='g'+Math.round(p.x/10)+','+Math.round(p.z/10);
  if(!visited.has(key))return {key,x:p.x,z:p.z,building:null,radius:16};
 }
 return null;
}
export function clearRecoverySite(world,site){
 let removed=0;const gone=new Set();
 const near=m=>alive(m)&&distance(location(m),site)<site.radius;
 // Keep these lists in sync; physics bodies are disposed BEFORE visual meshes.
 for(const name of ['fragments','debris']){
  const source=world[name]||[];
  for(let i=source.length-1;i>=0;i--){
   const item=source[i],mesh=item.mesh;
   if(!near(mesh))continue;
   item.aggregate?.dispose();item.aggregate=null;
   gone.add(mesh);mesh.dispose();source.splice(i,1);removed++;
   world.activeBodies=Math.max(0,world.activeBodies-1);
  }
 }
 for(const name of ['visualFragments','rubble','staticRubbleBatches']){
  const source=world[name]||[];
  for(let i=source.length-1;i>=0;i--){
   const item=source[i],mesh=item.mesh||item;
   if(!near(mesh))continue;
   gone.add(mesh);mesh.dispose();source.splice(i,1);removed++;
  }
 }
 if(world.pendingSecondary)world.pendingSecondary=world.pendingSecondary.filter(job=>
   job.fragment?.mesh&&!gone.has(job.fragment.mesh)&&alive(job.fragment.mesh));
 if(world.visualFractureQueue)world.visualFractureQueue=world.visualFractureQueue.filter(job=>
   job.part?.mesh&&!gone.has(job.part.mesh)&&alive(job.part.mesh));
 if(world.rubble)world.rubble=world.rubble.filter(alive);
 return removed;
}
export function restoreBuildingFloor(world,building,floor){
 if(!floor||!alive(floor.mesh)||(!floor.active&&floor.health>=floor.maxHealth))return false;
 const wasBroken=floor.active;
 if(wasBroken){
  floor.mesh.setEnabled(true);
  floor.aggregate?.dispose();
  floor.aggregate=new PhysicsAggregate(floor.mesh,PhysicsShapeType.BOX,
    {mass:0,friction:.85,restitution:.05},world.scene);
 }
 floor.active=false;floor.health=floor.maxHealth;floor.damageTaken=0;
 floor.damageMarks=0;floor.pendingFailure=false;
 world.pendingFailures=world.pendingFailures.filter(f=>f.entry!==floor);
 if(wasBroken)world.brokenFloors=Math.max(0,world.brokenFloors-1);
 for(let i=(world.decorativeMarks||[]).length-1;i>=0;i--){
  const mark=world.decorativeMarks[i];
  if(mark.entry!==floor)continue;
  mark.mesh.dispose();world.decorativeMarks.splice(i,1);
 }
 building.destroyed=false;
 return true;
}
const lerp=(a,b,t)=>a+(b-a)*t;
function travel(root,target,dt,speed){
 const p=root.position,dx=target.x-p.x,dz=target.z-p.z;
 const dist=Math.hypot(dx,dz),t=Math.min(1,dt*speed/Math.max(.01,dist));
 p.x=lerp(p.x,target.x,t);p.z=lerp(p.z,target.z,t);
 if(target.y!==undefined)p.y=lerp(p.y,target.y,Math.min(1,dt*1.9));
 if(dist>.5)root.rotation.y=Math.atan2(dx,dz);
 return dist<1.8;
}
function buildHelicopter(w){
 const root=new TransformNode('RECOVERY RESCUE HELICOPTER',w.scene);
 root.position=V(-CITY_HALF_SIZE-18,40,0);
 const m=w.mat('recovery heli paint','#efc544'),glass=w.mat('heli windscreen','#2e5d71'),
   dark=w.materials.dark||w.materials.trim;
 w.box('helicopter fuselage',[5,1.9,2.3],V(0,0,0),m,root);
 w.box('helicopter cockpit',[1.9,1.27,2.32],V(0,.30,1.6),glass,root);
 w.box('helicopter tail boom',[.6,.6,5],V(0,.46,-3.1),m,root);
 for(const side of [-1,1]){
  w.box('rescue skid',[.14,.16,5.0],V(side*1.2,-1.50,0),dark,root);
  w.box('rescue landing leg',[.12,1.15,.12],V(side*1.05,-.9,-1),dark,root);
  w.box('rescue landing leg',[.12,1.15,.12],V(side*1.05,-.9,1),dark,root);
 }
 w.cylinder('helicopter rotor mast',.17,1.1,V(0,1.52,0),dark,8,root);
 const main=new TransformNode('RECOVERY ROTOR',w.scene);main.parent=root;main.position.y=2.12;
 for(const angle of [0,Math.PI/2]){
  const blade=w.box('spinning helicopter blade',[.22,.06,12],V(0,0,0),dark,main);
  blade.rotation.y=angle;
 }
 const tail=new TransformNode('TAIL ROTOR',w.scene);tail.parent=root;tail.position=V(.15,.5,-5.75);
 for(const angle of [0,Math.PI/2]){
  const b=w.box('tail rotor blade',[.08,1.7,.08],V(0,0,0),dark,tail);b.rotation.z=angle;
 }
 const cable=w.cylinder('HELICOPTER CARGO CABLE',.07,8,V(0,-5.8,0),dark,6,root);
 const cargo=w.box('RECOVERY CARGO NET',[3,2.4,3],V(0,-10.4,0),
   w.mat('cargo net','#747d6d'),root);
 cargo.setEnabled(false);
 root.setEnabled(false);
 return {root,main,tail,cable,cargo};
}
function buildMixer(w){
 const root=new TransformNode('RECOVERY CONCRETE MIXER',w.scene);
 root.position=V(-CITY_HALF_SIZE-16,.9,0);
 const body=w.mat('construction chassis','#e69f36'),metal=w.mat('steel truck','#4b5762'),
  cement=w.mat('concrete drum','#ded4b7');
 w.box('mixer truck chassis',[2.9,.6,7.9],V(0,0,0),metal,root);
 w.box('mixer truck cab',[2.7,2.5,2.4],V(0,1.15,2.45),body,root);
 w.box('mixer windscreen',[2.48,1, .12],V(0,1.62,3.72),w.materials.glass,root);
 const drum=new TransformNode('SPINNING CONCRETE DRUM',w.scene);
 drum.parent=root;drum.position=V(0,1.6,-1.25);
 const shell=w.cylinder('cement mixer barrel',2.7,3.6,V(0,0,0),cement,12,drum);
 shell.rotation.x=Math.PI/2;
 for(const z of [-1.25,0,1.25]){
  const ring=w.cylinder('cement mixer band',2.85,.11,V(0,0,z),body,12,drum);
  ring.rotation.x=Math.PI/2;
 }
 for(const a of [-1,1])for(const z of [-2.55,2.7]){
  const wheel=w.cylinder('concrete truck wheel',1.23,.38,V(a*1.56,-.42,z),metal,10,root);
  wheel.rotation.z=Math.PI/2;
 }
 const chute=w.box('concrete pouring chute',[.9,.19,4],V(0,.55,-4.45),cement,root);
 root.setEnabled(false);return {root,drum,chute};
}
function buildRig(w){
 const root=new TransformNode('RECOVERY MOBILE CRANE',w.scene);
 root.position=V(-CITY_HALF_SIZE-17,.8,0);
 const chassis=w.mat('recovery crane yellow','#ffcf44'),black=w.mat('recovery tires','#333943');
 w.box('mobile crane chassis',[3.1,.75,9.4],V(0,0,0),black,root);
 w.box('mobile crane cab',[2.8,2.4,2.9],V(0,1.15,3.05),chassis,root);
 for(const side of [-1,1])for(const z of [-3.2,0,3.1]){
  const wheel=w.cylinder('mobile crane wheel',1.25,.44,V(side*1.7,-.42,z),black,10,root);
  wheel.rotation.z=Math.PI/2;
 }
 const pivot=new TransformNode('ACTIVE CRANE BOOM PIVOT',w.scene);
 pivot.parent=root;pivot.position=V(0,2.1,-1.65);
 const boom=w.box('ACTIVE CONSTRUCTION BOOM',[.8,.8,19],V(0,6.9,4.7),chassis,pivot);
 boom.rotation.x=-.56;
 const hook=w.cylinder('ACTIVE HOIST CABLE',.10,13,V(0,10,-5.2),black,7,pivot);
 const pallet=w.box('LIFTED CONCRETE PANEL',[4,.32,2.6],V(0,3,-5),w.materials.sidewalk,pivot);
 root.setEnabled(false);
 return {root,pivot,boom,hook,pallet};
}
function buildTruck(w){
 const root=new TransformNode('RECOVERY MATERIALS TRUCK',w.scene);
 root.position=V(-CITY_HALF_SIZE-15,.8,0);
 const steel=w.mat('material carrier','#2d6673'),black=w.mat('carrier wheels','#303841');
 w.box('construction materials truck chassis',[2.8,.62,7.6],V(0,0,0),steel,root);
 w.box('construction materials truck cab',[2.7,2.3,2.7],V(0,1.1,2.4),steel,root);
 w.box('materials flatbed',[2.55,.3,4.1],V(0,.65,-1.7),w.materials.trim,root);
 for(let z of [-2.8,-1.5,0]){
  w.box('precast floor section',[2.25,.48,1.15],V(0,1.02+(z===-1.5?.36:0),z),
    w.materials.sidewalk,root);
 }
 for(const side of [-1,1])for(const z of [-2.8,2.3]){
  const wheel=w.cylinder('delivery truck tire',1.3,.4,V(side*1.48,-.43,z),black,10,root);
  wheel.rotation.z=Math.PI/2;
 }
 root.setEnabled(false);return {root};
}
function staging(site){
 return {x:site.x+13,z:site.z-13,y:.85};
}
export class RecoveryConvoy{
 constructor(world,progression){
  this.world=world;this.progression=progression;
  this.phase='idle';this.stage='sweep';this.elapsed=0;this.site=null;
  this.visited=new Set();this.buildingIndex=0;this.floorIndex=0;
  this.removed=0;this.filled=0;this.completed=0;this.sweepRuns=0;
  this.heli=null;this.mixer=null;this.crane=null;this.truck=null;
  this.pourPatch=null;this.pourStream=null;
 }
 event(){
  this.stage='sweep';this.phase='idle';this.site=null;this.elapsed=0;
  this.visited.clear();this.sweepRuns=0;
  this.park();
  this.pourStream?.dispose();this.pourStream=null;
  // An interrupted pour must not remain above a new crater.
  this.pourPatch?.dispose();this.pourPatch=null;
 }
 park(){
  for(const vehicle of [this.heli,this.mixer,this.crane,this.truck])
   vehicle?.root.setEnabled(false);
 }
 initFleet(){
  if(this.heli)return;
  const w=this.world;this.heli=buildHelicopter(w);
  this.mixer=buildMixer(w);this.crane=buildRig(w);this.truck=buildTruck(w);
 }
 currentState(){
  return {stage:this.stage,phase:this.phase,target:this.site?.building?.name||
    (this.site?Math.round(this.site.x)+','+Math.round(this.site.z):null),
    removed:this.removed,cratersFilled:this.filled,buildingsRestored:this.completed,
    fleetVisible:[this.heli,this.mixer,this.crane,this.truck].filter(v=>v?.root.isEnabled()).length};
 }
 start(stage,site){
  this.stage=stage;this.site=site;this.phase='arrive';this.elapsed=0;
  this.initFleet();this.park();
  const agent=stage==='sweep'?this.heli:stage==='fill'?this.mixer:this.crane;
  agent.root.setEnabled(true);
  if(stage==='build')this.truck.root.setEnabled(true);
  if(stage==='sweep'){
   if(this.sweepRuns++===0)agent.root.position.set(-CITY_HALF_SIZE-18,50,site.z);
   agent.root.position.y=50;
   agent.cargo.setEnabled(false);
  }else{
   agent.root.position.set(-CITY_HALF_SIZE-17,.8,staging(site).z);
   if(stage==='build')this.truck.root.position.set(-CITY_HALF_SIZE-23,.8,staging(site).z+5);
  }
 }
 finishStage(){
  this.park();this.phase='idle';this.site=null;this.elapsed=0;
  this.pourStream?.dispose();this.pourStream=null;
  this.pourPatch=null;
 }
 tick(dt){
  const w=this.world;this.elapsed+=dt;
  if(this.heli){this.heli.main.rotation.y+=dt*20;this.heli.tail.rotation.x+=dt*23}
  if(this.mixer)this.mixer.drum.rotation.z+=dt*1.6;
  if(this.crane){
   this.crane.pivot.rotation.y=Math.sin(this.elapsed*1.25)*.23;
   const active=this.stage==='build'&&this.phase==='construct'&&this.site?.building;
   const f=active&&this.site.building.floors.find(e=>e.active);
   this.crane.pallet.position.y=f
     ?2+Math.max(0,f.mesh.position.y-3)*Math.min(1,this.elapsed/1.25)
     :3+Math.abs(Math.sin(this.elapsed*1.8))*4;
   this.crane.hook.scaling.y=f?Math.max(.32,1-this.crane.pallet.position.y/32):1;
  }
  if(this.phase==='idle'){
   if(this.stage==='sweep'){
    const site=recoverySite(w,this.visited);
    if(site){this.start('sweep',site);return true}
    this.stage='fill';
   }
   if(this.stage==='fill'){
    // Fresh debris may still settle while the last seismic cascades end.
    // Sweep it before dispatching trucks, including previously cleaned lots.
    if(looseMeshes(w).length){
     this.visited=new Set([...this.visited].filter(key=>key.startsWith('b')));
     this.stage='sweep';return true;
    }
    const crater=w.terrainCraters?.[0];
    if(crater){this.start('fill',{x:crater.x,z:crater.z,crater});return true}
    this.stage='build';
   }
   if(this.stage==='build'){
    const b=allBuildings(w).find(anyDamage);
    if(b){this.start('build',{x:b.x,z:b.z,building:b});return true}
    this.stage='complete';this.park();return false;
   }
   return false;
  }
  if(this.stage==='sweep'){
   const heli=this.heli,site=this.site,target={x:site.x,z:site.z,y:50};
   const reached=travel(heli.root,target,dt,26);
   if(reached&&this.phase==='arrive'){this.phase='collect';this.elapsed=0;heli.cargo.setEnabled(true)}
   if(this.phase==='collect'){
    heli.cargo.scaling.setAll(1+Math.sin(this.elapsed*4)*.12);
    heli.cable.scaling.y=1+Math.sin(this.elapsed*2)*.05;
    if(this.elapsed>2.6){
     this.removed+=clearRecoverySite(w,site);
     this.visited.add(site.key);
     this.phase='haul';this.elapsed=0;
    }
   }
   if(this.phase==='haul'){
    heli.root.position.y=50+4*Math.sin(Math.min(1,this.elapsed/1.4)*Math.PI/2);
    // The helicopter visibly lifts its suspended load before heading toward
    // the next property; no instant teleport or mesh shrink animation.
    if(this.elapsed>1.4){heli.cargo.setEnabled(false);this.finishStage()}
   }
   return true;
  }
  if(this.stage==='fill'){
   const mixer=this.mixer,site=this.site;
   const reached=travel(mixer.root,staging(site),dt,19);
   if(reached&&this.phase==='arrive'){
    this.phase='pour';this.elapsed=0;
    const concrete=w.mat('fresh poured concrete','#979f9e',{alpha:.82});
    const patch=MeshBuilder.CreateDisc('CEMENT MIXER CONCRETE FILL',
      {radius:Math.max(2.2,site.crater.radius*.86),tessellation:40},w.scene);
    patch.rotation.x=Math.PI/2;patch.position=V(site.x,.088,site.z);
    patch.material=concrete;patch.isPickable=false;patch.scaling.setAll(.03);
    this.pourPatch=patch;
    (w.pouredConcrete||(w.pouredConcrete=[])).push(patch);
    const end=mixer.root.position.add(V(0,.7,-2.7));
    this.pourStream=MeshBuilder.CreateTube('VISIBLE CONCRETE POUR',
      {path:[end,V(site.x,.12,site.z)],radius:.16,tessellation:7},w.scene);
    this.pourStream.material=concrete;this.pourStream.isPickable=false;
   }
   if(this.phase==='pour'){
    // The concrete disk grows radially while the truck's mixer rotates.
    // It lies just below road paint/asphalt when road skins are restored.
    this.pourPatch?.scaling.setAll(Math.max(.03,Math.min(1,this.elapsed/3.2)));
    if(Math.random()<dt*4)w.createBurst?.(V(site.x,.2,site.z),'dust',4,.22);
    if(this.elapsed>3.2){
     if(fillCrater(w,site.crater))this.filled++;
     this.finishStage();
    }
   }
   return true;
  }
  if(this.stage==='build'){
   const site=this.site,pos=staging(site);
   const reachedCrane=travel(this.crane.root,pos,dt,17);
   const reachedTruck=travel(this.truck.root,{x:pos.x-6,z:pos.z+5,y:.8},dt,17);
   if(reachedCrane&&reachedTruck&&this.phase==='arrive'){
    this.phase='construct';this.elapsed=0;this.floorIndex=0;
   }
   if(this.phase==='construct'){
    const b=site.building,floor=b.floors.find(e=>e.active||e.health<e.maxHealth);
    if(!floor){this.completed++;this.finishStage();return true}
    // Distinct prefabricated sections rise from the supply truck.
    this.crane.pallet.setEnabled(true);
    if(this.elapsed>1.25){
     if(restoreBuildingFloor(w,b,floor))this.progression.rebuilt++;
     this.floorIndex++;this.elapsed=0;
     if(!anyDamage(b)){
      this.completed++;attractNewResidents(w,w.mobile?2:4);this.finishStage();
     }
    }
   }
   return true;
  }
  return false;
 }
}
