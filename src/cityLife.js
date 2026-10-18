import {
  MeshBuilder,Vector3,Quaternion,TransformNode,PhysicsAggregate,
  PhysicsShapeType,PhysicsMotionType
} from '@babylonjs/core';
import {terrainDisplacement} from './terrainDamage.js';
import {civilianPosition,pushCitizenRagdoll,animateCitizenRagdoll,
  settleCitizenRagdoll} from './citizenRagdolls.js';
import {citizenIdentity,updateCitizenRoutine,nextTowardNode} from './citizenRoutines.js';
import {createCharacterLibrary,createCharacter} from './characterArt.js';
import {
  pedestrianNode,choosePedestrianNext,
  positionOnRoute,trafficHeading,SIDEWALK_COORDS
} from './cityMotion.js';

const V=(x,y,z)=>new Vector3(x,y,z);
const rand=(a,b)=>a+(b-a)*Math.random();
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const PED_BASE_Y=.215;
const tempPosition=V(0,0,0);

export function populateCityLife(world){
  world.civilians=[];world.lifeMarks=[];
  world.civilianDeaths=0;world.carsWrecked=0;
  const m=world.materials;
  m.pedHeads=world.mat('citizen skin','#d7b49a');
  m.pedShirts=['#c88770','#638ba6','#dbc17c','#92a28f','#bc7793','#7a9b86']
    .map((color,i)=>world.mat('citizen jacket '+i,color));
  m.pedPants=world.mat('citizen trousers','#323c4d');
  m.wreck=world.mat('vehicle impact soot','#34363a');
  m.stain=world.mat('small ground injury stain','#77332d',{alpha:.58,disableLighting:true});
  // Rescue labels are projected into a readable HTML overlay by
  // RescueMarkers. The previous dynamic-texture planes turned into black
  // rectangles on some Android / WebGL renderers.
  // A connected grid of safe footpaths around the 26m city blocks.
  // Pedestrians cross at intersections and turn instead of standing in place.
  // Shared master geometry and palette, instanced into detailed
  // low-poly people. Every resident shares meshes; no per-person materials.
  const masters=world.characterLibrary=createCharacterLibrary(world);
  world.citizenMasters=masters.meshes;
  const count=world.mobile?72:210;
  world.citizenMasterRefs=masters;
  world.nextCitizenId=count;
  for(let i=0;i<count;i++)spawnCitizen(world,i,masters);
}
function spawnCitizen(world,i,masters){
  const m=world.materials;
  const identity=citizenIdentity(i),[nodeI,nodeJ]=identity.home;
  const here=pedestrianNode(nodeI,nodeJ);
  const target=nextTowardNode(identity.home,identity.work);
  const root=new TransformNode('citizen '+i+' '+identity.occupation,world.scene);
  root.position=V(here.x,PED_BASE_Y,here.z);
  const appearance=createCharacter(world,root,i,{library:masters});
  const {legs,arms,headRig}=appearance;
  const help=new TransformNode('help signal logical anchor',world.scene);
  help.parent=root;help.position.y=2.7;help.setEnabled(false);
  root.getChildMeshes().forEach(mesh=>mesh.isPickable=false);
  world.civilians.push({root,x:here.x,z:here.z,state:'walking',panic:0,exposure:0,
    threat:V(here.x+3,0,here.z+3),walkPhase:rand(0,7),speed:identity.speed,
    node:[nodeI,nodeJ],target,previous:null,legs,arms,help,walked:0,
    identity,routineGoal:null,pathGoal:null,routineActivity:'breakfast',
    waitTime:0,socialUntil:0,lastGreeting:-100,visible:true,
    appearance,headRig,characterAge:appearance.age});
}
export function attractNewResidents(world,count=3){
  // After a district is rebuilt, new families move in; do not resurrect
  // citizens who actually died in a disaster.
  const capacity=world.mobile?72:210;
  const alive=world.civilians.filter(p=>p.identity&&p.state!=='dead').length;
  const arrivals=Math.max(0,Math.min(count,capacity-alive));
  if(!world.citizenMasterRefs||arrivals<=0)return 0;
  for(let i=0;i<arrivals;i++){
    const deadIndex=world.civilians.findIndex(p=>p.identity&&p.state==='dead');
    if(deadIndex!==-1){
      const dead=world.civilians.splice(deadIndex,1)[0];
      if(dead.ragdoll||dead.airborne)settleCitizenRagdoll(dead,world);
      dead.root.dispose(false,false);
    }
    spawnCitizen(world,world.nextCitizenId++,world.citizenMasterRefs);
  }
  world.returnedResidents=(world.returnedResidents||0)+arrivals;
  return arrivals;
}


