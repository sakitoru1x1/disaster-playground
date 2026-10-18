import {MeshBuilder,Vector3,StandardMaterial,Color3,PointLight} from '@babylonjs/core';
const V=(x,y,z)=>new Vector3(x,y,z);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export class CityFires{
 constructor(world){
  this.world=world;this.fires=new Map();this.clock=0;this.spreadClock=0;
  this.started=0;this.extinguished=0;this.maxFires=world.mobile?5:10;
  const scene=world.scene;
  this.flameMat=new StandardMaterial('ACTIVE FIRE BRIGHT ORANGE',scene);
  this.flameMat.diffuseColor=Color3.FromHexString('#ff4d1b');
  this.flameMat.emissiveColor=Color3.FromHexString('#f96a15');
  this.flameMat.disableLighting=true;this.flameMat.alpha=.92;
  this.coreMat=new StandardMaterial('ACTIVE FIRE HOT CORE',scene);
  this.coreMat.diffuseColor=Color3.FromHexString('#ffe687');
  this.coreMat.emissiveColor=Color3.FromHexString('#ff8b28');
  this.coreMat.disableLighting=true;this.coreMat.alpha=.84;
  this.smokeMat=new StandardMaterial('ACTIVE FIRE GREY SMOKE',scene);
  this.smokeMat.diffuseColor=Color3.FromHexString('#373b46');
  this.smokeMat.emissiveColor=Color3.FromHexString('#25282e');
  this.smokeMat.disableLighting=true;this.smokeMat.alpha=.44;
 }
 chooseAnchor(building){
  const intact=building.floors.filter(f=>!f.active);
  const floor=intact[Math.min(intact.length-1,Math.max(0,Math.floor(intact.length*.66)))];
  const y=floor?floor.mesh.position.y:2.4;
  const x=building.x+Math.max(3,building.floors[0]?.size?.x*.5||4);
  return V(x,y,building.z);
 }
 ignite(building,strength=.55){
  if(!building||this.fires.size>=this.maxFires)return false;
  const key=building.id;
  if(this.fires.has(key)){
   const old=this.fires.get(key);old.heat=Math.min(1,old.heat+strength*.24);
   return true;
  }
  const anchor=this.chooseAnchor(building),scene=this.world.scene;
  const flames=[],smoke=[];
  for(let i=0;i<3;i++){
   const f=MeshBuilder.CreateSphere('BUILDING FIRE FLAME',{diameter:1.8,segments:8},scene);
   f.position=anchor.add(V((i-1)*.9,i*.44,(i%2-.5)*1.6));
   f.scaling=V(.75,.9+(i%2)*.55,.65);f.material=i===1?this.coreMat:this.flameMat;
   f.isPickable=false;flames.push(f);
  }
  for(let i=0;i<3;i++){
   const cloud=MeshBuilder.CreateSphere('BUILDING FIRE DARK SMOKE',{diameter:2.8,segments:8},scene);
   cloud.position=anchor.add(V(i*.24,2.2+i*1.5,-.5));
   cloud.scaling=V(1.0+i*.30,.7+i*.22,1+i*.30);cloud.material=this.smokeMat;
   cloud.isPickable=false;smoke.push(cloud);
  }
  const light=!this.world.mobile&&this.fires.size<3
   ?new PointLight('FLICKERING FIRE LIGHT',anchor.add(V(0,2,0)),scene):null;
  if(light){light.diffuse=Color3.FromHexString('#ff7e37');light.range=15;light.intensity=3}
  this.fires.set(key,{building,x:building.x,z:building.z,anchor,flames,smoke,light,
   heat:clamp(strength,.25,1),age:0,lastDamage:0,extinguishing:0});
  this.started++;return true;
 }
 igniteNear(point,strength=.6,radius=28){
  if(strength<.24)return 0;
  const buildings=[...this.world.buildings,...(this.world.districtBuildings||[])];
  const candidates=buildings.filter(b=>distance(b,point)<radius&&
    !this.fires.has(b.id)).sort((a,b)=>distance(a,point)-distance(b,point));
  const count=Math.min(strength>.72?3:strength>.40?2:1,candidates.length);
  for(let i=0;i<count;i++)this.ignite(candidates[i],.38+strength*.36);
  return count;
 }
 isBurningNear(x,z,radius=17){
  for(const fire of this.fires.values())
   if(fire.heat>.03&&Math.hypot(x-fire.x,z-fire.z)<radius)return true;
  return false;
 }
 near(x,z,radius=20){
  return [...this.fires.values()].filter(f=>Math.hypot(x-f.x,z-f.z)<radius);
 }
 suppress(fire,amount){
  if(!fire||!this.fires.has(fire.building.id))return false;
  fire.extinguishing=1;
  fire.heat=Math.max(0,fire.heat-amount);
  if(fire.heat<=.02){
   for(const m of [...fire.flames,...fire.smoke])m.dispose();
   fire.light?.dispose();this.fires.delete(fire.building.id);
   this.extinguished++;this.world.audio?.play('pour',fire.anchor,.5);
   return true;
  }
  return false;
 }
 tick(dt){
  this.clock+=dt;this.spreadClock+=dt;
  for(const f of this.fires.values()){
   f.age+=dt;f.lastDamage+=dt;
   if(f.extinguishing>0)f.extinguishing=Math.max(0,f.extinguishing-dt*.25);
   else f.heat=clamp(f.heat+dt*.0015);
   const height=f.anchor.y;
   for(let i=0;i<f.flames.length;i++){
    const m=f.flames[i];m.scaling.y=(.85+Math.sin(f.age*7+i*1.9)*.30)*f.heat;
    m.scaling.x=(.70+Math.sin(f.age*3.7+i)*.14)*f.heat;
    m.position.y=height+i*.55+Math.sin(f.age*4+i)*.3;
    m.setEnabled(f.heat>.03);
   }
   for(let i=0;i<f.smoke.length;i++){
    const m=f.smoke[i];m.position.y=height+2+i*1.65+(f.age*.75%2);
    m.position.x=f.anchor.x+i*.32+Math.sin(f.age*.8+i)*.56;
    m.scaling.setAll((1+i*.22)*(.8+f.heat*.58));
   }
   if(f.light)f.light.intensity=(2.2+Math.sin(f.age*15)*.9)*f.heat;
   if(f.lastDamage>5.5&&f.heat>.35){
    f.lastDamage=0;
    // Flames attack a local intact floor, not all 200 structures.
    const entry=f.building.floors.find(e=>!e.active&&e.health>0);
    if(entry)this.world.damageStructure(entry,1.5+f.heat*2,
      V(0,2,0),f.anchor,'fire');
   }
  }
  if(this.spreadClock>17){
   this.spreadClock=0;
   const buildings=[...this.world.buildings,...(this.world.districtBuildings||[])];
   for(const fire of [...this.fires.values()]){
    if(fire.heat<.72)continue;
    const adjacent=buildings.find(b=>b.id!==fire.building.id&&
      !this.fires.has(b.id)&&distance(b,fire)<22);
    if(adjacent&&this.fires.size<this.maxFires)this.ignite(adjacent,.33);
   }
  }
 }
 stats(){return {burning:this.fires.size,started:this.started,extinguished:this.extinguished}}
}
