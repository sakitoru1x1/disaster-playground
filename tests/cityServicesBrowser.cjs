const {chromium,devices}=require('playwright');
(async()=>{
 const {createServer}=await import('vite');
 const server=await createServer({server:{host:'127.0.0.1',port:0}});await server.listen();
 const browser=await chromium.launch({headless:true,
  executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage']});
 let errorsCount=0;
 for(const mode of ['desktop','mobile']){
  const context=await browser.newContext(mode==='mobile'?
   {...devices['Pixel 7'],viewport:{width:412,height:850},deviceScaleFactor:1}:
   {viewport:{width:1180,height:780}});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push('PAGE: '+e.message));
  try{
   await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/',{waitUntil:'domcontentloaded',timeout:40000});
   await page.waitForFunction(()=>!!window.disasterDebug?.getEmergency,{timeout:120000});
   const initial=await page.evaluate(()=>{
    const d=window.disasterDebug;
    return {pets:d.getPets(),fps:d.getPerf(),emergency:d.getEmergency(),
      settingsRemoved:!document.querySelector('#settingsBtn')};
   });
   if(initial.pets.length<(mode==='mobile'?8:15))throw Error('Pets missing');
   if(!initial.settingsRemoved)throw Error('Quality toggle still exists');
   if(mode==='mobile'&&(initial.fps.quality!=='SHARP MOBILE'||initial.fps.hardwareScale>.88))
    throw Error('Phone not locked to SHARP '+JSON.stringify(initial.fps));
   const result=await page.evaluate(()=>{
    const d=window.disasterDebug,p=d.getPets()[0];
    // Mimic a moving tsunami front crossing THIS actual animal.
    const triggered=d.exposeCitizenTest(0,'tsunami',.95);
    d.igniteTestFire(-130,-130,1);
    const fireStart=d.getEmergency().fires.burning;
    let activeFire=0,activeAmbulance=0,watchedFlame=false,watchedHose=false,fireDone=0;
    for(let i=0;i<78;i++){
     d.tickRecoveryForTest(1.75);
     const emergency=d.getEmergency();
     activeFire=Math.max(activeFire,emergency.dispatch.fireEngines||0);
     activeAmbulance=Math.max(activeAmbulance,emergency.dispatch.ambulances||0);
     fireDone=emergency.fires.extinguished;
     if(document.querySelector('canvas'))watchedFlame ||= emergency.fires.started>0;
    }
    return {triggered,fireStart,activeFire,activeAmbulance,watchedFlame,
      fireDone,emergency:d.getEmergency(),cleanup:d.getCleanup(),quality:d.getPerf().quality};
   });
   if(result.fireStart<1||!result.watchedFlame)
    throw Error('No building fire from test impact: '+JSON.stringify(result));
   if(result.activeFire<1||result.activeAmbulance<1)
    throw Error('Fire truck or ambulance did not dispatch '+JSON.stringify(result));
   if(result.fireDone<1)throw Error('Fire brigade never extinguished fire '+JSON.stringify(result));
   if(errors.length)throw Error(errors.join(' | '));
   console.log('SERVICES_BROWSER_PASS',JSON.stringify({mode,...result}));
  }catch(err){errorsCount++;console.log('SERVICES_BROWSER_FAIL',mode,String(err),errors)}
  await context.close();
 }
 await browser.close();await server.close();if(errorsCount)process.exitCode=1;
})().then(()=>process.exit(process.exitCode||0)).catch(e=>{console.error(e);process.exit(1)});