function injureCivilian(world,p){
  if(p.state==='dead'||p.state==='injured')return;
  world.audio?.play('hurt',p.root.position,.5);
  p.state='injured';p.panic=0;p.medicalTarget=null;p.exposure=0;
  p.help?.setEnabled(true);
  p.help?.setEnabled(true);
  // A collapsed injured citizen should be lying down, not standing tilted.
  p.root.rotation.z=-1.17;
  p.root.rotation.y=rand(-.42,.42);
  p.legs?.forEach((leg,i)=>leg.rotation.x=i?.24:-.35);
  p.arms?.forEach((arm,i)=>arm.rotation.x=i?-.65:.55);
  p.root.position.y=.15;
}
function killCivilian(world,p){
  if(p.state==='dead')return;
  p.state='dead';p.panic=0;world.civilianDeaths++;
  p.help?.setEnabled(false);
  p.root.rotation.z=rand(-1.44,-1.13);
  p.root.rotation.y=rand(-2,2);
  p.root.position.y=.4;
  const mark=MeshBuilder.CreateDisc('pedestrian ground stain',
    {radius:rand(.31,.53),tessellation:10},world.scene);
  mark.rotation.x=Math.PI/2;
  mark.position=V(p.root.position.x,.29,p.root.position.z);
  mark.material=world.materials.stain;
  mark.isPickable=false;
  world.lifeMarks.push(mark);
  if(world.lifeMarks.length>20)world.lifeMarks.shift().dispose();
}

// Normal cars are navigated by ANIMATED Havok shapes to avoid dozens of
// constantly accelerating rigid bodies. A disaster turns only the affected
// vehicles back into ordinary DYNAMIC Havok bodies; after that route control
// never overrides momentum or collisions.
export function releaseTrafficCar(car){
  if(!car||car.type!=='car'||!car.aggregate||car.traffic?.state!=='driving')return false;
  const v=car.traffic;
  v.state='released';
  const body=car.aggregate.body;
  body.setMotionType(PhysicsMotionType.DYNAMIC);
  const dx=Math.cos(v.heading),dz=-Math.sin(v.heading);
  body.setLinearVelocity(V(dx*v.speed,body.getLinearVelocity().y,dz*v.speed));
  return true;
}

