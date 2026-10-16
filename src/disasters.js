import {
  Vector3, Color3, Color4, MeshBuilder, StandardMaterial, TransformNode,
  PhysicsAggregate, PhysicsShapeType, ParticleSystem, PointLight, Mesh
} from '@babylonjs/core';
import {blowBody,activateWindRubble} from './windPhysics.js';
import {tornadoDamagePerSecond} from './structuralDamage.js';
import {meteorPower,meteorScale,meteorWaveDamage,meteorHitDistribution} from './meteorBalance.js';
const V=(x,y,z)=>new Vector3(x,y,z);
const rand=(a,b)=>a+Math.random()*(b-a);
const clamp=(a,l,h)=>Math.max(l,Math.min(h,a));
const names={meteor:'METEOR STRIKE',tornado:'TORNADO',quake:'EARTHQUAKE',tsunami:'TSUNAMI'};
const colors={meteor:'#fcb679',tornado:'#99d9dc',quake:'#e7a68f',tsunami:'#82c7eb'};

export class DisasterSystem{
  constructor(world,events={}){
    this.world=world;this.scene=world.scene;this.events=events;
    this.effects=[];this.meteors=[];this.shocks=[];this.time=0;this.shake=0;
    this.stormCounter=0;this.lightning=0;
    this.meteorHistory=[];this.meteorEvents=[];this.lastMeteorImpact=null;this.windEventStats={lifted:0,carsAirborne:0};
    this.blastWaves=[];this.blastHistory=[];
    this.volume=.8;this.audioEnabled=true;this.audio=null;
  }
  get strength(){return this.lastStrength||.75}
  deploy(type,position,intensity=.75){
    const p=position.clone();
    p.x=clamp(p.x,-75,75);p.z=clamp(p.z,-75,75);
    const strength=type==='meteor'?meteorPower(intensity):clamp(intensity,.15,1);
    this.lastStrength=strength;
    this.world.impactCount++;
    switch(type){
      case 'meteor': this.meteor(p,strength);break;
      case 'tornado':this.tornado(p,strength);break;
      case 'quake':this.quake(p,strength);break;
      case 'tsunami':this.tsunami(p,strength);break;
    }
    this.events.onDeploy?.(type,p,strength);
    return p;
  }
  emitSound(kind='boom',power=1){
    if(!this.audioEnabled)return;
    try{
      const Ctx=window.AudioContext||window.webkitAudioContext;
      if(!Ctx)return;
      if(!this.audio)this.audio=new Ctx();
      if(this.audio.state==='suspended')this.audio.resume();
      const ctx=this.audio,t=ctx.currentTime;
      const len=kind==='wind'?2.6:kind==='quake'?2.3:1.9;
      const frames=Math.ceil(ctx.sampleRate*len),buf=ctx.createBuffer(1,frames,ctx.sampleRate);
      const d=buf.getChannelData(0);
      let random=0;
      for(let i=0;i<frames;i++){
        const time=i/ctx.sampleRate;
        random=random*.87+(Math.random()*2-1)*.13;
        const env=Math.pow(1-time/len,kind==='wind'?.7:1.8);
        const rumble=Math.sin(time*(kind==='quake'?34:kind==='wind'?40:55)+Math.sin(time*9)*3);
        d[i]=(random*.6+rumble*.22)*env;
      }
      const src=ctx.createBufferSource();src.buffer=buf;
      const low=ctx.createBiquadFilter();low.type='lowpass';low.frequency.value=kind==='wind'?530:kind==='quake'?210:290;
      const gain=ctx.createGain();gain.gain.value=0;
      gain.gain.setValueAtTime(0,t);
      gain.gain.linearRampToValueAtTime(.22*power*this.volume,t+.08);
      gain.gain.exponentialRampToValueAtTime(.001,t+len);
      src.connect(low);low.connect(gain);gain.connect(ctx.destination);
      src.start(t);src.stop(t+len);
    }catch(e){console.warn('Audio unavailable',e)}
  }
  material(name,color,alpha=.8,emissive=null){
    return this.world.mat(name,color,{alpha,emissive:emissive||color,backFaceCulling:false});
  }

