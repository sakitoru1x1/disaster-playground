import {MeshBuilder,TransformNode,Vector3,PhysicsAggregate,PhysicsShapeType} from '@babylonjs/core';
import {CITY_HALF_SIZE} from './cityLayout.js';
import {fillCrater} from './terrainDamage.js';
import {attractNewResidents} from './cityLife.js';

const V=(x,y,z)=>new Vector3(x,y,z);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const allBuildings=w=>[...w.buildings,...(w.districtBuildings||[])];
const activeDamage=b=>b.floors.some(e=>e.active);
const anyDamage=b=>b.floors.some(e=>e.active);
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
  // Rotorcraft aligns over the centroid of the actual fallen slabs,
  // not an arbitrary map marker at the original facade center.
  const pieces=looseMeshes(world).filter(m=>distance(location(m),b)<17);
  const center=pieces.reduce((a,m)=>{const p=location(m);a.x+=p.x;a.z+=p.z;return a},{x:0,z:0});
  const hoverX=pieces.length?b.x+Math.max(-6,Math.min(6,center.x/pieces.length-b.x)):b.x;
  const hoverZ=pieces.length?b.z+Math.max(-6,Math.min(6,center.z/pieces.length-b.z)):b.z;
  return {key:'b'+b.id,x:b.x,z:b.z,hoverX,hoverZ,building:b,radius:17};
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
// A real transport manifest: remove rubble from simulation bookkeeping, but
// keep the original *visible meshes* until they have travelled to the dump.
// Physics bodies must be detached before linking debris to the lift sling.
export function detachRecoveryDebris(world,site){
 const cargo=[],gone=new Set();
 const near=m=>alive(m)&&distance(location(m),site)<site.radius;
 for(const name of ['fragments','debris']){
  const source=world[name]||[];
  for(let i=source.length-1;i>=0;i--){
   const item=source[i],mesh=item.mesh;
   if(!near(mesh))continue;
   item.aggregate?.dispose();item.aggregate=null;
   mesh.physicsBody?.dispose(); // remove any remaining Havok owner
   cargo.push(mesh);gone.add(mesh);source.splice(i,1);
   world.activeBodies=Math.max(0,world.activeBodies-1);
  }
 }
 for(const name of ['visualFragments','rubble','staticRubbleBatches']){
  const source=world[name]||[];
  for(let i=source.length-1;i>=0;i--){
   const item=source[i],mesh=item.mesh||item;
   if(!near(mesh))continue;
   mesh.physicsBody?.dispose();
   cargo.push(mesh);gone.add(mesh);source.splice(i,1);
  }
 }
 if(world.pendingSecondary)world.pendingSecondary=world.pendingSecondary.filter(job=>
   job.fragment?.mesh&&!gone.has(job.fragment.mesh)&&alive(job.fragment.mesh));
 if(world.visualFractureQueue)world.visualFractureQueue=world.visualFractureQueue.filter(job=>
   job.part?.mesh&&!gone.has(job.part.mesh)&&alive(job.part.mesh));
 if(world.rubble)world.rubble=world.rubble.filter(alive);
 return cargo;
}
export function clearRecoverySite(world,site){
 const cargo=detachRecoveryDebris(world,site);
 for(const mesh of cargo)mesh.dispose();
 return cargo.length;
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
 // Cargo hangs from a *lowering* winch; no fake box covering the debris.
 // The load's true original rubble meshes are attached to this sling while
 // the cable retracts. The hook swings slightly under acceleration.
 const cable=w.cylinder('HELICOPTER WINCH STEEL LINE',.085,1,V(0,-3,0),dark,8,root);
 const sling=new TransformNode('HELICOPTER SUSPENDED RUBBLE SLING',w.scene);
 sling.parent=root;sling.position=V(0,-13,0);
 const net=w.mat('cargo recovery web','#98a18b');
 const cargo=w.box('SUSPENDED CARGO PLATFORM',[6,.22,5.6],V(0,-.65,0),net,sling);
 cargo.visibility=.68;
 for(const side of [-1,1]){
  w.box('cargo safety net',[.13,1.3,5.6],V(side*3,-.01,0),net,sling);
  w.box('cargo safety net',[6,1.3,.13],V(0,-.01,side*2.8),net,sling);
 }
 for(const side of [-1,1]){
  const strap=w.cylinder('winch sling rigging',.065,5.8,V(side*1.5,2,0),dark,6,sling);
  strap.rotation.z=side*.53;
 }
 sling.setEnabled(false);
 root.setEnabled(false);
 return {root,main,tail,cable,cargo,sling,load:[],height:18,rotorWash:0};
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
// True fixed-site lattice tower crane. It is assembled vertically at each
// rebuilding lot and rotates its horizontal jib over the foundations; it is
// NOT a small driving crane with a tilted boom.
export function buildTowerCrane(w){
 const root=new TransformNode('TOWER CRANE CONSTRUCTION SITE',w.scene);
 root.position=V(0,.15,0);
 const yellow=w.mat('tower crane safety yellow','#e9b43a');
 const red=w.mat('tower crane counterweight red','#c65b3a');
 const steel=w.mat('tower crane structural steel','#555c65');
 w.box('tower crane reinforced base',[6,.6,6],V(0,0,0),steel,root);
 const tower=new TransformNode('TOWER CRANE 58 METRE LATTICE MAST',w.scene);
 tower.parent=root;tower.position.y=.4;
 const mastHeight=54,module=6,mastSide=2.8;
 for(let k=0;k<mastHeight/module;k++){
  const y=k*module+module/2;
  for(const sideX of [-1,1])for(const sideZ of [-1,1]){
   w.box('tower crane vertical lattice chord',[.23,module,.23],
     V(sideX*mastSide/2,y,sideZ*mastSide/2),yellow,tower);
  }
  for(const edge of [-1,1]){
   for(const tilt of [-1,1]){
    const cross=w.box('tower crane diagonal bracing',[.13,Math.hypot(module,mastSide),.13],
      V(edge*mastSide/2,y,0),yellow,tower);
    cross.rotation.x=tilt*Math.atan2(mastSide,module);
    const cross2=w.box('tower crane X bracing',[.13,Math.hypot(module,mastSide),.13],
      V(0,y,edge*mastSide/2),yellow,tower);
    cross2.rotation.z=tilt*Math.atan2(mastSide,module);
   }
  }
 }
 // Rotates around mast axis above a slewing ring at y≈55 metres.
 const jib=new TransformNode('TOWER CRANE ROTATING JIB',w.scene);
 jib.parent=root;jib.position.y=mastHeight+.55;
 w.cylinder('tower crane slewing platform',3.7,.9,V(0,0,0),steel,12,jib);
 w.box('crane operator cab',[2.2,2.2,2.5],V(-2.2,-1.4,1.8),red,jib);
 w.box('tower crane head apex',[.45,7,.45],V(0,4,0),yellow,jib);
 const boomLength=47, counterLength=17;
 // Long horizontal lattice jib extends +Z: side rails, under-rail,
 // periodic triangular struts and suspension ties.
 for(const x of [-.95,.95]){
  w.box('tower crane main jib chord',[.17,.22,boomLength],
    V(x,0,boomLength/2),yellow,jib);
  w.box('tower crane upper jib chord',[.15,.18,boomLength],
    V(x,1.65,boomLength/2),yellow,jib);
  w.box('tower crane counter jib chord',[.22,.23,counterLength],
    V(x,0,-counterLength/2),yellow,jib);
 }
 for(let k=1;k<13;k++){
  const z=k*boomLength/13;
  w.box('crane lattice transverse bar',[2.0,.16,.15],V(0,0,z),yellow,jib);
  for(const side of [-1,1]){
   const brace=w.box('crane lattice diagonal',[.12,2.8,.12],V(side*.95,.85,z-1),yellow,jib);
   brace.rotation.x=k%2?.72:-.72;
  }
 }
 for(const z of [-7,-11,-15]){
  w.box('tower crane counterweight',[3.6,1.7,2.7],V(0,-1.35,z),steel,jib);
 }
 for(const z of [20,43]){
  const stay=w.box('suspended tower crane guy wire',[.08,Math.hypot(z,6),.08],
   V(0,4.5,z/2),steel,jib);
  stay.rotation.x=Math.atan2(z,6);
 }
 const trolley=new TransformNode('TOWER CRANE MOVING TROLLEY',w.scene);
 trolley.parent=jib;trolley.position=V(0,-.18,18);
 w.box('tower crane travelling trolley',[2.1,.65,2.5],V(0,0,0),steel,trolley);
 const cable=w.cylinder('TOWER CRANE HOIST CABLE',.08,1,V(0,-2,0),steel,7,trolley);
 const hook=w.cylinder('tower crane hanging hook',.46,.7,V(0,-3.4,0),red,10,trolley);
 const pallet=w.box('TOWER CRANE PRECAST LIFT',[4,.36,3],V(0,-4.2,0),
   w.materials.sidewalk,trolley);
 pallet.setEnabled(false);
 root.setEnabled(false);
 return {root,tower,jib,trolley,cable,hook,pallet,mastHeight,boomLength,
   targetX:0,targetZ:0,progress:0};
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
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t)};

