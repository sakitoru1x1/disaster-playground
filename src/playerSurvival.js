import {MeshBuilder, PhysicsAggregate, PhysicsShapeType, Vector3} from '@babylonjs/core';
import {meteorScale} from './meteorBalance.js';

// Player is one real Havok rigid body. All impulses and collisions happen in
// the existing world; health / drowning / balance are gameplay rules.
const V=(x,y,z)=>new Vector3(x,y,z);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const HEIGHT=1.9, RADIUS=.48, MASS=65, EYE_OFFSET=.78;
const safeMesh=m=>m&&!m.isDisposed()&&m.isEnabled();

export class PlayerSurvival {
  constructor(walk){
    this.walk=walk;
    this.world=walk.world;
    this.camera=walk.camera;
    this.scene=walk.scene;
    this.health=100;
    this.dead=false;
    this.body=null;
    this.mesh=null;
    this.inAir=false;
    this.knockdown=0;
    this.drowning=0;
    this.cooldown=0;
    this.shake=0;
    this.lastHurt='none';
    this.events=0;
    this.impacts=0;
    this.waveSeen=new Set();
    this.contactCooldown=new Map();
    this.prevY=1.05;
    this.prevVy=0;
    this.grounded=true;
    this.simTime=0;
    this.uiTimer=0;
    this.cameraShakeTime=0;
    this.onDeath=null;
  }
  spawn(x,z){
    this.removeBody();
    this.mesh=MeshBuilder.CreateCapsule('PLAYER Havok capsule',
      {height:HEIGHT,radius:RADIUS,tessellation:8,capSubdivisions:4},this.scene);
    this.mesh.position.set(x,1.05,z);
    this.mesh.isVisible=false;
    this.mesh.isPickable=false;
    this.aggregate=new PhysicsAggregate(this.mesh,PhysicsShapeType.CAPSULE,
      {mass:MASS,friction:.83,restitution:0},this.scene);
    this.body=this.aggregate.body;
    this.body.setLinearDamping(.6);
    this.body.setAngularDamping(1);
    this.prevY=this.mesh.position.y;
    this.prevVy=0;
    this.grounded=true;
    this.waveSeen.clear();
    this.contactCooldown.clear();
  }
  removeBody(){
    this.aggregate?.dispose();this.aggregate=null;this.body=null;
    this.mesh?.dispose();this.mesh=null;
  }
  dispose(){this.removeBody()}
  takeDamage(amount,cause='impact',knock=0){
    if(this.dead||amount<=0)return;
    this.health=clamp(this.health-amount,0,100);
    this.events++;
    this.lastHurt=cause;
    this.shake=Math.max(this.shake,clamp(.15+amount*.024,0,2.2));
    this.cooldown=Math.max(this.cooldown,.15);
    this.knockdown=Math.max(this.knockdown,knock);
    if(this.health===0){
      this.dead=true;
      this.knockdown=10;
      this.body?.setLinearVelocity(V(0,0,0));
      this.onDeath?.(cause);
    }
  }
  impulse(x,y,z){
    if(!this.body||this.dead)return;
    this.body.applyImpulse(V(x,y,z),this.mesh.getAbsolutePosition());
  }
  environment(dt,disasters){
    if(!this.body||this.dead||!disasters)return;
    const p=this.mesh.position,vel=this.body.getLinearVelocity();
    let exposure=0;
    for(const fx of disasters.effects){
      if(fx.type==='tornado'){
        const center=fx.root.position,k=fx.strength;
        const dx=p.x-center.x,dz=p.z-center.z,dist=Math.max(.7,Math.hypot(dx,dz));
        const radius=14+24*k;
        if(dist>=radius)continue;
        const f=1-dist/radius;
        // Inward suction + rotational airflow + updraft inside the funnel.
        const lift=k*(f>.57?25+35*f:5*f);
        const swirl=k*k*(12+34*f);
        const pull=k*k*(4+18*f);
        this.body.applyForce(V(
          MASS*((-dx/dist)*pull+(-dz/dist)*swirl),
          MASS*lift,
          MASS*((-dz/dist)*pull+(dx/dist)*swirl)
        ),p);
        if(f>.5&&k>.48&&this.cooldown<=0){
          this.takeDamage((k-.45)*7*f,'tornado',.18);
          this.cooldown=.7;
        }
        exposure=Math.max(exposure,f*k);
      }else if(fx.type==='quake'){
        const dist=Math.hypot(p.x-fx.origin.x,p.z-fx.origin.z);
        const intensity=fx.strength*clamp(1-dist/175,.3,1);
        this.shake=Math.max(this.shake,intensity*.56);
        if(intensity>.35){
          // Deterministic rocking force, stronger at the epicenter.
          const pulse=Math.sin((fx.age+this.simTime*.11)*26);
          this.body.applyForce(V(MASS*intensity*11*pulse,0,
            MASS*intensity*7*Math.cos(fx.age*23)),p);
          if(intensity>.63&&this.cooldown<=0){
            this.takeDamage(2.5*intensity,'earthquake',intensity*.36);
            this.cooldown=.95;
          }
        }
        exposure=Math.max(exposure,intensity*.75);
      }else if(fx.type==='tsunami'){
        const front=fx.root.position.x;
        const relative=front-p.x;
        if(relative< -6||relative>30||Math.abs(p.z)>82)continue;
        const k=fx.strength, f=relative<3?clamp((relative+6)/9,0,1):
          clamp((30-relative)/27,0,1);
        const active=f*k;
        if(active<=0)continue;
        const height=fx.waveHeight;
        const lift=clamp((height-(p.y-.45))/Math.max(1,height),0,1);
        this.body.applyForce(V(MASS*(8+65*k*k)*f,
          MASS*(7+33*k*k)*f*lift,
          MASS*5*Math.sin(fx.age*7)*f*k),p);
        if(relative>=-2&&height>1.8){
          this.drowning+=dt*clamp((height-p.y)/Math.max(1,height),0,1)*k;
          if(this.drowning>2&&this.cooldown<=0){
            this.takeDamage((4+12*k)*dt*8,'drowning',.15);
            this.cooldown=.35;
          }
        }
        if(k>.5&&relative>=-3&&this.cooldown<=0){
          this.takeDamage(10*k*k*f,'tsunami',k*.9);
          this.cooldown=.85;
        }
        exposure=Math.max(exposure,active);
      }
    }
    // Shock-front impacts propagate outwards instead of hurting the player
    // the moment a distant meteor is deployed.
    for(const m of disasters.meteorHistory){
      const id=m.impactTime;
      if(this.waveSeen.has(id)||!Number.isFinite(m.explosionTime))continue;
      const k=m.strength??.7,scale=meteorScale(k);
      const dist=Math.hypot(p.x-m.x,p.z-m.z,(p.y-m.y)*.26);
      const age=disasters.time-m.explosionTime;
      if(age<0||dist>scale.radius||age>scale.maxWaveAge+1){
        if(age>scale.maxWaveAge+1)this.waveSeen.add(id);
        continue;
      }
      if(dist>scale.waveSpeed*age+6)continue;
      this.waveSeen.add(id);
      const closeness=1-dist/scale.radius;
      const damage=(9+105*Math.pow(k,1.35))*Math.pow(closeness,1.7);
      const dx=(p.x-m.x)/Math.max(1,dist),dz=(p.z-m.z)/Math.max(1,dist);
      this.impulse(dx*MASS*(3+20*k)*closeness,
        MASS*(2+11*k)*closeness,
        dz*MASS*(3+20*k)*closeness);
      this.takeDamage(damage,'meteor',clamp(k*closeness*1.7,0,1.65));
      exposure=Math.max(exposure,closeness);
    }
    if(exposure===0)this.drowning=Math.max(0,this.drowning-dt*.65);
  }
  // Detect fast, physically simulated debris overlapping the capsule. This
  // supplements Havok contact resolution with impact damage; it never moves rubble.
  debrisHits(){
    if(!this.body||this.dead)return;
    const p=this.mesh.position,playerVel=this.body.getLinearVelocity();
    const groups=[...this.world.fragments,...this.world.debris,...this.world.props,
      ...this.world.visualFragments];
    let inspected=0;
    for(const part of groups){
      const m=part.mesh;
      if(!safeMesh(m))continue;
      const pos=m.getAbsolutePosition();
      if(Math.abs(pos.x-p.x)>3.8||Math.abs(pos.z-p.z)>3.8||
         Math.abs(pos.y-p.y)>4.5)continue;
      if(++inspected>32)break;
      const bounds=m.getBoundingInfo().boundingBox;
      if(p.x<bounds.minimumWorld.x-.7||p.x>bounds.maximumWorld.x+.7||
         p.z<bounds.minimumWorld.z-.7||p.z>bounds.maximumWorld.z+.7||
         p.y<bounds.minimumWorld.y-1.05||p.y>bounds.maximumWorld.y+1.05)continue;
      if(this.contactCooldown.get(m.uniqueId)>this.simTime)continue;
      let v;
      try{v=part.aggregate?.body.getLinearVelocity()||part.velocity||V(0,0,0)}
      catch{v=V(0,0,0)}
      const objectSpeed=Math.hypot(v.x,v.y,v.z);
      const relative=Math.hypot(v.x-playerVel.x,v.y-playerVel.y,v.z-playerVel.z);
      // Walking into a parked car must not register as a flying-object strike.
      if(objectSpeed<4.2||relative<4.2)continue;
      const damage=clamp((relative-4)*1.7,0,36);
      const direct=part.type==='car'?'vehicle':'debris';
      this.takeDamage(damage,direct,clamp(relative*.025,0,.9));
      this.contactCooldown.set(m.uniqueId,this.simTime+.7);
      this.impacts++;
      break;
    }
  }
  step(dt,disasters,{forward=0,right=0,yaw=0,sprint=false}={}){
    if(!this.body)return;
    dt=clamp(dt,0,.065);
    this.simTime+=dt;
    this.cooldown=Math.max(0,this.cooldown-dt);
    this.knockdown=Math.max(0,this.knockdown-dt);
    this.shake=Math.max(0,this.shake-dt*1.4);
    const v=this.body.getLinearVelocity(),pos=this.mesh.position;
    // Falling after being thrown is fully resolved by Havok and ground physics.
    const grounded=pos.y<1.28&&v.y<2.4&&v.y> -4;
    if(!this.dead&&grounded&&!this.grounded&&this.prevVy< -8){
      this.takeDamage(Math.min(100,Math.pow(-this.prevVy-7,1.6)*.8),
        'fall',clamp(-this.prevVy/21,0,2));
    }
    this.prevVy=v.y;this.grounded=grounded;
    if(!this.dead){
      const speed=(sprint?11.5:7.2)*(this.knockdown>0?.24:1);
      const length=Math.hypot(forward,right);
      const f=forward/Math.max(1,length),r=right/Math.max(1,length);
      const wishX=(Math.sin(yaw)*f+Math.cos(yaw)*r)*speed;
      const wishZ=(Math.cos(yaw)*f-Math.sin(yaw)*r)*speed;
      const blend=Math.min(1,dt*(grounded?6:1.2)*(this.knockdown>0?.5:1));
      this.body.setLinearVelocity(V(v.x+(wishX-v.x)*blend,
        v.y,v.z+(wishZ-v.z)*blend));
      // Capsule should stand upright even after violent collisions.
      this.body.setAngularVelocity(V(0,0,0));
      this.environment(dt,disasters);
      this.debrisHits();
    }
    // Keep the head bound to the body with only visual hit reaction.
    this.cameraShakeTime+=dt*29;
    const bob=Math.sin(this.cameraShakeTime)*Math.min(.16,this.shake*.11);
    const tilt=this.knockdown>0?.25:0;
    this.camera.position.set(pos.x,pos.y+EYE_OFFSET-tilt+bob,pos.z);
    const shakeX=this.shake*Math.sin(this.cameraShakeTime*2.3)*.025;
    const shakeY=this.shake*Math.cos(this.cameraShakeTime*1.73)*.03;
    this.camera.rotation.set(this.walk.pitch+shakeY,
      this.walk.yaw+shakeX,this.knockdown>0?.09*Math.sin(this.cameraShakeTime*.6):0);
    this.uiTimer+=dt;
    if(this.uiTimer>.14){
      this.uiTimer=0;
      const health=document.querySelector('#walkHealthValue');
      if(health)health.textContent=Math.ceil(this.health)+'%';
      const bar=document.querySelector('#walkHealthFill');
      if(bar)bar.style.width=this.health+'%';
      const status=document.querySelector('#walkDanger');
      if(status)status.textContent=this.dead?'DEAD':this.drowning>1.2?'DROWNING':
        this.knockdown>.2?'STUNNED':this.health<32?'CRITICAL':'ALIVE';
      document.documentElement.style.setProperty('--player-hurt',
        String(this.dead?.8:clamp(this.shake*.19+(100-this.health)*.003,0,.7)));
    }
  }
  dieState(){return {health:+this.health.toFixed(2),dead:this.dead,knockdown:+this.knockdown.toFixed(2),
    drowning:+this.drowning.toFixed(2),lastHurt:this.lastHurt,events:this.events,
    impacts:this.impacts,grounded:this.grounded,velocity:this.body?.getLinearVelocity().asArray()||[0,0,0],
    physicalBody:!!this.body};}
  revive(x,z){
    this.health=100;this.dead=false;this.knockdown=0;this.drowning=0;
    this.shake=0;this.cooldown=0;this.lastHurt='none';
    this.spawn(x,z);
  }
}