  meteor(target,strength){
    const scene=this.scene,w=this.world;
    // Keep low-power projectiles visible without gigantic 100% spheres.
    const radius=1.2+2.8*Math.pow(strength,.55);
    const mesh=MeshBuilder.CreateSphere('HAVOK METEOR PROJECTILE',{diameter:radius*2,segments:14},scene);
    // Resolve the selected city object: ground clicks inside a footprint also target its facade.
    const targetStorey=w.findBuildingAt(target.x,target.z,target.y);
    const aim=targetStorey?
      V(targetStorey.mesh.position.x,Math.max(6,targetStorey.mesh.position.y),targetStorey.mesh.position.z):
      V(target.x,Math.max(0,target.y),target.z);
    const flightTime=1.1;
    // Open ground is approached nearly vertically so the meteor cannot hit a
    // neighboring skyscraper on the way to the selected road.
    // Roof targets are approached from above so the projectile drills through
    // the roof, not off its edge. Wall targets preserve the diagonal trajectory.
    const isRoofTarget=!!targetStorey&&targetStorey.storey===targetStorey.building.floors.length-1;
    const launchOffset=isRoofTarget?V(0,65,0):targetStorey?V(20,63,17):V(0,66,0);
    mesh.position=aim.add(launchOffset);mesh.material=w.materials.meteor;
    mesh.isPickable=false;
    const fire=MeshBuilder.CreateSphere('meteor incandescent core',{diameter:radius*1.65,segments:10},scene);
    fire.material=this.material('molten meteor corona','#f7a44f',.56,'#ff652b');
    fire.parent=mesh;fire.isPickable=false;
    // Continuous-sweep projectile: collision detection happens BEFORE Havok
    // can resolve a hard-sphere bounce against the still-intact roof.
    // At contact, we transfer momentum to real Havok concrete fragments.
    const aggregate=null;
    const velocity=V(-launchOffset.x/flightTime,-launchOffset.y/flightTime+9*flightTime,-launchOffset.z/flightTime);
    const system=new ParticleSystem('meteor burning tail',330,scene);
    system.particleTexture=w.getParticleTexture();system.emitter=mesh;
    system.minSize=.8;system.maxSize=3;
    system.minLifeTime=.22;system.maxLifeTime=.8;
    system.emitRate=350;system.minEmitPower=.7;system.maxEmitPower=3.4;
    system.color1=new Color4(1,.68,.23,.95);system.color2=new Color4(1,.19,.05,.85);
    system.colorDead=new Color4(.3,.28,.3,0);system.gravity=V(0,3,0);system.start();
    this.meteors.push({mesh,aggregate,velocity,system,target:aim,strength,life:0,
      lastPosition:mesh.position.clone(),targetBuildingId:targetStorey?.building.id??null,
      phase:'flight',contact:null,impactAge:0,explosionDelay:0});
    this.shake=Math.max(this.shake,.3);this.emitSound('wind',.55);
    this.events.onStatus?.('INCOMING PROJECTILE','Trajectory locked. Brace for impact.');
  }
  // At FIRST CONTACT transfer kinetic energy AND trigger the blast in the same
  // physics tick. No delayed explosion and no bouncing off a hard roof.
  beginMeteorImpact(m,contact){
    if(m.phase!=='flight')return;
    const hit=contact||{point:m.mesh.getAbsolutePosition().clone(),entry:null,kind:'ground'};
    const p=hit.point.clone();
    const velocity=m.velocity.clone();
    const direction=velocity.lengthSquared()>1e-6?velocity.normalize():V(-.25,-1,-.2).normalize();
    m.phase='embedded';m.contact={point:p,entry:hit.entry||null,kind:hit.entry?'building':'ground'};
    m.impactAge=0;m.contactTime=this.time;
    const w=this.world;
    // Remove projectile collision body immediately: no rolling, sliding or bouncing.
    if(m.aggregate){m.aggregate.dispose();m.aggregate=null}
    m.velocity=V(0,0,0);
    m.penetrationDirection=direction;
    m.penetrationOrigin=p.clone();
    m.penetrationDistance=hit.entry?1.15+1.75*m.strength:.35;
    m.mesh.position=p.add(direction.scale(.5));
    m.lowerDamaged=false;
    m.nextStorey=hit.entry?.building.floors[hit.entry.storey-1]||null;
    m.mesh.rotation.set(rand(-.25,.25),rand(0,6.28),rand(-.25,.25));
    m.system.emitRate=100;
    const brokenBefore=w.brokenFloors;
    const immediate=w.kineticMeteorImpact(p,direction,m.strength,hit.entry||null);
    m.immediateBroken=w.brokenFloors-brokenBefore;
    m.immediatePieces=immediate;
    this.lastMeteorImpact={x:p.x,y:p.y,z:p.z,buildingId:hit.entry?.building.id??null,
      phase:'impact',contactType:hit.entry?'building':'ground',directBroken:m.immediateBroken,
      physicalPieces:immediate,shockwaveBroken:0,exploded:false,
      delay:0,impactTime:this.time,explosionTime:null,totalBroken:w.brokenFloors};
    this.meteorEvents.push({type:'physical-contact',time:this.time,broken:w.brokenFloors,
      directBroken:m.immediateBroken,physicalPieces:immediate,contactType:m.contact.kind});
    w.createBurst(p,'dust',65,.38+m.strength*.35);
    this.shake=Math.max(this.shake,.65*m.strength);
    // Advance the projectile slightly INTO the penetrated surface, then
    // initiate the blast with no frame delay. The disintegrated building
    // chunks already have real Havok impulses from kineticMeteorImpact().
    m.mesh.position.copyFrom(p.add(direction.scale(m.penetrationDistance)));
    this.detonate(m);
    m.phase='done';
  }

