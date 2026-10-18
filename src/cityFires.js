import {MeshBuilder,Vector3,StandardMaterial,Color3,PointLight} from '@babylonjs/core';
import {terrainDisplacement} from './terrainDamage.js';
const V=(x,y,z)=>new Vector3(x,y,z);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
// An actual building fire needs a physical support surface. Don't leave
// burning window decals hovering where a damaged storey used to be.
// Only floors supported from the foundation upward count as standing.
export function supportedFireAnchor(building,terrainHeight=0){
 if(!building?.floors?.length)return V(building?.x||0,terrainHeight+.85,building?.z||0);
 const standing=[];
 for(const floor of building.floors){
  if(floor.active||!floor.mesh||floor.mesh.isDisposed?.()||
     floor.mesh.isEnabled?.()===false)break;
  standing.push(floor);
 }
 if(!standing.length)return V(building.x,terrainHeight+.85,building.z);
 const floor=standing[Math.floor((standing.length-1)*.67)];
 const p=floor.mesh.getAbsolutePosition?.()||floor.mesh.position;
 const offset=Math.max(1.1,Math.min(floor.size?.x||5,floor.size?.z||5)*.43);
 // Keep the flame on the side of this *remaining* facade, not beyond it.
 return V(p.x+offset,p.y,p.z);
}
export class CityFires{
 constructor(world){
  this.world=world;this.fires=new Map();this.clock=0;this.spreadClock=0;
  this.started=0;this.extinguished=0;this.maxFires=world.mobile?5:10;
  this.effectsUpdated=0;this.effectsSkipped=0;this.maxEmbers=world.mobile?3:7;
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
  this.smokeMat.disableLighting=true;this.smokeMat.alpha=.36;
  this.emberMat=new StandardMaterial('FIRE FLYING SPARKS',scene);
  this.emberMat.diffuseColor=Color3.FromHexString('#ffd07e');
  this.emberMat.emissiveColor=Color3.FromHexString('#ffae47');
  this.emberMat.disableLighting=true;
 }
 chooseAnchor(building){
  const ground=terrainDisplacement(building.x,building.z,
    this.world.terrainCraters||[]);
  return supportedFireAnchor(building,ground);
 }
 positionEffects(f){
  // Re-evaluate support each frame: falling/detached walls cannot continue
  // to display floating fire and the smoke must follow the new burn site.
  f.anchor.copyFrom(this.chooseAnchor(f.building));
  const anchor=f.anchor,heat=f.heat;
  const camera=this.world.scene.activeCamera;
  const observer=camera?.globalPosition||camera?.position||anchor;
  const distance=Math.hypot(observer.x-anchor.x,observer.z-anchor.z,
    (observer.y-anchor.y)*.52);
  const drawRadius=this.world.mobile?185:340;
  // Switch off secondary meshes at long range. Physics and extinguishing
  // continue unaffected while expensive translucent smoke isn't drawn.
  const distant=distance>drawRadius;
  if(distant&&f.age-f.lastVisualUpdate<.24){this.effectsSkipped++;return}
  f.lastVisualUpdate=f.age;this.effectsUpdated++;
  for(let i=0;i<f.flames.length;i++){
   const mesh=f.flames[i];
   mesh.position.set(anchor.x+(i-1)*.9,
     anchor.y+i*.55+Math.sin(f.age*4+i)*.3,
     anchor.z+(i%2-.5)*1.6);
   mesh.scaling.y=(.85+Math.sin(f.age*7+i*1.9)*.30)*heat;
   mesh.scaling.x=(.70+Math.sin(f.age*3.7+i)*.14)*heat;
   mesh.setEnabled(heat>.03&&(!distant||i===1));
  }
  for(let i=0;i<f.smoke.length;i++){
   const mesh=f.smoke[i];
   mesh.position.set(anchor.x+i*.24+Math.sin(f.age*.8+i)*.56,
     anchor.y+2+i*1.65+(f.age*.75%2),anchor.z-.5);
   mesh.scaling.setAll((1+i*.22)*(.8+heat*.58));
   mesh.setEnabled(heat>.03&&(!distant||i===0));
  }
  for(let i=0;i<f.embers.length;i++){
   const m=f.embers[i],phase=(f.age*.38+(i+.5)/f.embers.length)%1;
   m.position.set(anchor.x+Math.sin(f.age*2.7+i*2.1)*(phase*1.15+.3),
     anchor.y+.55+phase*5.2,
     anchor.z+Math.cos(f.age*1.9+i*2.2)*(phase*.95+.3));
   const size=.6*(1-phase)*heat+.04;
   m.scaling.setAll(size);
   m.setEnabled(!distant&&heat>.16);
  }
  if(f.light){
   f.light.position.copyFrom(anchor).addInPlaceFromFloats(0,2,0);
   f.light.intensity=distant?0:(2.2+Math.sin(f.age*15)*.9)*heat;
  }
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
   const f=MeshBuilder.CreateCylinder('BUILDING FIRE FLAME',
     {diameterTop:.08,diameterBottom:1.85,height:2.35,tessellation:7},scene);
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
  // Every ember is reused for the lifetime of this fire; no per-frame
  // allocations and only three on mobile.
  const embers=[];
  for(let i=0;i<this.maxEmbers;i++){
   const m=MeshBuilder.CreateSphere('FIRE RISING EMBER',
     {diameter:.30,segments:5},scene);
   m.material=this.emberMat;m.isPickable=false;embers.push(m);
  }
  const light=!this.world.mobile&&this.fires.size<3
   ?new PointLight('FLICKERING FIRE LIGHT',anchor.add(V(0,2,0)),scene):null;
  if(light){light.diffuse=Color3.FromHexString('#ff7e37');light.range=15;light.intensity=3}
  this.fires.set(key,{building,x:building.x,z:building.z,anchor,
   flames,smoke,embers,light,lastVisualUpdate:-1,
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
   for(const m of [...fire.flames,...fire.smoke,...fire.embers])m.dispose();
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
   this.positionEffects(f);
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
 stats(){return {burning:this.fires.size,started:this.started,extinguished:this.extinguished,
   embers:this.fires.size*this.maxEmbers,effectsUpdated:this.effectsUpdated,
   effectsSkipped:this.effectsSkipped}}
}
