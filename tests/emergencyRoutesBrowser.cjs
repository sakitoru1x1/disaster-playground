const {chromium,devices}=require('playwright');
(async()=>{
 const {createServer}=await import('vite');
 const server=await createServer({server:{host:'127.0.0.1',port:0}});await server.listen();
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,
 args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage']});
 let failures=0;
 for(const device of ['desktop','mobile']){
  const context=await browser.newContext(device==='mobile'?
   {...devices['Pixel 7'],viewport:{width:412,height:850},deviceScaleFactor:1}
   :{viewport:{width:1180,height:780}});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/',{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>!!window.disasterDebug?.debugRescueCase,{timeout:120000});
   const result=await page.evaluate(()=>{
    const d=window.disasterDebug;
    const buildings=d.getDistrictBuildings().filter(b=>b.floors>=4);
    const first=buildings[0];
    if(!first)throw Error('Test district building missing');
    // Reserve real debris bodies in an independent safe district BEFORE
    // the first impact fills the smaller mobile physics fragment budget.
    const scattered=d.scatterRubbleForTest(80,80,13);
    if(scattered.added<3)throw Error('Independent safe rubble was not spawned');
    const hitA=d.testDistrictImpact(first.id);
    let second=null,hitB=null;
    // A second structural release isn't guaranteed under the mobile Havok
    // budget; distant loose wreckage still requires helicopter cleanup.
    const candidate=buildings.find(b=>b.id%3!==0&&
      Math.hypot(b.x-first.x,b.z-first.z)>80);
    if(candidate){const impact=d.testDistrictImpact(candidate.id);
      if(impact?.topFloorActive){second=candidate;hitB=impact}}
    const injury=d.debugRescueCase('stretcher',first.x,first.z);
    d.makeCraterForTest(48,48,.45);
    // All work with no real elapsed wall-clock seconds using deterministic
    // simulated ticks, and record the helicopter WHILE another site is blocked.
    const initial=d.getEmergency(),initialAmbulance=initial.responders.find(r=>r.name==='ambulance');
    if(!initialAmbulance||initialAmbulance.roadPath<1)
      throw Error('Rescue vehicle did not have a route: '+JSON.stringify(initial));
    const initialPosition={x:initialAmbulance.x,z:initialAmbulance.z};
    let furthest=-Infinity,minimum=Infinity,seenAmbulanceDriving=false,
      seenFireDriving=false,seenHeliWhileInjured=false,seenHoisting=false,
      seenParallelWork=false,
      seenCraneForIntact=false,loadedPatients=0,atScene=false,blockedSeen=false;
    for(let i=0;i<290;i++){
     d.tickRecoveryForTest(1.25);
     const e=d.getEmergency(),rec=d.getRecovery();
     for(const v of e.responders){
      furthest=Math.max(furthest,Math.abs(v.x),Math.abs(v.z));
      minimum=Math.min(minimum,Math.hypot(v.x-first.x,v.z-first.z));
      if(v.name==='ambulance'&&v.state==='driving')seenAmbulanceDriving=true;
      if(v.name==='fire'&&v.state==='driving')seenFireDriving=true;
      if(v.name==='ambulance'&&v.crewVisible>=1)atScene=true;
     }
     blockedSeen||=rec.sites.some(s=>s.phase==='blocked'&&Math.hypot(s.x-first.x,s.z-first.z)<4);
     if(rec.helicopters>0&&e.dispatch.loadedPatients===0)
      seenHeliWhileInjured=true;
     if(rec.helicopters>0&&(e.dispatch.ambulances>0||e.dispatch.fireEngines>0))
      seenParallelWork=true;
     seenHoisting||=rec.cargoPieces>0&&rec.carriedRealRubble;
     if(rec.constructionCranes>0){
       const buildings=d.getDistrictBuildings();
       // crane may be active only when a floor in its target is physically gone
       const site=rec.sites.find(s=>s.claimed.includes('build'));
       if(site&&site.key.startsWith('b')){
        const b=buildings.find(b=>'b'+b.id===site.key);
        if(b&&b.activeFloors===0)seenCraneForIntact=true;
       }
     }
     loadedPatients=Math.max(loadedPatients,e.dispatch.loadedPatients);
   }
   return {first,second,hitA,hitB,scattered,injury,initialPosition,furthest,minimum,
    seenAmbulanceDriving,seenFireDriving,seenHeliWhileInjured,seenParallelWork,seenHoisting,
    seenCraneForIntact,loadedPatients,atScene,blockedSeen,after:d.getState(),
    recovery:d.getRecovery()};
   });
   if(!result.hitA.topFloorActive)
    throw Error('Test impact failed to break structural floors');
   if(result.furthest>156)throw Error('Emergency vehicles left the island: '+result.furthest);
   if(!result.seenAmbulanceDriving||!result.atScene||result.minimum>23)
    throw Error('Ambulance stuck at depot: '+JSON.stringify(result).slice(0,1200));
   if(!result.blockedSeen||!result.seenParallelWork||!result.seenHoisting)
    throw Error('Helicopter did not reach safe rubble while victim was being rescued '+JSON.stringify(result).slice(0,1300));
   if(result.seenCraneForIntact)throw Error('Crane assigned to completely intact building');
   if(!result.loadedPatients)throw Error('Ambulance never loaded the injured resident');
   if(errors.length)throw Error('JS errors: '+errors.join(' | '));
   console.log('TRAFFIC_RESCUE_REGRESSION_PASS',JSON.stringify({
    device,furthest:result.furthest.toFixed(2),nearestVehicleToIncident:result.minimum.toFixed(2),
    helicopterTransportedVisibleRubble:result.seenHoisting,
    helicopterAndRescueSimultaneous:result.seenHeliWhileInjured,
    loadedPatients:result.loadedPatients,unbrokenCranes:result.seenCraneForIntact,
    rebuiltFloors:result.recovery.buildingsRestored}));
  }catch(e){failures++;console.log('TRAFFIC_RESCUE_REGRESSION_FAIL',device,String(e),errors)}
  await context.close();
 }
 await browser.close();await server.close();
 process.exitCode=failures?1:0;
})().then(()=>process.exit(process.exitCode||0)).catch(e=>{console.error(e);process.exit(1)});
