import {
  Vector3, Color3, Color4, MeshBuilder, StandardMaterial, TransformNode,
  PhysicsAggregate, PhysicsShapeType, ParticleSystem, PointLight, Mesh
} from '@babylonjs/core';
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
    this.volume=.8;this.audioEnabled=true;this.audio=null;
  }
  get strength(){return this.lastStrength||.75}
  deploy(type,position,intensity=.75){
    const p=position.clone();
    p.x=clamp(p.x,-75,75);p.z=clamp(p.z,-75,75);
    const strength=clamp(intensity,.15,1);
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
    const radius=1.7+strength*1.65;
    const mesh=MeshBuilder.CreateSphere('HAVOK METEOR PROJECTILE',{diameter:radius*2,segments:14},scene);
    // Resolve the selected city object: ground clicks inside a footprint also target its facade.
    const targetStorey=w.findBuildingAt(target.x,target.z,target.y);
    const aim=targetStorey?
      V(targetStorey.mesh.position.x,Math.max(6,targetStorey.mesh.position.y),targetStorey.mesh.position.z):
      V(target.x,Math.max(0,target.y),target.z);
    const flightTime=1.1;
    const launchOffset=V(20,63,17);
    mesh.position=aim.add(launchOffset);mesh.material=w.materials.meteor;
    mesh.isPickable=false;
    const fire=MeshBuilder.CreateSphere('meteor incandescent core',{diameter:radius*1.65,segments:10},scene);
    fire.material=this.material('molten meteor corona','#f7a44f',.56,'#ff652b');
    fire.parent=mesh;fire.isPickable=false;
    const aggregate=new PhysicsAggregate(mesh,PhysicsShapeType.SPHERE,{mass:800+strength*900,friction:.35,restitution:.08},scene);
    // Ballistic velocity includes compensation for Havok's downward gravity.
    aggregate.body.setLinearVelocity(V(-launchOffset.x/flightTime,-launchOffset.y/flightTime+9*flightTime,-launchOffset.z/flightTime));
    aggregate.body.setAngularVelocity(V(3,1.1,2));
    const system=new ParticleSystem('meteor burning tail',330,scene);
    system.particleTexture=w.getParticleTexture();system.emitter=mesh;
    system.minSize=.8;system.maxSize=3;
    system.minLifeTime=.22;system.maxLifeTime=.8;
    system.emitRate=350;system.minEmitPower=.7;system.maxEmitPower=3.4;
    system.color1=new Color4(1,.68,.23,.95);system.color2=new Color4(1,.19,.05,.85);
    system.colorDead=new Color4(.3,.28,.3,0);system.gravity=V(0,3,0);system.start();
    this.meteors.push({mesh,aggregate,system,target:aim,strength,life:0,
      lastPosition:mesh.position.clone(),targetBuildingId:targetStorey?.building.id??null});
    this.shake=Math.max(this.shake,.3);this.emitSound('wind',.55);
    this.events.onStatus?.('INCOMING PROJECTILE','Trajectory locked. Brace for impact.');
  }
  detonate(m,contact=null){
    const p=contact?.point?.clone()||m.mesh.getAbsolutePosition().clone();
    const ground=V(p.x,.6,p.z),strength=m.strength,w=this.world;
    // A direct hit ALWAYS breaks the impacted segment and adjacent load-bearing pieces.
    let directBroken=0;
    if(contact?.entry){
      const e=contact.entry,building=e.building;
      const neighbors=[e,building.floors[e.storey-1],building.floors[e.storey+1]];
      for(const hit of neighbors){
        if(!hit||hit.active)continue;
        const center=hit.mesh.getAbsolutePosition();
        const impulse=center.subtract(p).normalize().scale(28+42*strength)
          .add(V(0,6+14*strength,0));
        if(w.release(hit,impulse))directBroken++;
      }
    }
    const r=17+27*strength;
    const splashBroken=w.fractureAt(p,r,1.35+strength*.6,'blast');
    this.lastMeteorImpact={
      x:p.x,y:p.y,z:p.z,buildingId:contact?.entry?.building.id??null,
      directBroken,shockwaveBroken:splashBroken,totalBroken:w.brokenFloors
    };
    w.tossDebris(V(p.x,Math.max(2,p.y*.38),p.z),Math.floor(12+24*strength),strength);
    this.world.createBurst(p,'fire',Math.floor(120+180*m.strength),1.2+m.strength);
    this.world.createBurst(ground,'dust',Math.floor(150+230*m.strength),.65+m.strength);
    this.world.scorch(ground,5+10*m.strength,true);
    this.waveRing(ground,'#ffc58b',4+20*m.strength,1.1);
    this.waveRing(ground,'#f1bb80',7+26*m.strength,1.7);
    const light=new PointLight('impact illumination',p.add(V(0,5,0)),this.scene);
    light.intensity=120* Math.max(.4,m.strength);light.range=65;light.diffuse=Color3.FromHexString('#ff9f53');
    this.effects.push({type:'flash',light,age:0,maxAge:.5});
    this.shake=Math.max(this.shake,2.3*m.strength);
    this.emitSound('boom',1.2*m.strength);
    this.events.onImpact?.(m.strength);
    m.system.stop();m.system.dispose();m.aggregate.dispose();m.mesh.dispose();
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
      origin:position.clone(),phase:0,lastPulse:0,noise:rand(0,5)};
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
      const p=m.mesh.getAbsolutePosition().clone();
      const radius=(1.7+m.strength*1.65);
      const contact=this.findMeteorContact(m.lastPosition,p,radius);
      if(contact){
        this.detonate(m,contact);
        this.meteors.splice(i,1);
      }else if(p.y<=radius*.7||m.life>3.3){
        // Even a ground impact applies a physically simulated blast to nearby structures.
        this.detonate(m);
        this.meteors.splice(i,1);
      }else{
        m.lastPosition=p;
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
    fx.root.position.x=clamp(fx.origin.x+Math.sin(t*.45+fx.noise)*12,-70,70);
    fx.root.position.z=clamp(fx.origin.z+Math.cos(t*.37+fx.noise)*10,-70,70);
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
    for(const e of w.structures){
      const p=e.mesh.getAbsolutePosition(),dx=p.x-center.x,dz=p.z-center.z;
      const dist=Math.hypot(dx,dz);
      if(dist>radius)continue;
      if(!e.active){
        if(Math.random()<dt*(.5+1.9*k)*(1-dist/radius)){
          const tangent=V(-dz/Math.max(1,dist)*(18+19*k),rand(8,23)*k,dx/Math.max(1,dist)*(18+19*k));
          w.release(e,tangent,p);
        }
      }
    }
    for(const part of w.fragments){
      const p=part.mesh.getAbsolutePosition(),dx=p.x-center.x,dz=p.z-center.z;
      if(Math.hypot(dx,dz)>radius)continue;
      const force=V(-dz*(16+18*k),340*k+12*Math.max(0,radius-Math.hypot(dx,dz)),dx*(16+18*k));
      part.aggregate.body.applyForce(force,p);
    }
    for(const prop of w.props){
      const p=prop.mesh.position,dx=p.x-center.x,dz=p.z-center.z,dist=Math.hypot(dx,dz);
      if(dist<radius)prop.aggregate.body.applyForce(V(-dz*28,450*k,dx*28),p);
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
    this.world.fractureAt(V(p.x,7,p.z),9,.24);
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