  detonate(m){
    // Explode where the meteor has actually tunneled into the structure,
    // not at the old surface intersection above the roof.
    const p=m.mesh.position.clone();
    const ground=V(p.x,.6,p.z),strength=m.strength,w=this.world;
    const brokenBefore=w.brokenFloors;
    // Bound the number of physics bodies spawned in one frame to avoid a
    // long synchronous Havok update that looks like a frozen browser.
    const scale=meteorScale(strength);
    const r=scale.radius;
    // A few closest sections are struck in the SAME frame. Subsequent
    // districts are hit when the travelling pressure front reaches them.
    const wave=this.startBlastWave(p,strength);
    const splashBroken=wave.broken;
    this.lastMeteorImpact={
      ...this.lastMeteorImpact,x:p.x,y:p.y,z:p.z,phase:'explosion',exploded:true,
      directBroken:m.immediateBroken,physicalPieces:m.immediatePieces,
      shockwaveBroken:splashBroken,waveRadius:r,explosionTime:this.time,
      elapsedAfterContact:this.time-m.contactTime,totalBroken:w.brokenFloors
    };
    this.meteorEvents.push({type:'explosion',time:this.time,broken:w.brokenFloors,
      directBroken:m.immediateBroken,shockwaveBroken:splashBroken,contactType:m.contact.kind});
    this.meteorHistory.push({...this.lastMeteorImpact});
    if(this.meteorHistory.length>16)this.meteorHistory.shift();
    wave.impactLog=this.meteorHistory.at(-1);
    if(wave.finished)this.finishBlastLog(wave);
    w.tossDebris(V(p.x,Math.max(2,p.y*.38),p.z),Math.round(2+14*strength),.22+.78*strength);
    this.world.createBurst(p,'fire',scale.particles,.7+strength*1.3);
    this.world.createBurst(ground,'dust',Math.round(scale.particles*.85),.6+strength);
    this.world.scorch(ground,3+scale.coreRadius*.65,true);
    this.waveRing(ground,'#ffc58b',r,Math.max(.8,r/scale.waveSpeed));
    this.waveRing(ground,'#f1bb80',r*.75,Math.max(.65,r/scale.waveSpeed*.86));
    const light=new PointLight('impact illumination',p.add(V(0,5,0)),this.scene);
    light.intensity=120* Math.max(.4,m.strength);light.range=65;light.diffuse=Color3.FromHexString('#ff9f53');
    this.effects.push({type:'flash',light,age:0,maxAge:.5});
    this.shake=Math.max(this.shake,2.3*m.strength);
    this.emitSound('boom',1.2*m.strength);
    this.events.onImpact?.(m.strength);
    m.system.stop();m.system.dispose();if(m.aggregate)m.aggregate.dispose();m.mesh.dispose();
  }