function damageCar(world,car,power,direction){
  if(car.wrecked||car.type!=='car'||!car.aggregate)return;
  car.damage=(car.damage||0)+power;
  if(car.damage<1.1)return;
  releaseTrafficCar(car);
  car.wrecked=true;world.carsWrecked++;world.audio?.play('carCrash',car.mesh.position,1);
  const child=car.mesh.getChildMeshes().find(mesh=>mesh.name==='vehicle windows');
  if(child){child.scaling.y*=.48;child.rotation.z=rand(-.26,.26);child.material=world.materials.wreck}
  const hood=MeshBuilder.CreateBox('crushed vehicle hood',
    {width:1.15,height:.14,depth:1.5},world.scene);
  hood.parent=car.mesh;hood.position=V(1.05,.56,0);hood.rotation.z=rand(-.22,-.09);
  hood.material=world.materials.wreck;hood.isPickable=false;
  car.mesh.material=world.materials.wreck;
  const wheel=car.mesh.getChildMeshes().find(mesh=>mesh.name==='vehicle wheel');
  if(wheel&&world.debris.length<world.maxDebris){
    const oldPos=wheel.getAbsolutePosition().clone();
    wheel.parent=null;wheel.position.copyFrom(oldPos);
    const aggregate=new PhysicsAggregate(wheel,PhysicsShapeType.BOX,
      {mass:2,friction:.8,restitution:.2},world.scene);
    aggregate.body.applyImpulse(V(rand(-6,6),rand(3,9),rand(-6,6)),oldPos);
    world.debris.push({mesh:wheel,aggregate,time:0});world.activeBodies++;
  }
  const body=car.aggregate.body;
  body.setAngularVelocity(V(rand(-2,2),rand(-2,2),rand(-2,2)));
  body.applyImpulse(V(direction.x*15,rand(2,8),direction.z*15),car.mesh.position);
  if(world.carsWrecked%2===0)world.createBurst(car.mesh.position,'dust',13,.25);
}

