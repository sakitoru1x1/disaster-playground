import {
  Engine, Scene, ArcRotateCamera, Vector3, Matrix, Color3,
  DefaultRenderingPipeline, HavokPlugin, Plane, PhysicsAggregate, PhysicsShapeType
} from '@babylonjs/core';
import HavokPhysics from '@babylonjs/havok';
import {CityWorld} from './world.js';
import {DisasterSystem} from './disasters.js';
import {WalkController} from './walkController.js';
import {pauseCityTraffic} from './cityLife.js';
import {CITY_HALF_SIZE} from './cityLayout.js';
import {initializeTerrain} from './terrainDamage.js';
import {PhysicsViewer} from '@babylonjs/core/Debug/physicsViewer';
import {ShadowGenerator} from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import './ui.css';
import './mobile.css';
import './walk.css';
import './playerSurvival.css';
import './survivorHelp.css';

const $=selector=>document.querySelector(selector);
const $$=selector=>[...document.querySelectorAll(selector)];
const canvas=$('#renderCanvas');
const mobileDevice=/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)||
  (matchMedia('(pointer:coarse)').matches&&Math.min(screen.width,screen.height)<820);
document.documentElement.classList.toggle('mobile-device',mobileDevice);
const compactLayout=()=>matchMedia('(max-width:1200px) and (max-height:660px) and (orientation:landscape), (pointer:coarse) and (orientation:landscape) and (max-height:850px), (max-width:600px) and (orientation:portrait)').matches;
let mobileResolutionFactor=1.0,mobileFpsTimer=0;
const engine=new Engine(canvas,true,{stencil:true,preserveDrawingBuffer:false,alpha:false,
  antialias:true,powerPreference:'high-performance'});
engine.setHardwareScalingLevel(mobileDevice?mobileResolutionFactor:
  Math.max(1.55,window.devicePixelRatio*1.15));
