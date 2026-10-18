import {MeshBuilder,TransformNode,Vector3,Quaternion,Color3,StandardMaterial} from '@babylonjs/core';
import {ROAD_COORDS,CITY_HALF_SIZE} from './cityLayout.js';
import {civilianPosition,settleCitizenRagdoll} from './citizenRagdolls.js';
const V=(x,y,z)=>new Vector3(x,y,z),near=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const nearestRoad=n=>ROAD_COORDS.reduce((a,b)=>Math.abs(b-n)<Math.abs(a-n)?b:a,ROAD_COORDS[0]);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function createVehicle(w,kind,index){
 const name=kind==='fire'?'FIRE BRIGADE TRUCK':'AMBULANCE RESCUE';
 const base=kind==='fire'?w.mat('BRIGHT FIRE ENGINE RED','#e02e2f'):
   w.mat('AMBULANCE CLEAN WHITE','#f5f8ed');
 const accent=kind==='fire'?w.mat('fire yellow stripe','#ffd950'):
   w.mat('ambulance emergency red','#d52f3b');
 const glass=w.materials.carDark,tire=w.materials.dark;
 const root=new TransformNode(name+' #'+index,w.scene);
 root.position=V(-CITY_HALF_SIZE-8,.95,-125+(index*7));
 w.box(name+' cargo',[2.85,2.45,4],V(0,1.2,-1.1),base,root);
 w.box(name+' CAB',[2.85,2.25,2.8],V(0,1,2.2),base,root);
 w.box(name+' WINDSHIELD',[2.64,.95,.14],V(0,1.61,3.63),glass,root);
 for(const side of [-1,1]){
  w.box(name+' side emergency band',[.07,.28,6],V(side*1.49,1.25,0),accent,root);
  for(const z of [-2.05,2.45]){
   const wheel=w.cylinder('responder rubber wheel',1.05,.35,V(side*1.53,-.5,z),tire,10,root);
   wheel.rotation.z=Math.PI/2;
  }
  w.box(name+' side logo',[.09,.62,.75],V(side*1.52,1.9,-1),accent,root);
 }
 const left=w.box('EMERGENCY FLASH RED',[.55,.36,.72],V(-.72,2.42,1.82),accent,root);
 const right=w.box('EMERGENCY FLASH BLUE',[.55,.36,.72],V(.72,2.42,1.82),
    w.mat('blue strobe glass','#387bff',{emissive:'#387bff'}),root);
 const stretcher=kind==='ambulance'
  ?w.box('AMBULANCE STRETCHER',[.85,.19,2.05],V(0,.25,-3.1),
     w.mat('rescue stretcher orange','#d97037'),root):null;
 if(stretcher)stretcher.setEnabled(false);
 const hose=kind==='fire'?
    w.cylinder('FIRE HOSE WATER JET',.22,1,V(0,0,0),
       w.mat('fire water stream','#72c8eb',{alpha:.68}),8):null;
 if(hose)hose.setEnabled(false);
 root.setEnabled(false);
 return {root,left,right,stretcher,hose,kind};
}
function route(depot,target){
 const sx=nearestRoad(depot.x),sz=nearestRoad(depot.z);
 const x=nearestRoad(target.x),z=nearestRoad(target.z);
 return [{x:depot.x,z:depot.z},{x:sx,z:sz},
  {x,z:sz},{x,z},{x:target.x+9,z:target.z-9}];
}
function drive(root,waypoints,dt,speed){
 if(!waypoints.length)return true;
 const target=waypoints[0],p=root.position;
 const dx=target.x-p.x,dz=target.z-p.z,dist=Math.hypot(dx,dz);
 if(dist<1.1){waypoints.shift();return waypoints.length===0}
 const step=Math.min(dist,speed*dt);
 p.x+=dx/dist*step;p.z+=dz/dist*step;
 root.rotation.y=Math.atan2(dx,dz);
 return false;
}
function drawWater(hose,from,to){
 const dx=to.x-from.x,dy=to.y-from.y,dz=to.z-from.z;
 const len=Math.max(.2,Math.hypot(dx,dy,dz));
 hose.setEnabled(true);
 hose.position=from.add(to).scale(.5);
 hose.scaling.y=len;
 const direction=V(dx,dy,dz).normalize();
 const rotation=new Quaternion();
 Quaternion.FromUnitVectorsToRef(V(0,1,0),direction,rotation);
 hose.rotationQuaternion=rotation;
}
function medicAvatar(w,unit,side){
 const root=new TransformNode('EMERGENCY PARAMEDIC '+unit.id+' '+side,w.scene);
 root.parent=unit.vehicle.root;
 const shirt=w.mat('medic uniform white','#f5efdd'),pants=w.materials.pedPants;
 w.box('PARAMEDIC VEST',[.6,.86,.32],V(0,1.12,0),shirt,root);
 w.cylinder('PARAMEDIC HEAD',.45,.42,V(0,1.86,0),w.materials.pedHeads,7,root);
 for(const x of [-.18,.18])w.box('MEDIC LEG',[.17,.7,.17],V(x,.42,0),pants,root);
 root.position=V(side*1.9,-.85,-3.5);root.setEnabled(false);
 return root;
}
export class EmergencyDispatch{
 constructor(world,progression){
  this.world=world;this.progression=progression;
  this.units={fire:[],ambulance:[]};this.tasks=new Set();
  this.fireDone=0;this.patientRescued=0;
  this.tickCount=0;this.max={fire:world.mobile?2:3,ambulance:world.mobile?2:3};
  world.responderVehicles=[];
 }
 event(){this.tickCount=0}
 deploy(kind,target){
  const pool=this.units[kind];
  let unit=pool.find(u=>u.state==='idle');
  if(!unit){
   if(pool.length>=this.max[kind])return false;
   const vehicle=createVehicle(this.world,kind,pool.length+1);
   unit={id:kind+'-'+pool.length,kind,vehicle,state:'idle',target:null,
    elapsed:0,path:[],patient:null,crew:[],site:null};
   pool.push(unit);
   this.world.responderVehicles.push({mesh:vehicle.root,emergency:true,kind,unit});
   if(kind==='ambulance')unit.crew=[
     medicAvatar(this.world,unit,-1),medicAvatar(this.world,unit,1)];
  }
  unit.state='driving';unit.target=target;unit.site=kind==='fire'?target:null;
  unit.patient=kind==='ambulance'?target:null;
  const depot={x:-CITY_HALF_SIZE-8,z:-121+pool.indexOf(unit)*8};
  unit.vehicle.root.position.set(depot.x,.96,depot.z);
  unit.vehicle.root.setEnabled(true);
  unit.path=route(depot,kind==='fire'?target:civilianPosition(target));
  unit.elapsed=0;
  return true;
 }
 activeUnits(kind){return this.units[kind].filter(u=>u.state!=='idle')}
 tick(dt,danger=false){
  const w=this.world;
  this.tickCount+=dt;
  const fires=this.progression.fires;
  // Dispatch only after the strongest moving shockfront passes.
  if(!danger&&this.tickCount>.7){
   for(const fire of fires?.fires.values()||[]){
    if(this.activeUnits('fire').some(u=>u.target===fire))continue;
    this.deploy('fire',fire);
   }
   for(const person of w.civilians){
    if(person.state!=='injured')continue;
    if(this.activeUnits('ambulance').some(u=>u.patient===person))continue;
    this.deploy('ambulance',person);
    if(this.activeUnits('ambulance').length>=this.max.ambulance)break;
   }
  }
  for(const kind of ['fire','ambulance']){
   for(const unit of this.units[kind]){
    const vehicle=unit.vehicle;
    if(unit.state==='idle'){vehicle.root.setEnabled(false);vehicle.hose?.setEnabled(false);continue}
    unit.elapsed+=dt;
    const flash=Math.floor(this.world.time*7)%2===0;
    vehicle.left.setEnabled(flash);vehicle.right.setEnabled(!flash);
    if(unit.state==='driving'){
     const arrived=drive(vehicle.root,unit.path,dt,kind==='fire'?21:24);
     if(arrived){unit.state='working';unit.elapsed=0;
      if(kind==='ambulance'){
       vehicle.stretcher?.setEnabled(true);
       unit.crew.forEach(c=>c.setEnabled(true));
      }
     }
    }else if(unit.state==='working'&&kind==='fire'){
     const fire=unit.target;
     if(!fires?.fires.has(fire.building.id)){unit.state='return';unit.elapsed=0;vehicle.hose.setEnabled(false);continue}
     const point=vehicle.root.position.add(V(0,2,0));
     drawWater(vehicle.hose,point,fire.anchor.add(V(0,1.4,0)));
     fires.suppress(fire,dt*.087);
     if(!fires.fires.has(fire.building.id)){
      this.fireDone++;vehicle.hose.setEnabled(false);unit.state='return';unit.elapsed=0;
     }
    }else if(unit.state==='working'&&kind==='ambulance'){
     const person=unit.patient;
     if(!person||person.state!=='injured'){
      unit.crew.forEach(c=>c.setEnabled(false));vehicle.stretcher?.setEnabled(false);
      unit.state='return';continue;
     }
     const target=civilianPosition(person);
     for(let i=0;i<unit.crew.length;i++){
      const crew=unit.crew[i],pos=crew.position;
      const relative=target.subtract(vehicle.root.position);
      const t=clamp(dt*1.7,0,1);
      pos.x+=(relative.x+(i?1:-1)-pos.x)*t;
      pos.z+=(relative.z-pos.z)*t;
     }
     if(unit.elapsed>3.4){
      if(person.ragdoll||person.airborne)settleCitizenRagdoll(person,w,true);
      person.state='walking';person.exposure=0;person.treatment=0;
      person.help?.setEnabled(false);person.root.rotation.z=0;
      person.root.position.copyFrom(target);
      person.root.position.y=.215;
      this.progression.rescued++;this.patientRescued++;
      unit.crew.forEach(c=>c.setEnabled(false));vehicle.stretcher?.setEnabled(false);
      unit.state='return';unit.elapsed=0;w.audio?.play('heal',target,.65);
     }
    }else if(unit.state==='return'){
     // Drive out with realistic flashing lights; don't pop out immediately.
     if(!unit.path.length)unit.path=route(vehicle.root.position,
       {x:-CITY_HALF_SIZE-8,z:-121});
     if(drive(vehicle.root,unit.path,dt,26)){
      unit.state='idle';unit.target=null;unit.patient=null;unit.site=null;
      vehicle.root.setEnabled(false);vehicle.hose?.setEnabled(false);
     }
    }
   }
  }
 }
 isSecuring(site){
  return this.activeUnits('ambulance').some(u=>u.patient?.state==='injured'&&
    near(civilianPosition(u.patient),site)<14);
 }
 stats(){
  return {ambulances:this.activeUnits('ambulance').length,
   fireEngines:this.activeUnits('fire').length,
   availableAmbulances:this.units.ambulance.length,
   availableFireEngines:this.units.fire.length,
   firefightingCompleted:this.fireDone,patientsEvacuated:this.patientRescued}
 }
}
