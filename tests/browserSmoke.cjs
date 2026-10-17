const {chromium,devices}=require('playwright');
const fs=require('fs');
const executable='C:/Program Files/Google/Chrome/Application/chrome.exe';
(async()=>{
 const {createServer}=await import('vite');
 const server=await createServer({server:{host:'127.0.0.1',port:0}});
 await server.listen();
 const address=server.httpServer.address();
 const baseUrl='http://127.0.0.1:'+address.port+'/';
 const options={headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage']};
 if(fs.existsSync(executable))options.executablePath=executable;
 const browser=await chromium.launch(options);
 let failed=false;
 for(const deviceName of ['desktop','mobile']){
  const ctx=await browser.newContext(deviceName==='mobile'
   ?{...devices['Pixel 7'],viewport:{width:412,height:860},deviceScaleFactor:1}
   :{viewport:{width:1280,height:800}});
  const page=await ctx.newPage(),errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  page.on('console',msg=>{if(msg.type()==='error'&&!/WebGL/i.test(msg.text()))errors.push(msg.text())});
  try{
   await page.goto(baseUrl,{waitUntil:'domcontentloaded',timeout:35000});
   await page.waitForFunction(()=>window.disasterDebug?.getState?.().civilians>0,{timeout:115000});
   const start=await page.evaluate(()=>({
     perf:window.disasterDebug.getPerf(),state:window.disasterDebug.getState(),
     city:window.disasterDebug.getCitizenDebug()}));
   const expected=deviceName==='mobile'?72:210;
   if(start.state.civilians!==expected)throw Error('Wrong population: '+start.state.civilians+' / '+expected);
   if(start.state.integrity!==100)throw Error('City starts destroyed: '+start.state.integrity);
   if(start.city.renderedInstances===0)throw Error('Pedestrians invisible');
   await page.evaluate(()=>{
     window.disasterDebug.deploy('quake',127,120,.75);
     window.disasterDebug.deploy('tornado',125,-124,.65);
     window.disasterDebug.deploy('tsunami',130,0,.45);
   });
   await page.waitForTimeout(1400);
   const state=await page.evaluate(()=>window.disasterDebug.getState());
   if(state.impacts<3)throw Error('Disasters not deployed');
   await page.evaluate(()=>window.disasterDebug.reset());
   await page.waitForFunction(()=>window.disasterDebug?.getState?.().impacts===0,{timeout:115000});
   const restored=await page.evaluate(()=>window.disasterDebug.getState());
   if(restored.integrity!==100||restored.civilians!==expected)
     throw Error('Reset leaked disaster damage or failed to restore population');
   if(errors.length)throw Error('JavaScript exceptions: '+errors.join(' | '));
   console.log('QA_BROWSER_PASS',JSON.stringify({device:deviceName,citizens:start.state.civilians,
     buildings:start.state.buildings+start.state.districtBuildings,floors:start.state.floors,
     fps:state.fps,impacts:state.impacts,meshes:start.perf.meshes}));
  }catch(e){failed=true;console.error('QA_BROWSER_FAIL',deviceName,String(e),JSON.stringify(errors))}
  await ctx.close();
 }
 await browser.close();
 await server.close();
 if(failed)process.exitCode=1;
})().then(()=>process.exit(process.exitCode||0)).catch(e=>{console.error(e);process.exit(1)});
