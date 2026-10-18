import {
  MeshBuilder, StandardMaterial, PBRMaterial, Color3, Color4, Vector3, Texture,
  DynamicTexture, PhysicsAggregate, PhysicsShapeType, PhysicsMotionType, BallAndSocketConstraint, Quaternion, TransformNode, ShadowGenerator,
  HemisphericLight, DirectionalLight, GlowLayer, PointLight, ParticleSystem,
  Animation, VertexBuffer, Mesh, Matrix
} from '@babylonjs/core';
import {fractureStorey} from './fracture.js';
import {splitOnCollision,splitVisualOnLanding,queueSecondaryFracture,canVisuallyFracture} from './secondaryFracture.js';
import {populateCityLife,affectCityLife,updateCityLife} from './cityLife.js';
import {trafficRoutes,positionOnRoute,trafficHeading} from './cityMotion.js';
import {CityProgression} from './cityProgression.js';
import {applyCrater} from './terrainDamage.js';
import {buildCitySurfaceSkins} from './terrainSurface.js';
import {planCity,BLOCK_COORDS,ROAD_COORDS,CITY_HALF_SIZE,isPark} from './cityLayout.js';
import {buildDistrictBuildings,activateDistrictBuilding} from './cityDistricts.js';
import {makeFacadeWindows,compactSettledRubble} from './perfGeometry.js';
import {applyVisualArtDirection,addShowcaseFloor,addShowcasePlaza,addShowcaseContact,addShowcaseEntrance,addDistrictContacts} from './visualPass.js';
import {prepareCityDetails,detailBuildingFloor,detailStreets,detailVehicle} from './cityDetail.js';
import {sectionResistance,meteorDirectDamage,meteorBlastDamage,tornadoDamagePerSecond} from './structuralDamage.js';
import {meteorHitDistribution,meteorScale} from './meteorBalance.js';