  startBlastWave(center,power){
    const config=meteorScale(power);
    const targets=[];
    for(const entry of this.world.structures){
      if(entry.active)continue;
      const p=entry.mesh.getAbsolutePosition();
      const distance=Math.hypot(p.x-center.x,p.z-center.z,(p.y-center.y)*.26);
      if(distance<config.radius){
        targets.push({entry,distance});
      }
    }
    targets.sort((a,b)=>a.distance-b.distance);
    const wave={center:center.clone(),power,config,targets,cursor:0,age:0,broken:0,
      damaged:0,finished:false,firstTime:this.time};
    this.blastWaves.push(wave);
    if(power>.65)this.world.massBlastActive=true;
    // Process the immediate epicenter; the rest is a travelling shockwave.
    this.updateBlastWave(wave,0,true);
    return wave;
  }

  finishBlastLog(wave){
    if(!wave.impactLog)return;
    wave.impactLog.shockwaveBroken=wave.broken;
    wave.impactLog.totalBroken=this.world.brokenFloors;
    wave.impactLog.waveDuration=wave.age;
    wave.impactLog.waveFinished=true;
    if(this.lastMeteorImpact?.impactTime===wave.firstTime){
      Object.assign(this.lastMeteorImpact,wave.impactLog);
    }
  }

  updateBlastWave(wave,dt,initial=false){
    wave.age+=dt;
    const {config,center,power}=wave;
    const frontier=initial?Math.min(12,config.radius):config.waveSpeed*wave.age+6;
    // Throttle creation of Havok rigid bodies separately from damage checks:
    // at most two disintegrating floors and eight section updates per frame.
    let checked=0,released=0;
    const maxChecks=initial?4:8,maxBreaks=initial?2:2;
    while(wave.cursor<wave.targets.length&&checked<maxChecks){
      const item=wave.targets[wave.cursor];
      if(item.distance>frontier)break;
      const entry=item.entry;
      if(entry.active){wave.cursor++;continue}
      const falloff=Math.max(0,1-item.distance/config.radius);
      let damage=meteorWaveDamage(power,item.distance);
      if(item.distance<=config.coreRadius*.82){
        damage=Math.max(damage,entry.maxHealth*1.24);
      }
      // Don't start another dynamic fracture when the per-frame budget is spent.
      if(entry.health<=damage&&released>=maxBreaks)break;
      wave.cursor++;checked++;
      if(damage<1)continue;
      const pos=entry.mesh.getAbsolutePosition();
      const radial=pos.subtract(center),dist=Math.max(1,Math.hypot(radial.x,radial.z));
      const force=V(radial.x/dist*config.impulse*falloff,
        Math.max(2,config.impulse*(.11+.17*falloff)),
        radial.z/dist*config.impulse*falloff);
      if(this.world.damageStructure(entry,damage,force,center,'blast')){
        released++;wave.broken++;
      }else if(entry.health<entry.maxHealth)wave.damaged++;
    }
    if(wave.cursor>=wave.targets.length){
      wave.finished=true;
      this.finishBlastLog(wave);
      this.blastHistory.push({power,radius:config.radius,broken:wave.broken,
        damaged:wave.damaged,targets:wave.targets.length,duration:wave.age});
      if(this.blastHistory.length>12)this.blastHistory.shift();
    }
  }

  waveRing(p,color,maxRadius=25,duration=1.3){
    const ring=MeshBuilder.CreateTorus('impact pressure front',{diameter:2,thickness:.13,tessellation:64},this.scene);
    ring.position=V(p.x,.42,p.z);ring.material=this.material('shockwave '+Math.random(),color,.82);
    ring.isPickable=false;
    this.shocks.push({mesh:ring,age:0,duration,maxRadius});
  }

