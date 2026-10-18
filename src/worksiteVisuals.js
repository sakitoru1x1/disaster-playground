import {MeshBuilder,Vector3} from '@babylonjs/core';
const V=(x,y,z)=>new Vector3(x,y,z);
const near=(a,b,r)=>Math.hypot(a.x-b.x,a.z-b.z)<r;
export function siteMustPause(site,dispatcher){
 return !!(site.fire||site.victims||dispatcher?.isSecuring?.(site)||
   dispatcher?.isFireWorksite?.(site));
}
// Reusable site dressing. Set dressing belongs to a single phase and is
// reused rather than allocating meshes for every new construction lot.
export class WorksiteVisuals{
 constructor(world){
  this.world=world;this.maxSites=world.mobile?3:6;
  this.pool=[];this.active=new Map();this.demarcated=0;this.lastUpdate=0;
  this.matOrange=world.mat('workzone barrier warning orange','#ee8934');
  this.matWhite=world.mat('workzone barrier white','#ffe5bf');
  this.matRed=world.mat('workzone construction safety red','#e54833');
  this.matSteel=world.mat('workzone supplies steel','#73858b');
 }
 make(){
  const w=this.world;
  const root=MeshBuilder.CreateBox('WORKSITE CORNER ANCHOR',{size:.02},w.scene);
  root.isVisible=false;root.isPickable=false;
  const elements=[];
  // A visible four-sided cordon, not a teleport marker.
  for(let edge=0;edge<4;edge++){
   const side=edge%2===0?-1:1,axis=edge<2?'x':'z';
   const barrier=w.box('CONSTRUCTION SAFETY BARRIER',
    axis==='x'?[12,.55,.13]:[.13,.55,12],
    axis==='x'?V(0,.45,side*8):V(side*8,.45,0),
    this.matWhite,root);
   elements.push(barrier);
   const stripes=w.box('WORKZONE ORANGE STRIPE',
    axis==='x'?[11,.18,.16]:[.16,.18,11],
    axis==='x'?V(0,.48,side*8):V(side*8,.48,0),
    this.matOrange,root);elements.push(stripes);
  }
  const cones=[];
  for(const x of [-8,8])for(const z of [-8,8]){
   const cone=MeshBuilder.CreateCylinder('WORKSITE TRAFFIC CONE',
    {diameterTop:.1,diameterBottom:.72,height:1.02,tessellation:7},w.scene);
   cone.parent=root;cone.position=V(x,.5,z);cone.material=this.matOrange;
   cone.isPickable=false;cones.push(cone);elements.push(cone);
  }
  const materialPallet=w.box('DELIVERED CONSTRUCTION PALLET',
    [3,.38,2.4],V(3,.28,-5),this.matSteel,root);
  const blocks=[];
  for(let i=0;i<4;i++)blocks.push(w.box('STACKED PREFAB CONCRETE STOREY',
    [2.5,.36,1.8],V(3,.55+i*.38,-5),this.matWhite,root));
  // Two high-vis construction crew, legs animate only while crane is active.
  const workers=[];
  const helmet=w.mat('WORKSITE HELMET YELLOW','#f5cb42');
  for(let i=0;i<2;i++){
   const worker=w.box('BUILDER HI VIS VEST',[.62,.83,.38],V(i?4:-3,1.21,4),
      this.matOrange,root);
   const head=w.cylinder('CONSTRUCTION CREW HELMET',.56,.38,
     V(i?4:-3,1.97,4),helmet,7,root);
   const legs=[];
   for(const side of [-1,1])legs.push(w.box('BUILDER LEG',
      [.18,.75,.20],V((i?4:-3)+side*.17,.41,4),this.matSteel,root));
   workers.push({worker,head,legs});
   elements.push(worker,head,...legs);
  }
  root.setEnabled(false);
  return {root,elements,cones,materialPallet,blocks,workers,key:null,phase:null,age:0};
 }
 allocate(){
  if(this.pool.length>=this.maxSites)return null;
  const instance=this.make();this.pool.push(instance);return instance;
 }
 claim(site,stage){
  if(!site||stage==='sweep')return;
  const current=this.active.get(site.key);
  if(current){current.phase=stage;return}
  const instance=this.pool.find(x=>!x.key)||this.allocate();
  if(!instance)return;
  instance.key=site.key;instance.phase=stage;instance.age=0;
  instance.root.position.set(site.x,.10,site.z);
  instance.root.setEnabled(true);
  this.active.set(site.key,instance);
  this.demarcated++;
 }
 update(dt,parallel){
  for(const [key,instance] of this.active){
   const site=parallel.sites.get(key),phase=site?.claimed?.build?'build':
     site?.claimed?.fill?'fill':null;
   if(!site||!phase||site.fire||site.victims){
    instance.root.setEnabled(false);instance.key=null;instance.phase=null;
    this.active.delete(key);continue;
   }
   instance.phase=phase;instance.age+=dt;
   const building=phase==='build';
   instance.materialPallet.setEnabled(building);
   instance.blocks.forEach(b=>b.setEnabled(building));
   for(let i=0;i<instance.workers.length;i++){
    const w=instance.workers[i];
    w.worker.setEnabled(building);w.head.setEnabled(building);
    w.legs.forEach((leg,j)=>{
     leg.setEnabled(building);
     leg.rotation.x=building?Math.sin(instance.age*3+j*Math.PI+i)*.25:0;
    });
   }
  }
 }
 stats(){return {active:this.active.size,pool:this.pool.length,
   barriers:this.active.size*4,workers:[...this.active.values()].filter(i=>i.phase==='build').length*2}}
}