const rand=(a,b)=>a+Math.random()*(b-a);
const choice=a=>a[Math.floor(Math.random()*a.length)];
const hex=h=>Color3.FromHexString(h);
const V=(x,y,z)=>new Vector3(x,y,z);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export class CityWorld {
  constructor(scene,camera,buildingCount=22,options={}){
    this.scene=scene; this.camera=camera;
    this.mobile=!!options.mobile;
    this.buildingCount=Math.max(1,Math.min(30,Math.round(buildingCount)));
    this.structures=[];this.buildings=[];this.props=[];this.trees=[];this.debris=[];
    this.districtBuildings=[];this.cityHalfSize=CITY_HALF_SIZE;
    this.fragments=[];this.rubble=[];this.pendingFailures=[];this.slabFractures=[];this.maxFragmentBodies=260;
    this.staticRubbleBatches=[];this.bakedRubbleMeshes=0;this.rubbleBatchSavedDraws=0;this.nextRubbleBatchTime=0;
    this.fracturesThisFrame=0;this.maxFracturesPerFrame=this.mobile?2:3;
    this.maxCascadeReleasesPerFrame=this.mobile?1:2;this.cascadeDeferred=0;
    this.maxPrimaryFragmentBodies=175;this.pendingSecondary=[];this.secondaryBreaks=0;
    this.secondaryQueuePeak=0;this.secondaryDeferred=0;this.secondaryMissed=0;
    this.visualFractureQueue=[];this.visualFractureDeferred=0;this.visualFractureMissed=0;
    this.secondaryPieces=0;this.secondaryWallBreaks=0;this.tertiaryBreaks=0;
    this.secondaryImpactEvents=0;this.maxSecondaryBreaks=300;
    this.secondaryVisualWindow=0;this.maxVisualSecondaryPerWindow=this.mobile?22:68;
    this.tertiaryWindowCount=0;this.maxTertiaryPerWindow=this.mobile?18:42;
    this.secondaryWallVisualWindow=0;this.maxWallVisualPerWindow=14;
    this.maxSecondaryPerWindow=16;this.secondaryWindowCount=0;this.secondaryWindowStart=0;
    this.visualFragments=[];this.maxVisualFragments=290;this.visualDropped=0;
    this.groundedFracturePieces=0;this.groundContactFractures=0;
    this.massBlastActive=false;this.massBlastMarks=0;
    this.particles=[];this.particlePool=[];this.particlesSkipped=0;
    this.maxConcurrentParticles=this.mobile?10:18;
    this.maxPooledParticles=this.mobile?10:18;
    this.scars=[];this.decorativeMarks=[];this.lastMarkCleanup=0;this.maxDecorativeMarks=this.mobile?35:85;
    this.impactCount=0;this.totalFloors=0;this.brokenFloors=0;
    this.activeBodies=0;this.time=0;this.maxDebris=110;
    this.windLifted=0;this.windEjected=0;this.windCarsLifted=new Set();this.kineticImpacts=0;
    this.tsunamiSectionHits=0;this.tsunamiDeferred=0;
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
    this.shadow=new ShadowGenerator(this.mobile?512:2048,sun);
    this.shadow.usePercentageCloserFiltering=true;
    this.shadow.filteringQuality=ShadowGenerator.QUALITY_MEDIUM;
    this.shadow.bias=.0005;
    this.shadow.normalBias=.026;
    this.shadow.frustumEdgeFalloff=.6;
    sun.shadowMinZ=1;
    sun.shadowMaxZ=380;
    this.makeMaterials();
    applyVisualArtDirection(this);
    prepareCityDetails(this);
    this.makeSky();
    this.makeTerrain();
    buildCitySurfaceSkins(this);
    detailStreets(this);
    addShowcasePlaza(this);
    this.makeDistricts();
    buildDistrictBuildings(this);
    addDistrictContacts(this);
    this.makeProps();
    populateCityLife(this);
    this.progression=new CityProgression(this);
    this.optimizeStaticGeometry();
  }

  // Roads, lane markings and other decorative static objects do not need
  // independent draw calls. Merge meshes by material; never touch Havok bodies,
  // dynamic floors, the ground collision mesh or vegetation.
  optimizeStaticGeometry(){
    const names=new Set(['north south avenue','east west avenue','avenue edge',
      'dashed lane','city block','street lamp','lamp head','lamp arm',
      'perimeter edge','marina pier','island distant rock']);
    const groups=new Map();
    for(const mesh of this.scene.meshes){
      if(!names.has(mesh.name)||mesh.parent||!mesh.material||mesh.physicsBody)continue;
      const key=mesh.material.uniqueId;
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(mesh);
    }
    this.staticBatchStats={sourceMeshes:0,mergedMeshes:0};
    for(const group of groups.values()){
      if(group.length<2)continue;
      try{
        const merged=Mesh.MergeMeshes(group,true,true,undefined,false,false);
        if(!merged)continue;
        merged.name='batched static city geometry';
        merged.isPickable=false;merged.receiveShadows=true;
        merged.freezeWorldMatrix();
        this.staticBatchStats.sourceMeshes+=group.length;
        this.staticBatchStats.mergedMeshes++;
      }catch(e){console.warn('Static batching skipped',e)}
    }
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
    m.rubbleSurface=this.mat('rubble colored paint, glazing and fracture faces','#ffffff');
    m.rubbleSurface.specularColor=hex('#161b1d');
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
    // Keep the island's decorative bedrock below the deepest crater, rather
    // than letting a solid box visibly fill excavated terrain from underneath.
    this.box('island slab',[CITY_HALF_SIZE*2,4,CITY_HALF_SIZE*2],V(0,-6.05,0),m.soil,null,true);
    for(const edge of [-CITY_HALF_SIZE+.1,CITY_HALF_SIZE-.1]){
      this.box('island cliff face',[CITY_HALF_SIZE*2-.2,4,.2],V(0,-2.02,edge),m.soil);
      this.box('island cliff face',[.2,4,CITY_HALF_SIZE*2-.2],V(edge,-2.02,0),m.soil);
    }
    const top=this.box('main land',[CITY_HALF_SIZE*2,.15,CITY_HALF_SIZE*2],V(0,-.035,0),m.island);top.receiveShadows=true;
    this.ground=top;top.isPickable=true;
    const ocean=MeshBuilder.CreateGround('endless sea',{width:1300,height:1300,subdivisions:30},this.scene);
    ocean.position.y=-3.25;ocean.material=m.water;ocean.isPickable=false;
    this.sea=ocean;
    // Continuous coastline wash follows the square island perimeter.
    const foam=this.mat('coastal foam','#b8dedd',{emissive:'#7fb7c6',alpha:.48});
    for(const offset of [2.8,5.2]){
      const d=CITY_HALF_SIZE+offset;
      for(const side of [-1,1]){
        this.box('coast surf',[d*2,.10,.32],V(0,-3.10,side*d),foam);
        this.box('coast surf',[.32,.10,d*2],V(side*d,-3.10,0),foam);
      }
    }
    // Asphalt, lane paint and sidewalk paving are now tessellated surface
    // skins (terrainSurface.js), NOT giant unbreakable six-faced boxes.
    // This lets a meteor genuinely excavate the road instead of showing an
    // unchanged asphalt sheet while the physics capsule falls underneath it.
    // District plots and subtle grassy courtyards.
    const coords=BLOCK_COORDS;
    for(let i=0;i<coords.length;i++)for(let j=0;j<coords.length;j++){
      const x=coords[i],z=coords[j];
      if(isPark(x,z)){
        // Park grass lives in the deformable landscape skin, not a rigid plate.
        if(x===0&&z===0){
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
        if(x===0&&z===0)continue;
        const px=x+(axis?side*8.3:0),pz=z+(!axis?side*8.3:0);
        const nearby=Math.hypot(x,z)<80;
        const density=nearby?(this.mobile?.23:.31):(this.mobile?.08:.15);
        if(Math.random()<density*Math.min(1,.45+this.buildingCount/32))this.createTree(px+rand(-.5,.5),pz+rand(-.5,.5),.6);
      }
    }
    for(let k=0;k<13;k++){
      const theta=k/13*Math.PI*2;
      const x=Math.cos(theta)*(CITY_HALF_SIZE+23+Math.sin(k*2.3)*12),z=Math.sin(theta)*(CITY_HALF_SIZE+22+Math.cos(k*3.8)*11);
      const island=MeshBuilder.CreateSphere('island distant rock',{diameter:rand(18,35),segments:5},this.scene);
      island.position=V(x,-8,z);island.scaling.y=.3;island.material=k%2?m.soil:m.island;island.isPickable=false;
    }
  }

  makeWindowTexture(){
    // 512px atlas shared by the whole city. Each pane has glass reflections,
    // distinct interior brightness and fine mullions without more draw calls.
    const t=new DynamicTexture('procedural architectural windows',{width:512,height:256},this.scene,false);
    t.hasAlpha=true;const c=t.getContext();c.clearRect(0,0,512,256);
    c.fillStyle='#273b4a';c.fillRect(0,0,512,256);
    for(let i=0;i<5;i++){
      const x=12+i*102,y=22,w=83,h=212;
      const lit=(i===1||i===3) && Math.random()>.35;
      const g=c.createLinearGradient(x,y,x+w,y+h);
      if(lit){
        g.addColorStop(0,'#edcf9b');g.addColorStop(.34,'#c4a982');
        g.addColorStop(.7,'#b1967a');g.addColorStop(1,'#d5baa0');
      }else{
        g.addColorStop(0,'#558aa0');g.addColorStop(.45,'#2d556d');
        g.addColorStop(.67,'#436d83');g.addColorStop(1,'#243c50');
      }
      c.fillStyle=g;c.fillRect(x,y,w,h);
      // Window frames, horizon reflection and the recessed interior.
      c.fillStyle='rgba(230,243,240,.24)';c.fillRect(x+6,y+5,4,h-12);
      c.fillStyle='rgba(250,253,248,.18)';c.fillRect(x+12,y+5,8,h-12);
      c.fillStyle=lit?'#998c7c':'#7797a5';c.fillRect(x,y+h*.53,w,5);
      c.fillStyle='rgba(18,36,44,.40)';c.fillRect(x+w-10,y+8,6,h-15);
      c.fillStyle='rgba(242,246,241,.14)';c.fillRect(x+4,y+6,w-8,4);
      for(let j=0;j<3;j++){
        const glint=x+23+j*16;
        c.fillStyle='rgba(239,250,249,.075)';
        c.fillRect(glint,y+11+j*15,2,h*.24);
      }
    }
    t.update();
    const material=new StandardMaterial('city glass panels',this.scene);
    material.diffuseTexture=t;material.emissiveTexture=t;
    material.diffuseColor=hex('#c5e1ed');material.emissiveColor=hex('#252f35');
    material.specularPower=80;
    material.useAlphaFromDiffuseTexture=true;material.backFaceCulling=false;
    material.specularColor=hex('#b9cdd1');
    return material;
  }

  makeDistricts(){
    this.showcaseCount=0;
    this.windowMat=this.makeWindowTexture();
    this.windowMaster=MeshBuilder.CreatePlane('window geometry source',{size:1,sideOrientation:Mesh.DOUBLESIDE},this.scene);
    this.windowMaster.material=this.windowMat;this.windowMaster.isVisible=false;this.windowMaster.isPickable=false;
    for(const plot of planCity(this.buildingCount)){
      for(const site of plot.buildings){
        this.makeBuilding(site.x,site.z,plot.i,plot.j,site.size);
      }
    }
    // Tiny harbor installations.
    for(let i=0;i<5;i++){
      this.box('marina pier',[2.6,.5,14],V(-85+i*25,-.35,CITY_HALF_SIZE-5),this.materials.soil);
    }
  }

  makeBuilding(x,z,i,j,siteSize=11){
    const index=this.buildings.length;
    const showcase=this.showcaseCount<4&&Math.hypot(x,z)<42;
    if(showcase)this.showcaseCount++;
    const style=Math.floor(rand(0,7)),modern=Math.random()>.55;
    const floors=Math.floor(rand(3,8))+((i===5||j===5)?1:0);
    const width=siteSize*rand(.91,1.03),depth=siteSize*rand(.88,1.03),fh=3.6;
    const offsX=siteSize>=10?rand(-.45,.45):rand(-.13,.13);
    const offsZ=siteSize>=10?rand(-.45,.45):rand(-.13,.13);
    const b={id:index,x,z,style,showcase,name:choice(['Harbor','Sunset','North','Pacific','Crescent','Beacon','Meridian','Atlas','Orion'])+' '+(index+1),floors:[],destroyed:false};
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
      // One UV-mapped mesh for all four sides instead of four scene objects.
      makeFacadeWindows(this.scene,mesh,this.windowMat,w,d,fh);
      if(showcase)addShowcaseFloor(this,mesh,w,d,fh,isTop,style);
      if(isTop){
        const roof=this.box('roof cap',[w+.65,.25,d+.65],V(0,fh*.5+.02,0),this.materials.dark,mesh);
        if(index%3===0){
          this.box('hvac',[2,1.15,2.9],V(-w*.25,fh*.5+.77,-d*.15),this.materials.trim,mesh);
          this.cylinder('roof antenna',.12,3.7,V(w*.24,fh*.5+1.95,d*.16),this.materials.dark,6,mesh);
        }else{
          this.box('rooftop unit',[2.5,1.3,2],V(0,fh*.5+.7,0),this.materials.trim,mesh);
        }
      }
      const maxHealth=sectionResistance(n,floors);
      const entry={mesh,aggregate:null,building:b,storey:n,active:false,size:V(w,fh-.16,d),
        materialClass:isTop?'roof':n===0?'foundation':'concrete frame',
        maxHealth,health:maxHealth,damageTaken:0,damageMarks:0};
      entry.aggregate=new PhysicsAggregate(mesh,PhysicsShapeType.BOX,{mass:0,friction:.84,restitution:.08},this.scene);
      detailBuildingFloor(this,entry,{modern,isTop});
      b.floors.push(entry);this.structures.push(entry);this.totalFloors++;
    }
    if(showcase)addShowcaseContact(this,x+offsX,z+offsZ,width,depth);
    const door=this.box('building lobby',[Math.min(3,width*.4),2.7,.15],V(x+offsX,.4+1.2,z+offsZ+depth*.5+.1),this.materials.glass);
    const numbers=this.box('lobby marquee',[Math.min(4,width*.5),.23,.2],V(x+offsX,3,z+offsZ+depth*.5+.16),this.materials.lamp);
    if(showcase)addShowcaseEntrance(this,b.floors[0].mesh,width,depth,fh,style);
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
    // Cars follow low-cost road waypoints with ANIMATED Havok colliders.
    // Colliding disasters switch an affected car to DYNAMIC rigid-body motion.
    const numberOfCars=this.mobile?17:Math.min(30,Math.max(22,Math.round(this.buildingCount*1.1)));
    for(const planned of trafficRoutes(numberOfCars)){
      const {route,distance,speed}=planned;
      const p=positionOnRoute(route,distance),heading=trafficHeading(route,distance);
      const car=this.box('moving city vehicle',[3.65,1.15,1.8],V(p.x,1,p.z),choice(m.chassis),null,true);
      car.rotationQuaternion=Quaternion.FromEulerAngles(0,heading,0);
      this.box('vehicle windows',[1.8,.75,1.55],V(-.15,.72,0),m.carDark,car);
      for(const side of [-1,1])for(const wheelSide of [-1,1]){
        const wheel=this.cylinder('vehicle wheel',.7,.24,V(side*1.2,-.51,wheelSide*.92),m.dark,12,car);
        wheel.rotation.x=Math.PI/2;
      }
      const aggregate=new PhysicsAggregate(car,PhysicsShapeType.BOX,{mass:11,friction:.7,restitution:.16},this.scene);
      aggregate.body.setLinearDamping(.45);aggregate.body.setAngularDamping(.5);
      aggregate.body.setMotionType(PhysicsMotionType.ANIMATED);
      detailVehicle(this,car);
      this.props.push({mesh:car,aggregate,type:'car',active:true,
        traffic:{route,distance,speed,state:'driving',heading,lastPosition:V(p.x,1,p.z)}});
    }
    for(let i=0;i<(this.mobile?38:80);i++){
      const x=choice(ROAD_COORDS)+choice([-4.8,4.8]);
      const z=rand(-CITY_HALF_SIZE+12,CITY_HALF_SIZE-12);
      const pole=this.cylinder('street lamp',.13,5.6,V(x,3,z),m.dark,7);
      const lightbox=this.box('lamp head',[1.3,.17,.44],V(x,5.83,z),m.lamp);
      this.box('lamp arm',[.85,.12,.15],V(x+.37,5.58,z),m.dark);
    }
    // City boundary accent and coastline lighting.
    for(const v of [-CITY_HALF_SIZE+.4,CITY_HALF_SIZE-.4]){
      this.box('perimeter edge',[CITY_HALF_SIZE*2-1,.4,.46],V(0,.12,v),m.trim);
      this.box('perimeter edge',[.46,.4,CITY_HALF_SIZE*2-1],V(v,.12,0),m.trim);
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
    for(const building of [...this.buildings,...this.districtBuildings]){
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

  // Adds visible cracks and physical chips without removing the load-bearing
  // section. Damage never makes an intact storey fall until resistance is gone.
  damageStructure(entry,amount,impulse=V(0,0,0),impactAt=null,source='impact'){
    if(!entry||entry.active||amount<=0)return false;
    // Distant district buildings retain their single cheap static collider
    // while only being scratched. Activate floor-by-floor Havok physics only
    // when a storey actually needs to fracture in release().
    this.audio?.play('crack',impactAt||entry.mesh.position,Math.min(1.3,amount/60));
    entry.health=Math.max(0,entry.health-amount);
    entry.damageTaken+=amount;
    const ratio=entry.health/entry.maxHealth;
    const markThresholds=[.76,.46,.20];
    const markAt=markThresholds[entry.damageMarks]??-1;
    if(ratio<=markAt&&entry.damageMarks<3){
      entry.damageMarks++;
      const drawMark=source!=='blast'||this.massBlastMarks<28;
      if(source==='blast')this.massBlastMarks++;
      if(drawMark){
      const center=entry.mesh.getAbsolutePosition(),size=entry.size;
      const roof=entry.storey===entry.building.floors.length-1&&
        (source==='meteor'||source==='blast');
      let points;
      if(roof){
        const px=impactAt?Math.max(-size.x*.35,Math.min(size.x*.35,impactAt.x-center.x)):0;
        const pz=impactAt?Math.max(-size.z*.35,Math.min(size.z*.35,impactAt.z-center.z)):0;
        const x=center.x+px,z=center.z+pz,y=center.y+size.y*.5+.30;
        points=[V(x-1.25,y,z-.65),V(x-.55,y,z+.08),V(x+.28,y,z-.37),V(x+1.36,y,z+.48)];
      }else{
        const x=center.x+size.x*.5+.065,z=center.z,y=center.y;
        points=[V(x,y-1.15,z-.98),V(x,y-.39,z-.12),V(x,y+.30,z-.51),V(x,y+1.05,z+.85)];
      }
      const crack=MeshBuilder.CreateLines('structural stress crack',{points},this.scene);
      crack.color=Color3.FromHexString('#20232b');crack.isPickable=false;
      this.trackDecorativeMark(crack,entry,48);
      this.createBurst(points[1],'dust',Math.round(7+9*amount/entry.maxHealth),.18);
      if(source==='meteor'||source==='blast'){
        const hit=impactAt||center;
        // Small physical chips leave the facade even if the frame survives.
        this.tossDebris(hit,Math.min(3,Math.max(1,Math.floor(amount/25))),.22);
      }
      }
    }
    if(entry.health>0)return false;
    const released=this.release(entry,impulse,impactAt);
    // With both fragment budgets exhausted, release() can fail without
    // creating a retry. Never heal this critically damaged section to 0.1.
    if(!released)this.enqueueStructuralFailure(entry,impulse,.25);
    return released;
  }

  beginFrame(){this.fracturesThisFrame=0}
  enqueueStructuralFailure(entry,impulse,delay=.12){
    if(!entry||entry.active||entry.pendingFailure)return;
    entry.pendingFailure=true;
    this.pendingFailures.push({entry,time:delay,impulse:impulse.clone()});
  }
  release(entry,impulse=V(0,0,0),impactAt=null){
    if(entry.active)return false;
    // Shared frame budget for meteor, quake, tsunami and cascade failures.
    // Never discard an overload: retry the still-intact section later.
    if(this.fracturesThisFrame>=this.maxFracturesPerFrame){
      this.enqueueStructuralFailure(entry,impulse);
      this.cascadeDeferred++;
      return false;
    }
    if(entry.building?.district)activateDistrictBuilding(this,entry.building);
    if(!fractureStorey(this,entry,impulse,impactAt))return false;
    this.audio?.play('collapse',impactAt||entry.mesh.position,.65+entry.size.x/18);
    this.audio?.play('glass',impactAt||entry.mesh.position,.35);
    this.fracturesThisFrame++;
    // Removing ANY structural storey removes support for the entire stack above it.
    // Schedule the next intact upper floor, even if the destroyed floor was itself high.
    const above=entry.building.floors[entry.storey+1];
    if(above&&!above.active)
      this.enqueueStructuralFailure(above,impulse.scale(.34).add(V(rand(-5,5),rand(2,7),rand(-5,5))),rand(.33,.76));
    return true;
  }

  fractureAt(center,radius,strength=1,mode='blast',maxSections=Infinity){
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
      if(mode!=='blast'&&mode!=='kinetic'){
        const likelihood=(mode==='quake'? .15:.40)+falloff*1.15*strength;
        const stable=entry.storey===0?.8:1;
        if(Math.random()>likelihood*stable)continue;
      }
      affected.push({entry,falloff,dx,dz});
    }
    // A shockwave breaks closest sections first and distributes the workload
    // over subsequent cascading collapses; prevents a 1-frame Havok freeze.
    affected.sort((a,b)=>b.falloff-a.falloff);
    for(const {entry,falloff,dx,dz} of affected.slice(0,maxSections)){
      const dist=Math.hypot(dx,dz)||1;
      let force=V(dx/dist*(10+34*falloff*strength),rand(6,19)*strength,dz/dist*(10+34*falloff*strength));
      if(mode==='quake')force=V(rand(-26,26)*strength,rand(7,13)*strength,rand(-26,26)*strength);
      if(mode==='tornado')force=V(-dz/dist*(15+25*strength),15+30*strength,dx/dist*(15+25*strength));
      if(mode==='water')force=V((13+32*strength),3+strength*10,rand(-7,7));
      if(mode==='blast'||mode==='kinetic'){
        const damage=meteorBlastDamage(strength,falloff)*(mode==='kinetic'?.32:1);
        if(this.damageStructure(entry,damage,force,center,mode))cracked++;
      }else if(this.release(entry,force))cracked++;
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

  // Physical damage from the projectile itself, BEFORE the delayed explosion.
  kineticMeteorImpact(point,direction,strength,entry=null){
    this.kineticImpacts++;
    let damage=0;
    if(entry){
      const floors=entry.building.floors;
      const targets=[entry,floors[entry.storey-1],floors[entry.storey+1]].filter(Boolean);
      const energies=meteorHitDistribution(strength),scale=meteorScale(strength);
      for(let i=0;i<targets.length;i++){
        const e=targets[i];if(e.active)continue;
        const center=e.mesh.getAbsolutePosition();
        const radial=center.subtract(point);
        const dir=radial.lengthSquared()>.0001?radial.normalize():direction;
        const impulse=direction.scale(scale.impulse*(1+i*.2))
          .add(dir.scale(16+scale.impulse*.65)).add(V(0,4+18*strength,0));
        const energy=energies[i];
        if(this.damageStructure(e,energy,impulse,point,'meteor'))damage++;
      }
      // Loose chips on impact; strength determines how much material is ejected.
      this.tossDebris(point,Math.round(1+6*Math.sqrt(strength)),.2+.8*strength);
    }else{
      // Ground/asphalt contact produces real physical chunks and a crater.
      const asphalt=ROAD_COORDS.some(v=>Math.abs(point.x-v)<4||Math.abs(point.z-v)<4);
      const material=asphalt?this.materials.road:this.materials.soil;
      const count=Math.round(6+8*strength);
      for(let n=0;n<count&&this.debris.length<this.maxDebris;n++){
        const side=rand(.38,1.7),p=point.add(V(rand(-2,2),rand(.3,1.4),rand(-2,2)));
        const mesh=this.box('impact displaced asphalt',[side,rand(.16,.43),side*rand(.7,1.3)],p,material);
        const aggregate=new PhysicsAggregate(mesh,PhysicsShapeType.BOX,{mass:rand(1,5),friction:.8,restitution:.12},this.scene);
        const lateral=V(rand(-1,1),rand(.22,1.1),rand(-1,1)).normalize().scale(rand(9,27)*strength);
        aggregate.body.applyImpulse(lateral.add(direction.scale(rand(3,10)*strength)),p);
        aggregate.body.setAngularVelocity(V(rand(-6,6),rand(-6,6),rand(-6,6)));
        this.debris.push({mesh,aggregate,time:0});this.activeBodies++;damage++;
      }
      this.scorch(point,2.4+2.5*strength,false);
      // Mechanical shock can damage only structures immediately beside impact.
      // Ground impact is represented by displaced asphalt; broad structural
      // damage comes only from the spatially propagated blast wave.
    }
    return damage;
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
    if(this.mobile)amount=Math.min(amount,type==='dust'?44:52);
    const reusableIndex=this.particlePool.findIndex(item=>item.type===type);
    let system;
    if(reusableIndex>=0){
      system=this.particlePool.splice(reusableIndex,1)[0].system;
      system.reset();
    }else{
      if(this.particles.length+this.particlePool.length>=this.maxConcurrentParticles){
        this.particlesSkipped++;return null;
      }
      system=new ParticleSystem('pooled '+type,Math.max(128,amount),this.scene);
      system.particleTexture=this.getParticleTexture();
    }
    system.emitter=position.clone();
    system.minSize=type==='fire'?.5:1.3;system.maxSize=type==='fire'?2.4:5.4;
    system.minLifeTime=.45;system.maxLifeTime=type==='dust'?2.8:1.3;
    // One-shot burst: no continuous emission or repeated allocations.
    system.emitRate=0;system.manualEmitCount=amount;
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
    this.particles.push({system,type,expires:performance.now()+Math.max(900,system.maxLifeTime*1100)});
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
    if(this.scars.length>40){
      const old=this.scars.shift(),material=old.material;
      old.dispose();material?.dispose();
    }
    return disk;
  }

  visualFracturePriority(part){
    const sizes=part.mesh?.metadata?.fragmentSize;
    if(!sizes)return 0;
    const dims=[...sizes].sort((a,b)=>b-a);
    return dims[0]*dims[1]*(part.kind==='slab'?2.6:1)*
      (part.secondaryGeneration?0.65:1.3);
  }
  queueVisualFracture(part,delay=.55){
    if(!part.mesh||part.mesh.isDisposed()||this.secondaryBreaks>=this.maxSecondaryBreaks){
      this.visualFractureMissed++;return false;
    }
    const priority=this.visualFracturePriority(part);
    const maxPending=this.mobile?110:220;
    if(this.visualFractureQueue.length>=maxPending){
      let worst=0;
      for(let i=1;i<this.visualFractureQueue.length;i++)
        if(this.visualFractureQueue[i].priority<this.visualFractureQueue[worst].priority)worst=i;
      if(priority<=this.visualFractureQueue[worst].priority){
        this.visualFractureMissed++;return false;
      }
      const removed=this.visualFractureQueue.splice(worst,1)[0];
      if(!removed.part.mesh.isDisposed())
        removed.part.mesh.metadata.pendingVisualFracture=false;
      this.visualFractureMissed++;
    }
    part.mesh.metadata={...(part.mesh.metadata||{}),pendingVisualFracture:true};
    this.visualFractureQueue.push({part,nextAttempt:this.time+delay,tries:0,priority});
    this.visualFractureDeferred++;
    return true;
  }
  trackDecorativeMark(mesh,entry=null,lifespan=42){
    const item={mesh,entry,expires:this.time+lifespan};
    this.decorativeMarks.push(item);
    while(this.decorativeMarks.length>this.maxDecorativeMarks){
      const old=this.decorativeMarks.shift();if(!old.mesh.isDisposed())old.mesh.dispose();
    }
    return mesh;
  }
  affectLife(kind,center,power,radius,dt){affectCityLife(this,kind,center,power,radius,dt)}
  damageTerrain(x,z,k,kind){return applyCrater(this,x,z,k,kind)}
  integrity(){
    if(!this.structures.length)return 100;
    // Cracked but still standing floors must count toward city damage;
    // the old counter showed 100% even with critically weakened buildings.
    const remaining=this.structures.reduce((sum,e)=>sum+(e.active?0:
      Math.max(0,Math.min(1,e.health/Math.max(1,e.maxHealth)))),0);
    return Math.max(0,Math.min(100,Math.round(100*remaining/this.structures.length)));
  }
  update(dt){
    this.time+=dt;
    updateCityLife(this,dt);
    if(this.time-this.lastMarkCleanup>2){
      this.lastMarkCleanup=this.time;
      for(let i=this.decorativeMarks.length-1;i>=0;i--){
        const mark=this.decorativeMarks[i];
        if(mark.mesh.isDisposed()||mark.entry?.active||mark.expires<this.time){
          if(!mark.mesh.isDisposed())mark.mesh.dispose();
          this.decorativeMarks.splice(i,1);
        }
      }
    }
    // Renew the secondary fracture budget periodically, so later disasters work too.
    if(this.time-this.secondaryWindowStart>10){
      this.secondaryWindowStart=this.time;this.secondaryWindowCount=0;
      this.secondaryWallVisualWindow=0;this.secondaryVisualWindow=0;
      this.tertiaryWindowCount=0;
    }
    // If the global lifetime limit is reached, no future retry can succeed.
    if(this.secondaryBreaks>=this.maxSecondaryBreaks&&this.pendingSecondary.length){
      for(const job of this.pendingSecondary){job.fragment.secondaryQueued=false;this.secondaryMissed++}
      this.pendingSecondary.length=0;
    }
    // Highest-energy slabs first; retry capacity failures without forgetting
    // the contact. Keep per-frame work bounded even for citywide collapses.
    this.pendingSecondary.sort((a,b)=>b.priority-a.priority);
    let attempts=0;
    for(let i=0;i<this.pendingSecondary.length&&attempts<4;){
      const job=this.pendingSecondary[i],part=job.fragment;
      if(!part.aggregate||part.mesh.isDisposed()||part.secondaryGeneration>=2){
        part.secondaryQueued=false;this.pendingSecondary.splice(i,1);this.secondaryMissed++;continue;
      }
      if(this.time<job.nextAttempt){i++;continue}
      attempts++;this.secondaryImpactEvents++;
      if(splitOnCollision(this,part,job)){
        this.pendingSecondary.splice(i,1);part.secondaryQueued=false;continue;
      }
      job.retries++;this.secondaryDeferred++;
      job.nextAttempt=this.time+Math.min(2,.22+job.retries*.2);
      i++;
    }
    let cascadesThisFrame=0;
    for(let i=this.pendingFailures.length-1;i>=0;i--){
      const failure=this.pendingFailures[i];failure.time-=dt;
      if(failure.time<=0&&cascadesThisFrame<this.maxCascadeReleasesPerFrame&&
         this.fracturesThisFrame<this.maxFracturesPerFrame){
        cascadesThisFrame++;
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
    for(let i=this.particles.length-1;i>=0;i--){
      const item=this.particles[i];
      if(performance.now()<=item.expires)continue;
      item.system.stop();item.system.reset();
      this.particles.splice(i,1);
      if(this.particlePool.length<this.maxPooledParticles)
        this.particlePool.push({system:item.system,type:item.type});
      else item.system.dispose();
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
        this.audio?.play('debrisLand',item.mesh.position,.55);
        item.mesh.position.y=item.floorY;
        if((item.kind==='slab'||item.kind==='wall')&&canVisuallyFracture(item)){
          if(splitVisualOnLanding(this,item)){
            this.visualFragments.splice(i,1);continue;
          }
          // Continue retrying after the window quota refreshes.
          item.retryVisualFracture=this.queueVisualFracture(item,1);
        }
        item.velocity.setAll(0);item.angular.setAll(0);
        item.settled=true;item.mesh.metadata.visualFalling=false;
      }
    }
    if(this.secondaryBreaks>=this.maxSecondaryBreaks&&this.visualFractureQueue.length){
      for(const job of this.visualFractureQueue){
        if(!job.part.mesh.isDisposed())job.part.mesh.metadata.pendingVisualFracture=false;
        this.visualFractureMissed++;
      }
      this.visualFractureQueue.length=0;
    }
    if(this.time>=(this.nextVisualSortTime||0)){
      this.nextVisualSortTime=this.time+1.5;
      this.visualFractureQueue.sort((a,b)=>b.priority-a.priority);
    }
    // Retry settled visual slabs once the quota is available; preserve the
    // original mesh until a replacement has actually been created.
    let visualAttempts=0;
    for(let i=0;i<this.visualFractureQueue.length&&visualAttempts<4;){
      const job=this.visualFractureQueue[i],part=job.part;
      if(!part.mesh||part.mesh.isDisposed()||this.secondaryBreaks>=this.maxSecondaryBreaks){
        this.visualFractureMissed++;this.visualFractureQueue.splice(i,1);continue;
      }
      if(this.time<job.nextAttempt){i++;continue}
      visualAttempts++;
      if(splitVisualOnLanding(this,part)){
        const rubbleIndex=this.rubble.indexOf(part.mesh);
        if(rubbleIndex!==-1)this.rubble.splice(rubbleIndex,1);
        this.visualFractureQueue.splice(i,1);continue;
      }
      job.tries++;job.nextAttempt=this.time+Math.min(2.8,.5+.22*job.tries);
      this.visualFractureDeferred++;i++;
    }
    // Reclaim Havok resources after fragments have come to rest on the ground.
    // Keep their final meshes visible as permanent rubble.
    for(let i=this.fragments.length-1;i>=0;i--){
      const fragment=this.fragments[i];
      fragment.age+=dt;
      // Backup for Havok callbacks: an actual fall followed by landing is
      // sufficient even if the collision event reports no impulse or fires late.
      if(fragment.age>.65&&fragment.age<6&&!fragment.secondaryQueued&&
         fragment.secondaryGeneration<2&&fragment.mesh.position.y<3.5&&
         Math.max((fragment.fallStartY||0)-fragment.mesh.position.y,fragment.impactEnergy||0)>2.2){
        queueSecondaryFracture(this,fragment,null,true);
      }
      if(fragment.age<7||fragment.mesh.position.y>2.8)continue;
      const v=fragment.aggregate.body.getLinearVelocity();
      if(fragment.age<13&&v.lengthSquared()>4)continue;
      if(fragment.secondaryQueued){
        // The panel has landed and can wait without a live Havok body.
        // Preserve its collision energy for a later budgeted visual fracture.
        const pos=fragment.mesh.position;
        const proxy={mesh:fragment.mesh,kind:fragment.kind,
          secondaryGeneration:fragment.secondaryGeneration,
          fallStartY:fragment.fallStartY||pos.y+3,
          impactEnergy:Math.max(fragment.impactEnergy||0,
            (fragment.fallStartY||pos.y)-pos.y,3.1)};
        if(!this.queueVisualFracture(proxy,.45))this.secondaryMissed++;
        this.pendingSecondary=this.pendingSecondary.filter(job=>job.fragment!==fragment);
        fragment.secondaryQueued=false;
        // Continue below and settle the now collider-free panel as rubble.
      }
      fragment.aggregate.body.setCollisionCallbackEnabled(false);
      if(fragment.collisionObservable&&fragment.collisionObserver)fragment.collisionObservable.remove(fragment.collisionObserver);
      fragment.aggregate.dispose();
      fragment.aggregate=null;
      this.audio?.play('debrisLand',fragment.mesh.position,.45);
      fragment.mesh.metadata.settled=true;
      this.rubble.push(fragment.mesh);
      this.fragments.splice(i,1);this.activeBodies=Math.max(0,this.activeBodies-1);
    }
    if(this.time>=this.nextRubbleBatchTime){
      this.nextRubbleBatchTime=this.time+2.7;
      this.rubbleBatchSavedDraws+=compactSettledRubble(this);
    }
    // Turn debris that has already settled into persistent visual rubble;
    // remove its Havok collider to avoid accumulating hundreds of bodies.
    for(let i=this.debris.length-1;i>=0;i--){
      const body=this.debris[i];
      body.time+=dt;
      const p=body.mesh.position;
      if(p.y< -50){
        body.aggregate?.dispose();
        body.mesh.dispose();
        this.debris.splice(i,1);
        this.activeBodies=Math.max(0,this.activeBodies-1);
        continue;
      }
      if(body.time>6&&p.y<3.2){
        const v=body.aggregate.body.getLinearVelocity();
        if(v.lengthSquared()<2||body.time>20){
          body.aggregate.dispose();
          body.mesh.metadata={...(body.mesh.metadata||{}),settled:true,kind:'rubble'};
          this.rubble.push(body.mesh);
          this.debris.splice(i,1);
          this.activeBodies=Math.max(0,this.activeBodies-1);
        }
      }
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