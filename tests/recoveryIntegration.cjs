const {chromium}=require('playwright');
(async()=>{
 const {createServer}=await import('vite');
 const server=await createServer({server:{host:'127.0.0.1',port:0}});
 await server.listen();
 const browser=await chromium.launch({headless:true,
  executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:1140,height:760}});
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 let output;
 try{
  await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!window.disasterDebug?.makeCraterForTest,{timeout:120000});
  output=await page.evaluate(()=>{
   const d=window.disasterDebug,buildings=d.getDistrictBuildings();
   const target=buildings.find(b=>b.floors>=4);
   const other=buildings.find(b=>b.floors>=4&&Math.hypot(b.x-target.x,b.z-target.z)>55);
   const impact=d.testDistrictImpact(target.id);
   const impact2=d.testDistrictImpact(other.id);
   const crater=d.makeCraterForTest(0,0,.45);
   d.makeCraterForTest(104,-104,.42);
   let stats=d.getState(),changes=new Set(),sightings=new Set(),result;
   if(!impact.topFloorActive)throw new Error('Test impact did not break a floor');
   if(stats.craters!==2||stats.broken<2)throw new Error('Two craters and wrecks did not form');
   for(let i=0;i<400;i++){
    result=d.tickRecoveryForTest(2);
    changes.add(result.recovery.stage+':'+result.recovery.phase);
    if(result.recovery.fleetVisible)sightings.add(result.recovery.stage);
    if(result.recovery.stage==='complete')break;
   }
   return {impact,impact2,crater,after:result,stages:[...changes],vehicles:[...sightings],
    integrity:d.getState().integrity,before:stats.broken};
  });
  console.log('RECOVERY_E2E',JSON.stringify(output));
  if(!output.stages.some(p=>p.startsWith('sweep:collect')))throw new Error('No helicopter pickup');
  if(!output.stages.some(p=>p.startsWith('fill:pour')))throw new Error('No mixer pour');
  if(!output.stages.some(p=>p.startsWith('build:construct')))throw new Error('No crane building');
  if(output.after.craters!==0||output.after.broken!==0)throw new Error('After repair, craters or broken floors remain');
  if(output.after.recovery.stage!=='complete')throw new Error('Recovery convoy stalled');
  if(output.after.recovery.buildingsRestored<2||output.after.recovery.cratersFilled!==2)
   throw new Error('Cleanup/construction did not iterate over multiple buildings and craters');
  if(errors.length)throw new Error('JS errors: '+errors.join('; '));
  console.log('RECOVERY_E2E_PASS: helicopter, concrete mixer, mobile crane, materials truck, reconstructed foundation');
 }catch(e){console.error('RECOVERY_E2E_FAIL',String(e),JSON.stringify(errors));process.exitCode=1}
 finally{await browser.close();await server.close()}
})().then(()=>process.exit(process.exitCode||0)).catch(e=>{console.error(e);process.exit(1)});