export function affectCityLife(world,kind,center,power,radius,dt){
  const strength=clamp(power,0,1);
  for(const p of world.civilians){
    if(p.state==='dead')continue;
    const at=civilianPosition(p);
    const x=at.x,z=at.z;
    const distance=kind==='quake'?0:kind==='tsunami'?Math.abs(x-center.x):
      Math.hypot(x-center.x,z-center.z);
    if(distance>radius)continue;
    const falloff=kind==='quake'?1:clamp(1-distance/Math.max(1,radius),0,1);
    const physical=kind==='tornado'||kind==='tsunami';
    const impact=physical&&strength>.28&&
      (kind==='tornado'?strength*falloff>.19:falloff>.40);
    if(impact){
      if(p.state!=='injured')injureCivilian(world,p);
      pushCitizenRagdoll(world,p,kind,center,strength,radius,dt);
    }
    // Already injured or flying civilians must not be reset to walking.
    if(p.state==='injured'||p.ragdoll||p.airborne)continue;
    p.threat=V(center.x,0,center.z);
    p.panic=Math.max(p.panic,Math.min(8,2+6*strength));
    p.state='fleeing';
    // Some civilians take cover during moderate tremors instead of
    // running blindly into traffic; severe events trigger evacuation.
    if(strength>.3&&strength<.62&&p.root.uniqueId%3===0){
      p.state='sheltering';p.panic=0;p.shelterTime=Math.max(p.shelterTime||0,2+strength*4);
    }
    if(strength>.52){
      const lethality=Math.pow((strength-.52)/.48,1.4)*
        (kind==='quake'?.8:kind==='tsunami'?.9:.6+.4*falloff);
      p.exposure+=dt*lethality*3.0;
      if(p.exposure>.42+((p.root.uniqueId*17)%15)*.042){
        // Most victims can be rescued; very close/high-energy exposure may be fatal.
        if(strength>.90&&(p.root.uniqueId%5===0))killCivilian(world,p);
        else injureCivilian(world,p);
      }
    }
  }
  for(const car of world.props){
    if(car.type!=='car'||!car.aggregate)continue;
    const pos=car.mesh.position;
    const distance=kind==='quake'?0:kind==='tsunami'?Math.abs(pos.x-center.x):
      Math.hypot(pos.x-center.x,pos.z-center.z);
    if(distance>radius)continue;
    const dx=pos.x-center.x,dz=pos.z-center.z,len=Math.max(1,Math.hypot(dx,dz));
    const outward=V(kind==='tsunami'?1:dx/len,0,kind==='tsunami'?0:dz/len);
    const body=car.aggregate.body;
    // A mild event slows nearby drivers; a strong one disrupts road handling
    // and hands the vehicle to dynamic Havok for impacts and destruction.
    if(strength<.36){
      if(car.traffic?.state==='driving')car.traffic.slowUntil=world.time+2;
      else if(!car.wrecked&&world.time-(car.lastFleeTime||-10)>1.7){
        car.lastFleeTime=world.time;
        body.applyImpulse(outward.scale(2.5+strength*12),pos);
      }
    }else if(world.time-(car.lastDamageTime||-10)>.65){
      car.lastDamageTime=world.time;
      releaseTrafficCar(car);
      damageCar(world,car,strength*.48+.18,outward);
    }
  }
}
function chooseNewPedestrianNode(person){
  person.previous=person.node;
  person.node=person.target;
  person.target=person.panic>0||!person.identity
    ?choosePedestrianNext(person.node[0],person.node[1],
      person.previous,person.threat,person.panic>0)
    :nextTowardNode(person.node,person.routineGoal||person.identity.home,person.previous);
}
export function walkPedestrian(person,dt,time=0){
  if(['dead','injured','evacuating'].includes(person.state))return;
  if(person.state==='sheltering'&&person.shelterTime>0){
    person.shelterTime-=dt;
    person.root.position.y=.07;
    person.legs[0].rotation.x=person.legs[1].rotation.x=.4;
    return;
  }
  person.root.rotation.z=0;
  const root=person.root, running=person.panic>0;
  if(person.headRig)person.headRig.rotation.y*=Math.max(0,1-dt*4);
  // No teleporting: resume today's home/work/shopping itinerary after danger.
  if(person.identity&&!running){
    updateCitizenRoutine(person,time);
    person.routineActivity=person.socialUntil>time?'socializing':person.scheduleActivity;
    if(person.routineGoal&&(!person.pathGoal||
       !person.pathGoal.every((v,i)=>v===person.routineGoal[i]))){
      person.pathGoal=[...person.routineGoal];
      person.target=nextTowardNode(person.node,person.routineGoal,person.previous);
    }
    const destination=person.routineGoal||person.node;
    const arrived=person.node[0]===destination[0]&&person.node[1]===destination[1]&&
      Math.hypot(root.position.x-SIDEWALK_COORDS[destination[0]],
        root.position.z-SIDEWALK_COORDS[destination[1]])<.3;
    if(arrived){
      person.waitTime=(person.waitTime||0)+dt;
      person.target=person.node;
      // Life does not freeze at an office doorway: small head turns and
      // greeting gestures make stationary NPCs look occupied.
      const idle=time*1.5+person.walkPhase;
      root.rotation.y=.22*Math.sin(idle*.28);
      person.arms[0].rotation.x=Math.sin(idle)*(person.socialUntil>time?.48:.13);
      person.arms[1].rotation.x=-person.arms[0].rotation.x;
      person.legs[0].rotation.x=person.legs[1].rotation.x=0;
      if(person.headRig)person.headRig.rotation.y=Math.sin(idle*.44)*.19;
      root.position.y=PED_BASE_Y;
      return;
    }
    person.waitTime=0;
  }
  if(person.role==='medic'&&person.medicalTarget){
    const target=person.medicalTarget.root.position,dx=target.x-root.position.x,dz=target.z-root.position.z;
    const distance=Math.hypot(dx,dz);
    if(distance>.1){const step=Math.min(distance,person.speed*2.2*dt);
      root.position.x+=dx/distance*step;root.position.z+=dz/distance*step;
      root.rotation.y=Math.atan2(dx,dz);}
    return;
  }
  if(running)person.panic=Math.max(0,person.panic-dt);
  person.state=running?'fleeing':'walking';
  if(person.identity&&person.panic<=0&&running){
    person.target=nextTowardNode(person.node,person.routineGoal||person.identity.home);
  }
  const pace=person.speed*(running?2.8:1);
  let remaining=dt*pace;
  let attempts=0;
  while(remaining>0&&attempts++<3){
    if(person.identity&&!running&&person.routineGoal&&
       person.node[0]===person.routineGoal[0]&&person.node[1]===person.routineGoal[1])break;
    const nx=SIDEWALK_COORDS[person.target[0]],
      nz=SIDEWALK_COORDS[person.target[1]];
    const dx=nx-root.position.x,dz=nz-root.position.z;
    const length=Math.hypot(dx,dz);
    if(length<=remaining+.001){
      root.position.x=nx;root.position.z=nz;remaining-=length;
      chooseNewPedestrianNode(person);
    }else{
      root.position.x+=dx/length*remaining;
      root.position.z+=dz/length*remaining;
      remaining=0;
    }
  }
  const tx=SIDEWALK_COORDS[person.target[0]],
    tz=SIDEWALK_COORDS[person.target[1]];
  const dx=tx-root.position.x,dz=tz-root.position.z;
  if(Math.hypot(dx,dz)>.001)root.rotation.y=Math.atan2(dx,dz);
  person.walked+=pace*dt;
  const cycle=person.walked*(running?2.7:2.1)+person.walkPhase;
  root.position.y=PED_BASE_Y+Math.abs(Math.sin(cycle))*.035;
  person.legs[0].rotation.x=Math.sin(cycle)*.58;
  person.legs[1].rotation.x=-Math.sin(cycle)*.58;
  person.arms[0].rotation.x=-Math.sin(cycle)*.44;
  person.arms[1].rotation.x=Math.sin(cycle)*.44;
}
function blockedByAnotherCar(world,car,next){
  const traffic=car.traffic;
  const dx=Math.cos(traffic.heading),dz=-Math.sin(traffic.heading);
  for(const other of world.props){
    if(other===car||other.type!=='car'||other.wrecked)continue;
    const p=other.mesh.position;
    const x=p.x-next.x,z=p.z-next.z;
    if(Math.abs(x*dx+z*dz)>6.3||x*dx+z*dz<0)continue;
    if(Math.abs(x*(-dz)+z*dx)>2)continue;
    return true;
  }
  return false;
}
export function pauseCityTraffic(world,paused){
  for(const car of world.props){
    if(car.type!=='car'||car.traffic?.state!=='driving'||!car.aggregate)continue;
    const body=car.aggregate.body;
    if(paused){
      // ANIMATED bodies may continue towards a queued target even when the
      // global physics timestep is very small. STATIC freezes them exactly.
      body.setMotionType(PhysicsMotionType.STATIC);
    }else{
      body.setMotionType(PhysicsMotionType.ANIMATED);
      const t=car.traffic;
      const p=positionOnRoute(t.route,t.distance);
      body.setTargetTransform(V(p.x,1,p.z),Quaternion.FromEulerAngles(0,t.heading,0));
    }
  }
}
export function updateTraffic(world,dt){
  for(const car of world.props){
    const t=car.traffic;
    if(!t||t.state!=='driving'||car.wrecked||!car.aggregate)continue;
    // Never resume an ANIMATED route after a disaster ejects the vehicle.
    const slow=t.slowUntil>world.time;
    const actualStep=dt*(slow?.35:1);
    const actualDist=t.distance+t.speed*actualStep;
    const destination=positionOnRoute(t.route,actualDist);
    const groundDelta=terrainDisplacement(destination.x,destination.z,world.terrainCraters||[]);
    if(groundDelta<-.86){
      // Kinematic vehicles cannot cross a hole as if the old street still exists.
      releaseTrafficCar(car);
      continue;
    }
    if(blockedByAnotherCar(world,car,destination))continue;
    t.distance=actualDist;
    t.heading=trafficHeading(t.route,t.distance);
    const q=Quaternion.FromEulerAngles(0,t.heading,0);
    tempPosition.set(destination.x,1+groundDelta,destination.z);
    car.aggregate.body.setTargetTransform(tempPosition,q);
    t.lastPosition.copyFrom(tempPosition);
  }
}
export {cityClock,citizenStats} from './citizenRoutines.js';
export function updateCityLife(world,dt){
  updateTraffic(world,dt);
  world.nextSocialScan=(world.nextSocialScan||0)-dt;
  if(world.nextSocialScan<=0){
    world.nextSocialScan=1.25;
    const cells=new Map();
    for(const p of world.civilians){
      if(!p.identity||p.state!=='walking'||p.panic>0||p.socialUntil>world.time||
         p.waitTime<.6||world.time-p.lastGreeting<11)continue;
      const x=p.root.position.x,z=p.root.position.z;
      const key=Math.round(x/3)+','+Math.round(z/3);
      const other=cells.get(key);
      if(other&&Math.hypot(x-other.root.position.x,z-other.root.position.z)<2.2){
        p.socialUntil=other.socialUntil=world.time+2.5;
        p.lastGreeting=other.lastGreeting=world.time;
        p.routineActivity=other.routineActivity='socializing';
        cells.delete(key);
      }else cells.set(key,p);
    }
  }
  // Real-world render cost: around 20 instanced pieces per nearby
  // character, while tiny eyes/ears/hands are hidden beyond readable range.
  // Update infrequently; avoid 210 distance checks every single frame.
  world.characterLODTick=(world.characterLODTick||0)-dt;
  if(world.characterLODTick<=0){
    world.characterLODTick=.52;
    const camera=world.scene?.activeCamera;
    const cp=camera?.globalPosition||camera?.position;
    if(cp)for(const person of world.civilians){
      if(!person.appearance?.details)continue;
      const dx=person.root.position.x-cp.x,
        dz=person.root.position.z-cp.z,dy=person.root.position.y-cp.y;
      const range=world.mobile?42:68;
      const detailed=(dx*dx+dz*dz+dy*dy)<range*range;
      if(person._detailVisible===detailed)continue;
      person._detailVisible=detailed;
      for(const part of person.appearance.details)part.setEnabled(detailed);
    }
  }
  const cam=world.scene?.activeCamera;
  const walkView=cam?.name==='street level spectator'&&cam?.position;
  for(const p of world.civilians){
    // Frustum culling is assisted only in walk mode. Do not cull everyone
    // when the orbit camera views the entire city from high altitude.
    if(!p.root||!p.identity)continue;
    if(p.ragdoll){p.root.setEnabled(false);continue}
    const far=walkView&&Math.hypot(p.root.position.x-cam.position.x,
      p.root.position.z-cam.position.z)>(world.mobile?68:110);
    if(p.visible===!!far){p.visible=!far;p.root.setEnabled(!far)}
  }
  for(const person of world.civilians){
    if(animateCitizenRagdoll(person,world,dt))continue;
    walkPedestrian(person,dt,world.time);
    const displacement=terrainDisplacement(person.root.position.x,person.root.position.z,
      world.terrainCraters||[]);
    // Walking, injured, sheltering and dead citizens must all remain on the
    // same physical terrain that the player collides with.
    const stance=person.state==='dead'?.4:person.state==='injured'?.15:
      person.state==='sheltering'?.07:PED_BASE_Y+Math.abs(Math.sin(person.walked))* .025;
    person.root.position.y=stance+displacement;
    if(person.state==='dead'||person.state==='evacuating')continue;
    // Falling debris and wrecked vehicles can also strike pedestrians.
    if(world.time%1<dt*4&&world.fragments.length){
      const hit=world.fragments.slice(0,75).some(fragment=>{
        const p=fragment.mesh.position;
        return p.y<3.5&&Math.hypot(p.x-person.root.position.x,p.z-person.root.position.z)<1.25&&
          fragment.aggregate?.body.getLinearVelocity().lengthSquared()>7;
      });
      if(hit)killCivilian(world,person);
    }
  }
}
