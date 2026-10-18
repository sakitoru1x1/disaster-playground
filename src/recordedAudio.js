// Sample-based game soundscape. Every sound is a locally bundled CC0 audio
// recording. No oscillators, generated random noise or external audio URLs.
const AUDIO='/audio/';
const CLAMP=(x,min=0,max=1)=>Math.min(max,Math.max(min,x));
const BANK={
 musicCalm:'calm_music.mp3',musicDanger:'danger_music.ogg',
 city:'city_ambient.ogg',construction:'construction_ambient.ogg',
 water:'water_ambient.ogg',machine:'machinery_1.ogg',motor:'machinery_2.ogg',
 helicopter:'helicopter_rotor.ogg',flyby:'helicopter_flyby.ogg',
 car:'car_driving.wav',carIdle:'car_idle.wav',storm:'tornado_wind.ogg',
 siren:'ambulance_siren.wav',wind:'wind_rush.ogg',air:'wind_short.ogg',
 meteor:'wind_rush.ogg',explosion:'boom_big.ogg',
 explode2:'boom_small.ogg',explode3:'boom_sharp.ogg',
 quake:'thunder.ogg',tsunami:'water_ambient.ogg',
 collapse:'concrete_1.ogg',collapse2:'concrete_2.ogg',
 crack:'impact_1.ogg',crack2:'impact_2.ogg',
 glass:'glass_1.ogg',glass2:'glass_2.ogg',
 rubble:'rubble_1.ogg',rubble2:'rubble_2.ogg',
 metal:'steel_1.ogg',metal2:'steel_2.ogg',
 winch:'machine',drum:'machinery_2.ogg',pour:'water_ambient.ogg',
 footstep:'footstep_1.ogg',footstep2:'footstep_2.ogg',footstepWet:'footstep_wet.ogg',
 ui:'ui_click.ogg',select:'ui_select.ogg',heal:'ui_select.ogg',
 horn:'car_idle.wav',hurt:'impact_2.ogg',
 catMeow:'cat_meow.wav',catPanic:'cat_meow2.ogg',catPurr:'cat_purr.wav',
 dogBark:'dog_bark2.ogg',dogPanic:'dog_bark.wav',
 fire:'fire_crackle.ogg',responder:'car_idle.wav'
};
BANK.winch='machinery_1.ogg';
const EFFECTS={
 meteor:{key:'air',volume:.37,priority:1},
 boom:{key:['explosion','explode2'],volume:.95,priority:3,cooldown:.42},
 quake:{key:'quake',volume:.48,priority:2,cooldown:1.5},
 tornado:{key:'storm',volume:.52,priority:2},
 tsunami:{key:'tsunami',volume:.57,priority:2},
 crack:{key:['crack','crack2'],volume:.22,priority:1,cooldown:.25,group:'rubble'},
 collapse:{key:['collapse','collapse2','explode3'],volume:.62,priority:2,cooldown:.44,group:'rubble'},
 rubble:{key:['rubble','rubble2'],volume:.27,priority:1,cooldown:.35,group:'rubble'},
 glass:{key:['glass','glass2'],volume:.26,priority:1,cooldown:.36,group:'rubble'},
 metal:{key:['metal','metal2'],volume:.45,priority:1,cooldown:.34,group:'rubble'},
 footstep:{key:['footstep','footstep2'],volume:.29,priority:0,cooldown:.18},
 carCrash:{key:['metal','collapse'],volume:.57,priority:2,cooldown:.55},
 carHorn:{key:'horn',volume:.24,priority:0,cooldown:3.2},
 winch:{key:'winch',volume:.34,priority:1,cooldown:.55},
 load:{key:'metal',volume:.46,priority:1,cooldown:.6},
 build:{key:'collapse2',volume:.33,priority:1,cooldown:.43},
 pour:{key:'pour',volume:.24,priority:0,cooldown:1.1},
 heal:{key:'heal',volume:.22,priority:0},
 hurt:{key:'hurt',volume:.27,priority:1,cooldown:.38},
 ui:{key:'ui',volume:.24,priority:0,cooldown:.07},
 select:{key:'select',volume:.25,priority:0,cooldown:.07},
 flyby:{key:'flyby',volume:.50,priority:1,cooldown:3},
 catMeow:{key:['catMeow','catPurr'],volume:.46,priority:0,cooldown:1.5,group:'pet'},
 dogBark:{key:'dogBark',volume:.50,priority:0,cooldown:1.5,group:'pet'},
 catPanic:{key:'catPanic',volume:.62,priority:1,cooldown:.5,group:'petAlarm'},
 dogPanic:{key:'dogPanic',volume:.60,priority:1,cooldown:.5,group:'petAlarm'}
};
const LOOP={
 musicCalm:.13,musicDanger:.14,city:.06,construction:.16,water:.10,
 car:.25,carIdle:.20,helicopter:.59,machine:.18,motor:.23,
 storm:.32,siren:.14,drum:.32,pour:.30,fire:.24,responder:.27
};
const COOLDOWN={rubble:.22};
export class RecordedSoundscape{
 constructor({mobile=false,Context=globalThis.AudioContext||globalThis.webkitAudioContext}={}){
  this.mobile=mobile;this.Context=Context;
  this.enabled=true;this.ctx=null;this.master=null;this.musicBus=null;this.effectsBus=null;
  this.world=null;this.buffers=new Map();this.loads=new Map();
  this.loops=new Map();this.last=new Map();this.playing=new Set();
  this.listener=null;this.nextUpdate=0;this.lastStep=0;this.previousRecovery='';
  this.nextHorn=0;this.musicLevel=.65;this.effectsLevel=.88;
  this.stats={started:0,dropped:0,decoded:0,errors:0};
 }
 bindWorld(world){this.world=world;if(world)world.audio=this;this.previousRecovery='';return this}
 async unlock(){
  if(!this.enabled||!this.Context)return false;
  if(!this.ctx){
   try{
    this.ctx=new this.Context({latencyHint:'interactive'});
    const c=this.ctx;
    this.master=c.createGain();this.master.gain.value=.58;
    const limiter=c.createDynamicsCompressor();
    limiter.threshold.value=-13;limiter.knee.value=9;limiter.ratio.value=2.8;
    this.master.connect(limiter);limiter.connect(c.destination);
    this.effectsBus=c.createGain();this.effectsBus.gain.value=this.effectsLevel;
    this.effectsBus.connect(this.master);
    this.musicBus=c.createGain();this.musicBus.gain.value=this.musicLevel;
    this.musicBus.connect(this.master);
   }catch(e){this.stats.errors++;return false}
  }
  try{if(this.ctx.state==='suspended')await this.ctx.resume()}catch{this.stats.errors++}
  if(this.ctx.state!=='running')return false;
  // Download & decode a small hot set after first user input, in the
  // background. Additional samples are fetched only when a sound needs them.
  for(const key of ['musicCalm','musicDanger','city','car','helicopter',
    'explosion','collapse','footstep','ui'])this.load(key);
  return true;
 }
 setEnabled(enabled){
  this.enabled=!!enabled;
  if(this.ctx)this.master.gain.setTargetAtTime(this.enabled?.58:0,this.ctx.currentTime,.08);
 }
 setVolumes({music=this.musicLevel,effects=this.effectsLevel}={}){
  this.musicLevel=CLAMP(music);this.effectsLevel=CLAMP(effects);
  if(this.ctx){
   this.musicBus.gain.setTargetAtTime(this.musicLevel,this.ctx.currentTime,.3);
   this.effectsBus.gain.setTargetAtTime(this.effectsLevel,this.ctx.currentTime,.08);
  }
 }
 async load(key){
  const file=BANK[key];if(!file||!this.ctx)return null;
  if(this.buffers.has(file))return this.buffers.get(file);
  if(this.loads.has(file))return this.loads.get(file);
  const pending=(async()=>{
   try{
    const response=await fetch(AUDIO+file);
    if(!response.ok)throw Error(file+' '+response.status);
    const data=await response.arrayBuffer();
    const buffer=await this.ctx.decodeAudioData(data);
    this.buffers.set(file,buffer);this.stats.decoded++;
    return buffer;
   }catch(e){this.stats.errors++;console.warn('Recorded sound unavailable:',file,e);return null}
   finally{this.loads.delete(file)}
  })();
  this.loads.set(file,pending);return pending;
 }
 getListener(){
  const c=this.world?.scene?.activeCamera;
  if(!c)return null;
  if(c.name==='street level spectator')return c.position;
  return c.target||c.position;
 }
 spatial(position,range=65){
  if(!position)return {gain:1,pan:0};
  const listener=this.getListener();if(!listener)return {gain:.35,pan:0};
  const dx=position.x-listener.x,dz=position.z-listener.z;
  const dy=((position.y??0)-(listener.y??0))*.30;
  const distance=Math.hypot(dx,dz,dy);
  const gain=1/(1+(distance/range)**2);
  const f=this.world?.scene?.activeCamera?.getForwardRay?.()?.direction;
  const pan=CLAMP((f?dx*f.z-dz*f.x:dx)/55,-.86,.86);
  return {gain,pan};
 }
 route(node,bus,position,gain){
  const c=this.ctx;const volume=c.createGain();volume.gain.value=gain;
  const pan=c.createStereoPanner?.();
  const {pan:panning}=this.spatial(position);
  node.connect(volume);
  if(pan){pan.pan.value=panning;volume.connect(pan);pan.connect(bus)}
  else volume.connect(bus);
  return {volume,pan,stop(){try{node.disconnect();volume.disconnect();pan?.disconnect()}catch{}}};
 }
 play(name,position=null,strength=1){
  const entry=EFFECTS[name];if(!entry||!this.ctx||!this.enabled||this.ctx.state!=='running')return false;
  const now=this.ctx.currentTime;
  const cd=entry.cooldown??.08;
  const group=entry.group||name;
  if(now<(this.last.get(group)||0)){this.stats.dropped++;return false}
  if(this.playing.size>(this.mobile?7:12)){this.stats.dropped++;return false}
  const space=this.spatial(position,entry.priority>=2?130:70);
  if(space.gain<.025){this.stats.dropped++;return false}
  this.last.set(group,now+(COOLDOWN[group]??cd));
  const key=Array.isArray(entry.key)
    ?entry.key[Math.floor(Math.random()*entry.key.length)]:entry.key;
  this.load(key).then(buffer=>{
   if(!buffer||!this.ctx||!this.enabled||this.ctx.state!=='running')return;
   if(this.playing.size>(this.mobile?7:12))return;
   const src=this.ctx.createBufferSource();src.buffer=buffer;
   src.playbackRate.value=.94+Math.random()*.12;
   const volume=Math.min(.95,(entry.volume||.3)*strength*space.gain);
   const route=this.route(src,this.effectsBus,position,volume);
   this.playing.add(src);this.stats.started++;
   src.onended=()=>{this.playing.delete(src);route.stop()};
   src.start();
  });
  return true;
 }
 async ensureLoop(name){
  if(this.loops.has(name))return this.loops.get(name);
  const slot={gain:0,target:0,source:null,node:null,position:null,rate:1};
  this.loops.set(name,slot);
  const base=name.startsWith('car')?'car':
   name.startsWith('heli')?'helicopter':
   name.startsWith('crane')?'machine':
   name.startsWith('mixer')?'drum':
   name.startsWith('truck')?'responder':
   name.startsWith('emergencySiren')?'siren':
   name.startsWith('fire')?'fire':name;
  const buffer=await this.load(base);
  if(!buffer||!this.ctx){this.loops.delete(name);return null}
  // The loop may have become inactive while the asset was decoding.
  const src=this.ctx.createBufferSource();
  src.buffer=buffer;src.loop=true;src.playbackRate.value=slot.rate;
  const route=this.route(src,name.startsWith('music')?this.musicBus:this.effectsBus,
    slot.position,0);
  slot.source=src;slot.node=route;src.start();
  return slot;
 }
 loop(name,value,position=null,rate=1){
  if(!this.ctx)return;
  const base=name.startsWith('car')?'car':
   name.startsWith('heli')?'helicopter':
   name.startsWith('crane')?'machine':
   name.startsWith('mixer')?'drum':
   name.startsWith('truck')?'responder':
   name.startsWith('emergencySiren')?'siren':
   name.startsWith('fire')?'fire':name;
  const desired=CLAMP(value)*(LOOP[base]??.15);
  let slot=this.loops.get(name);
  if(desired<.008&&!slot)return; // never create silent background audio
  if(!slot){this.ensureLoop(name);slot=this.loops.get(name)}
  if(!slot)return;
  slot.target=desired;slot.position=position;slot.rate=rate;
  if(!slot.source)return;
  const now=this.ctx.currentTime;
  const {gain,pan}=this.spatial(position,name.startsWith('car')?42:88);
  slot.node.volume.gain.setTargetAtTime(this.enabled?slot.target*gain:0,now,.35);
  if(slot.node.pan)slot.node.pan.pan.setTargetAtTime(pan,now,.25);
  slot.source.playbackRate.setTargetAtTime(CLAMP(rate,.7,1.6),now,.3);
 }
 update({world=this.world,disasters=null,walk=null,paused=false}={}){
  if(!world||!this.ctx||this.ctx.state!=='running')return;
  const now=this.ctx.currentTime;if(now<this.nextUpdate)return;
  this.nextUpdate=now+.14;
  this.world=world;
  const recovery=world.progression?.recovery;
  const stage=recovery?.stage||'idle',phase=recovery?.phase||'idle';
  const danger=!!(disasters?.effects?.length||disasters?.meteors?.length||disasters?.blastWaves?.length);
  const mode=paused||!this.enabled?0:1;
  const walkOn=!!walk?.enabled;
  // No perpetual stack of white noise. One subtle distant city recording,
  // no anonymous crowds, and a gentle soundtrack until a disaster occurs.
  const cars=(world.props||[]).filter(p=>p.type==='car'&&p.traffic?.state==='driving');
  this.loop('city',mode*(walkOn?.60:.32)*(danger?.35:1));
  this.loop('musicCalm',mode*(danger?.08:.72));
  this.loop('musicDanger',mode*(danger?.37:0));
  const listener=this.getListener();
  const nearest=cars.map(p=>({p,g:this.spatial(p.mesh.position,55).gain}))
    .sort((a,b)=>b.g-a.g).slice(0,this.mobile?1:2);
  for(let i=0;i<(this.mobile?1:2);i++){
   const p=nearest[i]?.p;
   const g=nearest[i]?.g??0;
   this.loop('car'+i,mode*g*(danger?.5:1),p?.mesh.position,
     CLAMP(.86+(p?.traffic?.speed||10)/55,.8,1.22));
  }
  // Independent helicopter rotors, moving mixers and cranes: each audible
  // machine retains its own true 3D position instead of sounding from a
  // single 'global recovery' machine.
  const crews=recovery?.units;
  const use=(kind,prefix,volume,getPosition,activePhase=null)=>{
   const pool=crews?.[kind]||[];
   for(let i=0;i<pool.length;i++){
    const crew=pool[i];
    const busy=crew.phase!=='idle'&&crew.stage===kind&&
      (!activePhase||crew.phase===activePhase);
    this.loop(prefix+i,mode*(busy?volume:0),getPosition(crew));
   }
  };
  if(crews){
   use('sweep','heli',.81,c=>c.heli?.root.position);
   use('fill','mixer',.60,c=>c.mixer?.root.position);
   use('build','crane',.72,c=>c.crane?.root.position);
   for(let i=0;i<(crews.build?.length||0);i++){
    const c=crews.build[i];
    this.loop('truck'+i,mode*(c.phase==='arrive'?.48:0),c.truck?.root.position);
   }
  }else{
   const active=!!recovery&&phase!=='idle';
   this.loop('helicopter',mode*(active&&stage==='sweep'?1:0),recovery?.heli?.root.position);
   this.loop('machine',mode*(active&&stage==='build'?.76:0),recovery?.crane?.root.position);
   this.loop('drum',mode*(active&&stage==='fill'?.72:0),recovery?.mixer?.root.position);
  }
  const fireUnits=[...(world.progression?.fires?.fires?.values()||[])];
  const fireSource=fireUnits.map(f=>({f,g:this.spatial(f.anchor,48).gain}))
    .sort((a,b)=>b.g-a.g)[0];
  this.loop('fireSound',mode*(fireSource?.f?.heat||0)*.7,fireSource?.f?.anchor);
  const responders=(world.responderVehicles||[]).filter(u=>u.unit?.state!=='idle')
    .map(u=>({u,g:this.spatial(u.mesh.position,67).gain}))
    .sort((a,b)=>b.g-a.g).slice(0,this.mobile?2:3);
  for(let i=0;i<(this.mobile?2:3);i++){
   const vehicle=responders[i]?.u;
   this.loop('emergencySiren'+i,mode*(vehicle?.48:0),vehicle?.mesh.position);
   this.loop('truck'+(i+4),mode*(vehicle?.unit?.state==='driving'?.40:0),
    vehicle?.mesh.position);
  }
  this.loop('storm',mode*(disasters?.effects?.some(e=>e.type==='tornado')?.65:0),
    disasters?.effects?.find(e=>e.type==='tornado')?.root?.position);
  this.loop('water',mode*(disasters?.effects?.some(e=>e.type==='tsunami')?.55:0),
    disasters?.effects?.find(e=>e.type==='tsunami')?.root?.position);
  if(!paused&&walkOn&&walk.survival?.grounded&&!walk.survival.dead){
   const vel=walk.survival.body?.getLinearVelocity();
   const speed=Math.hypot(vel?.x||0,vel?.z||0);
   if(speed>1.5&&now>this.lastStep){
    this.play('footstep',walk.camera.position,speed>8?1:.72);
    this.lastStep=now+(speed>8?.26:.37);
   }
  }
  const phaseName=stage+':'+phase;
  if(active&&phaseName!==this.previousRecovery){
   if(stage==='sweep'&&phase==='arrive')this.play('flyby',recovery.site,1);
   if(stage==='sweep'&&phase==='lower')this.play('winch',recovery.site,1);
   if(stage==='sweep'&&phase==='collect')this.play('load',recovery.site,1);
   if(stage==='build'&&phase==='construct')this.play('metal',recovery.site,.65);
   if(stage==='fill'&&phase==='pour')this.play('pour',recovery.site,.65);
  }
  this.previousRecovery=phaseName;
 }
 resetScene(){
  this.world=null;this.previousRecovery='';this.last.clear();
  for(const slot of this.loops.values()){
   slot.target=0;
   if(slot.node&&this.ctx)slot.node.volume.gain.setTargetAtTime(0,this.ctx.currentTime,.08);
  }
 }
 getState(){return {unlocked:this.ctx?.state==='running',enabled:this.enabled,
  loops:this.loops.size,voices:this.playing.size,bufferCount:this.buffers.size,...this.stats}}
 dispose(){
  for(const slot of this.loops.values()){try{slot.source?.stop();slot.node?.stop()}catch{}}
  this.loops.clear();this.playing.clear();this.loads.clear();this.buffers.clear();
  const ctx=this.ctx;this.ctx=null;ctx?.close().catch(()=>{});
 }
}
