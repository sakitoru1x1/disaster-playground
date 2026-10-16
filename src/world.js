import {
  MeshBuilder, StandardMaterial, PBRMaterial, Color3, Color4, Vector3, Texture,
  DynamicTexture, PhysicsAggregate, PhysicsShapeType, BallAndSocketConstraint, Quaternion, TransformNode, ShadowGenerator,
  HemisphericLight, DirectionalLight, GlowLayer, PointLight, ParticleSystem,
  Animation, VertexBuffer, Mesh, Matrix
} from '@babylonjs/core';
import {fractureStorey} from './fracture.js';
import {splitOnCollision} from './secondaryFracture.js';

const rand=(a,b)=>a+Math.random()*(b-a);
const choice=a=>a[Math.floor(Math.random()*a.length)];
const hex=h=>Color3.FromHexString(h);
const V=(x,y,z)=>new Vector3(x,y,z);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export class CityWorld {
  constructor(scene,camera){
    this.scene=scene; this.camera=camera;
    this.structures=[];this.buildings=[];this.props=[];this.trees=[];this.debris=[];
    this.fragments=[];this.rubble=[];this.pendingFailures=[];this.slabFractures=[];this.maxFragmentBodies=260;
    this.maxPrimaryFragmentBodies=175;this.pendingSecondary=[];this.secondaryBreaks=0;
    this.secondaryPieces=0;this.secondaryImpactEvents=0;this.maxSecondaryBreaks=200;
    this.maxSecondaryPerWindow=16;this.secondaryWindowCount=0;this.secondaryWindowStart=0;
    this.visualFragments=[];this.maxVisualFragments=580;this.visualDropped=0;
    this.particles=[];this.scars=[];this.impactCount=0;this.totalFloors=0;this.brokenFloors=0;
    this.activeBodies=0;this.time=0;this.maxDebris=110;
    this.materials={};this.shadow=null;this.glow=null;
    this.init();
  }

  mat(name,color,opts={}){
    const m=new StandardMaterial(name,this.scene);
    m.diffuseColor=hex(color);m.specularColor=hex(opts.specular||'#172735');
    if(opts.emissive)m.emissiveColor=hex(opts.emissive);
    if(opts.alpha!==undefined)m.alpha=opts.alpha;
    if(opts.backFaceCulling===false)m.backFaceCulling=false;
    if(opts.disableLighting)m.disableLighting=true;
    return m;
  }
  box(name,size,pos,mat,parent=null,shadow=false){
    const b=MeshBuilder.CreateBox(name,{width:size[0],height:size[1],depth:size[2]},this.scene);
    b.position.copyFrom(pos);b.material=mat;b.isPickable=false;
    if(parent)b.parent=parent;
    if(shadow && this.shadow)this.shadow.addShadowCaster(b);
    return b;
  }
  cylinder(name,diameter,height,pos,mat,tess=12,parent=null){
    const m=MeshBuilder.CreateCylinder(name,{diameter,height,tessellation:tess},this.scene);
    m.position.copyFrom(pos);m.material=mat;m.isPickable=false;if(parent)m.parent=parent;return m;
  }

  init(){
    const s=this.scene;
    s.clearColor=new Color4(.54,.70,.80,1);
    s.fogMode=s.FOGMODE_EXP2;s.fogDensity=.0022;s.fogColor=hex('#9fbfce');
    s.ambientColor=hex('#bac9cc');
    const hemi=new HemisphericLight('sky-ambient',V(.25,1,-.4),s);
    hemi.intensity=.55;hemi.diffuse=hex('#dceaf4');hemi.groundColor=hex('#6c6a66');
    const sun=new DirectionalLight('afternoon-sun',V(-.55,-1,.42),s);
    sun.position=V(85,160,-65);sun.intensity=1.14;sun.diffuse=hex('#fff0d1');
    this.sun=sun;this.hemi=hemi;
    this.shadow=new ShadowGenerator(2048,sun);
    this.shadow.usePercentageCloserFiltering=true;
    this.shadow.filteringQuality=ShadowGenerator.QUALITY_MEDIUM;
    this.shadow.bias=.0005;
    this.shadow.normalBias=.026;
    this.shadow.frustumEdgeFalloff=.6;
    sun.shadowMinZ=1;
    sun.shadowMaxZ=240;
    this.makeMaterials();
    this.makeSky();
    this.makeTerrain();
    this.makeDistricts();
    this.makeProps();
  }

  makeMaterials(){
    const m=this.materials;
    m.island=this.mat('land','#819c79');m.grass=this.mat('park grass','#739d81');
    m.soil=this.mat('foundation edge','#b9a48a');m.road=this.mat('road asphalt','#364657');
    m.marking=this.mat('street markings','#e8ddd0',{emissive:'#403e36'});
    m.sidewalk=this.mat('concrete walk','#9ba7a0');
    m.water=this.mat('water','#397b95',{emissive:'#0a2433',alpha:.96});
    m.water.backFaceCulling=false;
    m.tree=this.mat('mint foliage','#448878');m.tree2=this.mat('sunny foliage','#76aa7e');m.trunk=this.mat('tree bark','#645443');
    m.dark=this.mat('roof graphite','#424c59');m.trim=this.mat('highlights','#dddbc9');
    m.concrete=this.mat('broken exposed concrete','#888b86');
    m.glass=this.mat('window blue','#558da0',{emissive:'#163747'});
    m.glassLit=this.mat('window warm','#edbc85',{emissive:'#8d5f35'});
    m.carDark=this.mat('car glass','#233747',{emissive:'#0c2335'});
    m.glow=this.mat('fire glow','#ffa050',{emissive:'#fa642a'});
    m.lamp=this.mat('street lamp light','#fff5cb',{emissive:'#ffe2a7'});
    m.smoke=this.mat('smoke','#4b5662',{alpha:.58});m.dust=this.mat('dust','#c7b5a2',{alpha:.35});
    m.crack=this.mat('crack','#393b3a',{emissive:'#221911'});
    m.meteor=this.mat('meteor rock','#453f44',{emissive:'#c86724'});
    m.chassis=[this.mat('car red','#da786a'),this.mat('car teal','#74a5a7'),this.mat('car cream','#e5cf9f'),this.mat('car blue','#7993b8')];
    m.walls=['#d1c4a9','#a6b9b0','#caadac','#bdc7c5','#9baebd','#d3b796','#bdb4c5'].map((c,i)=>this.mat('building material '+i,c));
    m.wallsAccent=['#947e6d','#657e79','#986d6b','#7b9291','#6b8091','#aa8367','#888097'].map((c,i)=>this.mat('building accent '+i,c));
  }

  makeSky(){
    const t=new DynamicTexture('sky gradient',{width:8,height:512},this.scene,false);
    const ctx=t.getContext();
    const g=ctx.createLinearGradient(0,0,0,512);
    g.addColorStop(0,'#314d68');g.addColorStop(.38,'#7193ad');g.addColorStop(.68,'#bad3d7');g.addColorStop(.82,'#f5d4ae');g.addColorStop(1,'#debea6');
    ctx.fillStyle=g;ctx.fillRect(0,0,8,512);t.update();
    const sky=MeshBuilder.CreateSphere('atmosphere',{diameter:900,segments:24,sideOrientation:Mesh.BACKSIDE},this.scene);
    sky.material=this.mat('sky material','#ffffff',{disableLighting:true,backFaceCulling:false});
    sky.material.emissiveTexture=t;sky.material.diffuseTexture=t;
    sky.isPickable=false;sky.infiniteDistance=true;sky.applyFog=false;
    const sunDisc=MeshBuilder.CreateSphere('sun halo',{diameter:31,segments:20},this.scene);
    sunDisc.position=V(-255,185,110);
    sunDisc.material=this.mat('solar disc','#fff4da',{emissive:'#ffeac2',disableLighting:true});
    sunDisc.isPickable=false;sunDisc.applyFog=false;
  }

  makeTerrain(){
    const m=this.materials;
    this.box('island slab',[172,4,172],V(0,-2.1,0),m.soil,null,true);
    const top=this.box('main land',[172,.15,172],V(0,-.035,0),m.island);top.receiveShadows=true;
    this.ground=top;top.isPickable=true;
    const ocean=MeshBuilder.CreateGround('endless sea',{width:1300,height:1300,subdivisions:30},this.scene);
    ocean.position.y=-3.25;ocean.material=m.water;ocean.isPickable=false;
    this.sea=ocean;
    // Pale surf encircles the floating landmass.
    for(let i=0;i<3;i++){
      const ring=MeshBuilder.CreateTorus('coastal surf '+i,{diameter:176+i*5,thickness:.2+i*.06,tessellation:96},this.scene);
      ring.scaling.z=1;ring.position.y=-3.12+i*.012;ring.material=this.mat('surf foam '+i,'#b8dedd',{emissive:'#7fb7c6',alpha:.48-i*.08});ring.isPickable=false;
    }
    const roads=[-39,-13,13,39];
    for(const x of roads){
      const road=this.box('north south avenue',[7,.06,161],V(x,.07,0),m.road);road.receiveShadows=true;
      const crossing=this.box('avenue edge',[.12,.065,161],V(x-3.34,.09,0),m.marking);
      this.box('avenue edge',[.12,.065,161],V(x+3.34,.09,0),m.marking);
      for(let z=-77;z<79;z+=12)this.box('dashed lane',[.16,.07,4.3],V(x,.105,z),m.marking);
    }
    for(const z of roads){
      const road=this.box('east west avenue',[161,.075,7],V(0,.115,z),m.road);road.receiveShadows=true;
      this.box('avenue edge',[161,.09,.12],V(0,.12,z-3.34),m.marking);
      this.box('avenue edge',[161,.09,.12],V(0,.12,z+3.34),m.marking);
      for(let x=-77;x<79;x+=12)this.box('dashed lane',[4.3,.08,.15],V(x,.148,z),m.marking);
    }
    // District plots and subtle grassy courtyards.
    const coords=[-52,-26,0,26,52];
    for(let i=0;i<5;i++)for(let j=0;j<5;j++){
      const x=coords[i],z=coords[j];
      const platform=this.box('city block',[18.6,.3,18.6],V(x,.13,z),m.sidewalk);platform.receiveShadows=true;
      if((i===1&&j===3)||(i===3&&j===1)||(i===2&&j===2)){
        const grass=this.box('district park',[16,.11,16],V(x,.35,z),m.grass);grass.receiveShadows=true;
        if(i===2&&j===2){
          const plaza=this.cylinder('central fountain basin',8,.72,V(x,.7,z),m.trim,36);
          const pond=this.cylinder('fountain water',6.7,.12,V(x,1.11,z),m.water,36);
          const art=this.cylinder('public sculpture',.7,4.1,V(x,3,z),this.materials.dark,6);
          art.rotation.z=.26;
        }else{
          for(let k=0;k<5;k++)this.createTree(x+rand(-6,6),z+rand(-6,6),.82);
        }
      }
      for(let a=0;a<4;a++){
        const side=a<2?-1:1,axis=a%2===0;
        if((i===2&&j===2))continue;
        const px=x+(axis?side*8.3:0),pz=z+(!axis?side*8.3:0);
        if(Math.random()<.75)this.createTree(px+rand(-.5,.5),pz+rand(-.5,.5),.6);
      }
    }
    for(let k=0;k<13;k++){
      const theta=k/13*Math.PI*2;
      const x=Math.cos(theta)*(106+Math.sin(k*2.3)*12),z=Math.sin(theta)*(105+Math.cos(k*3.8)*11);
      const island=MeshBuilder.CreateSphere('island distant rock',{diameter:rand(18,35),segments:5},this.scene);
      island.position=V(x,-8,z);island.scaling.y=.3;island.material=k%2?m.soil:m.island;island.isPickable=false;
    }
  }

  makeWindowTexture(){
    const t=new DynamicTexture('procedural architectural windows',{width:256,height:128},this.scene,false);
    t.hasAlpha=true;const c=t.getContext();c.clearRect(0,0,256,128);
    c.fillStyle='#2d5567';
    for(let i=0;i<5;i++){
      const lit=(i===1||i===3) && Math.random()>.35;
      c.fillStyle=lit?'#e7c194':'#4f8093';
      c.fillRect(11+i*50,12,36,101);
      c.fillStyle=lit?'#a18f78':'#7898a5';
      c.fillRect(13+i*50,14,13,8);
      c.fillStyle='#a3bfc7';c.fillRect(11+i*50,60,36,3);
    }
    t.update();
    const material=new StandardMaterial('city glass panels',this.scene);
    material.diffuseTexture=t;material.emissiveTexture=t;
    material.diffuseColor=hex('#a3c9d2');material.emissiveColor=hex('#6c7d81');
    material.useAlphaFromDiffuseTexture=true;material.backFaceCulling=false;material.specularColor=hex('#b9cdd1');
    return material;
  }

  makeDistricts(){
    this.windowMat=this.makeWindowTexture();
    this.windowMaster=MeshBuilder.CreatePlane('window geometry source',{size:1,sideOrientation:Mesh.DOUBLESIDE},this.scene);
    this.windowMaster.material=this.windowMat;this.windowMaster.isVisible=false;this.windowMaster.isPickable=false;
    const coords=[-52,-26,0,26,52];
    for(let i=0;i<5;i++)for(let j=0;j<5;j++){
      if((i===1&&j===3)||(i===3&&j===1)||(i===2&&j===2))continue;
      const x=coords[i],z=coords[j];
      this.makeBuilding(x,z,i,j);
    }
    // Tiny harbor installations.
    for(let i=0;i<5;i++){
      this.box('marina pier',[2.6,.5,14],V(-77+i*18,-.35,78),this.materials.soil);
    }
  }

  makeBuilding(x,z,i,j){
    const index=this.buildings.length;
    const style=Math.floor(rand(0,7)),modern=Math.random()>.55;
    const floors=Math.floor(rand(3,8))+((i===2||j===2)?1:0);
    const width=rand(9.7,12.5),depth=rand(9,12.4),fh=3.6,offsX=rand(-1,1),offsZ=rand(-1,1);
    const b={id:index,x,z,style,name:choice(['Harbor','Sunset','North','Pacific','Crescent','Beacon','Meridian','Atlas','Orion'])+' '+(index+1),floors:[],destroyed:false};
    this.buildings.push(b);
    for(let n=0;n<floors;n++){
      const isTop=n===floors-1;
      const taper=(modern&&n>3)?(.98-(n-3)*.019):1;
      const w=width*taper,d=depth*taper;
      const y=.39+n*fh+fh*.5;
      const wallMat=n%3===2?this.materials.wallsAccent[style]:this.materials.walls[style];
      const mesh=this.box('floor '+index+'-'+n,[w,fh-.16,d],V(x+offsX,y,z+offsZ),wallMat,null,true);
      mesh.receiveShadows=true;
      const topBand=this.box('horizontal cornice',[w+.11,.075,d+.11],V(0,fh*.5-.15,0),n%2?this.materials.trim:this.materials.wallsAccent[style],mesh);
      // Avoid highly visible horizontal bands that make facades resemble stacked slices.
      const baseBand=null;
      // Texture-mapped glass bands remain parented to their simulated floor.
      for(const side of [-1,1]){
        const p=this.windowMaster.createInstance('window face');
        p.scaling.set(w*.83,fh*.52,1);p.position=V(0,0,side*(d/2+.022));p.parent=mesh;p.isPickable=false;
        const q=this.windowMaster.createInstance('window side');
        q.scaling.set(d*.81,fh*.52,1);q.rotation.y=Math.PI/2;q.position=V(side*(w/2+.022),0,0);q.parent=mesh;q.isPickable=false;
      }
      if(isTop){
        const roof=this.box('roof cap',[w+.65,.25,d+.65],V(0,fh*.5+.02,0),this.materials.dark,mesh);
        if(index%3===0){
          this.box('hvac',[2,1.15,2.9],V(-w*.25,fh*.5+.77,-d*.15),this.materials.trim,mesh);
          this.cylinder('roof antenna',.12,3.7,V(w*.24,fh*.5+1.95,d*.16),this.materials.dark,6,mesh);
        }else{
          this.box('rooftop unit',[2.5,1.3,2],V(0,fh*.5+.7,0),this.materials.trim,mesh);
        }
      }
      const entry={mesh,aggregate:null,building:b,storey:n,active:false,size:V(w,fh-.16,d),health:1};
      entry.aggregate=new PhysicsAggregate(mesh,PhysicsShapeType.BOX,{mass:0,friction:.84,restitution:.08},this.scene);
      b.floors.push(entry);this.structures.push(entry);this.totalFloors++;
    }
    const door=this.box('building lobby',[Math.min(3,width*.4),2.7,.15],V(x+offsX,.4+1.2,z+offsZ+depth*.5+.1),this.materials.glass);
    const numbers=this.box('lobby marquee',[Math.min(4,width*.5),.23,.2],V(x+offsX,3,z+offsZ+depth*.5+.16),this.materials.lamp);
  }

  createTree(x,z,scale=1){
    const root=new TransformNode('tree swaying',this.scene);root.position=V(x,.4,z);root.scaling=V(scale,scale,scale);
    const trunk=this.cylinder('tree trunk',.38,2.55,V(0,1.3,0),this.materials.trunk,7,root);
    const green=Math.random()>.45?this.materials.tree:this.materials.tree2;
    if(!this.treeMasters){this.treeMasters=[this.materials.tree,this.materials.tree2].map((mat,i)=>{
      const base=MeshBuilder.CreateSphere('foliage master '+i,{diameter:1,segments:6},this.scene);
      base.material=mat;base.isVisible=false;base.isPickable=false;return base;
    });}
    const master=this.treeMasters[green===this.materials.tree?0:1];
    for(let n=0;n<3;n++){
      const crown=master.createInstance('tree crown');crown.scaling.setAll(3.3-n*.32);
      crown.position=V((n-1)*.28,3.3+n*.76,Math.sin(n*2)*.28);crown.parent=root;crown.isPickable=false;
    }
    this.trees.push({root,x,z,sway:rand(0,6)});
  }

  makeProps(){
    const m=this.materials;
    for(let i=0;i<21;i++){
      const x=choice([-39,-13,13,39])+rand(-1,1),z=rand(-70,70);
      const car=this.box('parked vehicle',[3.65,1.15,1.8],V(x,1,z),choice(m.chassis),null,true);
      const cabin=this.box('vehicle windows',[1.8,.75,1.55],V(-.15,.72,0),m.carDark,car);
      for(const p of [-1,1])for(const q of [-1,1]){
        const wheel=this.cylinder('vehicle wheel',.7,.24,V(p*1.2,-.51,q*.92),m.dark,12,car);
        wheel.rotation.x=Math.PI/2;
      }
      const a=new PhysicsAggregate(car,PhysicsShapeType.BOX,{mass:11,friction:.7,restitution:.16},this.scene);
      a.body.setLinearDamping(.45);a.body.setAngularDamping(.5);
      this.props.push({mesh:car,aggregate:a,type:'car',active:true});
    }
    for(let i=0;i<26;i++){
      const x=choice([-39,-13,13,39])+choice([-4.8,4.8]);
      const z=rand(-77,77);
      const pole=this.cylinder('street lamp',.13,5.6,V(x,3,z),m.dark,7);
      const lightbox=this.box('lamp head',[1.3,.17,.44],V(x,5.83,z),m.lamp);
      this.box('lamp arm',[.85,.12,.15],V(x+.37,5.58,z),m.dark);
    }
    // City boundary accent and coastline lighting.
    for(const v of [-85.6,85.6]){
      this.box('perimeter edge',[171,.4,.46],V(0,.12,v),m.trim);
      this.box('perimeter edge',[.46,.4,171],V(v,.12,0),m.trim);
    }
    this.makeCrane();
  }

  // Live Havok ball-and-socket constraint: a suspended wrecking ball that can swing into the city.
  makeCrane(){
    try{
      const x=73,z=-53,y=26;
      const steel=this.mat('crane safety yellow','#dfa658');
      const ballast=this.mat('crane ballast','#414e57');
      const metal=this.mat('crane wrecking ball','#4a5961',{specular:'#d2d8da'});
      this.box('crane tower',[1.4,y,1.4],V(x,y*.5,z),steel,null,true);
      for(let i=3;i<y;i+=3){
        const brace=this.box('crane lattice brace',[3,.16,.18],V(x,i,z),ballast);
        brace.rotation.z=i%2?.55:-.55;
      }
      this.box('crane boom',[44,.9,.9],V(x-16,y,z),steel,null,true);
      this.box('counterweight',[4.4,2.2,3.2],V(x+4,y-1.5,z),ballast);
      const anchor=V(x-32,y-.1,z),ballPosition=V(x-32,y-12.3,z);
      const anchorMesh=this.box('crane pivot',[.5,.5,.5],anchor,ballast);
      const anchorPhysics=new PhysicsAggregate(anchorMesh,PhysicsShapeType.BOX,{mass:0},this.scene);
      const ball=MeshBuilder.CreateSphere('constrained Havok wrecking ball',{diameter:4.2,segments:16},this.scene);
      ball.position=ballPosition;ball.material=metal;ball.isPickable=false;
      const ballPhysics=new PhysicsAggregate(ball,PhysicsShapeType.SPHERE,{mass:125,friction:.5,restitution:.14},this.scene);
      const constraint=new BallAndSocketConstraint(V(0,0,0),V(0,12.2,0),V(1,0,0),V(1,0,0),this.scene);
      anchorPhysics.body.addConstraint(ballPhysics.body,constraint);
      const cable=this.cylinder('physical crane cable',.15,1,V(0,0,0),ballast,8);
      this.crane={anchor,anchorPhysics,ball,ballPhysics,cable,constraint};
      this.props.push({mesh:ball,aggregate:ballPhysics,type:'crane',active:true});
      ballPhysics.body.applyImpulse(V(-80,5,75),ball.position);
    }catch(error){console.warn('Optional crane joint could not be initialized',error)}
  }

  findBuildingAt(x,z,y=0){
    let group=null;
    for(const building of this.buildings){
      const intact=building.floors.filter(e=>!e.active);
      const hit=intact.find(e=>{
        const p=e.mesh.getAbsolutePosition();
        return Math.abs(x-p.x)<=e.size.x*.5+.65&&Math.abs(z-p.z)<=e.size.z*.5+.65;
      });
      if(hit){group=intact;break}
    }
    if(!group||!group.length)return null;
    // When clicking the ground within the footprint, strike the upper-middle facade.
    const targetY=y>2?y:group[Math.floor(group.length*.62)].mesh.position.y;
    return group.reduce((best,e)=>Math.abs(e.mesh.position.y-targetY)<Math.abs(best.mesh.position.y-targetY)?e:best,group[0]);
  }

  release(entry,impulse=V(0,0,0),impactAt=null){
    if(entry.active)return false;
    if(!fractureStorey(this,entry,impulse,impactAt))return false;
    // Removing ANY structural storey removes support for the entire stack above it.
    // Schedule the next intact upper floor, even if the destroyed floor was itself high.
    const above=entry.building.floors[entry.storey+1];
    if(above&&!above.active&&!above.pendingFailure){
      above.pendingFailure=true;
      this.pendingFailures.push({entry:above,time:rand(.33,.76),impulse:impulse.scale(.34).add(V(rand(-5,5),rand(2,7),rand(-5,5)))});
    }
    return true;
  }

  fractureAt(center,radius,strength=1,mode='blast'){
    let cracked=0;
    const affected=[];
    for(const entry of this.structures){
      if(entry.active)continue;
      const pos=entry.mesh.getAbsolutePosition();
      const dx=pos.x-center.x,dz=pos.z-center.z;
      const planar=Math.hypot(dx,dz);
      const dist=Math.hypot(dx,dz,(pos.y-center.y)*.32);
      if(dist>radius)continue;
      const falloff=Math.pow(Math.max(0,1-dist/radius),1.1);
      const likelihood=(mode==='quake'? .15:.40)+falloff*1.15*strength;
      const stable=entry.storey===0?.8:1;
      if(Math.random()>likelihood*stable)continue;
      affected.push({entry,falloff,dx,dz});
    }
    for(const {entry,falloff,dx,dz} of affected){
      const dist=Math.hypot(dx,dz)||1;
      let force=V(dx/dist*(10+34*falloff*strength),rand(6,19)*strength,dz/dist*(10+34*falloff*strength));
      if(mode==='quake')force=V(rand(-26,26)*strength,rand(7,13)*strength,rand(-26,26)*strength);
      if(mode==='tornado')force=V(-dz/dist*(15+25*strength),15+30*strength,dx/dist*(15+25*strength));
      if(mode==='water')force=V((13+32*strength),3+strength*10,rand(-7,7));
      if(this.release(entry,force))cracked++;
    }
    for(const prop of this.props){
      const p=prop.mesh.position,dx=p.x-center.x,dz=p.z-center.z,dist=Math.hypot(dx,dz);
      if(dist<radius&&dist>0){
        const push=V(dx/dist*strength*25,rand(4,14)*strength,dz/dist*strength*25);
        prop.aggregate.body.applyImpulse(push,p);
      }
    }
    return cracked;
  }

  tossDebris(center,count=18,strength=1){
    const m=this.materials;
    for(let i=0;i<count;i++){
      if(this.debris.length>=this.maxDebris)break;
      const size=rand(.26,1.18),position=center.add(V(rand(-5,5),rand(.5,5),rand(-5,5)));
      const mesh=this.box('flying debris',[size,size*rand(.5,1.6),size],position,choice([...m.walls,m.dark,m.trim]));
      const agg=new PhysicsAggregate(mesh,PhysicsShapeType.BOX,{mass:rand(.6,2.8),friction:.7,restitution:.23},this.scene);
      agg.body.applyImpulse(V(rand(-25,25)*strength,rand(12,32)*strength,rand(-25,25)*strength),mesh.position);
      agg.body.setAngularVelocity(V(rand(-6,6),rand(-6,6),rand(-6,6)));
      this.debris.push({mesh,aggregate:agg,time:0});this.activeBodies++;
    }
  }

  createBurst(position,type='dust',amount=240,power=1){
    const tex=this.getParticleTexture();
    const system=new ParticleSystem('volumetric '+type,amount,this.scene);
    system.particleTexture=tex;system.emitter=position.clone();
    system.minSize=type==='fire'?.5:1.3;system.maxSize=type==='fire'?2.4:5.4;
    system.minLifeTime=.45;system.maxLifeTime=type==='dust'?2.8:1.3;
    system.emitRate=amount*5;system.manualEmitCount=amount;
    system.minEmitPower=4*power;system.maxEmitPower=18*power;
    system.direction1=V(-1,0,-1);system.direction2=V(1,2,1);
    system.minAngularSpeed=-3;system.maxAngularSpeed=3;
    system.gravity=V(0,type==='dust'?-1:2.3,0);
    if(type==='fire'){
      system.color1=new Color4(1,.67,.27,.88);system.color2=new Color4(1,.25,.06,.72);
      system.colorDead=new Color4(.29,.27,.27,0);
    }else if(type==='water'){
      system.color1=new Color4(.62,.9,.99,.75);system.color2=new Color4(.23,.61,.81,.55);
      system.colorDead=new Color4(.45,.66,.75,0);
    }else{
      system.color1=new Color4(.73,.66,.56,.62);system.color2=new Color4(.49,.50,.48,.51);
      system.colorDead=new Color4(.36,.39,.41,0);
    }
    system.updateSpeed=.012;system.start();
    this.particles.push({system,expires:performance.now()+Math.max(2400,system.maxLifeTime*2500)});
    return system;
  }
  getParticleTexture(){
    if(this.particleTexture)return this.particleTexture;
    const texture=new DynamicTexture('procedural soft particle',{width:64,height:64},this.scene,false);
    const c=texture.getContext(),g=c.createRadialGradient(32,32,1,32,32,32);
    g.addColorStop(0,'rgba(255,255,255,.94)');
    g.addColorStop(.3,'rgba(255,255,255,.65)');
    g.addColorStop(1,'rgba(255,255,255,0)');
    c.fillStyle=g;c.fillRect(0,0,64,64);texture.hasAlpha=true;texture.update();
    this.particleTexture=texture;return texture;
  }

  scorch(p,radius=5,fire=false){
    const disk=MeshBuilder.CreateDisc('impact scar',{radius,tessellation:32},this.scene);
    disk.rotation.x=Math.PI/2;disk.position=V(p.x,.22,p.z);
    disk.material=this.mat('scorch mark '+this.scars.length,fire?'#302d2e':'#505557',{alpha:.5});
    disk.isPickable=false;
    this.scars.push(disk);
    if(this.scars.length>40)this.scars.shift().dispose();
    return disk;
  }

  integrity(){return Math.max(0,Math.round(100*(1-this.brokenFloors/this.totalFloors)))}
  update(dt){
    this.time+=dt;
    // Renew the secondary fracture budget periodically, so later disasters work too.
    if(this.time-this.secondaryWindowStart>10){this.secondaryWindowStart=this.time;this.secondaryWindowCount=0}
    // Process contact impulses after Havok has completed its physics step.
    const batch=this.pendingSecondary.splice(0,5);
    for(const contact of batch){
      if(contact.fragment.aggregate){
        this.secondaryImpactEvents++;
        splitOnCollision(this,contact.fragment,contact);
      }
    }
    for(let i=this.pendingFailures.length-1;i>=0;i--){
      const failure=this.pendingFailures[i];failure.time-=dt;
      if(failure.time<=0){
        this.pendingFailures.splice(i,1);
        if(!failure.entry.active){
          failure.entry.pendingFailure=false;
          if(!this.release(failure.entry,failure.impulse)){
            failure.entry.pendingFailure=true;
            this.pendingFailures.push({entry:failure.entry,time:1.25,impulse:failure.impulse});
          }
        }
      }
    }
    for(const item of this.particles.slice()){
      if(performance.now()>item.expires){item.system.stop();item.system.dispose();this.particles.splice(this.particles.indexOf(item),1)}
    }
    // Visual fragments still fall from the damaged storey when the Havok budget is full.
    // Simulated gravity and a ground contact prevent abrupt disappearing/teleporting.
    for(let i=this.visualFragments.length-1;i>=0;i--){
      const item=this.visualFragments[i];
      if(item.settled){
        // Keep settled rubble visible, free a slot for the next collapse.
        this.rubble.push(item.mesh);this.visualFragments.splice(i,1);continue;
      }
      item.velocity.y-=18*dt;
      item.mesh.position.addInPlace(item.velocity.scale(dt));
      item.mesh.rotation.addInPlace(item.angular.scale(dt));
      if(item.mesh.position.y<=item.floorY){
        item.mesh.position.y=item.floorY;
        item.velocity.setAll(0);item.angular.setAll(0);
        item.settled=true;item.mesh.metadata.visualFalling=false;
      }
    }
    // Reclaim Havok resources after fragments have come to rest on the ground.
    // Keep their final meshes visible as permanent rubble.
    for(let i=this.fragments.length-1;i>=0;i--){
      const fragment=this.fragments[i];
      fragment.age+=dt;
      if(fragment.age<7||fragment.mesh.position.y>2.8)continue;
      const v=fragment.aggregate.body.getLinearVelocity();
      if(fragment.age<13&&v.lengthSquared()>4)continue;
      fragment.aggregate.body.setCollisionCallbackEnabled(false);
      if(fragment.collisionObservable&&fragment.collisionObserver)fragment.collisionObservable.remove(fragment.collisionObserver);
      fragment.aggregate.dispose();
      fragment.aggregate=null;
      fragment.mesh.metadata.settled=true;
      this.rubble.push(fragment.mesh);
      this.fragments.splice(i,1);this.activeBodies=Math.max(0,this.activeBodies-1);
    }
    for(const body of this.debris){
      body.time+=dt;
      if(body.mesh.position.y< -60)body.mesh.setEnabled(false);
    }
    if(this.sea){
      this.sea.position.y=-3.25+Math.sin(this.time*.85)*.06;
    }
    for(const tree of this.trees)tree.root.rotation.z*=.87;
    if(this.crane){
      const {anchor,ball,cable}=this.crane;
      const delta=ball.getAbsolutePosition().subtract(anchor),length=delta.length();
      if(length>.001){
        const d=delta.scale(1/length),up=V(0,1,0),axis=Vector3.Cross(up,d);
        cable.position=anchor.add(delta.scale(.5));cable.scaling.y=length;
        cable.rotationQuaternion=Quaternion.RotationAxis(axis.lengthSquared()>.000001?axis.normalize():V(1,0,0),Math.acos(clamp(Vector3.Dot(up,d),-1,1)));
      }
    }
  }
}