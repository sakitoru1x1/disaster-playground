import {
  MeshBuilder,Vector3,Quaternion,TransformNode,PhysicsAggregate,
  PhysicsShapeType,PhysicsMotionType
} from '@babylonjs/core';
import {
  pedestrianNode,choosePedestrianNext,
  positionOnRoute,trafficHeading,SIDEWALK_COORDS
} from './cityMotion.js';

const V=(x,y,z)=>new Vector3(x,y,z);
const rand=(a,b)=>a+(b-a)*Math.random();
const pick=a=>a[Math.floor(Math.random()*a.length)];
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

  // A connected grid of safe footpaths around the 26m city blocks.
  // Pedestrians cross at intersections and turn instead of standing in place.
  const count=world.mobile?14:Math.max(22,Math.min(30,Math.round(world.buildingCount*1.15)));
  for(let i=0;i<count;i++){
    const nodeI=Math.floor(Math.random()*SIDEWALK_COORDS.length);
    const nodeJ=Math.floor(Math.random()*SIDEWALK_COORDS.length);
    const here=pedestrianNode(nodeI,nodeJ);
    const target=choosePedestrianNext(nodeI,nodeJ,null,null,false);
    const root=new TransformNode('city pedestrian '+i,world.scene);
    root.position=V(here.x,PED_BASE_Y,here.z);
    const jacket=pick(m.pedShirts);
    const torso=MeshBuilder.CreateBox('person torso',{width:.6,height:.83,depth:.33},world.scene);
    torso.parent=root;torso.position.y=1.20;torso.material=jacket;
    const head=MeshBuilder.CreateSphere('person head',{diameter:.43,segments:7},world.scene);
    head.parent=root;head.position.y=1.94;head.material=m.pedHeads;
    const legs=[],arms=[];
    for(const side of [-1,1]){
      const leg=MeshBuilder.CreateBox('person leg',{width:.18,height:.69,depth:.20},world.scene);
      leg.parent=root;leg.position=V(side*.18,.42,0);leg.material=m.pedPants;legs.push(leg);
      const arm=MeshBuilder.CreateBox('person arm',{width:.15,height:.7,depth:.2},world.scene);
      arm.parent=root;arm.position=V(side*.42,1.18,0);arm.material=jacket;arms.push(arm);
    }
    root.getChildMeshes().forEach(mesh=>mesh.isPickable=false);
    const pace=rand(1.3,2.2);
    world.civilians.push({root,x:here.x,z:here.z,state:'walking',panic:0,exposure:0,
      threat:V(here.x+3,0,here.z+3),walkPhase:rand(0,7),speed:pace,
      node:[nodeI,nodeJ],target,previous:null,legs,arms,walked:0});
  }
}

function killCivilian(world,p){
  if(p.state==='dead')return;
  p.state='dead';p.panic=0;world.civilianDeaths++;
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
  car.wrecked=true;world.carsWrecked++;
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
    const x=p.root.position.x,z=p.root.position.z;
    const distance=kind==='quake'?0:kind==='tsunami'?Math.abs(x-center.x):
      Math.hypot(x-center.x,z-center.z);
    if(distance>radius)continue;
    const falloff=kind==='quake'?1:clamp(1-distance/Math.max(1,radius),0,1);
    p.threat=V(center.x,0,center.z);
    p.panic=Math.max(p.panic,Math.min(8,2+6*strength));
    p.state='fleeing';
    if(strength>.52){
      const lethality=Math.pow((strength-.52)/.48,1.4)*
        (kind==='quake'?.8:kind==='tsunami'?.9:.6+.4*falloff);
      p.exposure+=dt*lethality*3.0;
      if(p.exposure>.32+((p.root.uniqueId*17)%15)*.035)killCivilian(world,p);
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
  const [i,j]=person.node;
  person.previous=person.node;
  person.node=person.target;
  person.target=choosePedestrianNext(person.node[0],person.node[1],
    person.previous,person.threat,person.panic>0);
}
function walkPedestrian(person,dt){
  if(person.state==='dead')return;
  const root=person.root, running=person.panic>0;
  if(running)person.panic=Math.max(0,person.panic-dt);
  person.state=running?'fleeing':'walking';
  const pace=person.speed*(running?2.8:1);
  let remaining=dt*pace;
  let attempts=0;
  while(remaining>0&&attempts++<3){
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
    if(blockedByAnotherCar(world,car,destination))continue;
    t.distance=actualDist;
    t.heading=trafficHeading(t.route,t.distance);
    const q=Quaternion.FromEulerAngles(0,t.heading,0);
    tempPosition.set(destination.x,1,destination.z);
    car.aggregate.body.setTargetTransform(tempPosition,q);
    t.lastPosition.copyFrom(tempPosition);
  }
}
export function updateCityLife(world,dt){
  updateTraffic(world,dt);
  for(const person of world.civilians){
    walkPedestrian(person,dt);
    if(person.state==='dead')continue;
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