  tornado(position,strength){
    const scene=this.scene,w=this.world;
    const root=new TransformNode('TORNADO EYE',scene);
    root.position=V(position.x,1,position.z);
    const funnel=this.material('storm condensation','#738791',.19,'#425b64');
    const dark=this.material('dark funnel','#5e6470',.27,'#45525b');
    const foam=this.material('storm dust','#baa995',.29,'#786b60');
    const rings=[],clouds=[];
    const cone=MeshBuilder.CreateCylinder('volumetric twister',{height:30,diameterTop:15+strength*6,diameterBottom:2.2,tessellation:32,subdivisions:7},scene);
    cone.position=V(0,16,0);cone.parent=root;cone.material=funnel;cone.isPickable=false;
    for(let i=0;i<11;i++){
      const y=1.1+i*2.55,r=(1.6+i* .67)*(1+strength*.3);
      const tor=MeshBuilder.CreateTorus('vortex wind stream',{diameter:r*2,thickness:.12+(.16*i/11),tessellation:32},scene);
      tor.position=V(0,y,0);tor.rotation.x=rand(-.22,.22);
      tor.material=i%2?dark:foam;tor.parent=root;tor.isPickable=false;
      rings.push({mesh:tor,phase:rand(0,6),radius:r,height:y});
    }
    for(let i=0;i<34;i++){
      const sphere=MeshBuilder.CreateSphere('tornado dust mote',{diameter:rand(.8,2.9),segments:6},scene);
      sphere.material=i%3===0?dark:foam;sphere.parent=root;sphere.isPickable=false;
      clouds.push({mesh:sphere,r:rand(2,10),height:rand(.4,27),phase:rand(0,6),speed:rand(2,5)});
    }
    const effect={type:'tornado',root,cone,rings,clouds,age:0,duration:10+strength*6,strength,
      origin:position.clone(),phase:0,lastPulse:0,noise:rand(0,5),world:w,
      windTracks:new Map()};
    this.effects.push(effect);
    w.createBurst(position,'dust',190,1);
    this.shake=Math.max(this.shake,.7);
    this.emitSound('wind',1);
    this.events.onStatus?.('VORTEX ACTIVE','Cyclonic winds approaching the city.');
  }

  quake(position,strength){
    const w=this.world,scene=this.scene;
    const rad=45+strength*77;
    this.effects.push({type:'quake',age:0,duration:6.5+strength*4,strength,origin:position.clone(),pulse:0,radius:rad});
    w.fractureAt(V(position.x,8,position.z),rad*.65,.32+strength*.48,'quake');
    this.waveRing(position,'#efc39b',rad*.7,2.2);
    for(let j=0;j<12;j++){
      const angle=rand(0,6.28),length=rand(3,16)*strength,dist=rand(3,42)*strength;
      const x=position.x+Math.cos(angle)*dist,z=position.z+Math.sin(angle)*dist;
      const p1=V(clamp(x,-78,78),.43,clamp(z,-78,78));
      const p2=V(clamp(x+Math.cos(angle)*length,-78,78),.43,clamp(z+Math.sin(angle)*length,-78,78));
      const line=MeshBuilder.CreateTube('seismic fracture',{path:[p1,p2],radius:rand(.07,.24),tessellation:5},scene);
      line.material=w.materials.crack;line.isPickable=false;
    }
    w.createBurst(position,'dust',160,strength);
    this.emitSound('quake',strength);
    this.shake=Math.max(this.shake,1.25*strength);
    this.events.onStatus?.('SEISMIC ACTIVITY','Tectonic instability detected.');
  }
  tsunami(position,strength){
    const scene=this.scene,w=this.world;
    const waveHeight=9+strength*19;
    const root=new TransformNode('TSUNAMI WATER MASS',scene);
    const surface=this.material('translucent tidal front','#58a9c9',.58,'#235d83');
    const crest=this.material('whitecaps','#dcf5f1',.65,'#bfe9e5');
    const face=MeshBuilder.CreateBox('tsunami moving wall',{width:4,height:waveHeight,depth:164},scene);
    face.position=V(0,waveHeight*.5,0);face.material=surface;face.parent=root;face.isPickable=false;
    const lip=MeshBuilder.CreateBox('tsunami frothing crest',{width:6,height:1.7,depth:168},scene);
    lip.position=V(-1.5,waveHeight,0);lip.material=crest;lip.parent=root;lip.isPickable=false;
    const flood=MeshBuilder.CreateBox('water wake',{width:1,height:1.7,depth:164},scene);
    flood.position=V(-1,.15,0);flood.material=this.material('wash water','#69bfd3',.33,'#387c96');
    flood.parent=root;flood.isPickable=false;
    root.position=V(-85,0,0);
    this.effects.push({type:'tsunami',root,face,lip,flood,age:0,duration:8+strength*4,
      strength,origin:position.clone(),lastX:-87,lastSpray:0});
    this.emitSound('wind',strength);
    this.events.onStatus?.('EXTREME WATER SURGE','A tidal wall is entering the district.');
  }

