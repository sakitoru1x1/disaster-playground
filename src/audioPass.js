// Original procedural audio score & spatial SFX for Disaster Playground.
// No external downloads, no copyrighted recordings, no autoplay before input.
// One shared WebAudio context survives scene reset; all loops are gain-gated.
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const TAU=Math.PI*2;
const BEAT=.78;
const CHORDS=[
 [130.81,155.56,196,233.08],     // Cm7
 [103.83,155.56,196,261.63],     // Abmaj7
 [116.54,174.61,233.08,293.66], // Bb
 [130.81,155.56,196,261.63]     // Cm(add9)
];
const AMBIENCE=['city','wind','crowd','surf'];
const SOUND={
 uiSelect:[.12,850,1280,.10,.02],uiClick:[.095,690,930,.08,.01],
 uiConfirm:[.24,600,980,.12,.01],uiReset:[.56,360,140,.23,.06],
 meteorFly:[1.10,620,75,.37,.42],boom:[2.25,83,28,.75,.84],
 quake:[1.9,42,25,.82,.76],wind:[1.6,140,50,.40,.74],
 tornadoStart:[1.3,160,65,.48,.68],tsunamiStart:[1.8,120,35,.62,.90],
 crack:[.55,530,135,.56,.55],collapse:[1.15,103,32,.82,.92],
 debrisLand:[.45,250,63,.48,.64],glass:[.46,1300,290,.43,.63],
 carHorn:[.60,380,390,.20,.02],carCrash:[.78,172,42,.57,.68],
 voice:[.32,360,240,.21,.45],panic:[.50,740,380,.34,.44],
 birdsChirp:[.31,1560,1850,.12,.02],
 footstep:[.15,135,75,.15,.43],sprint:[.11,175,82,.20,.32],
 hurt:[.40,130,78,.49,.34],death:[1.05,190,40,.48,.46],
 respawn:[.56,310,880,.23,.07],heal:[.58,520,1020,.15,.04],
 warning:[.46,700,450,.21,.30],rescue:[.75,520,770,.20,.03],
 rotorStart:[.92,95,260,.32,.41],winch:[.37,900,210,.42,.72],
 cargoClink:[.53,550,95,.44,.57],cargoLift:[.8,210,90,.42,.54],
 heavyBrake:[.58,155,55,.36,.72],concrete:[.87,90,46,.45,.89],
 craneLift:[.47,740,210,.34,.59],buildFloor:[.70,220,56,.61,.63],
 buildComplete:[1.05,480,860,.17,.06],metal:[.32,650,168,.41,.56]
};
const COOL={
 footstep:.09,sprint:.09,voice:.8,panic:1.7,crack:.14,collapse:.35,
 debrisLand:.38,glass:.40,carCrash:.70,carHorn:3.0,boom:.45,quake:1.8,
 wind:1.4,concrete:.50,buildFloor:.33,metal:.24,hurt:.20
};
const LOOPS={
 city:[1.6,64,.33,.42],wind:[2.2,80,.70,.92],birds:[2.0,1450,.12,.12],
 crowd:[1.8,360,.32,.60],surf:[2.6,65,.5,.85],
 engine:[1.3,95,.27,.18],helicopter:[.44,47,.53,.28],
 mixer:[.9,105,.45,.47],truck:[1.1,76,.32,.28],
 crane:[.8,110,.31,.60],pour:[.6,290,.38,.88],
 siren:[1.4,620,.41,.07],storm:[2.1,57,.65,.79]
};
const hash=x=>{const v=Math.sin(x*78.233+34.21)*43758.5453;return v-Math.floor(v)};
export function spatialGain(position,listener,range=72){
 if(!position||!listener)return 1;
 const d=Math.hypot((position.x||0)-(listener.x||0),
   ((position.y||0)-(listener.y||0))*.26,
   (position.z||0)-(listener.z||0));
 return 1/Math.pow(1+Math.pow(d/range,2),1.3);
}
// Quiet is the default. A location has at most one distant 'air' layer;
 // environmental sources and machinery become loud only when close.
