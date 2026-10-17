import {MeshBuilder,TransformNode,PhysicsAggregate,PhysicsShapeType,PhysicsMotionType,Quaternion,Vector3} from '@babylonjs/core';
import {trafficRoutes,positionOnRoute,trafficHeading} from './cityMotion.js';
import {planCity} from './cityLayout.js';
const V=(x,y,z)=>new Vector3(x,y,z);
function distance(a,b){return Math.hypot(a.x-b.x,a.z-b.z)}
export class CityProgression {
 constructor(world){
  this.world=world;this.lastDisaster=-100;
  this.incidents=0;this.rescued=0;this.rebuilt=0;this.constructed=0;
  this.nextConstruction=65;
  this.emergencyVehicles=0;this.active=false;this.needsDispatch=false;
  this.nextRepair=0;this.rescueCooldown=0;this.day=1;this.lightPhase=0;
 }
 event(type){
  this.lastDisaster=this.world.time;
  this.active=true;this.needsDispatch=true;
  this.incidents++;
 }
 launchResponders(){
  const world=this.world;
  for(let n=0;n<2;n++){
   const carPlan=trafficRoutes(2)[n],route=carPlan.route;
   const p=positionOnRoute(route,carPlan.distance);
   const yaw=trafficHeading(route,carPlan.distance);
   const mesh=world.box(n===0?'RESCUE AMBULANCE':'RESCUE FIRE UNIT',
    [3.7,1.3,1.85],V(p.x,1,p.z),
    n===0?world.materials.trim:world.materials.chassis[0],null,false);
   mesh.rotationQuaternion=Quaternion.FromEulerAngles(0,yaw,0);
   world.box('emergency beacon',[1.05,.3,.65],V(-.1,.85,0),
     n===0?world.materials.glass:world.materials.lamp,mesh);
   world.box('emergency windshield',[1.6,.45,1.45],V(-.2,.68,0),
     world.materials.carDark,mesh);
   const aggregate=new PhysicsAggregate(mesh,PhysicsShapeType.BOX,
     {mass:15,friction:.85,restitution:.07},world.scene);
   aggregate.body.setMotionType(PhysicsMotionType.ANIMATED);
   aggregate.body.setLinearDamping(.45);
   world.props.push({type:'car',mesh,aggregate,active:true,emergency:true,
     traffic:{route,distance:carPlan.distance,speed:10.5,
       state:'driving',heading:yaw,lastPosition:mesh.position.clone()}});
   this.emergencyVehicles++;
  }
  // Emergency crews are independent NPCs: a level-10 quake may injure
  // every ordinary citizen, but aid must still arrive from outside the city.
  const existing=world.civilians.filter(p=>p.role==='medic'&&p.state!=='injured'&&p.state!=='dead');
  for(let n=existing.length;n<2;n++){
   const x=n===0?-44.65:44.65,z=-44.65;
   const root=new TransformNode('RESPONDER medic '+n,world.scene);
   root.position=V(x,.215,z);
   const torso=MeshBuilder.CreateBox('person torso',{width:.62,height:.85,depth:.36},world.scene);
   torso.parent=root;torso.position.y=1.18;torso.material=world.materials.pedShirts[4];
   const head=MeshBuilder.CreateSphere('person head',{diameter:.43,segments:7},world.scene);
   head.parent=root;head.position.y=1.94;head.material=world.materials.pedHeads;
   const legs=[],arms=[];
   for(const side of [-1,1]){
    const leg=MeshBuilder.CreateBox('person leg',{width:.18,height:.70,depth:.2},world.scene);
    leg.parent=root;leg.position=V(side*.18,.42,0);
    leg.material=world.materials.pedPants;legs.push(leg);
    const arm=MeshBuilder.CreateBox('person arm',{width:.16,height:.68,depth:.2},world.scene);
    arm.parent=root;arm.position=V(side*.43,1.16,0);
    arm.material=world.materials.pedShirts[4];arms.push(arm);
   }
   root.getChildMeshes().forEach(mesh=>mesh.isPickable=false);
   world.civilians.push({root,x,z,state:'walking',panic:0,exposure:0,role:'medic',
    threat:V(0,0,0),walkPhase:n,speed:2.5,
    node:[n===0?0:7,0],target:[n===0?0:7,1],
    previous:null,legs,arms,walked:0});
  }
 }
 update(dt,disasters){
  const world=this.world,time=world.time;
  this.day=1+Math.floor(time/120);
  this.lightPhase=(1+Math.cos(time/120*Math.PI*2))*.5;
  world.sun.intensity=.30+.72*this.lightPhase;
  world.hemi.intensity=.30+.40*this.lightPhase;
  const danger=(disasters?.meteors?.length||0)>0||disasters?.effects.some(e=>
   ['meteor','tornado','quake','tsunami'].includes(e.type))||
   disasters?.blastWaves?.some(w=>!w.finished);
  if(danger)this.lastDisaster=time;
  if(!this.active){this.tryBuildNewBlock(time);return}
  // Dispatch emergency vehicles only after the dangerous wave passes;
  // deploying them during the earthquake instantly wrecked the ambulances.
  if(this.needsDispatch&&!danger&&time-this.lastDisaster>2){
   this.needsDispatch=false;
   if(this.emergencyVehicles<6)this.launchResponders();
  }
  // Medics follow the nearest injured survivor, treat them after reaching
  // close range; no instant resurrection of genuinely dead citizens.
  for(const medic of world.civilians){
   if(medic.role!=='medic'||medic.state==='dead'||medic.state==='injured')continue;
   let nearest=null,best=1e9;
   for(const p of world.civilians){
    if(p.state!=='injured')continue;
    const r=distance(medic.root.position,p.root.position);
    if(r<best){best=r;nearest=p}
   }
   medic.medicalTarget=nearest;
   if(nearest&&best<1.7){
    nearest.treatment=(nearest.treatment||0)+dt;
    if(nearest.treatment>1.8){
     nearest.state='walking';nearest.exposure=0;
     nearest.root.position.y=.215;nearest.root.rotation.z=0;
     nearest.help?.setEnabled(false);
     nearest.treatment=0;this.rescued++;
     medic.medicalTarget=null;
    }
   }
  }
  // The city regrows only AFTER incidents have passed; lower floors are
  // always repaired before higher storeys, without teleporting entire blocks.
  if(danger||time-this.lastDisaster<17||world.pendingFailures.length)return;
  this.tryBuildNewBlock(time);
  if(time<this.nextRepair)return;
  this.nextRepair=time+ (world.mobile?5.5:3.5);
  const candidates=world.buildings.filter(b=>b.floors.some(e=>e.active));
  if(!candidates.length)return;
  const b=candidates[this.rebuilt%candidates.length];
  const floor=b.floors.find(e=>e.active);
  if(!floor)return;
  floor.mesh.setEnabled(true);
  floor.aggregate=new PhysicsAggregate(floor.mesh,PhysicsShapeType.BOX,
    {mass:0,friction:.84,restitution:.08},world.scene);
  floor.active=false;floor.health=floor.maxHealth;
  floor.damageTaken=0;floor.damageMarks=0;floor.pendingFailure=false;
  world.brokenFloors=Math.max(0,world.brokenFloors-1);
  b.destroyed=b.floors.every(e=>e.active);
  // Progressively remove only long-settled fragments in the repaired lot.
  for(let i=world.rubble.length-1,removed=0;i>=0&&removed<8;i--){
   const mesh=world.rubble[i];
   if(mesh.isDisposed()){world.rubble.splice(i,1);continue}
   if(mesh.position.y>3.1||distance(mesh.position,floor.mesh.position)>floor.size.x*.72)continue;
   mesh.dispose();world.rubble.splice(i,1);removed++;
  }
  this.rebuilt++;
 }
 tryBuildNewBlock(time){
  const world=this.world;
  if(time<this.nextConstruction)return false;
  this.nextConstruction=time+75;
  // Grow only into empty plots. Large existing plots must not be bisected
  // to fit two smaller buildings when the layout is already full.
  if(world.buildings.length>=22||world.integrity()<72)return false;
  const next=planCity(world.buildings.length+1);
  for(const plot of next){
   for(const site of plot.buildings){
    if(world.buildings.some(b=>distance(b,{x:site.x,z:site.z})<2))continue;
    world.makeBuilding(site.x,site.z,plot.i,plot.j,site.size);
    this.constructed++;
    return true;
   }
  }
  return false;
 }
 helpNearest(pos){
  let found=null,distance=3.3;
  for(const p of this.world.civilians){
   if(p.state!=='injured')continue;
   const r=Math.hypot(p.root.position.x-pos.x,p.root.position.z-pos.z);
   if(r<distance){found=p;distance=r}
  }
  if(!found)return false;
  found.state='walking';found.root.rotation.z=0;found.root.position.y=.215;
  found.help?.setEnabled(false);
  found.exposure=0;found.treatment=0;this.rescued++;
  return true;
 }
 stats(){
  return {day:this.day,incidents:this.incidents,rescued:this.rescued,rebuilt:this.rebuilt,constructed:this.constructed,
   emergencyVehicles:this.world.props.filter(p=>p.emergency&&p.traffic?.state==='driving').length,dispatchPending:this.needsDispatch,
   injured:this.world.civilians.filter(p=>p.state==='injured').length};
 }
}
