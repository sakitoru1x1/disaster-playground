import {MeshBuilder,Vector3,TransformNode,PhysicsAggregate,PhysicsShapeType} from '@babylonjs/core';
const V=(x,y,z)=>new Vector3(x,y,z);
const rand=(a,b)=>a+(b-a)*Math.random();
const pick=a=>a[Math.floor(Math.random()*a.length)];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export function populateCityLife(world){
  world.civilians=[];world.lifeMarks=[];
  world.civilianDeaths=0;world.carsWrecked=0;
  const m=world.materials;
  m.pedHeads=world.mat('citizen skin','#d7b49a');
  m.pedShirts=['#c88770','#638ba6','#dbc17c','#92a28f'].map((x,i)=>world.mat('citizen jacket '+i,x));
  m.pedPants=world.mat('citizen trousers','#323c4d');
  m.wreck=world.mat('vehicle impact soot','#34363a');
  m.stain=world.mat('small ground injury stain','#77332d',{alpha:.58,disableLighting:true});
  // Low-poly silhouettes with no costly skinned meshes or added Havok bodies.
  const count=world.mobile?6:Math.max(8,Math.min(16,Math.round(world.buildingCount*.62)));
  const roads=[-39,-13,13,39];
  for(let i=0;i<count;i++){
    let x,z;
    for(let tries=0;tries<12;tries++){
      x=pick(roads)+pick([-5,5])+rand(-.5,.5);
      z=rand(-67,67);
      if(!world.findBuildingAt(x,z,1))break;
    }
    const root=new TransformNode('city pedestrian '+i,world.scene);
    root.position=V(x,.48,z);
    const jacket=pick(m.pedShirts);
    const body=MeshBuilder.CreateBox('person torso',{width:.6,height:.83,depth:.33},world.scene);
    body.parent=root;body.position.y=1.20;body.material=jacket;
    const head=MeshBuilder.CreateSphere('person head',{diameter:.43,segments:7},world.scene);
    head.parent=root;head.position.y=1.94;head.material=m.pedHeads;
    for(const side of [-1,1]){
      const leg=MeshBuilder.CreateBox('person leg',{width:.18,height:.69,depth:.20},world.scene);
      leg.parent=root;leg.position=V(side*.18,.42,0);leg.material=m.pedPants;
      const arm=MeshBuilder.CreateBox('person arm',{width:.15,height:.7,depth:.2},world.scene);
      arm.parent=root;arm.position=V(side*.42,1.18,0);arm.material=jacket;
    }
    root.getChildMeshes().forEach(mesh=>mesh.isPickable=false);
    world.civilians.push({root,x,z,state:'walking',panic:0,exposure:0,
      threat:V(x+rand(-5,5),0,z+rand(-5,5)),walkPhase:rand(0,7),
      speed:rand(2.4,4.1),groundX:x,groundZ:z});
  }
}

function killCivilian(world,p){
  if(p.state==='dead')return;
  p.state='dead';p.panic=0;world.civilianDeaths++;
  p.root.rotation.z=rand(-1.44,-1.13);
  p.root.rotation.y=rand(-2,2);
  p.root.position.y=.4;
  // Small stylized surface mark, not a detailed injury effect.
  const mark=MeshBuilder.CreateDisc('pedestrian ground stain',{radius:rand(.31,.53),tessellation:10},world.scene);
  mark.rotation.x=Math.PI/2;
  mark.position=V(p.root.position.x,.29,p.root.position.z);
  mark.material=world.materials.stain;
  mark.isPickable=false;
  world.lifeMarks.push(mark);
  if(world.lifeMarks.length>20)world.lifeMarks.shift().dispose();
}
function damageCar(world,car,power,direction){
  if(car.wrecked||car.type!=='car'||!car.aggregate)return;
  car.damage=(car.damage||0)+power;
  if(car.damage<1.1)return;
  car.wrecked=true;world.carsWrecked++;
  const child=car.mesh.getChildMeshes().find(m=>m.name==='vehicle windows');
  if(child){child.scaling.y*=.48;child.rotation.z=rand(-.26,.26);child.material=world.materials.wreck}
  // Crush the cabin/hood, lose a wheel and scatter a little impact debris.
  const hood=MeshBuilder.CreateBox('crushed vehicle hood',{width:1.15,height:.14,depth:1.5},world.scene);
  hood.parent=car.mesh;hood.position=V(1.05,.56,0);hood.rotation.z=rand(-.22,-.09);
  hood.material=world.materials.wreck;hood.isPickable=false;
  car.mesh.material=world.materials.wreck;
  const wheel=car.mesh.getChildMeshes().find(mesh=>mesh.name==='vehicle wheel');
  if(wheel&&world.debris.length<world.maxDebris){
    const oldPos=wheel.getAbsolutePosition().clone();
    wheel.parent=null;wheel.position.copyFrom(oldPos);
    const aggregate=new PhysicsAggregate(wheel,PhysicsShapeType.BOX,{mass:2,friction:.8,restitution:.2},world.scene);
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
    if(strength<.36){
      if(!car.wrecked&&world.time-(car.lastFleeTime||-10)>1.7){
        car.lastFleeTime=world.time;
        body.applyImpulse(outward.scale(2.5+strength*12),pos);
      }
    }else if(world.time-(car.lastDamageTime||-10)>.65){
      car.lastDamageTime=world.time;
      damageCar(world,car,strength*.48+.18,outward);
    }
  }
}
export function updateCityLife(world,dt){
  for(const person of world.civilians){
    if(person.state==='dead')continue;
    person.walkPhase+=dt*8;
    if(person.panic>0){
      person.panic-=dt;
      const p=person.root.position;
      const delta=V(p.x-person.threat.x,0,p.z-person.threat.z);
      if(delta.lengthSquared()<.3)delta.set(rand(-1,1),0,rand(-1,1));
      delta.normalize();
      const pace=(5.8+person.speed)*dt;
      p.x=clamp(p.x+delta.x*pace,-80,80);
      p.z=clamp(p.z+delta.z*pace,-80,80);
      person.root.rotation.y=Math.atan2(delta.x,delta.z);
      person.root.position.y=.48+Math.abs(Math.sin(person.walkPhase))*.08;
    }else{
      person.state='walking';person.root.position.y=.48+Math.abs(Math.sin(person.walkPhase*.27))*.025;
    }
    // Falling debris or a wrecked vehicle can also strike pedestrians.
    if(world.time%1<dt*4&&world.fragments.length){
      const hit=world.fragments.slice(0,75).some(fragment=>{
        const p=fragment.mesh.position;
        return p.y<3.5&&Math.hypot(p.x-person.root.position.x,p.z-person.root.position.z)<1.25 &&
          fragment.aggregate?.body.getLinearVelocity().lengthSquared()>7;
      });
      if(hit)killCivilian(world,person);
    }
  }
}