// Winch rope is always anchored to the fuselage, and ends at the same sling
// position as the physical rubble cargo. The cable length really changes.
export function setHelicopterWinch(heli,length){
 const rope=Math.max(3.2,length);
 heli.height=rope;
 heli.sling.position.y=-rope;
 heli.cable.position.y=-(rope+2.1)/2;
 heli.cable.scaling.y=Math.max(.1,rope-2.1);
}
function beginCargoPickup(heli,debris){
 heli.load.length=0;
 const many=debris.length;
 for(let i=0;i<many;i++){
  const mesh=debris[i];
  if(!alive(mesh))continue;
  // A formerly frozen draw-call batch may be transformed again while flying.
  mesh.unfreezeWorldMatrix?.();
  mesh.computeWorldMatrix?.(true);
  mesh.setParent(heli.sling);
  const start=mesh.position.clone();
  const angle=i*2.399963229728653;
  const radius=1.9*Math.sqrt((i+.5)/Math.max(1,many));
  const end=V(Math.cos(angle)*radius,-.15+Math.floor(i/18)*.28,
    Math.sin(angle)*radius);
  heli.load.push({mesh,start,end});
 }
}
function animateCargoPickup(heli,t){
 const eased=smooth(t);
 for(const item of heli.load){
  if(!alive(item.mesh))continue;
  Vector3.LerpToRef(item.start,item.end,eased,item.mesh.position);
  item.mesh.rotation.y+=.006; // small movement as pieces settle into the net
 }
}
function dumpCargo(heli){
 const count=heli.load.length;
 for(const item of heli.load){if(alive(item.mesh))item.mesh.dispose()}
 heli.load.length=0;heli.sling.setEnabled(false);
 heli.sling.rotation.setAll(0);
 return count;
}
function updateTowerLift(crane,building,elapsed){
 const floor=building?.floors.find(e=>e.active||e.health<e.maxHealth);
 if(!floor)return false;
 const dx=building.x-crane.root.position.x,dz=building.z-crane.root.position.z;
 const dist=Math.hypot(dx,dz);
 const aim=Math.atan2(dx,dz);
 crane.jib.rotation.y=aim+Math.sin(elapsed*1.5)*.007;
 const trolleyProgress=smooth((elapsed-.3)/2.2);
 crane.trolley.position.z=4+(clamp(dist,7,crane.boomLength-3)-4)*trolleyProgress;
 const liftProgress=smooth(elapsed/2.55);
 const floorY=floor.mesh.getAbsolutePosition().y;
 const rope=clamp(crane.mastHeight-(1.6+(floorY+2.8-1.6)*liftProgress),
   2.2,crane.mastHeight-2);
 crane.cable.scaling.y=rope;
 crane.cable.position.y=-rope/2-.38;
 crane.hook.position.y=-rope-.47;
 crane.pallet.position.y=-rope-1.04;
 crane.pallet.rotation.z=Math.sin(elapsed*2)*.035;
 return true;
}
export class RecoveryConvoy{
 constructor(world,progression,{manual=false}={}){
  this.manual=manual;
  this.world=world;this.progression=progression;
  this.phase='idle';this.stage='sweep';this.elapsed=0;this.site=null;
  this.visited=new Set();this.floorIndex=0;
  this.removed=0;this.filled=0;this.completed=0;this.sweepRuns=0;
  this.heli=null;this.mixer=null;this.crane=null;this.truck=null;
  this.pourPatch=null;this.pourStream=null;
  this.hoverY=20;this.collected=0;this.lastFinished=null;
 }
 event(){
  this.stage='sweep';this.phase='idle';this.site=null;this.elapsed=0;
  this.visited.clear();this.sweepRuns=0;
  if(this.heli)dumpCargo(this.heli);
  this.park();
  this.pourStream?.dispose();this.pourStream=null;
  this.pourPatch?.dispose();this.pourPatch=null;
 }
 park(){
  for(const vehicle of [this.heli,this.mixer,this.crane,this.truck])
   vehicle?.root.setEnabled(false);
 }
 initFleet(stage){
  const w=this.world;
  // One work crew should not spawn an invisible heavy tower crane while
  // flying a helicopter. Every unit now allocates ONLY its actual machine.
  if(stage==='sweep'&&!this.heli)this.heli=buildHelicopter(w);
  if(stage==='fill'&&!this.mixer)this.mixer=buildMixer(w);
  if(stage==='build'){
   if(!this.crane)this.crane=buildTowerCrane(w);
   if(!this.truck)this.truck=buildTruck(w);
  }
 }
 currentState(){
  const helicopter=this.heli?.root,site=this.site;
  return {stage:this.stage,phase:this.phase,target:site?.building?.name||
    (site?Math.round(site.x)+','+Math.round(site.z):null),
    removed:this.removed,cratersFilled:this.filled,buildingsRestored:this.completed,
    fleetVisible:[this.heli,this.mixer,this.crane,this.truck].filter(v=>v?.root.isEnabled()).length,
    cargoPieces:this.heli?.load.length||0,
    carriedRealRubble:!!this.heli?.load.length&&this.heli.load.every(item=>item.mesh.parent===this.heli.sling),
    firstCargoY:this.heli?.load.length?this.heli.load[0].mesh.getAbsolutePosition().y:null,
    hoverOverTarget:!!helicopter&&!!site&&
      Math.hypot(helicopter.position.x-(site.hoverX??site.x),
        helicopter.position.z-(site.hoverZ??site.z))<1.8,
    helicopterAltitude:helicopter?.position.y??null,
    slingAltitude:helicopter?helicopter.position.y-(this.heli?.height||0):null,
    towerHeight:this.crane?.mastHeight||null,jibLength:this.crane?.boomLength||null,
    craneMastRaised:this.crane?.tower.scaling.y||0,
    trolleyDistance:this.crane?.trolley.position.z||0,
    craneStyle:this.crane?'lattice tower crane':null};
 }
 start(stage,site){
  this.stage=stage;this.site=site;this.phase='arrive';this.elapsed=0;
  this.world.audio?.play('select',site,.3);
  this.initFleet(stage);this.park();
  const agent=stage==='sweep'?this.heli:stage==='fill'?this.mixer:this.crane;
  agent.root.setEnabled(true);
  if(stage==='build')this.truck.root.setEnabled(true);
  if(stage==='sweep'){
   // The helicopter hovers directly over the ACTUAL rubble, not fifty
   // metres above it. Clear tallest nearby slab/facade with a 10m margin.
   const chunks=looseMeshes(this.world).filter(m=>distance(location(m),site)<site.radius);
   const high=chunks.reduce((h,m)=>Math.max(h,location(m).y),0);
   const standing=site.building?.floors.filter(f=>!f.active)
     .reduce((h,f)=>Math.max(h,f.mesh.getAbsolutePosition().y+f.size.y*.5),0)||0;
   this.hoverY=Math.max(17,Math.min(72,Math.max(high,standing)+10));
   if(this.sweepRuns++===0)
    this.heli.root.position.set(-CITY_HALF_SIZE+15,this.hoverY+12,
      Math.max(-CITY_HALF_SIZE+18,Math.min(CITY_HALF_SIZE-18,site.z)));
   this.heli.sling.setEnabled(false);
   setHelicopterWinch(this.heli,4);
  }else if(stage==='fill'){
   agent.root.position.set(-CITY_HALF_SIZE-17,.8,staging(site).z);
  }else{
   // The stationary tower crane rises IN PLACE next to the construction
   // plot. The only arriving vehicle is the materials delivery truck.
   agent.root.position.set(site.x+14,.15,site.z-14);
   agent.tower.scaling.y=.01;
   agent.jib.position.y=1;
   agent.jib.rotation.y=Math.atan2(site.x-agent.root.position.x,
     site.z-agent.root.position.z);
   agent.pallet.setEnabled(false);
   this.truck.root.position.set(-CITY_HALF_SIZE-23,.8,staging(site).z+5);
  }
 }
 finishStage(){
  this.lastFinished={stage:this.stage,site:this.site};
  this.park();this.phase='idle';this.site=null;this.elapsed=0;
  this.pourStream?.dispose();this.pourStream=null;this.pourPatch=null;
  if(this.heli?.load.length)dumpCargo(this.heli);
  this.crane?.pallet.setEnabled(false);
 }
 tick(dt){
  const w=this.world;this.elapsed+=dt;
  if(this.heli){
   this.heli.main.rotation.y+=dt*20;
   this.heli.tail.rotation.x+=dt*23;
   if(this.heli.sling.isEnabled())
    this.heli.sling.rotation.z=Math.sin(w.time*1.25)*.045;
  }
  if(this.mixer)this.mixer.drum.rotation.z+=dt*1.6;
  if(this.phase==='idle'){
   if(this.manual)return false;
   if(this.stage==='sweep'){
    const site=recoverySite(w,this.visited);
    if(site){this.start('sweep',site);return true}
    this.stage='fill';
   }
   if(this.stage==='fill'){
    // Newly settled debris must be removed before concrete can be poured.
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
   const heli=this.heli,site=this.site;
   if(this.phase==='arrive'){
    const near=travel(heli.root,{x:site.hoverX??site.x,z:site.hoverZ??site.z,y:this.hoverY},dt,33);
    if(near&&Math.abs(heli.root.position.y-this.hoverY)<.8){
     this.phase='lower';this.elapsed=0;heli.sling.setEnabled(true);
    }
   }else if(this.phase==='lower'){
    // The rotor stays over the debris; ONLY the cable and net descend.
    const target=heli.root.position.y-1.55;
    setHelicopterWinch(heli,lerp(4,target,smooth(this.elapsed/2.4)));
    if(this.elapsed>=2.4){
     const chunks=detachRecoveryDebris(w,site);
     beginCargoPickup(heli,chunks);
     w.audio?.play('load',site,.9);
     this.phase='collect';this.elapsed=0;
    }
   }else if(this.phase==='collect'){
    // Reuse each actual broken slab/fragment mesh and drag its real volume
    // into the net. No placeholder solid cube / instant invisible deletion.
    animateCargoPickup(heli,this.elapsed/2.9);
    if(this.elapsed>=2.9){
     this.phase='lift';this.elapsed=0;
     w.audio?.play('winch',site,.8);
    }
   }else if(this.phase==='lift'){
    setHelicopterWinch(heli,lerp(heli.root.position.y-1.55,7.8,smooth(this.elapsed/3)));
    if(this.elapsed>=3){
     this.phase='haul';this.elapsed=0;
    }
   }else if(this.phase==='haul'){
    // It leaves the district CARRYING the original visible debris before
    // unloading outside the island, then returns for another building.
    const depot={x:-CITY_HALF_SIZE-26,z:site.hoverZ??site.z,y:this.hoverY+9};
    const reached=travel(heli.root,depot,dt,34);
    if(reached&&Math.abs(heli.root.position.y-depot.y)<1.5){
     this.removed+=dumpCargo(heli);this.visited.add(site.key);
     this.finishStage();
    }
   }
   return true;
  }
  if(this.stage==='fill'){
   const mixer=this.mixer,site=this.site;
   const reached=travel(mixer.root,staging(site),dt,19);
   if(reached&&this.phase==='arrive'){
    this.phase='pour';this.elapsed=0;
    w.audio?.play('pour',site,.7);
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
   const crane=this.crane,site=this.site;
   if(this.phase==='arrive'){
    const erect=smooth(this.elapsed/5);
    crane.tower.scaling.y=Math.max(.01,erect);
    crane.jib.position.y=crane.mastHeight*erect+.55;
    const arrive=travel(this.truck.root,
      {x:site.x+8,z:site.z-9,y:.8},dt,20);
    if(arrive&&this.elapsed>=5){
     this.phase='construct';this.elapsed=0;this.floorIndex=0;
     crane.pallet.setEnabled(true);
    }
   }else if(this.phase==='construct'){
    const b=site.building,floor=b?.floors.find(e=>e.active);
    if(!floor){
     this.completed++;attractNewResidents(w,w.mobile?2:4);this.finishStage();return true;
    }
    updateTowerLift(crane,b,this.elapsed);
    if(this.elapsed>=3.2){
     if(restoreBuildingFloor(w,b,floor))this.progression.rebuilt++;
     w.audio?.play('build',floor.mesh.getAbsolutePosition(),.7);
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
