import {
  Engine, Scene, ArcRotateCamera, Vector3, Matrix, Color3,
  DefaultRenderingPipeline, HavokPlugin, Plane, PhysicsAggregate, PhysicsShapeType
} from '@babylonjs/core';
import HavokPhysics from '@babylonjs/havok';
import {CityWorld} from './world.js';
import {DisasterSystem} from './disasters.js';
import {PhysicsViewer} from '@babylonjs/core/Debug/physicsViewer';
import {ShadowGenerator} from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import './ui.css';

const $=selector=>document.querySelector(selector);
const $$=selector=>[...document.querySelectorAll(selector)];
const canvas=$('#renderCanvas');
const engine=new Engine(canvas,true,{stencil:true,preserveDrawingBuffer:false,alpha:false,antialias:true,powerPreference:'high-performance'});
engine.setHardwareScalingLevel(Math.max(1.55,window.devicePixelRatio*1.15));
let scene,camera,world,disasters,pipeline;
let havoc=null;
let selected='meteor',power=.75,paused=false,speed=1;
let buildingCount=22;
let simTime=0,lastTick=performance.now(),fpsTimer=0;
let rebuilding=false,soundsOn=true,qualityHigh=false,cinematic=false;
let physicsViewer=null;
let pointerStart=null,targetPoint=null,hovered=false;
let cameraAngles=[[-Math.PI*.67,1.05,165],[-Math.PI*.52,.66,135],[-Math.PI*.15,1.24,105]];
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
  const intensity=$('#power');
  intensity.min=type==='meteor'?'1':'15';
  if(type!=='meteor'&&Number(intensity.value)<15)intensity.value='15';
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
  $('#powerLevel').textContent=two(Math.max(1,Math.ceil(power*5)));
  $('#powerDescription').textContent=selected==='meteor'?
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
  $('#damage').textContent=(100-integrity)+'%';
  $('#clock').textContent=timestamp();
}
function callbacks(){
  return {
    onDeploy:(kind,p,strength)=>{
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
  if(!Number.isFinite(p.x)||Math.abs(p.x)>86||Math.abs(p.z)>86)return null;
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
function cycleCamera(){
  cameraIndex=(cameraIndex+1)%cameraAngles.length;
  const [a,b,r]=cameraAngles[cameraIndex];
  camera.alpha=a;camera.beta=b;camera.radius=r;
  toast(['ISOMETRIC VIEW','HIGH-ALTITUDE VIEW','CLOSE-UP VIEW'][cameraIndex]);
}
function applyQuality(){
  engine.setHardwareScalingLevel(qualityHigh?Math.max(1,window.devicePixelRatio*.85):Math.max(1.55,window.devicePixelRatio*1.15));
  if(pipeline){
    pipeline.bloomEnabled=qualityHigh;
    pipeline.fxaaEnabled=qualityHigh;
    pipeline.samples=qualityHigh?2:1;
  }
  if(world?.sun)world.sun.shadowEnabled=qualityHigh;
  if(scene)scene.fogMode=qualityHigh?scene.FOGMODE_EXP2:scene.FOGMODE_NONE;
  if(world?.shadow){
    world.shadow.setDarkness(qualityHigh?.18:.24);
    world.shadow.filteringQuality=qualityHigh?ShadowGenerator.QUALITY_MEDIUM:ShadowGenerator.QUALITY_LOW;
  }
  if(world){
    // PERF keeps visual rubble but significantly limits simultaneously ACTIVE
    // Havok bodies. Loose chunks may be reactivated by a tornado later.
    world.maxFragmentBodies=qualityHigh?260:155;
    world.maxPrimaryFragmentBodies=qualityHigh?175:112;
    world.maxDebris=qualityHigh?110:46;
    world.maxSecondaryPerWindow=qualityHigh?16:9;
  }
  $('#settingsBtn span').textContent=qualityHigh?'ULTRA':'PERF';
}
function switchQuality(){
  qualityHigh=!qualityHigh;
  applyQuality();
  toast(qualityHigh?'ULTRA QUALITY':'PERFORMANCE MODE');
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
  const p=new Vector3(Math.random()*110-55,0,Math.random()*110-55);
  deployAt(p);
}
async function createGame(){
  rebuilding=true;
  $('#loading').classList.remove('is-done');
  $('#loadingText').textContent='INITIALIZING PHYSICS ENGINE...';
  if(physicsViewer){physicsViewer.dispose();physicsViewer=null}
  if(scene){scene.dispose();scene=null;world=null;disasters=null}
  scene=new Scene(engine);
  // Dynamic impact effects need material updates, so retain Babylon's standard priority.
  camera=new ArcRotateCamera('free orbit camera',-Math.PI*.67,1.05,165,new Vector3(0,10,0),scene);
  camera.attachControl(canvas,true);
  camera.lowerRadiusLimit=36;camera.upperRadiusLimit=240;
  camera.lowerBetaLimit=.18;camera.upperBetaLimit=Math.PI*.47;
  camera.wheelDeltaPercentage=.014;camera.panningSensibility=260;
  camera.angularSensibilityX=1100;camera.angularSensibilityY=1100;
  camera.inertia=.82;camera.minZ=.1;camera.maxZ=2000;
  scene.activeCamera=camera;cameraIndex=0;
  if(!havoc)havoc=await HavokPhysics();
  const plugin=new HavokPlugin(true,havoc);
  scene.enablePhysics(new Vector3(0,-18,0),plugin);
  scene.getPhysicsEngine().setTimeStep(1/60);
  $('#loadingText').textContent='CONSTRUCTING SIMULATED CITY...';
  world=new CityWorld(scene,camera,buildingCount);
  const groundPhysics=new PhysicsAggregate(world.ground,PhysicsShapeType.BOX,{mass:0,friction:.93,restitution:.06},scene);
  const islandPhysics=new PhysicsAggregate(scene.getMeshByName('island slab'),PhysicsShapeType.BOX,{mass:0,friction:.92},scene);
  world.groundPhysics=groundPhysics;world.islandPhysics=islandPhysics;
  $('#loadingText').textContent='CALIBRATING VISUAL EFFECTS...';
  try{
    pipeline=new DefaultRenderingPipeline('filmic color grading',true,scene,[camera]);
    pipeline.samples=2;pipeline.fxaaEnabled=true;
    pipeline.bloomEnabled=true;pipeline.bloomThreshold=.73;pipeline.bloomWeight=.23;pipeline.bloomKernel=42;
    pipeline.imageProcessingEnabled=true;
    pipeline.imageProcessing.exposure=.89;pipeline.imageProcessing.contrast=1.09;
    pipeline.imageProcessing.vignetteEnabled=true;pipeline.imageProcessing.vignetteWeight=1.2;
    pipeline.imageProcessing.vignetteStretch=.1;
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
  setStatus('CHOOSE A TARGET TO BEGIN','Use the mouse to aim anywhere in the city');
  rebuilding=false;
  setTimeout(()=>$('#loading').classList.add('is-done'),330);
  window.disasterDebug={
    getPerf:()=>({fps:engine.getFps(),drawCalls:engine._drawCalls?.current??null,meshes:scene.meshes.length,activeMeshes:scene.getActiveMeshes().length,activeIndices:scene.getActiveIndices(),hardwareScale:engine.getHardwareScalingLevel(),width:engine.getRenderWidth(),height:engine.getRenderHeight(),shadows:world.shadow.getShadowMap()?.getSize()?.width||0,batching:world.staticBatchStats,quality:qualityHigh?'ULTRA':'PERF'}),
    getState:()=>({fps:engine.getFps(),buildings:world.buildings.length,requestedBuildings:buildingCount,floors:world.totalFloors,broken:world.brokenFloors,
    activeBodies:world.activeBodies,impacts:world.impactCount,integrity:world.integrity(),activeEffects:disasters.effects.length,craneJointActive:!!world.crane,fragments:world.fragments.length,shadowMapSize:world.shadow.getShadowMap()?.getSize().width,pendingFailures:world.pendingFailures.length,slabFractures:world.slabFractures.length,slabSplitCounts:world.slabFractures.slice(-30).map(s=>s.requestedParts),slabPhysicalParts:world.slabFractures.reduce((a,s)=>a+s.physicalParts,0),slabStaticParts:world.slabFractures.reduce((a,s)=>a+s.staticParts,0),
    fallingVisual:world.visualFragments.length,visibleRubble:world.rubble.length,
    secondaryBreaks:world.secondaryBreaks,secondaryWallBreaks:world.secondaryWallBreaks,
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
    windLifted:world.windLifted,windEjected:world.windEjected,carsAirborne:world.windCarsLifted.size,
    carElevations:world.props.filter(p=>p.type==='car').map(p=>+p.mesh.position.y.toFixed(2)),
    carPositions:world.props.filter(p=>p.type==='car').map(p=>({x:+p.mesh.position.x.toFixed(2),y:+p.mesh.position.y.toFixed(2),z:+p.mesh.position.z.toFixed(2)})),
    tornadoCenters:disasters.effects.filter(e=>e.type==='tornado').map(e=>({x:e.root.position.x,z:e.root.position.z})),
    airborneFragments:world.fragments.filter(p=>p.mesh.position.y>4).length}),
    getBuildings:()=>world.buildings.map(b=>({id:b.id,x:b.floors[0].mesh.position.x,z:b.floors[0].mesh.position.z,
      floors:b.floors.length,topY:b.floors.at(-1).mesh.position.y})),
    getPick:(x,y)=>{const p=surfacePoint(x,y);return p?{x:p.x,y:p.y,z:p.z}:null},
    deploy:(kind='meteor',x=0,z=0,p=.7)=>disasters.deploy(kind,new Vector3(x,0,z),p),
    deployAt:(kind,x,y,z,p=.8)=>disasters.deploy(kind,new Vector3(x,y,z),p),
    setBuildings:(count)=>changeBuildingCount(count),
    reset:()=>createGame()
  };
}
function bindUI(){
  $$('.tool').forEach(t=>t.addEventListener('click',()=>selectTool(t.dataset.tool)));
  $('#power').addEventListener('input',updatePower);updatePower();
  $('#housesCount').addEventListener('input',updateBuildingsLabel);
  $('#housesCount').addEventListener('change',e=>changeBuildingCount(e.target.value));
  updateBuildingsLabel();
  $('#randomBtn').addEventListener('click',surprise);
  $('#pauseBtn').addEventListener('click',togglePause);
  $('#speedBtn').addEventListener('click',cycleSpeed);
  $('#cameraBtn').addEventListener('click',cycleCamera);
  $('#resetBtn').addEventListener('click',()=>createGame());
  $('#settingsBtn').addEventListener('click',switchQuality);
  $('#soundBtn').addEventListener('click',()=>{
    soundsOn=!soundsOn;if(disasters)disasters.audioEnabled=soundsOn;
    $('#soundBtn span').textContent=soundsOn?'SOUND ON':'MUTED';
    toast(soundsOn?'SOUND ENABLED':'SOUND MUTED');
  });
  $('#helpBtn').addEventListener('click',()=>$('#helpModal').classList.remove('hidden'));
  $('#closeHelp').addEventListener('click',()=>$('#helpModal').classList.add('hidden'));
  $('#helpModal').addEventListener('click',e=>{if(e.target.id==='helpModal')e.target.classList.add('hidden')});
  canvas.addEventListener('pointerdown',e=>{pointerStart={x:e.clientX,y:e.clientY,time:performance.now()};});
  canvas.addEventListener('pointerup',e=>{
    if(!pointerStart)return;
    const d=Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y);
    pointerStart=null;
    if(d<7 && e.button===0){const {x,y}=pointerCoordinates(e);deployAt(surfacePoint(x,y))}
  });
  canvas.addEventListener('pointermove',updateCursor);
  canvas.addEventListener('pointerleave',()=>$('#targetCursor').style.opacity='0');
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  document.addEventListener('keydown',e=>{
    if(e.target instanceof HTMLInputElement)return;
    if(['1','2','3','4'].includes(e.key))selectTool(['meteor','tornado','quake','tsunami'][Number(e.key)-1]);
    else if(e.code==='Space'){e.preventDefault();togglePause()}
    else if(e.key.toLowerCase()==='r')createGame();
    else if(e.key.toLowerCase()==='c')cycleCamera();
    else if(e.key.toLowerCase()==='h')$('#app').classList.toggle('ui-hidden');
    else if(e.key.toLowerCase()==='p')togglePhysicsViewer();
    else if(e.key==='Escape')$('#helpModal').classList.add('hidden');
  });
  window.addEventListener('resize',()=>engine.resize());
}
bindUI();
engine.runRenderLoop(()=>{
  if(!scene)return;
  const dt=Math.min(engine.getDeltaTime()/1000,.065);
  if(!rebuilding&&!paused){
    const scaled=dt*speed;
    simTime+=scaled;
    disasters?.tick(scaled);
    world?.update(scaled);
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
