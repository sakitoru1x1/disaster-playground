const {chromium,devices}=require('playwright');
(async()=>{
 const {createServer}=await import('vite');
 const server=await createServer({server:{host:'127.0.0.1',port:0}});
 await server.listen();
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,
 args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage']});
 let failures=0;
 for(const mode of ['desktop','mobile']){
  const context=await browser.newContext(mode==='mobile'
   ?{...devices['Pixel 7'],viewport:{width:412,height:860},deviceScaleFactor:1}
   :{viewport:{width:1240,height:780}});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/',{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>!!window.disasterDebug?.debugRescueCase,{timeout:120000});
   const report=await page.evaluate(()=>{
    const dbg=window.disasterDebug,
      setup=dbg.debugRescueCase('stretcher');
    if(!setup)throw Error('Cannot injure victim');
    const seen=new Set(),visual={medics:false,stretcher:false,loaded:false,
      fireCrew:false,fireHose:false},fireTest=dbg.igniteTestFire(-130,-130,.65);
    const fireStart=dbg.getEmergency().fires.burning;
    for(let i=0;i<285;i++){
     dbg.tickRecoveryForTest(.95);
     const info=dbg.getEmergency();
     for(const [name,phase] of Object.entries(info.dispatch.dispatchStates||{}))
      seen.add(name+':'+phase);
     for(const vehicle of info.responders){
      if(vehicle.name==='ambulance'){
       visual.medics||=vehicle.crewVisible>=1;
       visual.stretcher||=vehicle.stretcherVisible;
       visual.loaded||=vehicle.visiblePatient;
      }else{
       visual.fireCrew||=vehicle.crewVisible>=1;
       visual.fireHose||=vehicle.hoseVisible;
      }
     }
     if(info.dispatch.patientsEvacuated>=2&&info.dispatch.firefightingCompleted>=1)break;
    }
    return {setup,fireTest,fireStart,seen:[...seen],visual,
      emergency:dbg.getEmergency(),recovery:dbg.getRecovery()};
   });
   if(report.fireStart<1||!report.visual.fireCrew||!report.visual.fireHose)
    throw Error('Fire crew is not deploying real hose '+JSON.stringify(report).slice(0,900));
   if(!report.visual.medics||!report.visual.stretcher||!report.visual.loaded)
    throw Error('Paramedics/stretcher patient never visible '+JSON.stringify(report).slice(0,1500));
   if(!report.seen.some(x=>x.includes('hospital')))
    throw Error('Ambulance never reached the field hospital '+JSON.stringify(report.seen));
   if(!report.seen.some(x=>x.includes('evacuate')))
    throw Error('Ambulance never evacuated loaded patient '+JSON.stringify(report.seen));
   if(!report.emergency.dispatch.loadedPatients)
    throw Error('No transported patient');
   if(errors.length)throw Error('JavaScript errors '+errors.join(' ; '));
   console.log('DISPATCH_E2E_PASS',JSON.stringify({mode,
    phases:report.seen.length,visual:report.visual,
    loaded:report.emergency.dispatch.loadedPatients,
    suppressed:report.emergency.dispatch.firefightingCompleted}));
  }catch(e){failures++;console.log('DISPATCH_E2E_FAIL',mode,String(e),errors)}
  await context.close();
 }
 await browser.close();await server.close();
 if(failures)process.exitCode=1;
})().then(()=>process.exit(process.exitCode||0)).catch(e=>{console.error(e);process.exit(1)});