  // Swept sphere vs the intact floor AABBs. Catches collisions even if a heavy
  // high-speed Havok body tunnels through a thin static wall at low FPS.
  findMeteorContact(from,to,radius){
    const direction=to.subtract(from);
    let best=null;
    for(const entry of this.world.structures){
      if(entry.active||!entry.mesh.isEnabled())continue;
      const c=entry.mesh.getAbsolutePosition(),sz=entry.size;
      const extent=[sz.x*.5+radius,sz.y*.5+radius,sz.z*.5+radius];
      const start=[from.x-c.x,from.y-c.y,from.z-c.z];
      const delta=[direction.x,direction.y,direction.z];
      let near=0,far=1,valid=true;
      for(let axis=0;axis<3;axis++){
        if(Math.abs(delta[axis])<1e-8){
          if(Math.abs(start[axis])>extent[axis]){valid=false;break}
        }else{
          const a=(-extent[axis]-start[axis])/delta[axis];
          const b=(extent[axis]-start[axis])/delta[axis];
          near=Math.max(near,Math.min(a,b));
          far=Math.min(far,Math.max(a,b));
          if(near>far){valid=false;break}
        }
      }
      if(valid&&near>=0&&near<=1&&(!best||near<best.t)){
        best={entry,t:near,point:from.add(direction.scale(near))};
      }
    }
    return best;
  }

  tick(dt){
    this.time+=dt;
    for(let i=this.meteors.length-1;i>=0;i--){
      const m=this.meteors[i];m.life+=dt;
      if(m.phase==='done'){this.meteors.splice(i,1);continue}
      // Sweep the meteor along its ballistic path BEFORE Havok runs collision
      // resolution. Its fragments are still real Havok physics objects.
      m.lastPosition=m.mesh.position.clone();
      m.velocity.y-=18*dt;
      const next=m.mesh.position.add(m.velocity.scale(dt));
      const radius=1.2+2.8*Math.pow(m.strength,.55);
      const contact=this.findMeteorContact(m.lastPosition,next,radius);
      if(contact){
        this.beginMeteorImpact(m,contact);
        this.meteors.splice(i,1);
      }else if(next.y<=radius+.35||m.life>3.1){
        const point=V(next.x,Math.max(radius*.9,0.8),next.z);
        this.beginMeteorImpact(m,{point,entry:null,kind:'ground'});
        this.meteors.splice(i,1);
      }else m.mesh.position.copyFrom(next);
    }
    for(let i=this.blastWaves.length-1;i>=0;i--){
      const wave=this.blastWaves[i];
      if(!wave.finished)this.updateBlastWave(wave,dt);
      if(wave.finished||wave.age>wave.config.maxWaveAge+5){
        if(!wave.finished){
          this.blastHistory.push({power:wave.power,radius:wave.config.radius,
            broken:wave.broken,damaged:wave.damaged,targets:wave.targets.length,
            processed:wave.cursor,duration:wave.age,timeout:true});
        }
        this.blastWaves.splice(i,1);
        if(this.blastWaves.every(w=>w.power<=.65))this.world.massBlastActive=false;
      }
    }
    for(let i=this.shocks.length-1;i>=0;i--){
      const ring=this.shocks[i];ring.age+=dt;
      const u=ring.age/ring.duration;
      ring.mesh.scaling.setAll(1+ring.maxRadius*u);
      ring.mesh.material.alpha=(1-u)*.7;
      if(u>=1){ring.mesh.material.dispose();ring.mesh.dispose();this.shocks.splice(i,1)}
    }
    for(let i=this.effects.length-1;i>=0;i--){
      const fx=this.effects[i];fx.age+=dt;
      if(fx.type==='tornado')this.tickTornado(fx,dt);
      if(fx.type==='quake')this.tickQuake(fx,dt);
      if(fx.type==='tsunami')this.tickTsunami(fx,dt);
      if(fx.type==='flash')fx.light.intensity*=Math.exp(-9*dt);
      if(fx.age>=fx.duration || fx.age>=fx.maxAge && fx.type==='flash'){
        this.endEffect(fx);this.effects.splice(i,1);
      }
    }
    this.shake*=Math.exp(-2.2*dt);
  }

