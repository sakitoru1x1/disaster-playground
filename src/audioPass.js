// Original procedural audio score & spatial SFX for Disaster Playground.
// No external downloads, no copyrighted recordings, no autoplay before input.
// One shared WebAudio context survives scene reset; all loops are gain-gated.
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const TAU=Math.PI*2;
const BEAT=.63;
const CHORDS=[
 [130.81,155.56,196,233.08],     // Cm7
 [103.83,155.56,196,261.63],     // Abmaj7
 [116.54,174.61,233.08,293.66], // Bb
 [130.81,155.56,196,261.63]     // Cm(add9)
];
const AMBIENCE=['city','wind','crowd','surf','birds'];
const FLEET=['helicopter','mixer','truck','crane','pour','siren','storm'];
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
 debrisLand:.17,glass:.22,carCrash:.5,carHorn:1.8,boom:.20,quake:1.5,
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
export function decideAudioMix({walk=false,paused=false,muted=false,danger=0,health=100,
  carCount=0,recovery={stage:'idle',phase:'idle'},daylight=1}={}){
 const working=recovery?.phase!=='idle';
 const audible=muted?0:paused?.12:1;
 return {
  ambience:audible*(walk?.39:.32),
  music:audible*(danger?.44:.70)*(health<25?.82:1),
  wind:audible*(.10+Math.min(1,danger)*.40),
  city:audible*(carCount?.29:.14)*(danger?.48:1),
  crowd:audible*(danger?.10:.18)*(daylight<.35?.48:1),
  surf:audible*.12,
  birds:audible*(daylight>.35?.10:.012)*(danger?.25:1),
  storm:audible*Math.min(1,danger)*.5,
  helicopter:audible*(working&&recovery.stage==='sweep'?.67:0),
  mixer:audible*(working&&recovery.stage==='fill'?.48:0),
  truck:audible*(working&&['fill','build'].includes(recovery.stage)&&recovery.phase==='arrive'?.40:0),
  crane:audible*(working&&recovery.stage==='build'?.45:0),
  pour:audible*(working&&recovery.stage==='fill'&&recovery.phase==='pour'?.52:0),
  siren:audible*Math.min(1,(recovery?.emergency||0))*.38
 };
}
function synthesized(ctx,kind,loop=false){
 const [duration,f1,f2,noise]=loop?LOOPS[kind]:SOUND[kind];
 const rate=ctx.sampleRate,frames=Math.floor(duration*rate);
 const buffer=ctx.createBuffer(1,frames,rate),data=buffer.getChannelData(0);
 let low=0,seed=0x1248abcd;
 for(let i=0;i<frames;i++){
  const t=i/rate,u=t/duration;
  seed=(Math.imul(seed,1664525)+1013904223)|0;
  const white=seed/2147483648;
  const transient=loop?Math.sin(Math.PI*u)**2:Math.exp(-u*5.8);
  const f=loop?f1: f1+(f2-f1)*u*u;
  const phase=TAU*(loop?f1*t: (f1*t+(f2-f1)*t*u/3));
  low=low*.91+white*.09;
  const tone=Math.sin(phase)+.24*Math.sin(phase*2+.3)+.12*Math.sin(phase*.5);
  const hiss=noise*(low*2*.85+white*.15);
  let envelope=loop?(.6+.4*Math.sin(TAU*t*3.2)**2):transient;
  if(loop){
   // Match the initial and final envelopes closely for seamless looping.
   const fade=Math.min(1,t/.045,(duration-t)/.045);
   envelope*=Math.max(0,fade);
  }
  if(kind==='birds'){
   const chirp=Math.pow(Math.max(0,Math.sin(TAU*1.5*t)),9);
   data[i]=.28*Math.sin(TAU*(f1*t+90*t*t))*chirp*Math.sin(Math.PI*u)**2;
  }else if(kind==='siren'){
   envelope=1; // continuous emergency warble
   data[i]=(.30*Math.sin(TAU*(730*t+45*Math.sin(TAU*.84*t))))*Math.min(1,t/.04,(duration-t)/.04);
  }else if(kind==='helicopter'){
   const rotor=Math.sin(TAU*15*t)**8;
   data[i]=(tone*.19+Math.sign(Math.sin(TAU*23*t))*.24+rotor*.25+hiss*.31)*envelope;
  }else if(kind==='engine'||kind==='truck'||kind==='mixer'){
   const lowOct=Math.sin(phase*.5)**3;
   data[i]=(tone*.26+lowOct*.37+hiss*.39)*envelope;
  }else if(kind==='city'||kind==='crowd'){
   data[i]=(tone*.16+hiss*.54+Math.sin(TAU*(f1*1.7)*t)*.04)*envelope;
  }else if(kind==='wind'||kind==='storm'||kind==='surf'||kind==='pour'){
   data[i]=(tone*.12+hiss*.86)*envelope;
  }else{
   data[i]=(tone*(1-noise*.55)+hiss)*envelope;
  }
 }
 return buffer;
}
const safeDisconnect=(...nodes)=>nodes.forEach(n=>{try{n?.disconnect()}catch{}});
export class AudioPass{
 constructor({mobile=false,windowObject=globalThis,contextFactory=null}={}){
  this.mobile=mobile;this.host=windowObject;this.contextFactory=contextFactory;
  this.enabled=true;this.unlocked=false;this.ctx=null;this.world=null;
  this.musicLevel=1;this.effectsLevel=1;this.ambientLevel=1;
  this.master=null;this.sfxBus=null;this.ambientBus=null;this.musicBus=null;
  this.buffers=new Map();this.loops=new Map();this.cooldowns=new Map();
  this.oneshots=new Set();this.maxVoices=mobile?13:22;
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
   comp.threshold.value=-18;comp.knee.value=19;comp.ratio.value=4;
   comp.attack.value=.004;comp.release.value=.24;
   this.master=c.createGain();this.master.gain.value=.56;
   this.master.connect(comp);comp.connect(c.destination);
   this.sfxBus=c.createGain();this.sfxBus.gain.value=.84*this.effectsLevel;this.sfxBus.connect(this.master);
   this.ambientBus=c.createGain();this.ambientBus.gain.value=.31;this.ambientBus.connect(this.master);
   this.musicBus=c.createGain();this.musicBus.gain.value=.18;this.musicBus.connect(this.master);
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
   this.master.gain.setTargetAtTime(this.enabled?.56:0,this.ctx.currentTime,.035);
  }
 }
  setMusicVolume(value){this.musicLevel=clamp(value)}
 setAmbienceVolume(value){this.ambientLevel=clamp(value)}
 setEffectsVolume(value){
  this.effectsLevel=clamp(value);
  if(this.sfxBus)this.sfxBus.gain.setTargetAtTime(.84*this.effectsLevel,this.ctx.currentTime,.08);
 }
 resetScene(){
  this.world=null;this.cooldowns.clear();this.stepCooldown=0;
  for(const item of this.loops.values())item.gain.gain.value=0;
 }
 dispose(){
  for(const item of this.loops.values()){try{item.src.stop()}catch{}safeDisconnect(item.src,item.gain,item.pan)}
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
  if(this.oneshots.size>=this.maxVoices){this.metrics.dropped++;return false}
  this.cooldowns.set(key,t+(COOL[kind]??.095));
  const source=c.createBufferSource(),buffer=this.getBuffer(kind);
  if(!buffer)return false;
  source.buffer=buffer;
  source.playbackRate.value=clamp(rate,.65,1.65);
  const amp=c.createGain(),volume=clamp(power,0,2);
  // Soft onset and smooth release eliminate clicks from procedural effects.
  const g=Math.min(.9,volume*.42*gain);
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
  src.connect(gain);
  if(pan){gain.connect(pan);pan.connect(this.ambientBus)}
  else gain.connect(this.ambientBus);
  src.start();
  const item={src,gain,pan,name};this.loops.set(name,item);
  return item;
 }
 loop(name,volume,position=null,rate=1){
  const item=this.getLoop(name);if(!item)return;
  const c=this.ctx;
  const g=clamp(volume)*spatialGain(position,this.getListener(),
    this.world?.scene?.activeCamera?.name==='street level spectator'?60:160);
  item.gain.gain.setTargetAtTime(g,c.currentTime,.18);
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
  // Temporal clock is WebAudio-based, independent from framerate. Music is
  // generated only shortly ahead and pauses completely when game is paused.
  const horizon=time+.28;let guard=0;
  while(this.nextBeat<horizon&&guard++<4){
   if(this.nextBeat<time-.5){this.nextBeat=time+.04;continue}
   const beat=this.beat++,chord=CHORDS[Math.floor(beat/8)%CHORDS.length];
   if(beat%8===0){
    for(const [i,f] of chord.entries())
     this.note(f/2,this.nextBeat,BEAT*6.8,(i===0?.057:.036),i%2?'sine':'triangle');
   }
   if(beat%2===0){
    this.note(chord[0]/2,this.nextBeat,BEAT*.85,.09,danger>.35?'sawtooth':'sine');
   }
   const melody=[2,3,1,0,2,3,1,2,3,2,0,1,2,3,1,0][beat%16];
   if(beat%4!==3){
    const freq=chord[melody]*2;
    this.note(freq,this.nextBeat+.11,BEAT*(danger>.4?.55:.8),
      danger>.4?.064:.045,'sine');
   }
   this.nextBeat+=BEAT;
  }
 }
 update({world=this.world,disasters=null,walk=null,paused=false,dt=.016}={}){
  if(!this.unlocked||!this.enabled||!this.ctx||!world)return;
  this.world=world;
  const t=this.ctx.currentTime;if(t<this.nextUpdate)return;
  this.nextUpdate=t+.11;
  const damaged=Math.max(0,100-world.integrity())/100;
  const disasterDanger=Math.min(1,(disasters?.effects?.length||0)*.6+
    (disasters?.meteors?.length||0)*.65+damaged*.3);
  const recovery=world.progression?.recovery;
  const stage=recovery?.stage||'idle',phase=recovery?.phase||'idle';
  const carCount=world.props.filter(p=>p.type==='car'&&p.traffic?.state==='driving').length;
  const mix=decideAudioMix({walk:!!walk?.enabled,paused,danger:disasterDanger,carCount,
    recovery:{stage,phase,emergency:world.props.some(p=>p.emergency&&p.traffic?.state==='driving')?1:0},
    health:walk?.survival?.health??100,daylight:world.progression?.lightPhase??1});
  this.ambientBus.gain.setTargetAtTime(mix.ambience*this.ambientLevel,t,.4);
  this.musicBus.gain.setTargetAtTime(mix.music*.62*this.musicLevel,t,1.3);
  const living=world.civilians?.filter(p=>p.state!=='dead').length??0;
  for(const key of AMBIENCE)this.loop(key,key==='crowd'?mix[key]*clamp(living/90):mix[key]);
  this.loop('storm',mix.storm,disasters?.effects?.find(f=>f.root)?.root?.position);
  this.loop('siren',mix.siren,world.props.find(p=>p.emergency)?.mesh.position);
  const heli=recovery?.heli,crane=recovery?.crane,mixer=recovery?.mixer,truck=recovery?.truck;
  this.loop('helicopter',mix.helicopter,heli?.root.position,phase==='haul'?1.08:.95);
  this.loop('mixer',mix.mixer,mixer?.root.position);
  this.loop('pour',mix.pour,recovery?.site);
  this.loop('crane',mix.crane,crane?.root.position,phase==='construct'?1.13:.78);
  this.loop('truck',mix.truck,truck?.root.position);
  const listener=this.getListener();
  const cars=world.props.filter(p=>p.type==='car'&&p.traffic?.state==='driving')
    .map(p=>({p,g:spatialGain(p.mesh.position,listener,72)}))
    .sort((a,b)=>b.g-a.g).slice(0,this.mobile?2:4);
  for(let i=0;i<(this.mobile?2:4);i++){
   const car=cars[i]?.p;
   this.loop('car'+i,paused?0:(car?(car.emergency?.49:.39):0),
     car?.mesh.position,car?.traffic?.slowUntil>world.time?.68:
       1+((car?.traffic?.speed??8)-8)*.035);
  }
  if(!paused&&walk?.enabled&&!walk.survival.dead&&walk.survival.grounded){
   const v=walk.survival.body?.getLinearVelocity();
   const pace=Math.hypot(v?.x||0,v?.z||0);
   if(pace>1.5&&t>this.stepCooldown){
    const fast=pace>8;
    this.play(fast?'sprint':'footstep',walk.camera.position,.48,{rate:.92+hash(this.metrics.played)*.16});
    this.stepCooldown=t+(fast?.24:.34);
   }
  }
  if(!paused&&this.musicBus)this.scheduleScore(t,disasterDanger);
 }
 getState(){return {supported:!!(this.contextFactory||this.host?.AudioContext||this.host?.webkitAudioContext),
  unlocked:this.unlocked,enabled:this.enabled,contextState:this.ctx?.state||'none',
  voices:this.oneshots.size,loops:this.loops.size,bufferCount:this.buffers.size,
  musicLevel:this.musicLevel,effectsLevel:this.effectsLevel,ambientLevel:this.ambientLevel,
  ...this.metrics};}
}
