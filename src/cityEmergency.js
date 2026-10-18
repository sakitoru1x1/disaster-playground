import {TransformNode,Vector3,Quaternion} from '@babylonjs/core';
import {ROAD_COORDS,CITY_HALF_SIZE} from './cityLayout.js';
import {civilianPosition,settleCitizenRagdoll} from './citizenRagdolls.js';

const V=(x,y,z)=>new Vector3(x,y,z),distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const nearestRoad=n=>ROAD_COORDS.reduce((a,b)=>Math.abs(b-n)<Math.abs(a-n)?b:a,ROAD_COORDS[0]);
// Rescue vehicles must never spawn on the ocean outside the city.
export const EMERGENCY_DEPOT=Object.freeze({x:ROAD_COORDS[0],z:ROAD_COORDS[0]});
const DEPOT=EMERGENCY_DEPOT;
export const RESCUE_PHASES=['idle','driving','deploy','approach','treat','load','evacuate','hospital','working','return'];
export function rescueNeedsStretcher(person){
 return !!person&&(person.ragdoll||person.airborne||person.injurySeverity>=.6||
   person.exposure>4.5);
}
export function permitRecoveryWork({burning=false,victim=false,medics=false,heavyEquipment=false}={}){
 return !burning&&!victim&&!medics&&!heavyEquipment;
}
// Emergency vehicles stick to the road lattice all the way to a roadside
// pickup/parking point. Medics walk the remaining meters to the casualty.
// Never drive the truck into a house, crater or across the ocean.
export function emergencyRoadRoute(depot,target){
 const sx=nearestRoad(depot.x),sz=nearestRoad(depot.z);
 const x=nearestRoad(target.x),z=nearestRoad(target.z);
 const stops=[{x:sx,z:sz},{x,z:sz},{x,z}];
 return stops.filter((point,i)=>i===0||
   point.x!==stops[i-1].x||point.z!==stops[i-1].z);
}
const route=emergencyRoadRoute;
function drive(root,path,dt,speed){
 if(!path.length)return true;
 const p=root.position,target=path[0],dx=target.x-p.x,dz=target.z-p.z;
 const dist=Math.hypot(dx,dz);
 if(dist<1.3){path.shift();return !path.length}
 const k=Math.min(speed*dt,dist);
 p.x+=dx/dist*k;p.z+=dz/dist*k;root.rotation.y=Math.atan2(dx,dz);
 return false;
}
function makeResponderVehicle(w,kind,id){
 const fire=kind==='fire';
 const name=(fire?'FIRE ENGINE':'AMBULANCE')+' SERVICE #'+id,scene=w.scene;
 const body=w.mat(name+' paint',fire?'#d83128':'#f5f5ed');
 const trim=w.mat(name+' rescue stripe',fire?'#ffe386':'#dc4739');
 const root=new TransformNode(name,scene);
 root.position=V(DEPOT.x,.95,DEPOT.z+id*8);
 w.box(name+' BODY',[2.9,2.25,4.2],V(0,1.4,-.85),body,root);
 w.box(name+' CAB',[2.9,2.25,2.65],V(0,1.18,2.32),body,root);
 w.box(name+' GLASS',[2.65,.87,.12],V(0,1.64,3.68),w.materials.carDark,root);
 for(const side of [-1,1]){
  w.box(name+' STRIPE',[.08,.35,6.2],V(side*1.47,1.25,.18),trim,root);
  for(const z of [-2.1,2.56]){
   const wheel=w.cylinder(name+' WHEEL',1,.35,V(side*1.5,-.53,z),w.materials.dark,10,root);
   wheel.rotation.z=Math.PI/2;
  }
  if(!fire)w.box(name+' MEDICAL CROSS',[.08,.67,.7],
     V(side*1.54,1.75,-.9),trim,root);
 }
 const red=w.mat(name+' red beacon','#ff282d',{emissive:'#ec2222'});
 const blue=w.mat(name+' blue beacon','#277cfe',{emissive:'#2e71e4'});
 const left=w.box(name+' WARNING RED',[.56,.29,.8],V(-.8,2.43,1.78),red,root);
 const right=w.box(name+' WARNING BLUE',[.56,.29,.8],V(.8,2.43,1.78),blue,root);
 root.setEnabled(false);
 return {root,left,right,kind};
}
function makeRescuer(w,unit,idx){
 const scene=w.scene;
 const root=new TransformNode('VISIBLE '+(unit.kind==='fire'?'FIREFIGHTER':'PARAMEDIC')+
  ' '+unit.id+' '+idx,scene);
 const suit=w.mat(unit.id+' uniform',unit.kind==='fire'?'#dfaa42':'#f3e9e1');
 const pants=w.mat(unit.id+' work trousers',unit.kind==='fire'?'#292f31':'#405769');
 const helmet=w.mat(unit.id+' safety helmet',unit.kind==='fire'?'#f4d24b':'#edebdf');
 w.box('RESPONDER BODY',[.66,.85,.43],V(0,1.16,0),suit,root);
 w.box('RESPONDER HIGH VIS',[.71,.17,.47],V(0,1.03,0),unit.kind==='fire'?helmet:pants,root);
 w.cylinder('RESPONDER HEAD',.47,.43,V(0,1.86,0),w.materials.pedHeads,8,root);
 w.box('RESPONDER HELMET',[.55,.14,.50],V(0,2.15,0),helmet,root);
 const legs=[],arms=[];
 for(const side of [-1,1]){
  legs.push(w.box('RESPONDER WALKING LEG',[.18,.72,.22],
   V(side*.19,.40,0),pants,root));
  arms.push(w.box('RESPONDER ARM',[.17,.72,.19],
   V(side*.43,1.16,0),suit,root));
 }
 root.setEnabled(false);
 return {root,legs,arms,index:idx,stride:idx*Math.PI};
}
function createFieldHospital(w){
 const root=new TransformNode('VISIBLE CITY RESCUE FIELD HOSPITAL',w.scene);
 root.position=V(-CITY_HALF_SIZE+9,.15,DEPOT.z+21);
 const white=w.mat('FIELD HOSPITAL WHITE','#e8f0e8');
 const red=w.mat('FIELD HOSPITAL MEDICAL RED','#e23d40');
 const glass=w.mat('FIELD HOSPITAL GLASS','#78a5a7');
 w.box('FIELD HOSPITAL TREATMENT BASE',[12,.2,10],V(0,.07,0),glass,root);
 w.box('FIELD HOSPITAL CLINIC BODY',[10,3.5,7],V(0,1.90,0),white,root);
 w.box('FIELD HOSPITAL RECEPTION DOOR',[2.6,2.35,.13],V(0,1.25,-3.59),glass,root);
 w.box('FIELD HOSPITAL MEDICAL SIGN',[4.3,1.15,.19],V(0,3.55,-3.68),white,root);
 w.box('FIELD HOSPITAL RED CROSS VERTICAL',[.35,.93,.25],V(0,3.58,-3.83),red,root);
 w.box('FIELD HOSPITAL RED CROSS HORIZONTAL',[.93,.35,.25],V(0,3.58,-3.83),red,root);
 // Two visible emergency cots make unloading a physical destination.
 for(const x of [-3.4,3.4]){
  w.box('FIELD HOSPITAL BED',[1.8,.3,2.6],V(x,.65,-5.7),white,root);
  for(const z of [-6.7,-4.7])
   w.box('FIELD HOSPITAL COT LEG',[.13,.65,.15],V(x,.31,z),glass,root);
 }
 return root;
}
function makeStretcher(w,id){
 const root=new TransformNode('ACTUAL PATIENT STRETCHER '+id,w.scene);
 const aluminium=w.mat(id+' steel stretcher','#aebdc7'),
  canvas=w.mat(id+' stretcher padding','#ef8a40');
 w.box('STRETCHER ORANGE MAT',[1,.16,2.13],V(0,1.05,0),canvas,root);
 for(const x of [-.65,.65]){
  w.box('STRETCHER FRAME',[.10,.13,2.55],V(x,.99,0),aluminium,root);
  for(const z of [-.92,.92])
   w.box('STRETCHER SUPPORT',[.10,.84,.11],V(x,.56,z),aluminium,root);
 }
 for(const z of [-1.1,1.1])
  w.box('STRETCHER HANDLE',[1.45,.09,.10],V(0,1.05,z),aluminium,root);
 const occupant=new TransformNode('VISIBLE PATIENT ON STRETCHER',w.scene);
 occupant.parent=root;occupant.position.y=1.22;
 w.box('PATIENT COVER',[.73,.23,1.48],V(0,.06,-.16),
   w.mat(id+' rescue blanket','#629db3'),occupant);
 w.cylinder('PATIENT HEAD',.42,.38,V(0,.12,1.00),w.materials.pedHeads,8,occupant);
 root.setEnabled(false);return {root,occupant};
}
function walkCrew(crew,to,dt,speed=4.8){
 const p=crew.root.position,dx=to.x-p.x,dz=to.z-p.z;
 const dist=Math.hypot(dx,dz);
 if(dist>.12){
  const k=Math.min(dist,dt*speed);
  p.x+=dx/dist*k;p.z+=dz/dist*k;
  crew.root.rotation.y=Math.atan2(dx,dz);
 }
 crew.stride+=dt*speed*3;
 for(let i=0;i<crew.legs.length;i++)
  crew.legs[i].rotation.x=Math.sin(crew.stride+i*Math.PI)*Math.min(.55,dist);
 for(let i=0;i<crew.arms.length;i++)
  crew.arms[i].rotation.x=Math.sin(crew.stride+(i+1)*Math.PI)*Math.min(.40,dist);
 return dist<.75;
}
function faceCrew(crew,pt){
 const p=crew.root.position;crew.root.rotation.y=Math.atan2(pt.x-p.x,pt.z-p.z);
}
function waterStream(w,unit){
 if(unit.spray)return;
 const mat=w.mat('FIRE SPRAY WATER '+unit.id,'#83def7',{alpha:.59,emissive:'#4283ad'});
 const nozzle=w.cylinder('FIREFIGHTER HOSE NOZZLE',.20,.9,V(0,0,0),
   w.materials.dark,8);
 const droplets=[];
 for(let i=0;i<(w.mobile?7:12);i++){
  const mesh=w.box('REAL WATER SPRAY DROPLET',[.23,.18,.45],V(0,0,0),mat);
  mesh.isPickable=false;mesh.setEnabled(false);droplets.push(mesh);
 }
 nozzle.setEnabled(false);
 unit.spray={nozzle,droplets};
}
function updateWater(unit,fire,time,working){
 if(!unit.spray)return;
 const {nozzle,droplets}=unit.spray;
 const crew=unit.crew[0],start=crew.root.position.add(V(0,1.33,.12));
 const end=fire?.anchor?.add(V(0,1.1,0))||start;
 const delta=end.subtract(start),len=delta.length();
 nozzle.setEnabled(working);
 if(working){
  nozzle.position.copyFrom(start);
  nozzle.rotationQuaternion=Quaternion.RotationAxis(V(1,0,0),-.2);
 }
 for(let i=0;i<droplets.length;i++){
  const m=droplets[i];m.setEnabled(working);
  if(!working)continue;
  const p=((i/droplets.length+time*.6)%1);
  m.position.copyFrom(start).addInPlace(delta.scale(p));
  m.position.y+=Math.sin(p*Math.PI)*Math.min(2,len*.075)-p*p*1.15;
  m.scaling.setAll(.6+Math.sin(p*Math.PI)*.34);
 }
}
function finishPatient(unit,progression){
 const p=unit.patient;if(!p)return;
 if(p.ragdoll||p.airborne)settleCitizenRagdoll(p,progression.world,true);
 p.state='walking';p.exposure=0;p.injurySeverity=0;p.treatment=0;
 p.root.rotation.z=0;p.help?.setEnabled(false);
 // The vehicle delivered the patient to hospital: citizens return at a
 // grounded, accessible road location, not at the disaster site.
 p.root.position.set(DEPOT.x+13,.215,DEPOT.z+12);
 p.root.setEnabled(true);
 progression.rescued++;
}
export class EmergencyDispatch{
 constructor(world,progression){
  this.world=world;this.progression=progression;
  this.units={fire:[],ambulance:[]};
  this.fireDone=0;this.patientRescued=0;this.medicsDispatched=0;
  this.max={fire:world.mobile?2:3,ambulance:world.mobile?2:3};
  this.tickCount=0;world.responderVehicles=[];
  this.hospital=createFieldHospital(world);
 }
 event(){
  this.tickCount=0;
  // Existing response teams finish their local priority calls; a new
  // disaster cannot destroy their task claims.
 }
 depotFor(unit){
  const i=this.units[unit.kind].indexOf(unit);
  // Spread response vehicles along a legal avenue without stacking them.
  return {x:DEPOT.x,z:ROAD_COORDS[Math.min(4,(unit.kind==='fire'?0:3)+i)]};
 }
 activeUnits(kind){return this.units[kind].filter(u=>u.state!=='idle')}
 phase(unit,next){
  unit.state=next;unit.elapsed=0;
  // Transitioning INTO a drive phase must not erase the route just set by
  // dispatch. The old reset made every truck "arrive" at its depot in one
  // frame, and medics then walked across the ocean to the injured!
  if(!['driving','return','evacuate'].includes(next))unit.path=[];
 }
 targetPoint(unit){
  if(unit.kind==='fire')return unit.target.anchor||unit.target;
  return civilianPosition(unit.patient);
 }
 deploy(kind,target){
  const pool=this.units[kind];
  let unit=pool.find(u=>u.state==='idle');
  if(!unit){
   if(pool.length>=this.max[kind])return false;
   const vehicle=makeResponderVehicle(this.world,kind,pool.length);
   unit={id:kind+'-'+pool.length,kind,vehicle,state:'idle',
    target:null,patient:null,elapsed:0,path:[],crew:[],stretcher:null,
    spray:null,site:null,needsStretcher:false};
   unit.crew=[makeRescuer(this.world,unit,0),makeRescuer(this.world,unit,1)];
   if(kind==='ambulance')unit.stretcher=makeStretcher(this.world,unit.id);
   if(kind==='fire')waterStream(this.world,unit);
   pool.push(unit);
   this.world.responderVehicles.push({mesh:vehicle.root,emergency:true,kind,unit});
  }
  const start=this.depotFor(unit);
  unit.vehicle.root.position.set(start.x,.97,start.z);
  unit.vehicle.root.setEnabled(true);
  unit.crew.forEach(c=>c.root.setEnabled(false));
  unit.stretcher?.root.setEnabled(false);
  if(unit.spray)updateWater(unit,null,0,false);
  unit.target=target;unit.patient=kind==='ambulance'?target:null;
  unit.needsStretcher=kind==='ambulance'&&rescueNeedsStretcher(target);
  unit.site=kind==='fire'?target:null;
  unit.path=route(start,this.targetPoint(unit));
  this.phase(unit,'driving');
  return true;
 }
 findWork(danger){
  if(danger||this.tickCount<.7)return;
  const fires=this.progression.fires;
  for(const fire of fires?.fires?.values()||[]){
   if(this.activeUnits('fire').some(u=>u.target===fire))continue;
   this.deploy('fire',fire);
  }
  for(const person of this.world.civilians||[]){
   if(person.state!=='injured')continue;
   if(this.activeUnits('ambulance').some(u=>u.patient===person))continue;
   this.deploy('ambulance',person);
   if(this.activeUnits('ambulance').length>=this.max.ambulance)break;
  }
 }
 scenePos(unit,idx=0){
  const p=unit.vehicle.root.position;
  return V(p.x+(idx?1.4:-1.4),.22,p.z-3.45);
 }
 approach(unit,dt){
  const target=this.targetPoint(unit);
  const working=unit.state==='approach'||unit.state==='working'||unit.state==='treat';
  let all=true;
  for(let i=0;i<unit.crew.length;i++){
   const c=unit.crew[i];
   if(!c.root.isEnabled())c.root.setEnabled(true);
   const t=V(target.x+(i?1.1:-1.1),.215,target.z+(unit.kind==='fire'?-6:0));
   all=walkCrew(c,t,dt,unit.kind==='fire'?5.4:4.7)&&all;
  }
  if(unit.kind==='fire'&&working&&all)this.phase(unit,'working');
  if(unit.kind==='ambulance'&&all)this.phase(unit,'treat');
 }
 startReturn(unit){
  unit.crew.forEach(c=>c.root.setEnabled(false));
  if(unit.spray)updateWater(unit,null,0,false);
  unit.path=route(unit.vehicle.root.position,this.depotFor(unit));
  this.phase(unit,'return');
  unit.path=route(unit.vehicle.root.position,this.depotFor(unit));
 }
 updateAmbulance(unit,dt){
  const patient=unit.patient;
  if(patient?.state==='dead'||!this.world.civilians.includes(patient)){
   if(patient?.state==='evacuating'){} else {this.startReturn(unit);return}
  }
  if(unit.state==='deploy'){
   if(unit.elapsed>.9){
    unit.crew.forEach((c,i)=>{c.root.position.copyFrom(this.scenePos(unit,i));c.root.setEnabled(true)});
    this.phase(unit,'approach');
   }
  }else if(unit.state==='approach'){
   if(patient.state!=='injured'){this.startReturn(unit);return}
   this.approach(unit,dt);
  }else if(unit.state==='treat'){
   if(patient.state!=='injured'){this.startReturn(unit);return}
   const target=civilianPosition(patient);
   unit.crew.forEach(c=>faceCrew(c,target));
   // A genuine on-site stabilization; serious injuries require transport.
   if(unit.elapsed>3.6){
    if(unit.needsStretcher){
     unit.stretcher.root.position.copyFrom(target);
     unit.stretcher.root.position.y=.17;
     unit.stretcher.root.setEnabled(true);
     unit.stretcher.occupant.setEnabled(false);
     this.world.audio?.play('load',target,.45);
     this.phase(unit,'load');
   }else{
     if(patient.ragdoll||patient.airborne)
       settleCitizenRagdoll(patient,this.world,true);
     patient.state='walking';patient.exposure=0;patient.treatment=0;
     patient.help?.setEnabled(false);patient.root.rotation.z=0;
     patient.root.position.y=.215;
     this.progression.rescued++;this.patientRescued++;
     this.world.audio?.play('heal',target,.75);
     this.startReturn(unit);
   }
   }
  }else if(unit.state==='load'){
   const stretcher=unit.stretcher.root;
   const p=unit.vehicle.root.position;
   const goal=V(p.x,.17,p.z-3.55);
   const from=stretcher.position,dx=goal.x-from.x,dz=goal.z-from.z;
   const dist=Math.hypot(dx,dz);
   const step=Math.min(dist,dt*3.6);
   if(dist>.01){from.x+=dx/dist*step;from.z+=dz/dist*step}
   for(let i=0;i<unit.crew.length;i++){
    const c=unit.crew[i],pt=V(from.x+(i?1.35:-1.35),.215,from.z);
    walkCrew(c,pt,dt,4.2);
   }
   if(unit.elapsed>1.1&&!unit.stretcher.occupant.isEnabled()){
    if(patient.ragdoll||patient.airborne)
      settleCitizenRagdoll(patient,this.world);
    patient.state='evacuating';patient.root.setEnabled(false);
    this.world.audio?.play('metal',stretcher.position,.35);
    unit.stretcher.occupant.setEnabled(true);
   }
   if(dist<.45&&unit.elapsed>2.2){
    unit.crew.forEach(c=>c.root.setEnabled(false));
    unit.stretcher.root.setEnabled(false);
    unit.path=route(unit.vehicle.root.position,this.depotFor(unit));
    this.phase(unit,'evacuate');
    unit.path=route(unit.vehicle.root.position,this.depotFor(unit));
    this.medicsDispatched++;
   }
  }else if(unit.state==='evacuate'){
   if(drive(unit.vehicle.root,unit.path,dt,25)){
    this.phase(unit,'hospital');
   }
  }else if(unit.state==='hospital'){
   // Medical clearance occurs at a hospital/service depot, not instantly
   // at the disaster site. Until now patient stayed off the pedestrian sim.
   if(unit.elapsed>2){
    finishPatient(unit,this.progression);
    this.patientRescued++;
    this.world.audio?.play('heal',unit.vehicle.root.position,.8);
    this.phase(unit,'return');unit.path=[];
   }
  }
 }
 updateFire(unit,dt){
  const fire=unit.target,flames=this.progression.fires;
  if(!flames?.fires?.has(fire.building.id)){
   if(unit.state!=='return')this.startReturn(unit);
   return;
  }
  if(unit.state==='deploy'){
   if(unit.elapsed>.9){
    unit.crew.forEach((c,i)=>{c.root.position.copyFrom(this.scenePos(unit,i));c.root.setEnabled(true)});
    this.world.audio?.play('load',unit.vehicle.root.position,.33);
    this.phase(unit,'approach');
   }
  }else if(unit.state==='approach')this.approach(unit,dt);
  else if(unit.state==='working'){
   const target=fire.anchor;
   if(unit.elapsed<dt*2)this.world.audio?.play('pour',target,.38);
   unit.crew.forEach(c=>faceCrew(c,target));
   updateWater(unit,fire,this.world.time,true);
   flames.suppress(fire,dt*.092);
   if(!flames.fires.has(fire.building.id)){
    this.fireDone++;
    this.startReturn(unit);
   }
  }
 }
 tick(dt,danger=false){
  this.tickCount+=dt;
  this.findWork(danger);
  for(const kind of ['fire','ambulance']){
   for(const unit of this.units[kind]){
    if(unit.state==='idle')continue;
    unit.elapsed+=dt;
    const flash=Math.floor(this.world.time*7)%2===0;
    unit.vehicle.left.setEnabled(flash);unit.vehicle.right.setEnabled(!flash);
    if(unit.state==='driving'){
     const reached=drive(unit.vehicle.root,unit.path,dt,kind==='fire'?22:25);
     if(reached)this.phase(unit,'deploy');
    }else if(unit.state==='return'){
     if(!unit.path.length||drive(unit.vehicle.root,unit.path,dt,25)){
      this.phase(unit,'idle');
      unit.vehicle.root.setEnabled(false);
      unit.crew.forEach(c=>c.root.setEnabled(false));
      unit.stretcher?.root.setEnabled(false);
      if(unit.spray)updateWater(unit,null,0,false);
      unit.target=null;unit.patient=null;unit.site=null;
     }
    }else if(kind==='fire')this.updateFire(unit,dt);
    else this.updateAmbulance(unit,dt);
   }
  }
 }
 isSecuring(site){
  return this.activeUnits('ambulance').some(u=>u.patient&&
   ['driving','deploy','approach','treat','load'].includes(u.state)&&
   distance(civilianPosition(u.patient),site)<15);
 }
 isFireWorksite(site){
  return this.activeUnits('fire').some(u=>u.target&&
   distance(u.target,site)<17);
 }
 stats(){
  const active=kind=>this.activeUnits(kind).length;
  return {ambulances:active('ambulance'),fireEngines:active('fire'),
   availableAmbulances:this.units.ambulance.length,
   availableFireEngines:this.units.fire.length,
   firefightingCompleted:this.fireDone,patientsEvacuated:this.patientRescued,
   loadedPatients:this.medicsDispatched,
   workingFirefighters:this.units.fire.filter(u=>u.state==='working').length,
   workingParamedics:this.units.ambulance.filter(u=>
    ['approach','treat','load'].includes(u.state)).length,
   patientOnStretcher:this.units.ambulance.filter(u=>u.state==='load').length,
   dispatchStates:Object.fromEntries([...this.units.fire,...this.units.ambulance]
    .map(u=>[u.id,u.state]))};
 }
}