  tickTornado(fx,dt){
    const w=this.world,t=fx.age,k=fx.strength;
    // Slow lateral wandering around target.
    // Gentle drift so lifted objects have time to orbit the funnel, instead
    // of chasing a center that runs away from them.
    fx.root.position.x=clamp(fx.origin.x+Math.sin(t*.23+fx.noise)*6,-70,70);
    fx.root.position.z=clamp(fx.origin.z+Math.cos(t*.22+fx.noise)*5,-70,70);
    fx.cone.rotation.y+=dt*.8;
    for(const ring of fx.rings){
      ring.phase+=dt*(1.5+ring.height*.09);
      ring.mesh.position.x=Math.sin(ring.phase)*(.5+ring.height*.06);
      ring.mesh.position.z=Math.cos(ring.phase)*(.5+ring.height*.06);
      ring.mesh.rotation.y+=dt*3;
    }
    for(const mote of fx.clouds){
      mote.phase+=dt*mote.speed;
      const r=mote.r*(.35+mote.height/35);
      mote.mesh.position=V(Math.cos(mote.phase)*r,mote.height,Math.sin(mote.phase)*r);
      mote.mesh.scaling.setAll(1+Math.sin(mote.phase*2)*.15);
    }
    const center=fx.root.position, radius=14+24*k;
    // Buildings have structural resistance: weak tornadoes cannot detach
    // load-bearing floors. Sustained powerful winds gradually fatigue the frame.
    for(const e of w.structures){
      if(e.active||k<=.38)continue;
      const p=e.mesh.getAbsolutePosition(),dx=p.x-center.x,dz=p.z-center.z;
      const dist=Math.hypot(dx,dz);
      if(dist>radius)continue;
      const falloff=Math.max(0,1-dist/radius);
      const damage=tornadoDamagePerSecond(k,falloff)*dt;
      if(damage<=0)continue;
      const tangent=V(-dz/Math.max(1,dist)*(8+28*k*k),5+16*k*k,dx/Math.max(1,dist)*(8+28*k*k));
      w.damageStructure(e,damage,tangent,p,'tornado');
    }
    for(const part of w.fragments){
      if(!part.aggregate)continue;
      const p=part.mesh.getAbsolutePosition();
      blowBody(part.aggregate.body,p,center,radius,k,dt,part.kind==='wall'?'wall':'rubble',fx);
    }
    for(const part of w.debris){
      if(!part.aggregate)continue;
      blowBody(part.aggregate.body,part.mesh.position,center,radius,k,dt,'rubble',fx);
    }
    for(const prop of w.props){
      if(prop.type==='crane'||!prop.aggregate)continue;
      const p=prop.mesh.getAbsolutePosition();
      if(blowBody(prop.aggregate.body,p,center,radius,k,dt,'car',fx)&&p.y>2.2){
        w.windCarsLifted.add(prop.mesh.uniqueId);
      }
    }
    // Settled panels and slabs were static performance proxies. Re-enable Havok
    // physics for nearby loose debris instead of leaving it nailed to the ground.
    fx.liftPulse=(fx.liftPulse||0)+dt;
    if(fx.liftPulse>.29){
      fx.liftPulse=0;
      activateWindRubble(w,center,radius,k,4);
    }
    // Visual-only fallback rubble is still caught by the airflow.
    for(const part of w.visualFragments){
      const p=part.mesh.position;
      if(Math.hypot(p.x-center.x,p.z-center.z)>radius)continue;
      const dx=p.x-center.x,dz=p.z-center.z,d=Math.max(1,Math.hypot(dx,dz));
      part.velocity.x+=(-dz/d*13-dx/d*3)*dt*k;
      part.velocity.z+=(dx/d*13-dz/d*3)*dt*k;
      part.velocity.y+=35*dt*k;
    }
    for(const tree of w.trees){
      const dist=Math.hypot(tree.x-center.x,tree.z-center.z);
      if(dist<radius+7)tree.root.rotation.z=Math.sin(this.time*8+tree.sway)*.16*k*(1-dist/(radius+7));
    }
    fx.lastPulse+=dt;
    if(fx.lastPulse>.65){fx.lastPulse=0;w.createBurst(V(center.x,.7,center.z),'dust',75,.6+k*.3)}
    if(Math.random()<dt*.19 && fx.age>2){
      const strike=V(center.x+rand(-10,10),.5,center.z+rand(-10,10));
      this.spark(strike);
    }
    this.shake=Math.max(this.shake,.18*k);
  }

