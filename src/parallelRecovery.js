import {RecoveryConvoy,recoverySite} from './cityRecovery.js';
import {civilianPosition} from './citizenRagdolls.js';
import {WorksiteVisuals} from './worksiteVisuals.js';
import {siteMustPause} from './worksiteVisuals.js';

// Independent local lots. Work at lot A can be in concrete while the
// helicopter is still carrying real wreckage away from lot B.
const near=(a,b,r=15)=>Math.hypot(a.x-b.x,a.z-b.z)<r;
const damaged=b=>b.floors.some(f=>f.active||f.health<f.maxHealth);
export function recoverySiteStatus(site){
 if(site.fire||site.victims)return 'blocked';
 if(!site.cleared)return 'cleanup';
 if(site.craters>0)return 'concrete';
 if(site.damaged)return 'construction';
 return 'complete';
}
export class ParallelRecovery{
 constructor(world,progression){
  this.world=world;this.progression=progression;
  this.maxHelis=world.mobile?2:4;
  this.maxMixers=world.mobile?1:2;
  this.maxCranes=world.mobile?1:2;
  this.units={sweep:[],fill:[],build:[]};
  this.sites=new Map();this.ids=0;this.clock=0;
  this.removed=0;this.filled=0;this.completed=0;
  this.stage='sweep';this.phase='idle';this.heli=null;this.crane=null;this.mixer=null;
  this.eventCount=0;this.worksites=world.scene&&world.box?new WorksiteVisuals(world):null;
 }
 event(){
  // Newly damaged properties are re-assessed. Active machinery returns to
  // depot rather than continuing to pour/build during a second catastrophe.
  for(const pool of Object.values(this.units))for(const unit of pool)unit.event();
  this.sites.clear();this.eventCount++;this.stage='sweep';this.phase='idle';
  this.worksites?.update(0,this);
 }
 hasNearbyVictim(site){
  for(const p of this.world.civilians||[]){
   if(p.state!=='injured')continue;
   if(near(civilianPosition(p),site,14))return true;
  }
  return false;
 }
 isBurning(site){
  return !!this.progression.fires?.isBurningNear(site.x,site.z,14);
 }
 gather(){
  const w=this.world,buildings=[...(w.buildings||[]),...(w.districtBuildings||[])];
  const usedCrater=new Set();
  for(const b of buildings){
   const key='b'+b.id,existing=this.sites.get(key);
   const craters=(w.terrainCraters||[]).filter(c=>near(c,b,16));
   craters.forEach(c=>usedCrater.add(c));
   const broken=b.floors.some(e=>e.active);
   const affected=damaged(b);
   if(!broken&&!affected&&!craters.length&&!existing)continue;
   const site=existing||{key,x:b.x,z:b.z,building:b,cleared:!broken,
     complete:false,priority:1,claimed:{},touched:false};
   site.damaged=affected;site.craters=craters.length;site.crater=craters[0]||null;
   site.fire=this.isBurning(site);site.victims=this.hasNearbyVictim(site);
   if(broken&&!existing)site.cleared=false;
   if(!existing)this.sites.set(key,site);
   if(site.complete&&affected){site.complete=false;site.cleared=!broken}
  }
  for(const crater of w.terrainCraters||[]){
   if(usedCrater.has(crater))continue;
   if(!crater._recoveryId)crater._recoveryId=++this.ids;
   const key='c'+crater._recoveryId;
   const debrisNearby=['fragments','debris','visualFragments','rubble',
     'staticRubbleBatches'].some(group=>(w[group]||[]).some(item=>{
       const mesh=item.mesh||item;
       if(!mesh||mesh.isDisposed?.())return false;
       const pos=mesh.getAbsolutePosition?.()||mesh.position;
       return pos&&near(pos,crater,crater.radius+4);
     }));
   const site=this.sites.get(key)||{key,x:crater.x,z:crater.z,building:null,
     cleared:!debrisNearby,claimed:{},touched:false};
   site.crater=crater;site.craters=1;site.damaged=false;
   site.fire=this.isBurning(site);site.victims=this.hasNearbyVictim(site);
   this.sites.set(key,site);
  }
  // Road/pedestrian rubble outside a building footprint also requires a
  // helicopter, but nearby chunks are processed in ONE lift.
  const tracked=new Set(this.sites.keys());
  for(let i=0;i<Math.max(0,8-tracked.size);i++){
   const extra=recoverySite(w,tracked);
   if(!extra)break;
   tracked.add(extra.key);
   if(this.sites.has(extra.key))continue;
   if([...this.sites.values()].some(s=>near(s,extra,15)))continue;
   this.sites.set(extra.key,{...extra,cleared:false,craters:0,
     damaged:false,fire:false,victims:this.hasNearbyVictim(extra),
     claimed:{},touched:false});
  }
  // Remove stale crater-only lots after the mixer is finished.
  for(const site of this.sites.values()){
   if(site.key.startsWith('c')&&site.crater&&
      !w.terrainCraters.includes(site.crater))site.craters=0;
  }
 }
 jobs(stage){
  const pool=[...this.sites.values()].filter(s=>{
   if(s.complete||s.claimed[stage]||siteMustPause(s,this.progression.dispatch))return false;
   if(stage==='sweep')return !s.cleared;
   if(stage==='fill')return s.cleared&&s.craters>0;
   return s.cleared&&!s.craters&&s.damaged;
  });
  pool.sort((a,b)=>{
   const severity=s=>s.building?.floors.filter(f=>f.active).length||0;
   return severity(b)-severity(a);
  });
  return pool;
 }
 assign(stage,limit){
  const queue=this.jobs(stage),pool=this.units[stage];
  if(!queue.length)return;
  for(let index=0;index<limit&&queue.length;index++){
   let unit=pool[index];
   if(!unit){unit=new RecoveryConvoy(this.world,this.progression,{manual:true});pool[index]=unit}
   if(unit.phase!=='idle')continue;
   const site=queue.shift();
   // Keep neighboring crane rigs from overlapping, but don't block other
   // categories: helicopter at B can coexist with concrete at A.
   if(stage==='build'&&pool.some(p=>p.phase!=='idle'&&p.site&&near(p.site,site,28))){
    continue;
   }
   site.claimed[stage]=unit;
   this.worksites?.claim(site,stage);
   const target={...site,crater:site.crater,radius:17};
   if(stage==='fill'&&site.crater){
    target.x=site.crater.x;target.z=site.crater.z;
   }
   unit.start(stage,target);
   site.touched=true;
  }
 }
 tick(dt){
  const w=this.world;
  this.clock+=dt;
  if(this.clock>.7){this.clock=0;this.gather()}
  if(!this.sites.size)return false;
  for(const [kind,pool] of Object.entries(this.units)){
   for(const unit of pool){
    const previous=unit.site?.key;
    const assigned=previous&&this.sites.get(previous);
    // Never pour concrete or lift floors around a newly arriving ambulance
    // or a spreading fire. If the helicopter already has a load, it should
    // finish flying it to the dump rather than dropping it on rescuers.
    if(unit.phase!=='idle'&&assigned&&siteMustPause(assigned,this.progression.dispatch)&&
       !(kind==='sweep'&&['collect','lift','haul'].includes(unit.phase))){
      unit.event();
      delete assigned.claimed[kind];
      if(kind==='sweep')assigned.cleared=false;
      continue;
    }
    if(unit.phase!=='idle')unit.tick(dt);
    // Cleanup is safe to consider complete once chunks are physically
    // loaded and the helicopter is ascending. It can still fly offshore
    // while a mixer starts work at that SAME site.
    if(kind==='sweep'&&previous&&['lift','haul'].includes(unit.phase)){
     const site=this.sites.get(previous);
     if(site)site.cleared=true;
    }
    if(unit.lastFinished){
     const result=unit.lastFinished,site=this.sites.get(result.site?.key);
     if(site){
      delete site.claimed[kind];
      if(kind==='sweep')site.cleared=true;
      if(kind==='fill'){
       site.craters=this.world.terrainCraters.filter(c=>near(c,site,16)).length;
       site.crater=this.world.terrainCraters.find(c=>near(c,site,16))||null;
      }
      if(kind==='build')site.damaged=site.building?.floors.some(e=>
        e.active||e.health<e.maxHealth)||false;
      if(site.cleared&&!site.craters&&!site.damaged)site.complete=true;
     }
     unit.lastFinished=null;
    }
   }
  }
  this.assign('sweep',this.maxHelis);
  this.assign('fill',this.maxMixers);
  this.assign('build',this.maxCranes);
  this.worksites?.update(dt,this);
  // Compatibility with the old HUD/debug surface, now with per-service
  // counters and all active machines enumerated.
  const busy=Object.entries(this.units).flatMap(([type,pool])=>
    pool.filter(p=>p.phase!=='idle').map(p=>({type,unit:p})));
  const focus=busy.find(x=>x.type==='build')||busy.find(x=>x.type==='fill')||busy[0];
  const blocked=[...this.sites.values()].some(s=>!s.complete&&
    siteMustPause(s,this.progression.dispatch));
  this.stage=focus?.type||(this.jobs('sweep').length?'sweep':
    this.jobs('fill').length?'fill':this.jobs('build').length?'build':blocked?'blocked':'complete');
  this.phase=focus?.unit.phase||'idle';
  this.heli=this.units.sweep.find(p=>p.phase!=='idle')?.heli||this.units.sweep[0]?.heli||null;
  this.mixer=this.units.fill.find(p=>p.phase!=='idle')?.mixer||this.units.fill[0]?.mixer||null;
  this.crane=this.units.build.find(p=>p.phase!=='idle')?.crane||this.units.build[0]?.crane||null;
  this.removed=this.units.sweep.reduce((n,p)=>n+p.removed,0);
  this.filled=this.units.fill.reduce((n,p)=>n+p.filled,0);
  this.completed=this.units.build.reduce((n,p)=>n+p.completed,0);
  return busy.length>0;
 }
 currentState(){
  const active=(stage)=>this.units[stage].filter(p=>p.phase!=='idle');
  const sweeps=active('sweep'),fills=active('fill'),builds=active('build');
  const primary=sweeps[0]||fills[0]||builds[0];
  const s=primary?.currentState()||{};
  const visibleHeli=sweeps.find(u=>u.heli?.load?.length)||sweeps[0];
  const visibleCrane=builds.find(u=>u.crane?.tower?.scaling?.y>.98)||builds[0];
  const heli=visibleHeli?.currentState()||{},crane=visibleCrane?.currentState()||{};
  return {...s,stage:this.stage,phase:this.phase,
   cargoPieces:heli.cargoPieces||0,
   carriedRealRubble:!!heli.carriedRealRubble,
   firstCargoY:heli.firstCargoY??null,
   hoverOverTarget:!!heli.hoverOverTarget,
   towerHeight:crane.towerHeight||null,jibLength:crane.jibLength||null,
   craneStyle:crane.craneStyle||null,craneMastRaised:crane.craneMastRaised||0,
   removed:this.removed,
   cratersFilled:this.filled,buildingsRestored:this.completed,
   helicopters:sweeps.length,concreteMixers:fills.length,constructionCranes:builds.length,
   dispatchedHelicopters:this.units.sweep.length,
   fleetVisible:[...sweeps,...fills,...builds].reduce((n,p)=>n+p.currentState().fleetVisible,0),
   activeStages:{sweep:sweeps.length,fill:fills.length,build:builds.length},
   activeUnitPhases:{sweep:sweeps.map(u=>u.phase),fill:fills.map(u=>u.phase),build:builds.map(u=>u.phase)},
   simultaneous:sweeps.length+fills.length+builds.length,
   workzones:this.worksites?.stats()||{active:0,pool:0,barriers:0,workers:0},
   sites:[...this.sites.values()].map(p=>({key:p.key,x:p.x,z:p.z,
    phase:recoverySiteStatus(p),claimed:Object.keys(p.claimed),
    fire:p.fire,victims:p.victims})).slice(0,100)
  };
 }
}
