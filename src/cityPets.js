import {TransformNode,Vector3} from '@babylonjs/core';
import {terrainDisplacement} from './terrainDamage.js';
import {CITY_HALF_SIZE} from './cityLayout.js';
import {SIDEWALK_COORDS,choosePedestrianNext} from './cityMotion.js';
import {petHearingGain} from './recordedAudio.js';
const V=(x,y,z)=>new Vector3(x,y,z);
const rand=(a,b)=>a+(b-a)*Math.random();
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
export function petDisasterForce(kind,p,center,power,radius){
 const dx=p.x-center.x,dz=p.z-center.z;
 const distance=kind==='tsunami'?Math.abs(dx):Math.hypot(dx,dz);
 const f=clamp((radius-Math.max(.5,distance))/radius)*power;
 if(f<=0)return {x:0,y:0,z:0,falloff:0};
 if(kind==='tornado'){
  const d=Math.max(1,Math.hypot(dx,dz));
  return {x:(-dx/d*12-dz/d*23)*f,
   y:(15+30*f)*f,z:(-dz/d*12+dx/d*23)*f,falloff:f};
 }
 if(kind==='tsunami')return {x:32*f,y:12*f,z:Math.sin(p.z*.4)*9*f,falloff:f};
 return {x:dx*f*3,y:3*f,z:dz*f*3,falloff:f};
}
export function spawnPets(world){
 const m={};
 m.cat=[world.mat('CAT ORANGE FUR','#b78554'),world.mat('CAT GREY FUR','#787d80'),
  world.mat('CAT WHITE FUR','#cbd2d6')];
 m.dog=[world.mat('DOG CARAMEL FUR','#aa825c'),world.mat('DOG DARK FUR','#59504b'),
  world.mat('DOG LIGHT FUR','#c2a48a')];
 m.nose=world.mat('PET NOSE','#292c2b');m.eye=world.mat('PET EYES','#f6df92');
 world.pets=[];
 const count=world.mobile?10:20;
 for(let i=0;i<count;i++){
  const kind=i%3?'dog':'cat',cat=kind==='cat';
  const root=new TransformNode('CITY '+kind.toUpperCase()+' '+i,world.scene);
  const palette=m[kind][Math.floor(i/3)%3];
  // Spawn on actual sidewalk junctions, not inside a building or ocean.
  const a=Math.floor(rand(1,SIDEWALK_COORDS.length-1));
  const b=Math.floor(rand(1,SIDEWALK_COORDS.length-1));
  const first=choosePedestrianNext(a,b);
  root.position=V(SIDEWALK_COORDS[a],.24,SIDEWALK_COORDS[b]);
  const body=world.box(kind+' animal body',cat?[.45,.55,1.02]:[.70,.78,1.4],
    V(0,cat?.64:.84,0),palette,root);
  const head=world.box(kind+' visible head',cat?[.54,.51,.52]:[.7,.65,.73],
    V(0,cat?.90:1.14,cat?.55:.77),palette,root);
  const snout=world.box(kind+' muzzle',[cat?.28:.42,.19,cat?.22:.32],
    V(0,cat?.80:1.0,cat?.86:1.17),m.nose,root);
  for(const s of [-1,1]){
   const ear=world.box(kind+' ear',[.16,cat?.31:.42,.20],
     V(s*(cat?.2:.26),cat?1.22:1.48,cat?.57:.78),palette,root);
   ear.rotation.z=s*(cat?-.17:.18);
   world.box(kind+' eye',[.11,.10,.08],
     V(s*(cat?.19:.23),cat?1.0:1.27,cat?.84:1.13),m.eye,root);
  }
  const legs=[];
  for(const side of [-1,1])for(const front of [-1,1]){
   const leg=world.box(kind+' walking paw',[cat?.17:.21,cat?.43:.62,cat?.18:.22],
    V(side*(cat?.17:.27),cat?.30:.40,front*(cat?.33:.50)),palette,root);
   legs.push(leg);
  }
  const tail=world.box(kind+' tail',[.12,.14,cat?.85:.64],
    V(0,cat?.89:.97,cat?-.85:-1.03),palette,root);
  tail.rotation.x=cat?.38:-.48;
  root.getChildMeshes().forEach(x=>x.isPickable=false);
  world.pets.push({kind,root,body,head,legs,tail,health:100,
    state:'wandering',heading:rand(-Math.PI,Math.PI),speed:cat?2.5:3.2,
    turn:rand(.1,3.2),wander:rand(2,6),voice:rand(3,13),stride:rand(0,9),
    node:[a,b],next:first,
    velocity:V(0,0,0),airborne:false,age:0});
 }
 return world.pets.length;
}
export function affectPets(world,kind,center,power,radius,dt){
 for(const pet of world.pets||[]){
  const force=petDisasterForce(kind,pet.root.position,center,power,radius);
  if(force.falloff<.14)continue;
  if(['tornado','tsunami'].includes(kind)){
   if(!pet.airborne){
    pet.airborne=true;pet.age=0;pet.state='thrown';
    pet.velocity=V(force.x,Math.max(9,force.y),force.z);
    world.audio?.play(pet.kind==='cat'?'catPanic':'dogPanic',pet.root.position,.72);
   }else{
    pet.velocity.x+=force.x*dt*1.05;
    pet.velocity.y+=force.y*dt*.68;
    pet.velocity.z+=force.z*dt*1.05;
   }
  }else{
   pet.heading=Math.atan2(pet.root.position.x-center.x,
     pet.root.position.z-center.z);
   pet.state='running';pet.wander=Math.max(pet.wander,5);
  }
 }
}
export function updatePets(world,dt){
 const camera=world.scene?.activeCamera;
 const listener=camera?.globalPosition||camera?.position||null;
 for(const pet of world.pets||[]){
  const p=pet.root.position;
  if(pet.airborne){
   pet.age+=dt;pet.velocity.y-=15*dt;
   p.addInPlace(pet.velocity.scale(dt));
   pet.root.rotation.z+=dt*(pet.kind==='cat'?3.3:2.6);
   pet.root.rotation.x+=dt*1.5;
   for(let i=0;i<pet.legs.length;i++)pet.legs[i].rotation.x=Math.sin(pet.age*13+i)*.7;
   if(p.y<.25+terrainDisplacement(p.x,p.z,world.terrainCraters||[])&&pet.age>.3){
    p.y=.25+terrainDisplacement(p.x,p.z,world.terrainCraters||[]);
    pet.airborne=false;pet.velocity.setAll(0);
    pet.root.rotation.x=0;pet.root.rotation.z=0;
    pet.state='running';pet.wander=rand(2,5);
   }
   continue;
  }
  pet.wander-=dt;pet.voice-=dt;pet.turn-=dt;
  if(pet.wander<0){pet.wander=rand(3,9);pet.state='wandering'}
  if(pet.turn<0){pet.turn=rand(1,4);pet.heading+=rand(-1.4,1.4)}
  // Route through pedestrian intersections, with a low-cost four-neighbor
  // graph: cats and dogs no longer walk straight through apartment walls.
  const [ni,nj]=pet.next||pet.node;
  const gx=SIDEWALK_COORDS[ni],gz=SIDEWALK_COORDS[nj];
  const dx=gx-p.x,dz=gz-p.z,dist=Math.hypot(dx,dz);
  const speed=pet.speed*(pet.state==='running'?1.65:.65);
  if(dist<Math.max(.35,speed*dt)){
   p.x=gx;p.z=gz;
   const prev=pet.node;pet.node=[ni,nj];
   pet.next=choosePedestrianNext(ni,nj,prev);
  }else{
   p.x+=dx/dist*speed*dt;
   p.z+=dz/dist*speed*dt;
  }
  p.y=.24+terrainDisplacement(p.x,p.z,world.terrainCraters||[]);
  if(dist>.05){pet.heading=Math.atan2(dx,dz);pet.root.rotation.y=pet.heading;}
  pet.stride+=dt*speed*3.4;
  pet.legs.forEach((leg,i)=>leg.rotation.x=Math.sin(pet.stride+(i%3?Math.PI:0))*.33);
  pet.tail.rotation.y=Math.sin(world.time*3+pet.stride*.15)*.36;
  if(pet.voice<=0){
   pet.voice=rand(9,24);
   if(petHearingGain(p,listener)>0)
    world.audio?.play(pet.kind==='cat'?'catMeow':'dogBark',p,.45);
  }
 }
}