  spark(p){
    const start=V(p.x+rand(-12,12),55,p.z+rand(-12,12));
    const path=[start];
    for(let h=0;h<9;h++)path.push(V(start.x+rand(-6,6),55-(h+1)*6,start.z+rand(-6,6)));
    const bolt=MeshBuilder.CreateTube('lightning flash',{path,radius:.19,tessellation:5},this.scene);
    bolt.material=this.material('electric flash','#c9effb',.93,'#e7f4ff');bolt.isPickable=false;
    const lamp=new PointLight('electric arc',p.add(V(0,16,0)),this.scene);lamp.diffuse=Color3.FromHexString('#c7e7ff');lamp.intensity=42;lamp.range=46;
    this.effects.push({type:'lightning',bolt,light:lamp,age:0,duration:.21});
    // Lightning here is a visual effect; it must not randomly demolish
    // whole buildings during a weak tornado.
    this.shake=Math.max(this.shake,.35);
  }

  tickQuake(fx,dt){
    const w=this.world,rad=fx.radius,k=fx.strength,p=fx.origin;
    fx.pulse+=dt;
    if(fx.pulse>.58){
      fx.pulse=0;
      const jitter=V(p.x+rand(-rad*.45,rad*.45),rand(3,15),p.z+rand(-rad*.45,rad*.45));
      w.fractureAt(jitter,rad*.47,k*.9,'quake');
      if(Math.random()>.45)w.createBurst(V(jitter.x,.8,jitter.z),'dust',85,.4+k*.4);
      for(const part of w.fragments){
        const pos=part.mesh.getAbsolutePosition();
        if(pos.subtract(p).length()<rad)part.aggregate.body.applyImpulse(V(rand(-8,8)*k,rand(0,7)*k,rand(-8,8)*k),pos);
      }
      for(const item of w.props){
        const pos=item.mesh.position;
        if(pos.subtract(p).length()<rad)item.aggregate.body.applyImpulse(V(rand(-12,12),6*k,rand(-12,12)),pos);
      }
      this.shake=Math.max(this.shake,.6*k);
    }
    this.shake=Math.max(this.shake,.25*k);
  }

  tickTsunami(fx,dt){
    const w=this.world,k=fx.strength;
    const front=-85+170*clamp(fx.age/fx.duration,0,1);
    fx.root.position.x=front;
    fx.face.rotation.z=Math.sin(fx.age*2)*.03;
    fx.lip.position.y=(9+k*19)+Math.sin(fx.age*5)*.6;
    fx.flood.scaling.x=Math.max(1,(front+85)/2);
    fx.flood.position.x=-(front+85)/2;
    // A wide surge transfers momentum to every mass it encounters.
    for(const e of w.structures){
      if(e.active)continue;
      const pos=e.mesh.getAbsolutePosition();
      if(Math.abs(pos.x-front)<4.5 && pos.y<21+k*9 && Math.random()<dt*(2+6*k)){
        w.release(e,V((18+30*k)*.7,4+rand(3,12)*k,rand(-10,10)),pos);
      }
    }
    for(const prop of w.props){
      const p=prop.mesh.position;
      if(Math.abs(p.x-front)<9)prop.aggregate.body.applyForce(V(2100*k,230*k,rand(-300,300)),p);
    }
    for(const part of w.fragments){
      const p=part.mesh.getAbsolutePosition();
      if(Math.abs(p.x-front)<7 && p.y<18+k*13)part.aggregate.body.applyForce(V(740*k,200*k,rand(-160,160)),p);
    }
    fx.lastSpray+=dt;
    if(fx.lastSpray>.26){
      fx.lastSpray=0;
      for(let n=0;n<3;n++)w.createBurst(V(front,2,rand(-73,73)),'water',45,.55+k*.35);
    }
    this.shake=Math.max(this.shake,.13*k);
  }

  endEffect(fx){
    if(fx.type==='tornado'){fx.root.dispose(false,false);fx.cone.dispose();for(const r of fx.rings)r.mesh.dispose();for(const c of fx.clouds)c.mesh.dispose()}
    else if(fx.type==='tsunami'){fx.root.dispose(false,false);fx.face.dispose();fx.lip.dispose();fx.flood.dispose()}
    else if(fx.type==='flash'){fx.light.dispose()}
    else if(fx.type==='lightning'){fx.bolt.material.dispose();fx.bolt.dispose();fx.light.dispose()}
  }
}
