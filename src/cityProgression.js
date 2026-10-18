import {civilianPosition,settleCitizenRagdoll} from './citizenRagdolls.js';
import {MeshBuilder,TransformNode,PhysicsAggregate,PhysicsShapeType,PhysicsMotionType,Quaternion,Vector3} from '@babylonjs/core';
import {trafficRoutes,positionOnRoute,trafficHeading} from './cityMotion.js';
import {planCity} from './cityLayout.js';
import {ParallelRecovery} from './parallelRecovery.js';
import {CityFires} from './cityFires.js';
import {EmergencyDispatch} from './cityEmergency.js';
const V=(x,y,z)=>new Vector3(x,y,z);
function distance(a,b){return Math.hypot(a.x-b.x,a.z-b.z)}
export class CityProgression {
 constructor(world){
  this.world=world;this.lastDisaster=-100;
  this.incidents=0;this.rescued=0;this.rebuilt=0;this.constructed=0;
  this.nextConstruction=65;
  this.emergencyVehicles=0;this.active=false;this.needsDispatch=false;
  this.nextRepair=0;this.rescueCooldown=0;this.day=1;this.lightPhase=0;
  this.fires=world.scene&&world.mat?new CityFires(world):null;
  this.dispatch=world.scene&&world.mat?new EmergencyDispatch(world,this):null;
  this.recovery=new ParallelRecovery(world,this);
 }
 event(type){
  this.lastDisaster=this.world.time;
  this.active=true;this.needsDispatch=true;
  this.incidents++;this.recovery.event();this.dispatch?.event();
 }
 launchResponders(){
  // The new dispatcher owns distinct response routes and on-site scenes.
  // Old ambulances drove endlessly around arbitrary block loops.
  if(this.dispatch)return;
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
  this.fires?.tick(dt);
  this.dispatch?.tick(dt,!!danger);
  if(!this.active){
    if(this.fires?.fires.size)return; // don't spontaneously build while burning
    this.tryBuildNewBlock(time);return
  }
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
    const r=distance(medic.root.position,civilianPosition(p));
    if(r<best){best=r;nearest=p}
   }
   medic.medicalTarget=nearest;
   if(nearest&&best<1.7&&civilianPosition(nearest).y<3){
    nearest.treatment=(nearest.treatment||0)+dt;
    if(nearest.treatment>1.8){
     if(nearest.ragdoll||nearest.airborne)settleCitizenRagdoll(nearest,world,true);
     nearest.state='walking';nearest.exposure=0;
     nearest.root.position.y=.215;nearest.root.rotation.z=0;
     nearest.help?.setEnabled(false);
     nearest.treatment=0;this.rescued++;
     world.audio?.play('heal',nearest.root.position,.8);
     medic.medicalTarget=null;
    }
   }
  }
  // A visible municipal workflow replaces the old magical one-floor repair:
  // helicopter clears each building's rubble, concrete mixers fill craters,
  // then trucks and a mobile crane replace storeys from the foundation up.
  if(danger||time-this.lastDisaster<7)return;
  // A completely leveled city can have hundreds of cascading failures.
  // Dispatch the cleanup helicopter after a bounded wait, even if a few
  // sections are still settling. Delay actual rebuilding until stable.
  if(world.pendingFailures.length&&time-this.lastDisaster<24)return;
  // Crews coordinate PER PROPERTY. One site may already have poured
  // concrete while several other helicopters are removing wreckage.
  // A single delayed collapse no longer stalls every other district.
  this.recovery.tick(dt);
  if(this.recovery.stage==='complete')this.tryBuildNewBlock(time);
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
   const at=civilianPosition(p);
   const r=Math.hypot(at.x-pos.x,at.z-pos.z,(at.y-pos.y)*.6);
   if(r<distance){found=p;distance=r}
  }
  if(!found)return false;
  if(found.ragdoll||found.airborne)settleCitizenRagdoll(found,this.world,true);
  found.state='walking';found.root.rotation.z=0;found.root.position.y=.215;
  found.help?.setEnabled(false);
  found.exposure=0;found.treatment=0;this.rescued++;
  return true;
 }
 stats(){
  return {day:this.day,incidents:this.incidents,rescued:this.rescued,rebuilt:this.rebuilt,constructed:this.constructed,
   emergencyVehicles:this.world.props.filter(p=>p.emergency&&p.traffic?.state==='driving').length,dispatchPending:this.needsDispatch,
   injured:this.world.civilians.filter(p=>p.state==='injured').length,
   fires:this.fires?.stats()||{burning:0,started:0,extinguished:0},
   emergency:this.dispatch?.stats()||{ambulances:0,fireEngines:0},
   recovery:this.recovery.currentState()};
 }
}