let scene,camera,world,disasters,pipeline,walk=null;
let havoc=null;
let selected='meteor',power=.75,paused=false,speed=1;
let buildingCount=mobileDevice?10:22;
$('#housesCount').value=String(buildingCount);
let simTime=0,lastTick=performance.now(),fpsTimer=0;
let rebuilding=false,soundsOn=true,qualityHigh=false,cinematic=false;
let physicsViewer=null;
let pointerStart=null,targetPoint=null,hovered=false;
let cameraAngles=[[-Math.PI*.67,1.05,320],[-Math.PI*.52,.66,240],[-Math.PI*.15,1.24,150]];
let cameraIndex=0;
const labels={meteor:'METEOR STRIKE',tornado:'TORNADO',quake:'EARTHQUAKE',tsunami:'TSUNAMI'};
const descriptions={meteor:'High-speed impact / blast radius',tornado:'Rotational winds / flying debris',quake:'Seismic disturbance / structural collapse',tsunami:'Coastal surge / mass displacement'};
const icons={meteor:'☄',tornado:'◈',quake:'≋',tsunami:'≈'};
const two=n=>String(Math.floor(n)).padStart(2,'0');
function timestamp(){const t=Math.floor(simTime);return two(t/60)+':'+two(t%60)}
function toast(text,sub=''){
  const el=document.createElement('div');el.className='toast';
  el.textContent=text;
  if(sub){const small=document.createElement('small');small.textContent=sub;el.appendChild(small)}
  $('#toasts').appendChild(el);
  setTimeout(()=>{el.style.opacity='0';el.style.transform='translateY(-12px)';el.style.transition='opacity .4s,transform .4s';setTimeout(()=>el.remove(),450)},2350);
}
function logEvent(title,detail){
  const el=document.createElement('div');el.className='event';
  const time=document.createElement('span');time.textContent=timestamp();
  const inside=document.createElement('div');
  const heading=document.createElement('b');heading.textContent=title;
  const small=document.createElement('small');small.textContent=detail;
  inside.append(heading,small);el.append(time,inside);
  const events=$('#events');events.prepend(el);
  while(events.children.length>4)events.lastChild.remove();
}
function setStatus(text,sub='Ready to deploy'){$('#statusText').textContent=text;$('#statusSub').textContent=sub;}
function selectTool(type){
  selected=type;
  $$('.mobile-tool').forEach(el=>{
    const active=el.dataset.mobileTool===type;
    el.classList.toggle('is-active',active);
    el.setAttribute('aria-pressed',String(active));
  });
  if(compactLayout())setMobileMenu(false);
  const intensity=$('#power');
  intensity.min=type==='tornado'?'15':'1';
  if(type==='tornado'&&Number(intensity.value)<15)intensity.value='15';
  updatePower();
  $$('.tool').forEach(el=>el.classList.toggle('is-active',el.dataset.tool===type));
  $('#targetCursor b').textContent=labels[type]+' TARGET';
  setStatus(labels[type]+' SELECTED','Click a location to deploy');
}
function updatePower(){
  power=parseInt($('#power').value,10)/100;
  const pct=Math.round(power*100);
  $('#powerValue').textContent=pct+'%';
  const minimum=selected==='meteor'?1:15;
  $('#rangeFill').style.width=((pct-minimum)/(100-minimum)*100)+'%';
  const stage=(selected==='quake'||selected==='tsunami')?
    1+Math.round(9*Math.max(0,pct-1)/99):Math.max(1,Math.ceil(power*5));
  $('#powerLevel').textContent=two(stage);
  $('#powerDescription').textContent=(selected==='quake'||selected==='tsunami')?
    'LEVEL '+Math.round(1+9*Math.max(0,pct-1)/99)+' / 10':selected==='meteor'?
    (pct>=85?'CITYWIDE DISASTER':pct>=60?'DISTRICT DESTRUCTION':pct>=30?'BUILDING DESTRUCTION':pct>=10?'HEAVY LOCAL IMPACT':'LOCAL PENETRATION'):
    (pct>=85?'CATASTROPHIC':pct>=60?'SEVERE DAMAGE':pct>=35?'MODERATE DAMAGE':'LIGHT DAMAGE');
}
function updateBuildingsLabel(){
  const el=$('#housesCount');if(!el)return;
  const count=Math.max(1,Math.min(30,Number(el.value)||22));
  $('#housesValue').textContent=count+' / 30';
  $('#housesRangeFill').style.width=((count-1)/29*100)+'%';
}
async function changeBuildingCount(count){
  const value=Math.max(1,Math.min(30,Math.round(Number(count)||1)));
  buildingCount=value;$('#housesCount').value=String(value);
  updateBuildingsLabel();
  if(compactLayout())setMobileMenu(false);
  if(rebuilding)return;
  toast('CITY DENSITY: '+value+' BUILDING'+(value===1?'':'S'),'Regenerating physics world');
  await createGame();
}
function updateStats(dt){
  if(!world||!scene)return;
  fpsTimer+=dt;
  if(fpsTimer<.22)return;
  fpsTimer=0;
  const integrity=world.integrity();
  $('#integrity').textContent=integrity;
  $('#integrityBar').style.width=integrity+'%';
  $('#integrityBar').style.background=integrity>70?'#98e2ac':integrity>35?'#eec17c':'#f5836f';
  $('#activeBodies').textContent=two(world.activeBodies);
  $('#impacts').textContent=two(world.impactCount);
  $('#fps').textContent=Math.round(engine.getFps());
  $('#mobileIntegrity').textContent=integrity+'%';
  $('#mobileFps').textContent=Math.round(engine.getFps());
  if(world.progression){
    const c=world.progression.stats();
    $('#cityProgress').textContent='DAY '+c.day+' · RESCUED '+c.rescued+
      ' · REBUILT '+c.rebuilt+(c.constructed?' · NEW '+c.constructed:'');
  }
  $('#damage').textContent=(100-integrity)+'%';
  $('#clock').textContent=timestamp();
}
function setMobileMenu(open){
  $('#app').classList.toggle('mobile-menu-open',!!open);
  $('#mobileMenuBtn').setAttribute('aria-expanded',String(!!open));
  $('#mobileMenuBtn').setAttribute('aria-label',open?'Close disaster controls':'Open disaster controls');
}
function callbacks(){
  return {
    onDeploy:(kind,p,strength)=>{
      world?.progression?.event(kind);
      logEvent(labels[kind],Math.round(strength*100)+'% intensity | '+Math.round(p.x)+', '+Math.round(p.z));
      toast(icons[kind]+' '+labels[kind],descriptions[kind]);
      setStatus(labels[kind]+' DEPLOYED','Real-time physics simulation in progress');
    },
    onImpact:strength=>{
      logEvent('Shockwave detected','Kinetic energy transferred to structures');
      setStatus('IMPACT CONFIRMED','Buildings responding to shockwave');
    },
    onStatus:(msg,description)=>setStatus(msg,description)
  };
}
function surfacePoint(sx,sy){
  if(!scene||!camera)return null;
  const ray=scene.createPickingRay(sx,sy,Matrix.Identity(),camera);
  const groundDistance=ray.intersectsPlane(new Plane(0,1,0,0));
  if(groundDistance===null||groundDistance<0)return null;
  let p=ray.origin.add(ray.direction.scale(groundDistance));
  // Match the building visible UNDER THE CURSOR, not the ground behind it.
  // Previously clicking a facade targeted a distant ground point.
  let best=groundDistance,hitFloor=null;
  if(world)for(const e of world.structures){
    if(e.active||!e.mesh.isEnabled())continue;
    const info=ray.intersectsMesh(e.mesh,false);
    if(info?.hit&&info.distance>0&&info.distance<best){
      best=info.distance;hitFloor=e;
    }
  }
  if(hitFloor){
    const center=hitFloor.mesh.getAbsolutePosition();
    p=new Vector3(center.x,center.y,center.z);
  }
  if(!Number.isFinite(p.x)||Math.abs(p.x)>CITY_HALF_SIZE||Math.abs(p.z)>CITY_HALF_SIZE)return null;
  return p;
}
function pointerCoordinates(e){
  const rect=canvas.getBoundingClientRect();
  return {x:e.clientX-rect.left,y:e.clientY-rect.top};
}
function updateCursor(e){
  const {x,y}=pointerCoordinates(e),p=surfacePoint(x,y);
  const cursor=$('#targetCursor');
  if(!p||e.target!==canvas||rebuilding){cursor.style.opacity='0';targetPoint=null;return}
  cursor.style.left=e.clientX+'px';cursor.style.top=e.clientY+'px';
  cursor.style.opacity='1';targetPoint=p;
  $('#locationCoords').textContent=p.x.toFixed(1)+' / '+p.z.toFixed(1);
}
function deployAt(p=targetPoint){
  if(rebuilding||!disasters||!p)return;
  if(paused){togglePause();toast('SIMULATION RESUMED')}
  disasters.deploy(selected,p,power);
}
function togglePause(){
  paused=!paused;
  if(world)pauseCityTraffic(world,paused);
  // Babylon continues rendering; its physics integration is paused by scaling timestep.
  if(scene?.getPhysicsEngine)scene.getPhysicsEngine()?.setTimeStep(paused?0.00001:(1/60)*speed);
  $('#pauseIcon').textContent=paused?'▶':'Ⅱ';
  $('#pauseBtn').lastChild.textContent=paused?' RESUME':' PAUSE';
  logEvent(paused?'Simulation paused':'Simulation running',paused?'Rigid bodies frozen':'Simulation resumed');
}
function cycleSpeed(){
  const options=[.5,1,1.5],i=options.indexOf(speed);
  speed=options[(i+1)%options.length];
  $('#speedBtn').textContent=speed+'× SPEED';
  if(scene&&!paused)scene.getPhysicsEngine()?.setTimeStep((1/60)*speed);
  toast('SIMULATION SPEED: '+speed+'×');
}
function toggleWalkMode(){
  if(!walk||rebuilding)return;
  walk.setEnabled(!walk.enabled);
  const active=walk.enabled;
  $('#walkDeath').classList.toggle('is-visible',active&&walk.survival.dead);
  $('#walkBtn').classList.toggle('is-active',active);
  $('#walkBtn').setAttribute('aria-pressed',String(active));
  $('#walkBtn span').textContent=active?'EXIT WALK':'WALK';
  $('#targetCursor').style.opacity='0';
  setMobileMenu(false);
  toast(active?'STREET VIEW ENABLED':'ORBIT CAMERA ENABLED',
    active?(mobileDevice?'Left stick: move · swipe: look · STRIKE: disaster':
      'WASD: move · mouse: look · F: disaster · V: exit'):'');
  if(active)walk.lockPointer();
}
function walkTarget(){
  if(!walk?.enabled||!world)return null;
  const ray=walk.camera.getForwardRay(140);
  let hit=null,best=140;
  for(const part of world.structures){
    if(part.active||part.mesh.isDisposed())continue;
    const result=ray.intersectsMesh(part.mesh,false);
    if(result?.hit&&result.distance>0&&result.distance<best){
      best=result.distance;hit=part.mesh.getAbsolutePosition().clone();
    }
  }
  if(hit)return hit;
  const t=ray.intersectsPlane(new Plane(0,1,0,0));
  const dist=t!==null&&t>1&&t<100?t:35;
  const point=ray.origin.add(ray.direction.scale(dist));
  point.y=0;
  point.x=Math.max(-CITY_HALF_SIZE+5,Math.min(CITY_HALF_SIZE-5,point.x));
  point.z=Math.max(-CITY_HALF_SIZE+5,Math.min(CITY_HALF_SIZE-5,point.z));
  return point;
}
function walkStrike(){if(walk?.enabled&&!walk.survival.dead)deployAt(walkTarget())}
function walkHelp(){
  if(!walk?.enabled||walk.survival.dead)return;
  const helped=world?.progression?.helpNearest(walk.camera.position);
  toast(helped?'SURVIVOR RESCUED':'NO INJURED PERSON NEARBY',helped?'Good work!':'Get within 3 metres of an injured citizen');
}
function respawnPlayer(){
  if(!walk?.enabled)return;
  walk.respawn();
  $('#walkDeath').classList.remove('is-visible');
  toast('RESPAWNED','Health restored to 100%');
}
function cycleCamera(){
  if(walk?.enabled){toggleWalkMode();return}
  cameraIndex=(cameraIndex+1)%cameraAngles.length;
  const [a,b,r]=cameraAngles[cameraIndex];
  camera.alpha=a;camera.beta=b;camera.radius=r;
  toast(['ISOMETRIC VIEW','HIGH-ALTITUDE VIEW','CLOSE-UP VIEW'][cameraIndex]);
}
function applyQuality(){
  if(mobileDevice){
    // Babylon's default Engine does NOT automatically multiply the backing
    // framebuffer by devicePixelRatio. Using DPR here caused a 3x upscale
    // (310x143 on a 932x430 phone), making everything visibly blocky.
    engine.setHardwareScalingLevel(qualityHigh?.84:mobileResolutionFactor);
  }else{
    engine.setHardwareScalingLevel(qualityHigh?Math.max(1,window.devicePixelRatio*.85):
      Math.max(1.55,window.devicePixelRatio*1.15));
  }
  if(pipeline){
    pipeline.bloomEnabled=!mobileDevice&&qualityHigh;
    pipeline.fxaaEnabled=!mobileDevice&&qualityHigh;
    pipeline.samples=!mobileDevice&&qualityHigh?2:1;
  }
  if(world?.sun)world.sun.shadowEnabled=!mobileDevice&&qualityHigh;
  if(scene)scene.fogMode=(!mobileDevice&&qualityHigh)?scene.FOGMODE_EXP2:scene.FOGMODE_NONE;
  if(world?.shadow){
    world.shadow.setDarkness(qualityHigh?.18:.24);
    world.shadow.filteringQuality=(!mobileDevice&&qualityHigh)?
      ShadowGenerator.QUALITY_MEDIUM:ShadowGenerator.QUALITY_LOW;
  }
  if(world){
    world.maxFragmentBodies=mobileDevice?(qualityHigh?100:72):(qualityHigh?260:155);
    world.maxPrimaryFragmentBodies=mobileDevice?(qualityHigh?72:50):(qualityHigh?175:112);
    world.maxDebris=mobileDevice?(qualityHigh?25:16):(qualityHigh?110:46);
    world.maxSecondaryPerWindow=mobileDevice?(qualityHigh?6:4):(qualityHigh?16:9);
    world.maxWallVisualPerWindow=mobileDevice?7:14;
    world.maxVisualFragments=mobileDevice?(qualityHigh?190:140):290;
  }
  $('#settingsBtn span').textContent=mobileDevice?(qualityHigh?'SHARP':'MOBILE'):(qualityHigh?'ULTRA':'PERF');
  $('#settingsBtn').setAttribute('aria-label',mobileDevice?(qualityHigh?'Switch to smooth mobile graphics':'Switch to sharper mobile graphics'):(qualityHigh?'Switch to performance graphics':'Switch to ultra graphics'));
  $('#settingsBtn').title=mobileDevice?
    (qualityHigh?'Switch to faster mobile graphics':'Switch to sharper mobile graphics'):
    'Toggle quality';
}
function switchQuality(){
  qualityHigh=!qualityHigh;
  if(mobileDevice)mobileResolutionFactor=1.0;
  applyQuality();
  toast(mobileDevice?(qualityHigh?'SHARP MOBILE':'MOBILE PERFORMANCE'):
    (qualityHigh?'ULTRA QUALITY':'PERFORMANCE MODE'));
}
function togglePhysicsViewer(){
  if(physicsViewer){physicsViewer.dispose();physicsViewer=null;toast('PHYSICS COLLIDERS HIDDEN');return}
  if(!world||!scene)return;
  try{
    physicsViewer=new PhysicsViewer(scene);
    for(const e of world.structures)if(e.aggregate)physicsViewer.showBody(e.aggregate.body);
    for(const f of world.fragments)physicsViewer.showBody(f.aggregate.body);
    for(const p of world.props)physicsViewer.showBody(p.aggregate.body);
    physicsViewer.showBody(world.groundPhysics.body);
    toast('HAVOK COLLISION DEBUG','Physical collider outlines enabled (P to hide)');
  }catch(error){console.warn('Physics viewer unavailable',error);toast('DEBUG VIEW UNAVAILABLE')}
}
function surprise(){
  selectTool(['meteor','meteor','tornado','quake','tsunami'][Math.floor(Math.random()*5)]);
  const p=new Vector3((Math.random()*2-1)*(CITY_HALF_SIZE-22),0,(Math.random()*2-1)*(CITY_HALF_SIZE-22));
  deployAt(p);
}
async function createGame(){
  rebuilding=true;
  $('#loading').classList.remove('is-done');
  $('#loadingText').textContent='INITIALIZING PHYSICS ENGINE...';
  if(physicsViewer){physicsViewer.dispose();physicsViewer=null}
  if(walk){walk.dispose();walk=null;document.documentElement.classList.remove('walk-mode','walk-locked');$('#walkBtn').classList.remove('is-active');$('#walkBtn').setAttribute('aria-pressed','false');$('#walkBtn span').textContent='WALK'}
  if(scene){scene.dispose();scene=null;world=null;disasters=null}
  scene=new Scene(engine);
  // Dynamic impact effects need material updates, so retain Babylon's standard priority.
  camera=new ArcRotateCamera('free orbit camera',-Math.PI*.67,1.05,mobileDevice?205:320,new Vector3(0,10,0),scene);
  camera.attachControl(canvas,true);
  camera.lowerRadiusLimit=36;camera.upperRadiusLimit=450;
  camera.lowerBetaLimit=.18;camera.upperBetaLimit=Math.PI*.47;
  camera.wheelDeltaPercentage=.014;camera.panningSensibility=260;
  camera.angularSensibilityX=mobileDevice?1600:1100;camera.angularSensibilityY=mobileDevice?1600:1100;
  camera.pinchDeltaPercentage=mobileDevice?.008:0;
  camera.inertia=.82;camera.minZ=.1;camera.maxZ=2000;
  scene.activeCamera=camera;cameraIndex=0;
  if(!havoc)havoc=await HavokPhysics();
  const plugin=new HavokPlugin(true,havoc);
  scene.enablePhysics(new Vector3(0,-18,0),plugin);
  scene.getPhysicsEngine().setTimeStep(1/60);
  $('#loadingText').textContent='CONSTRUCTING SIMULATED CITY...';
  world=new CityWorld(scene,camera,buildingCount,{mobile:mobileDevice});
  walk=new WalkController(scene,canvas,camera,world,mobileDevice);
  walk.survival.onDeath=cause=>{
    $('#walkDeathCause').textContent='CAUSE: '+cause.toUpperCase();
    $('#walkDeath').classList.add('is-visible');
    if(document.pointerLockElement===canvas)document.exitPointerLock?.();
    toast('PLAYER KILLED','Respawn to try again');
  };
  $('#walkDeath').classList.remove('is-visible');
  document.documentElement.style.setProperty('--player-hurt','0');
  initializeTerrain(world);
  $('#loadingText').textContent='CALIBRATING VISUAL EFFECTS...';
  pipeline=null;
  try{
    if(!mobileDevice){
    pipeline=new DefaultRenderingPipeline('filmic color grading',true,scene,[camera]);
    pipeline.samples=2;pipeline.fxaaEnabled=true;
    pipeline.bloomEnabled=true;pipeline.bloomThreshold=.73;pipeline.bloomWeight=.23;pipeline.bloomKernel=42;
    pipeline.imageProcessingEnabled=true;
    pipeline.imageProcessing.exposure=.89;pipeline.imageProcessing.contrast=1.09;
    pipeline.imageProcessing.vignetteEnabled=true;pipeline.imageProcessing.vignetteWeight=1.2;
    pipeline.imageProcessing.vignetteStretch=.1;
    }
  }catch(e){console.warn('Post-processing fallback',e)}
  disasters=new DisasterSystem(world,callbacks());
  disasters.audioEnabled=soundsOn;
  applyQuality();
  simTime=0;paused=false;speed=1;fpsTimer=0;
  $('#pauseIcon').textContent='Ⅱ';$('#pauseBtn').lastChild.textContent=' PAUSE';
  $('#speedBtn').textContent='1× SPEED';
  $('#events').innerHTML='';
  logEvent('City rebuilt','Physics world reset and ready');
  updateStats(1);
  setStatus('CHOOSE A TARGET TO BEGIN',mobileDevice?'Tap city to strike · drag to orbit · pinch to zoom':'Use the mouse to aim anywhere in the city');
  rebuilding=false;
  setTimeout(()=>$('#loading').classList.add('is-done'),330);
  window.disasterDebug={
    getPerf:()=>({fps:engine.getFps(),drawCalls:engine._drawCalls?.current??null,meshes:scene.meshes.length,activeMeshes:scene.getActiveMeshes().length,activeIndices:scene.getActiveIndices(),hardwareScale:engine.getHardwareScalingLevel(),width:engine.getRenderWidth(),height:engine.getRenderHeight(),shadows:world.shadow.getShadowMap()?.getSize()?.width||0,batching:world.staticBatchStats,mobile:mobileDevice,quality:mobileDevice?(qualityHigh?'SHARP':'MOBILE'):(qualityHigh?'ULTRA':'PERF')}),
    getState:()=>({terrainDeformations:world.terrainDeformations,craters:world.terrainCraters.length,
      ...world.progression.stats(),fps:engine.getFps(),buildings:world.buildings.length,requestedBuildings:buildingCount,floors:world.totalFloors,broken:world.brokenFloors,
    districtBuildings:world.districtBuildings.length,districtFloors:world.districtBuildings.reduce((n,b)=>n+b.floors.length,0),districtPhysicsActivated:world.districtBuildings.filter(b=>b.physicsActivated).length,cityWidth:CITY_HALF_SIZE*2,activeBodies:world.activeBodies,impacts:world.impactCount,integrity:world.integrity(),activeEffects:disasters.effects.length,craneJointActive:!!world.crane,fragments:world.fragments.length,shadowMapSize:world.shadow.getShadowMap()?.getSize().width,pendingFailures:world.pendingFailures.length,slabFractures:world.slabFractures.length,slabSplitCounts:world.slabFractures.slice(-30).map(s=>s.requestedParts),slabPhysicalParts:world.slabFractures.reduce((a,s)=>a+s.physicalParts,0),slabStaticParts:world.slabFractures.reduce((a,s)=>a+s.staticParts,0),
    fallingVisual:world.visualFragments.length,
    retainedShards:scene.meshes.filter(m=>m.metadata?.retained).length,
    floatingSettledSlabs:world.rubble.filter(m=>!m.isDisposed()&&m.metadata?.kind==='slab'&&m.position.y>5).length,
    visualDropped:world.visualDropped,
    groundedFracturePieces:world.groundedFracturePieces,
    groundContactFractures:world.groundContactFractures,
    visibleRubble:world.rubble.length+world.staticRubbleBatches.length,
    decorativeMarks:world.decorativeMarks.length,
    activeParticleSystems:world.particles.length,
    pooledParticleSystems:world.particlePool.length,particlesSkipped:world.particlesSkipped,
    bakedRubble:world.bakedRubbleMeshes,rubbleBatchCount:world.staticRubbleBatches.length,
    rubbleBatchSavedDraws:world.rubbleBatchSavedDraws,
    cascadeDeferred:world.cascadeDeferred,fracturesThisFrame:world.fracturesThisFrame,
    civilians:world.civilians.length,civilianDeaths:world.civilianDeaths,
    pedestriansWalking:world.civilians.filter(p=>p.state==='walking').length,
    pedestrianPositions:world.civilians.map(p=>({x:+p.root.position.x.toFixed(2),z:+p.root.position.z.toFixed(2),state:p.state})),
    pedestriansFleeing:world.civilians.filter(p=>p.state==='fleeing').length,
    carsDriving:world.props.filter(p=>p.type==='car'&&p.traffic?.state==='driving').length,
    carsWrecked:world.carsWrecked,
    quakeEffects:disasters.effects.filter(e=>e.type==='quake').map(e=>({level:e.level,broken:e.broken,targetIndex:e.targetIndex,targets:e.targets.length})),
    tsunamiEffects:disasters.effects.filter(e=>e.type==='tsunami').map(e=>({level:e.level,broken:e.broken,hit:e.damaged.size,deferred:e.deferred||0})),
    secondaryBreaks:world.secondaryBreaks,tertiaryBreaks:world.tertiaryBreaks,
    pendingSecondary:world.pendingSecondary.length,secondaryQueuePeak:world.secondaryQueuePeak,
    secondaryDeferred:world.secondaryDeferred,secondaryMissed:world.secondaryMissed,
    pendingVisualSecondary:world.visualFractureQueue.length,
    tsunamiSectionHits:world.tsunamiSectionHits,tsunamiDeferred:world.tsunamiDeferred,
    visualFractureDeferred:world.visualFractureDeferred,visualFractureMissed:world.visualFractureMissed,
    tertiaryWindowCount:world.tertiaryWindowCount,
    secondaryWallBreaks:world.secondaryWallBreaks,
    visualWallBreaks:world.secondaryWallVisualWindow,secondaryPieces:world.secondaryPieces,secondaryImpactEvents:world.secondaryImpactEvents,secondaryWindowCount:world.secondaryWindowCount,
    unsupportedFloors:world.structures.filter(e=>!e.active&&e.building.floors.slice(0,e.storey).some(low=>low.active)).length,
    damagedSections:world.structures.filter(e=>!e.active&&e.health<e.maxHealth).length,
    damagePercent:Math.round(world.structures.reduce((sum,e)=>sum+(e.active?1:1-e.health/e.maxHealth),0)/world.structures.length*100),
    sectionHealth:world.structures.map(e=>({buildingId:e.building.id,storey:e.storey,
      health:Math.round(e.health),maxHealth:e.maxHealth,broken:e.active,damageMarks:e.damageMarks})),
    lastMeteorImpact:disasters.lastMeteorImpact||null,meteorsInFlight:disasters.meteors.length,
    meteorPhases:disasters.meteors.map(m=>({phase:m.phase,impactAge:m.impactAge,delay:m.explosionDelay})),
    meteorHistory:disasters.meteorHistory.slice(-8),meteorEvents:disasters.meteorEvents.slice(-18),kineticImpacts:world.kineticImpacts,
    blastHistory:disasters.blastHistory.slice(-8),activeBlastWaves:disasters.blastWaves.length,
    waveProgress:disasters.blastWaves.map(w=>({power:w.power,cursor:w.cursor,total:w.targets.length,broken:w.broken,age:w.age})),
    windLifted:world.windLifted,windEjected:world.windEjected,
    windPhysicsUpdates:world.windPhysicsUpdates||0,carsAirborne:world.windCarsLifted.size,
    carElevations:world.props.filter(p=>p.type==='car').map(p=>+p.mesh.position.y.toFixed(2)),
    carPositions:world.props.filter(p=>p.type==='car').map(p=>({x:+p.mesh.position.x.toFixed(2),y:+p.mesh.position.y.toFixed(2),z:+p.mesh.position.z.toFixed(2)})),
    tornadoCenters:disasters.effects.filter(e=>e.type==='tornado').map(e=>({x:e.root.position.x,z:e.root.position.z})),
    airborneFragments:world.fragments.filter(p=>p.mesh.position.y>4).length}),
    getRubbleDebug:()=>{
      const rubble=[...world.rubble,...world.fragments.map(x=>x.mesh),
        ...world.visualFragments.map(x=>x.mesh)].filter(m=>m&&!m.isDisposed());
      const pigments=new Set(),origins=new Set();let painted=0,settled=0;
      for(const mesh of rubble){
        const data=mesh.getVerticesData('color');
        if(data?.length){
          painted++;
          for(let i=0;i<data.length;i+=16){
            pigments.add([data[i],data[i+1],data[i+2]].map(v=>Math.round(v*20)).join('/'));
          }
        }
        if(mesh.metadata?.rubbleAppearance?.buildingId!==undefined)
          origins.add(mesh.metadata.rubbleAppearance.buildingId);
        if(mesh.metadata?.settled)settled++;
      }
      // Check whether broad slab surfaces still resemble the source building,
      // rather than generic grey concrete, across all fracture generations.
      const slabs=rubble.filter(m=>m.metadata?.kind==='slab'&&
        m.metadata?.rubbleAppearance&&m.getVerticesData('color'));
      let customSlabs=0,paintedTopSamples=0,sourceDistance=0,concreteDistance=0;
      let paintedRimSamples=0,rimDistanceToPaint=0,rimDistanceToConcrete=0;
      let paintedUndersideSamples=0,undersideDistanceToPaint=0,undersideDistanceToConcrete=0;
      const slabOrigins=new Set(),slabGenerations=[0,0,0];
      for(const slab of slabs){
        const meta=slab.metadata,regions=meta.slabRegions||[];
        if(regions.length)customSlabs++;
        slabOrigins.add(meta.rubbleAppearance.buildingId);
        const gen=Math.min(2,Math.max(0,meta.secondaryGeneration||0));slabGenerations[gen]++;
        const col=slab.getVerticesData('color'),paint=meta.rubbleAppearance.paint,
          raw=meta.rubbleAppearance.concrete;
        for(let j=0;j<regions.length;j++){
          if(regions[j]!==1&&regions[j]!==7&&regions[j]!==4)continue;
          const k=j*4;
          const distancePaint=Math.hypot(col[k]-paint[0],col[k+1]-paint[1],col[k+2]-paint[2]);
          const distanceConcrete=Math.hypot(col[k]-raw[0],col[k+1]-raw[1],col[k+2]-raw[2]);
          if(regions[j]===1){paintedTopSamples++;sourceDistance+=distancePaint;concreteDistance+=distanceConcrete}
          else if(regions[j]===7){
            paintedRimSamples++;rimDistanceToPaint+=distancePaint;rimDistanceToConcrete+=distanceConcrete;
          }else{
            paintedUndersideSamples++;undersideDistanceToPaint+=distancePaint;
            undersideDistanceToConcrete+=distanceConcrete;
          }
        }
      }
      return {total:rubble.length,painted,paintedPercent:rubble.length?Math.round(painted*100/rubble.length):0,
        pigments:pigments.size,buildingColors:origins.size,settled,
        slabs:slabs.length,customSlabs,slabSourceBuildings:slabOrigins.size,slabGenerations,
        paintedTopSamples,paintedRimSamples,paintedUndersideSamples,
        averageSlabUndersideDistanceToPaint:paintedUndersideSamples?+(undersideDistanceToPaint/paintedUndersideSamples).toFixed(3):null,
        averageSlabUndersideDistanceToConcrete:paintedUndersideSamples?+(undersideDistanceToConcrete/paintedUndersideSamples).toFixed(3):null,
        averageSlabRimDistanceToPaint:paintedRimSamples?+(rimDistanceToPaint/paintedRimSamples).toFixed(3):null,
        averageSlabRimDistanceToConcrete:paintedRimSamples?+(rimDistanceToConcrete/paintedRimSamples).toFixed(3):null,
        averageSlabTopDistanceToPaint:paintedTopSamples?+(sourceDistance/paintedTopSamples).toFixed(3):null,
        averageSlabTopDistanceToConcrete:paintedTopSamples?+(concreteDistance/paintedTopSamples).toFixed(3):null,
        groundedFracturePieces:world.groundedFracturePieces,
        groundContactFractures:world.groundContactFractures,
        recentlySettled:world.rubble.filter(x=>!x.isDisposed()&&x.metadata?.secondaryGeneration>=1).slice(-280).map(m=>({
          id:m.uniqueId,y:+m.position.y.toFixed(3),g:m.metadata?.secondaryGeneration||0
        }))};
    },
    getVisualStyle:()=>({showcaseCount:world.showcaseCount,
      facades:scene.meshes.filter(m=>m.name==='showcase facade cornices and pilasters').length,
      contactShadows:scene.meshes.filter(m=>m.name==='showcase ambient contact').length,
      districtShadows:scene.meshes.filter(m=>m.name==='batched soft building footprint shadows').length,
      architecturalDetails:scene.meshes.filter(m=>m.name==='architectural facade detail').length,
      vehicleDetails:scene.meshes.filter(m=>m.name==='vehicle lights trim and handles').length,
      streetDetailBatches:scene.meshes.filter(m=>m.name==='batched road crosswalks drains and planting').length,
      plazaBatches:scene.meshes.filter(m=>m.name==='showcase central plaza details').length,
      asphaltTexture:!!world.materials.road.diffuseTexture,
      pavementTexture:!!world.materials.sidewalk.diffuseTexture,
      sun:world.sun.intensity,ambient:world.hemi.intensity}),
    getTerrainDebug:()=>({
      deformations:world.terrainDeformations,craters:world.terrainCraters.slice(),
      clippedTiles:world.terrainClippedTiles||0,warpedVertices:world.terrainWarpedVertices||0,
      skins:(world.terrainSkins||[]).map(m=>({name:m.name,vertices:m.getTotalVertices(),
        firstNormalY:m.getVerticesData('normal')?.[1]??null,
        enabled:m.isEnabled(),culled:m.material.backFaceCulling,
        visibleTriangles:m.getIndices().length/3,
        totalTriangles:m.metadata.terrainOriginalIndices.length/3})),
      trees:world.trees.slice(0,12).map(t=>({x:t.root.position.x,y:t.root.position.y,z:t.root.position.z})),
      people:world.civilians.slice(0,15).map(p=>({x:p.root.position.x,y:p.root.position.y,z:p.root.position.z}))
    }),
    getWalk:()=>walk?.info(),
    getPlayerState:()=>walk?.survival.dieState(),
    respawnPlayer:()=>respawnPlayer(),
    // Developer-only disaster damage calibration; not exposed in the game UI.
    damagePlayerForTest:(amount)=>walk?.survival.takeDamage(amount,'test',1.2),
    simulateCityGrowthForTest:()=>world.progression.tryBuildNewBlock(world.time+100),
    simulateRecoveryForTest:()=>{
      const pending=world.pendingFailures;
      world.pendingFailures=[];
      world.progression.lastDisaster=world.time-40;
      world.progression.nextRepair=0;
      const brokenBefore=world.brokenFloors;
      world.progression.update(0,{effects:[],blastWaves:[]});
      const brokenAfter=world.brokenFloors;
      world.pendingFailures=pending;
      return {...world.progression.stats(),brokenBefore,brokenAfter};
    },
    toggleWalk:()=>toggleWalkMode(),
    getBuildings:()=>world.buildings.map(b=>({id:b.id,x:b.floors[0].mesh.position.x,z:b.floors[0].mesh.position.z,
      floors:b.floors.length,topY:b.floors.at(-1).mesh.position.y})),
    getDistrictBuildings:()=>world.districtBuildings.map(b=>({id:b.id,x:b.x,z:b.z,
      kind:b.design.kind,floors:b.floors.length,activeFloors:b.floors.filter(e=>e.active).length,
      physicsActivated:b.physicsActivated,proxy:!!b.proxy,topY:b.floors.at(-1).mesh.position.y})),
    testDistrictImpact:(id)=>{
      const b=world.districtBuildings.find(x=>x.id===id);if(!b)return null;
      const entry=b.floors.at(-1),pos=entry.mesh.getAbsolutePosition();
      const before=world.brokenFloors;
      world.kineticMeteorImpact(pos,new Vector3(0,-1,0),1,entry);
      return {activated:b.physicsActivated,proxy:!!b.proxy,broken:world.brokenFloors-before,
        topFloorActive:entry.active,allFloorsScaled:b.floors.every(f=>f.mesh.scaling.y===1)};
    },
    getPick:(x,y)=>{const p=surfacePoint(x,y);return p?{x:p.x,y:p.y,z:p.z}:null},
    deploy:(kind='meteor',x=0,z=0,p=.7)=>disasters.deploy(kind,new Vector3(x,0,z),p),
    deployAt:(kind,x,y,z,p=.8)=>disasters.deploy(kind,new Vector3(x,y,z),p),
    setBuildings:(count)=>changeBuildingCount(count),
    reset:()=>createGame()
  };
}
function syncFullscreenUI(){
  const active=!!(document.fullscreenElement||document.webkitFullscreenElement);
  const button=$('#fullscreenBtn');
  button.setAttribute('aria-pressed',String(active));
  button.firstChild.textContent=active?'⇱ ':'⛶ ';
  button.setAttribute('aria-label',active?'Exit fullscreen':'Enter fullscreen');
  button.title=active?'Exit fullscreen':'Fullscreen';
  // Fullscreen can change the CSS viewport and the canvas backing resolution.
  requestAnimationFrame(()=>engine.resize());
  setTimeout(()=>engine.resize(),160);
}
async function toggleFullscreen(){
  const element=document.documentElement;
  const active=!!(document.fullscreenElement||document.webkitFullscreenElement);
  try{
    if(active){
      if(document.exitFullscreen)await document.exitFullscreen();
      else if(document.webkitExitFullscreen)await document.webkitExitFullscreen();
    }else{
      // Must run directly as a result of a real tap; browsers reject automatic fullscreen.
      if(element.requestFullscreen)await element.requestFullscreen({navigationUI:'hide'});
      else if(element.webkitRequestFullscreen)await element.webkitRequestFullscreen();
      else throw new Error('Fullscreen API unavailable');
      // Landscape is best for this game; orientation lock is optional on browsers.
      if(mobileDevice&&screen.orientation?.lock){
        try{await screen.orientation.lock('landscape')}catch{ /* platform restriction */ }
      }
    }
  }catch(error){
    console.warn('Fullscreen not supported in this browser',error);
    toast('FULLSCREEN UNAVAILABLE',
      'On iPhone: Share → Add to Home Screen, then open the game icon.');
  }finally{
    syncFullscreenUI();
  }
}
function bindUI(){
  $$('.tool').forEach(t=>t.addEventListener('click',()=>selectTool(t.dataset.tool)));
  $$('.mobile-tool').forEach(t=>t.addEventListener('click',()=>selectTool(t.dataset.mobileTool)));
  $('#mobileMenuBtn').addEventListener('click',()=>setMobileMenu(!$('#app').classList.contains('mobile-menu-open')));
  $('#mobileCloseBtn').addEventListener('click',()=>setMobileMenu(false));
  $('#mobileDrawerBackdrop').addEventListener('click',()=>setMobileMenu(false));
  $('#power').addEventListener('input',updatePower);updatePower();
  $('#housesCount').addEventListener('input',updateBuildingsLabel);
  $('#housesCount').addEventListener('change',e=>changeBuildingCount(e.target.value));
  updateBuildingsLabel();
  $('#randomBtn').addEventListener('click',surprise);
  $('#pauseBtn').addEventListener('click',togglePause);
  $('#speedBtn').addEventListener('click',cycleSpeed);
  $('#cameraBtn').addEventListener('click',cycleCamera);
  $('#walkBtn').addEventListener('click',toggleWalkMode);
  $('#walkStrikeBtn').addEventListener('click',walkStrike);
  $('#walkHelpBtn').addEventListener('click',walkHelp);
  $('#walkRespawnBtn').addEventListener('click',respawnPlayer);
  const stick=$('#walkJoystick'),thumb=$('#walkStick');
  stick.addEventListener('pointerdown',e=>walk?.startJoystick(e,stick,thumb));
  stick.addEventListener('pointermove',e=>walk?.updateJoystick(e,stick,thumb));
  for(const name of ['pointerup','pointercancel','lostpointercapture'])
    stick.addEventListener(name,e=>walk?.releaseJoystick(e,thumb));
  $('#resetBtn').addEventListener('click',()=>createGame());
  $('#settingsBtn').addEventListener('click',switchQuality);
  $('#fullscreenBtn').addEventListener('click',toggleFullscreen);
  document.addEventListener('fullscreenchange',syncFullscreenUI);
  document.addEventListener('webkitfullscreenchange',syncFullscreenUI);
  $('#soundBtn').addEventListener('click',()=>{
    soundsOn=!soundsOn;if(disasters)disasters.audioEnabled=soundsOn;
    $('#soundBtn span').textContent=soundsOn?'SOUND ON':'MUTED';
    toast(soundsOn?'SOUND ENABLED':'SOUND MUTED');
  });
  $('#helpBtn').addEventListener('click',()=>$('#helpModal').classList.remove('hidden'));
  $('#closeHelp').addEventListener('click',()=>$('#helpModal').classList.add('hidden'));
  $('#helpModal').addEventListener('click',e=>{if(e.target.id==='helpModal')e.target.classList.add('hidden')});
  canvas.addEventListener('pointerdown',e=>{
    if(walk?.enabled){
      if(e.pointerType==='touch')walk.beginTouchLook(e);
      else if(e.button===0)walk.lockPointer();
      return;
    }
    pointerStart={x:e.clientX,y:e.clientY,time:performance.now(),type:e.pointerType};
  });
  canvas.addEventListener('pointerup',e=>{
    if(walk?.enabled){walk.endTouchLook(e);return}
    if(!pointerStart)return;
    const start=pointerStart;
    const d=Math.hypot(e.clientX-start.x,e.clientY-start.y);
    pointerStart=null;
    const isTap=d<(e.pointerType==='touch'?17:7)&&
      performance.now()-start.time<(e.pointerType==='touch'?500:650);
    if(isTap&&(e.button===0||e.pointerType==='touch')){
      const {x,y}=pointerCoordinates(e);deployAt(surfacePoint(x,y));
    }
  });
  canvas.addEventListener('pointercancel',e=>{pointerStart=null;walk?.endTouchLook(e)});
  canvas.addEventListener('pointermove',e=>{
    if(walk?.enabled){walk.moveTouchLook(e);return}
    if(e.pointerType!=='touch')updateCursor(e);
  });
  canvas.addEventListener('pointerleave',()=>$('#targetCursor').style.opacity='0');
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  document.addEventListener('keydown',e=>{
    if(e.target instanceof HTMLInputElement)return;
    if(walk?.key(e.code,true)){e.preventDefault();return}
    if(e.key.toLowerCase()==='v'){toggleWalkMode();return}
    if(e.key.toLowerCase()==='f'&&walk?.enabled){walkStrike();return}
    if(e.key.toLowerCase()==='e'&&walk?.enabled){walkHelp();return}
    if(['1','2','3','4'].includes(e.key))selectTool(['meteor','tornado','quake','tsunami'][Number(e.key)-1]);
    else if(e.code==='Space'){e.preventDefault();togglePause()}
    else if(e.key.toLowerCase()==='r')createGame();
    else if(e.key.toLowerCase()==='c')cycleCamera();
    else if(e.key.toLowerCase()==='h')$('#app').classList.toggle('ui-hidden');
    else if(e.key.toLowerCase()==='p')togglePhysicsViewer();
    else if(e.key==='Escape'){$('#helpModal').classList.add('hidden');setMobileMenu(false)}
  });
  document.addEventListener('keyup',e=>{if(walk?.key(e.code,false))e.preventDefault()});
  window.addEventListener('resize',()=>{engine.resize();if(!compactLayout())setMobileMenu(false)});
  window.addEventListener('orientationchange',()=>setTimeout(()=>engine.resize(),240));
  syncFullscreenUI();
}
bindUI();
window.addEventListener('pagehide',()=>DisasterSystem.closeSharedAudio());
engine.runRenderLoop(()=>{
  if(!scene)return;
  const dt=Math.min(engine.getDeltaTime()/1000,.065);
  if(!rebuilding&&!paused){
    const scaled=dt*speed;
    simTime+=scaled;
    world?.beginFrame();
    disasters?.tick(scaled);
    world?.update(scaled);
    world?.progression.update(scaled,disasters);
    walk?.update(scaled,disasters);
    if(disasters?.shake>0&&camera){
      // Non-destructive screen-shake offsets target temporarily.
      const s=disasters.shake;
      camera.target.x=Math.sin(performance.now()*.073)*s*.21;
      camera.target.z=Math.cos(performance.now()*.081)*s*.21;
      camera.target.y=10+Math.sin(performance.now()*.09)*s*.2;
    }else if(camera){
      camera.target.x*=.9;camera.target.z*=.9;
      camera.target.y+=(10-camera.target.y)*.07;
    }
    updateStats(dt);
  }
  scene.render();
});
(async()=>{
  try{await createGame()}catch(e){
    console.error('Failed to initialize game',e);
    $('#loadingText').textContent='ERROR: '+(e?.message||'Initialization failed');
    $('#loadingText').style.color='#ffc28c';
  }
})();