const {chromium,devices}=require('playwright');
(async()=>{
 const {createServer}=await import('vite');
 const server=await createServer({server:{host:'127.0.0.1',port:0}});await server.listen();
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,
 args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage']});
 let fail=0;
 for(const device of ['desktop','mobile']){
  const context=await browser.newContext(device==='mobile'?
   {...devices['Pixel 7'],viewport:{width:412,height:880}}:{viewport:{width:1260,height:780}});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto('http://127.0.0.1:'+server.httpServer.address().port,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>!!window.disasterDebug?.citizenPhysics,{timeout:110000});
   const original=await page.evaluate(()=>window.disasterDebug.citizenPhysics());
   if(original.floatingBlackHelpPlanes)throw Error('Broken black HELP sign remains');
   const impact=await page.evaluate(()=>window.disasterDebug.exposeCitizenTest(0,'tornado',1));
   if(impact.state!=='injured'||!(impact.ragdoll||impact.airborne))
    throw Error('Victim remains glued to street '+JSON.stringify(impact));
   await page.waitForTimeout(1100);
   const moved=await page.evaluate(()=>window.disasterDebug.citizenPhysics());
   if(!moved.injured||moved.ragdolls+moved.airborne<1)throw Error('No visible ragdoll');
   if(moved.victims[0]?.y===0)throw Error('Victim did not lift');
   // A tsunami must affect a victim far along the Z axis, not just near Z=0.
   const surge=await page.evaluate(()=>window.disasterDebug.exposeCitizenTest(6,'tsunami',1));
   if(surge.state!=='injured'||!(surge.ragdoll||surge.airborne))
    throw Error('Tsunami failed to sweep another victim '+JSON.stringify(surge));
   await page.waitForTimeout(450);
   if(errors.length)throw Error(errors.join(' | '));
   const stats=await page.evaluate(()=>window.disasterDebug.citizenPhysics());
   console.log('CITIZEN_RAGDOLL_BROWSER_PASS',JSON.stringify({device,...stats,
     victims:stats.victims.slice(0,3)}));
  }catch(error){fail++;console.log('CITIZEN_RAGDOLL_BROWSER_FAIL',device,String(error),errors)}
  await context.close();
 }
 await browser.close();await server.close();if(fail)process.exitCode=1;
})().then(()=>process.exit(process.exitCode||0)).catch(e=>{console.error(e);process.exit(1)});