export function decideAudioMix({walk=false,paused=false,muted=false,danger=0,health=100,
  carCount=0,recovery={stage:'idle',phase:'idle'},daylight=1}={}){
 const working=recovery?.phase!=='idle',audible=muted?0:paused?.08:1;
 const alarm=clamp(danger);
 return {
  ambience:audible*(walk?.25:.22),
  music:audible*(.38-.26*alarm)*(health<25?.55:1),
  wind:audible*(.006+alarm*.17),
  city:audible*(carCount?.085:.026)*(1-alarm*.65),
  crowd:audible*(daylight>.30?.075:.02)*(1-alarm*.8),
  surf:audible*.11,
  birds:audible*(daylight>.4?.09:0)*(1-alarm),
  storm:audible*alarm*.38,
  helicopter:audible*(working&&recovery.stage==='sweep'?.75:0),
  mixer:audible*(working&&recovery.stage==='fill'?.59:0),
  truck:audible*(working&&['fill','build'].includes(recovery.stage)&&recovery.phase==='arrive'?.51:0),
  crane:audible*(working&&recovery.stage==='build'?.56:0),
  pour:audible*(working&&recovery.stage==='fill'&&recovery.phase==='pour'?.48:0),
  siren:audible*clamp(recovery?.emergency||0)*.21
 };
}
// Samples are predominantly TONAL; noise is used sparingly for rubble,
// wind and water. The previous loops stacked full-band noise all the time
// (city + wind + crowd + surf + engines), producing an exhausting hiss.
function synthesized(ctx,kind,loop=false){
 const [duration,f1,f2,noise]=(loop?LOOPS:SOUND)[kind];
 const rate=ctx.sampleRate,frames=Math.floor(duration*rate);
 const buffer=ctx.createBuffer(1,frames,rate),data=buffer.getChannelData(0);
 let low=0,seed=0x1248abcd;
 const ambience=['wind','storm','surf','city','crowd','pour'].includes(kind);
 for(let i=0;i<frames;i++){
  const t=i/rate,u=t/duration;
  seed=(Math.imul(seed,1664525)+1013904223)|0;
  const white=seed/2147483648;
  // Strongly filtered soft air instead of white-noise 'static'.
  low=low*.991+white*.009;
  const dust=low*.8+white*.025;
  const phase=TAU*(loop?f1*t:(f1*t+(f2-f1)*t*u/3));
  const tone=Math.sin(phase)+.18*Math.sin(phase*2.01+.3);
  let envelope=loop?1:Math.exp(-u*4.2);
  if(loop)envelope*=Math.min(1,t/.06,(duration-t)/.06);
  let wave=0;
  if(kind==='birds'||kind==='birdsChirp'){
   const chirp=Math.pow(Math.max(0,Math.sin(TAU*1.2*t)),14);
   wave=Math.sin(TAU*(f1*t+115*t*t))*.55*chirp;
  }else if(kind==='siren'){
   wave=Math.sin(TAU*(730*t+48*Math.sin(TAU*.84*t)))*.40;
  }else if(kind==='helicopter'){
   // Rotor beats and turbine hum have rhythmic attacks, not continuous hiss.
   const rotor=.34*Math.sin(TAU*16*t)**6;
   wave=.17*Math.sin(TAU*47*t)+.22*Math.sin(TAU*94*t)+rotor+
     .024*noise*dust;
  }else if(kind==='engine'||kind==='truck'||kind==='mixer'){
   const piston=.25*Math.sin(phase*.5)**3;
   wave=.29*tone+piston+.023*noise*dust;
  }else if(kind==='crane'){
   wave=.26*Math.sin(phase)+.15*Math.sin(phase*3)+.025*dust;
  }else if(kind==='city'){
   wave=.13*Math.sin(phase)+.06*Math.sin(phase*1.52)+.017*dust;
  }else if(kind==='crowd'){
   const pulse=Math.pow(Math.max(0,Math.sin(TAU*.57*t)),3);
   wave=.1*Math.sin(phase*1.16)*pulse+.028*dust;
  }else if(kind==='wind'||kind==='storm'||kind==='surf'||kind==='pour'){
   const tide=kind==='surf'?(.45+.45*Math.sin(TAU*.25*t)**2):1;
   wave=(.06*tone+.24*noise*dust)*tide;
  }else if(ambience){
   wave=.16*tone+.045*noise*dust;
  }else{
   // Sharp local SFX retain a controlled noisy attack. No white-noise bed.
   const impact=1-u;
   wave=(.77*tone+noise*(.22*low+.06*white))*impact;
  }
  data[i]=wave*envelope;
 }
 return buffer;
}
const safeDisconnect=(...nodes)=>nodes.forEach(n=>{try{n?.disconnect()}catch{}});
export class AudioPass{
 constructor({mobile=false,windowObject=globalThis,contextFactory=null}={}){
  this.mobile=mobile;this.host=windowObject;this.contextFactory=contextFactory;
  this.enabled=true;this.unlocked=false;this.ctx=null;this.world=null;
  this.musicLevel=.62;this.effectsLevel=.83;this.ambientLevel=.62;
  this.focusUntil=0;this.lastAccent=0;this.activeLoops=0;
  this.groupCooldowns=new Map();this.mixSnapshot=null;
  this.master=null;this.sfxBus=null;this.ambientBus=null;this.musicBus=null;this.motorBus=null;
  this.buffers=new Map();this.loops=new Map();this.cooldowns=new Map();
  this.oneshots=new Set();this.maxVoices=mobile?7:11;
  this.nextBeat=0;this.beat=0;this.lastFrame=0;this.nextUpdate=0;
  this.stepCooldown=0;this.voiceIndex=0;this.lastMood=0;this.metrics={played:0,dropped:0,musicNotes:0};
 }
 bindWorld(world){this.world=world; if(world)world.audio=this;return this}
 async unlock(){
  if(!this.enabled)return false;
  if(this.ctx){
   if(this.ctx.state==='suspended')await this.ctx.resume();
   this.unlocked=this.ctx.state==='running';return this.unlocked;
  }
  const Ctx=this.contextFactory||this.host?.AudioContext||this.host?.webkitAudioContext;
  if(!Ctx)return false;
  try{
   const c=new Ctx({latencyHint:'interactive'});this.ctx=c;
   const comp=c.createDynamicsCompressor();
   comp.threshold.value=-12;comp.knee.value=13;comp.ratio.value=2.4;
   comp.attack.value=.004;comp.release.value=.24;
   this.master=c.createGain();this.master.gain.value=.53;
   this.master.connect(comp);comp.connect(c.destination);
   this.sfxBus=c.createGain();this.sfxBus.gain.value=.84*this.effectsLevel;this.sfxBus.connect(this.master);
   this.ambientBus=c.createGain();this.ambientBus.gain.value=.16;this.ambientBus.connect(this.master);
   this.motorBus=c.createGain();this.motorBus.gain.value=.48*this.effectsLevel;this.motorBus.connect(this.master);
   this.musicBus=c.createGain();this.musicBus.gain.value=.07;this.musicBus.connect(this.master);
   if(c.state==='suspended')await c.resume();
   this.unlocked=c.state==='running';
   this.nextBeat=c.currentTime+.05;
   if(this.unlocked)this.play('uiConfirm',null,.38);
   return this.unlocked;
  }catch(err){this.ctx=null;return false}
 }
 setEnabled(enabled){
  this.enabled=!!enabled;
  if(this.ctx&&this.master){
   this.master.gain.setTargetAtTime(this.enabled?.53:0,this.ctx.currentTime,.035);
  }
 }
  setMusicVolume(value){this.musicLevel=clamp(value)}
 setAmbienceVolume(value){this.ambientLevel=clamp(value)}
 setEffectsVolume(value){
  this.effectsLevel=clamp(value);
  if(this.sfxBus)this.sfxBus.gain.setTargetAtTime(.84*this.effectsLevel,this.ctx.currentTime,.08);
  if(this.motorBus)this.motorBus.gain.setTargetAtTime(.48*this.effectsLevel,this.ctx.currentTime,.12);
 }
 resetScene(){
  this.world=null;this.cooldowns.clear();this.groupCooldowns.clear();
  this.stepCooldown=0;this.focusUntil=0;
  for(const item of this.loops.values())item.gain.gain.value=0;
 }
 dispose(){
  for(const item of this.loops.values()){try{item.src.stop()}catch{}safeDisconnect(item.src,item.gain,item.pan,item.filter)}
  this.loops.clear();this.oneshots.clear();this.buffers.clear();this.ctx?.close?.().catch?.(()=>{});
  this.ctx=null;this.unlocked=false;
 }
 getListener(){
  const c=this.world?.scene?.activeCamera;
  if(!c)return null;
  return c.name==='street level spectator'?c.position:c.target||c.position;
 }
 getPan(position){
  const listener=this.getListener();
  if(!listener||!position)return 0;
  const camera=this.world?.scene?.activeCamera;
  const forward=camera?.getForwardRay?.(1)?.direction;
  const dx=position.x-listener.x,dz=position.z-listener.z;
  // Real camera-relative stereo: after turning your head the passing vehicle
  // must move from the right speaker to the left, not stay anchored east.
  const sideways=forward?(dx*forward.z-dz*forward.x):dx;
  return clamp(sideways/70,-.8,.8);
 }
 getBuffer(kind,loop=false){
  const key=(loop?'loop:':'fx:')+kind;
  if(!this.buffers.has(key)){
   if(!(loop?LOOPS:SOUND)[kind])return null;
   this.buffers.set(key,synthesized(this.ctx,kind,loop));
  }
  return this.buffers.get(key);
 }
 play(kind,position=null,power=1,{force=false,rate=1}={}){
  if(!this.enabled||!this.unlocked||!this.ctx||!SOUND[kind])return false;
  const c=this.ctx,t=c.currentTime;
  const listener=this.getListener();
  const gain=spatialGain(position,listener,this.world?.scene?.activeCamera?.name==='street level spectator'?64:150);
  if(gain<.013){this.metrics.dropped++;return false}
  const key=kind;
  if(!force&&t<(this.cooldowns.get(key)||0)){this.metrics.dropped++;return false}
  const group=['debrisLand','crack','glass','metal','collapse'].includes(kind)?'wreckage':
    ['voice','panic'].includes(kind)?'crowd':
    ['uiSelect','uiClick','uiConfirm'].includes(kind)?'ui':null;
  if(group&&!force&&t<(this.groupCooldowns.get(group)||0)){
    this.metrics.dropped++;return false
  }
  if(this.oneshots.size>=this.maxVoices){this.metrics.dropped++;return false}
  this.cooldowns.set(key,t+(COOL[kind]??.10));
  if(group)this.groupCooldowns.set(group,t+(group==='wreckage'?.23:group==='crowd'?.9:.12));
  if(['boom','collapse','carCrash','quake','tsunamiStart','tornadoStart'].includes(kind))
    this.focusUntil=Math.max(this.focusUntil,t+
      (kind==='boom'?2.4:kind==='collapse'?.85:1.35));
  const source=c.createBufferSource(),buffer=this.getBuffer(kind);
  if(!buffer)return false;
  source.buffer=buffer;
  source.playbackRate.value=clamp(rate,.65,1.65);
  const amp=c.createGain(),volume=clamp(power,0,2);
  // Soft onset and smooth release eliminate clicks from procedural effects.
  // Only ONE nearby impact owns the foreground. Other impacts are quieter
  // and the city ambience/music duck smoothly for a short recovery window.
  const loud=['boom','collapse','quake','carCrash'].includes(kind);
  const g=Math.min(loud?.55:.33,volume*(loud?.35:.19)*gain);
  amp.gain.setValueAtTime(.0001,t);
  amp.gain.linearRampToValueAtTime(g,t+.015);
  amp.gain.setTargetAtTime(.0001,t+buffer.duration*.68,.09);
  const pan=c.createStereoPanner?.();
  source.connect(amp);
  if(pan){amp.connect(pan);pan.pan.value=this.getPan(position);pan.connect(this.sfxBus)}
  else amp.connect(this.sfxBus);
  this.oneshots.add(source);
  source.onended=()=>{this.oneshots.delete(source);safeDisconnect(source,amp,pan)};
  source.start(t);this.metrics.played++;
  return true;
 }
 getLoop(name){
  if(this.loops.has(name))return this.loops.get(name);
  const c=this.ctx,kind=name.startsWith('car')?'engine':name;
  const src=c.createBufferSource(),buffer=this.getBuffer(kind,true);
  if(!buffer)return null;
  src.buffer=buffer;src.loop=true;
  const gain=c.createGain();gain.gain.value=0;
  const pan=c.createStereoPanner?.();
  const motor=['engine','helicopter','truck','mixer','crane','pour','siren'].includes(kind);
  const filter=c.createBiquadFilter?.();
  if(filter){
   filter.type='lowpass';
   filter.frequency.value={
    city:320,crowd:550,wind:230,surf:260,storm:380,
    engine:950,helicopter:720,truck:800,mixer:950,crane:1150,
    pour:620,siren:2200
   }[kind]||900;
  }
  if(filter){src.connect(filter);filter.connect(gain)}else src.connect(gain);
  if(pan){gain.connect(pan);pan.connect(motor?this.motorBus:this.ambientBus)}
  else gain.connect(motor?this.motorBus:this.ambientBus);
  src.start();
  const item={src,gain,pan,filter,name};this.loops.set(name,item);
  return item;
 }
 loop(name,volume,position=null,rate=1){
  // No silent oscillators/buffers for unused vehicles and sound layers.
  if(volume<.008&&!this.loops.has(name))return;
  const item=this.getLoop(name);if(!item)return;
  const c=this.ctx;
  const g=clamp(volume)*spatialGain(position,this.getListener(),
    this.world?.scene?.activeCamera?.name==='street level spectator'?60:160);
  const duck=(this.focusUntil>c.currentTime&&['city','crowd','wind','surf','engine','truck','mixer','crane'].includes(
    name.startsWith('car')?'engine':name))?.40:1;
  item.gain.gain.setTargetAtTime(g*duck,c.currentTime,.35);
  item.src.playbackRate.setTargetAtTime(clamp(rate,.6,2),c.currentTime,.22);
  if(item.pan)item.pan.pan.setTargetAtTime(this.getPan(position),c.currentTime,.17);
 }
 note(frequency,time,duration,velocity=.3,wave='triangle'){
  const c=this.ctx,osc=c.createOscillator(),gain=c.createGain();
  osc.type=wave;osc.frequency.setValueAtTime(frequency,time);
  gain.gain.setValueAtTime(0,time);
  gain.gain.linearRampToValueAtTime(Math.max(.0002,velocity),time+.045);
  gain.gain.setValueAtTime(velocity*.8,time+Math.max(.06,duration*.42));
  gain.gain.exponentialRampToValueAtTime(.0001,time+duration);
  osc.connect(gain);gain.connect(this.musicBus);
  osc.onended=()=>safeDisconnect(osc,gain);
  osc.start(time);osc.stop(time+duration+.005);
  this.metrics.musicNotes++;
 }
 scheduleScore(time,danger){
  // Spacious music: sparse two-note minor chords, a soft bass swell and
  // long stretches with *no* melody. No continuous arpeggio/sawtooth.
  const horizon=time+.28;let guard=0;
  while(this.nextBeat<horizon&&guard++<4){
   if(this.nextBeat<time-.5){this.nextBeat=time+.04;continue}
   const beat=this.beat++,bar=Math.floor(beat/8);
   const chord=CHORDS[bar%CHORDS.length];
   if(beat%8===0){
    this.note(chord[0]/2,this.nextBeat,BEAT*6.3,.10,'sine');
    this.note(chord[2],this.nextBeat+.2,BEAT*4.7,.055,'triangle');
   }
   if(beat%8===5&&bar%2===0&&danger<.65)
    this.note(chord[1]*2,this.nextBeat,BEAT*1.5,.040,'sine');
   if(beat%16===14&&danger>.45)
    this.note(chord[0],this.nextBeat,BEAT*1.6,.07,'triangle');
   this.nextBeat+=BEAT;
  }
 }
 update({world=this.world,disasters=null,walk=null,paused=false,dt=.016}={}){
  if(!this.unlocked||!this.enabled||!this.ctx||!world)return;
  this.world=world;
  const t=this.ctx.currentTime;if(t<this.nextUpdate)return;
  this.nextUpdate=t+.16;
  const damaged=clamp((100-world.integrity())/100);
  const danger=clamp((disasters?.effects?.length||0)*.58+
    (disasters?.meteors?.length||0)*.65+damaged*.23);
  const recovery=world.progression?.recovery;
  const stage=recovery?.stage||'idle',phase=recovery?.phase||'idle';
  const listener=this.getListener();
  const vehicles=(world.props||[]).filter(p=>p.type==='car'&&p.traffic?.state==='driving');
  const mix=decideAudioMix({walk:!!walk?.enabled,paused,danger,carCount:vehicles.length,
    recovery:{stage,phase,emergency:vehicles.some(p=>p.emergency)?1:0},
    health:walk?.survival?.health??100,daylight:world.progression?.lightPhase??1});
  const foreground=this.focusUntil>t;
  // Main ducking system: a large event takes priority over music/air.
  this.ambientBus.gain.setTargetAtTime(mix.ambience*this.ambientLevel*(foreground?.36:1),t,.45);
  this.musicBus.gain.setTargetAtTime(mix.music*this.musicLevel*(foreground?.14:1)*.52,t,.85);

  const living=(world.civilians||[]).filter(p=>p.state!=='dead');
  const nearPeople=living.filter(p=>spatialGain(p.root?.position,listener,25)>.48).length;
  // No anonymous crowd or sweeping water in the middle of a deserted city.
  this.loop('city',mix.city);
  this.loop('crowd',mix.crowd*clamp(nearPeople/10));
  const nearWater=Math.max(Math.abs(listener?.x||0),Math.abs(listener?.z||0));
  this.loop('surf',mix.surf*clamp((nearWater-95)/46));
  this.loop('wind',mix.wind);
  this.loop('storm',mix.storm,disasters?.effects?.find(f=>f.root)?.root?.position);
  // Birdsong is a single occasional chirp, never a perpetual 2 s loop.
  if(!paused&&mix.birds>.001&&t>=this.lastAccent){
    this.play('birdsChirp',null,mix.birds*1.8,{rate:.84+hash(t)*.3});
    this.lastAccent=t+8+hash(t+92)*11;
  }

  const emergency=vehicles.find(p=>p.emergency);
  this.loop('siren',mix.siren,emergency?.mesh.position);
  const heli=recovery?.heli,crane=recovery?.crane,mixer=recovery?.mixer,truck=recovery?.truck;
  this.loop('helicopter',mix.helicopter,heli?.root.position,phase==='haul'?1.08:.95);
  this.loop('mixer',mix.mixer,mixer?.root.position);
  this.loop('pour',mix.pour,recovery?.site);
  this.loop('crane',mix.crane,crane?.root.position,phase==='construct'?1.13:.78);
  this.loop('truck',mix.truck,truck?.root.position);

  // 1 nearest engine on mobile, up to 2 desktop, with wide distance falloff
  // and no generic city-engine wash. Heavy work masks passing cars naturally.
  const cars=vehicles.map(p=>({p,g:spatialGain(p.mesh.position,listener,42)}))
    .sort((a,b)=>b.g-a.g).slice(0,this.mobile?1:2);
  for(let i=0;i<(this.mobile?1:2);i++){
   const car=cars[i]?.p,near=cars[i]?.g??0;
   this.loop('car'+i,paused?0:car?.emergency?.27:car?.traffic?mix.city*1.7*near:0,
     car?.mesh.position,car?.traffic?.slowUntil>world.time?.78:
       1+((car?.traffic?.speed??8)-8)*.025);
  }
  // Diegetic footfalls on the actual grounded player, not background loops.
  if(!paused&&walk?.enabled&&!walk.survival.dead&&walk.survival.grounded){
   const v=walk.survival.body?.getLinearVelocity();
   const pace=Math.hypot(v?.x||0,v?.z||0);
   if(pace>1.5&&t>this.stepCooldown){
    const fast=pace>8;
    this.play(fast?'sprint':'footstep',walk.camera.position,.37,{rate:.94+hash(this.metrics.played)*.1});
    this.stepCooldown=t+(fast?.25:.36);
   }
  }
  this.mixSnapshot={music:mix.music,ambience:mix.ambience,city:mix.city,
    nearPeople,nearestCar:cars[0]?.g||0,foreground,stage,phase};
  if(!paused)this.scheduleScore(t,danger);
 }
 getState(){return {supported:!!(this.contextFactory||this.host?.AudioContext||this.host?.webkitAudioContext),
  unlocked:this.unlocked,enabled:this.enabled,contextState:this.ctx?.state||'none',
  voices:this.oneshots.size,loops:this.loops.size,bufferCount:this.buffers.size,
  musicLevel:this.musicLevel,effectsLevel:this.effectsLevel,ambientLevel:this.ambientLevel,
  focusUntil:this.focusUntil,mix:this.mixSnapshot,
  ...this.metrics};}
}
