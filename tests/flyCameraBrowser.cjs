const {chromium,devices}=require('playwright');
(async()=>{
 const {createServer}=await import('vite');
 const server=await createServer({server:{host:'127.0.0.1',port:0}});await server.listen();
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,
  args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage']});
 let failures=0;
 for(const device of ['desktop','mobile']){
  const context=await browser.newContext(device==='mobile'?
   {...devices['Pixel 7'],viewport:{width:412,height:850}}:{viewport:{width:1280,height:800}});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/',
    {waitUntil:'domcontentloaded',timeout:55000});
   await page.waitForFunction(()=>!!window.disasterDebug?.getFly,{timeout:120000});
   const start=await page.evaluate(()=>window.disasterDebug.getFly());
   if(start.enabled||start.hasSkyDome||!start.hasSkyBackdrop)
    throw Error('Initial camera/sky wrong: '+JSON.stringify(start));
   await page.locator('#flyBtn').click({force:true});
   await page.waitForFunction(()=>window.disasterDebug.getFly().enabled,{timeout:8000});
   const entered=await page.evaluate(()=>window.disasterDebug.getFly());
   if(!entered.activeCamera.includes('flying spectator'))
    throw Error('Not active free camera '+JSON.stringify(entered));
   if(device==='mobile'){
    const visible=await page.locator('#flyControls').evaluate(e=>getComputedStyle(e).display);
    if(visible==='none')throw Error('Mobile flight arrows invisible');
   }
   const canvas=page.locator('#renderCanvas'),rect=await canvas.boundingBox();
   const startYaw=entered.yaw;
   await page.mouse.move(rect.x+rect.width*.49,rect.y+rect.height*.36);
   await page.mouse.down();
   await page.mouse.move(rect.x+rect.width*.56,rect.y+rect.height*.40,{steps:4});
   await page.mouse.up();
   const turned=await page.evaluate(()=>window.disasterDebug.getFly());
   if(Math.abs(turned.yaw-startYaw)<.06)
    throw Error('Free look drag did not rotate camera');
   const first=turned.position;
   await page.evaluate(()=>window.disasterDebug.flyButton('up',true));
   await page.waitForTimeout(4200);
   await page.evaluate(()=>window.disasterDebug.flyButton('up',false));
   const next=await page.evaluate(()=>window.disasterDebug.getFly());
   if(next.position.y<first.y+.08)
    throw Error('No free vertical movement: '+JSON.stringify({first,next}));
   await page.evaluate(()=>window.disasterDebug.flyButton('forward',true));
   await page.waitForTimeout(1100);
   await page.evaluate(()=>window.disasterDebug.flyButton('forward',false));
   const forward=await page.evaluate(()=>window.disasterDebug.getFly());
   const travel=Math.hypot(forward.position.x-next.position.x,
     forward.position.y-next.position.y,forward.position.z-next.position.z);
   if(travel<.06)throw Error('No free-forward flight');
   // The city should be targetable from the flying active camera.
   const point=await page.evaluate(()=>window.disasterDebug.getPick(200,260));
   if(point!==null&&(!Number.isFinite(point.x)||!Number.isFinite(point.z)))
    throw Error('Targeting ray invalid in free camera');
   await page.locator('#flyBtn').click({force:true});
   await page.waitForFunction(()=>!window.disasterDebug.getFly().enabled,{timeout:8000});
   const end=await page.evaluate(()=>window.disasterDebug.getFly());
   if(!end.activeCamera.includes('orbit'))throw Error('Orbit camera not restored');
   if(errors.length)throw Error(errors.join(' | '));
   console.log('FLY_CAMERA_BROWSER_PASS',JSON.stringify({device,skyDome:start.hasSkyDome,
    backdrop:start.hasSkyBackdrop,upMeters:+(next.position.y-first.y).toFixed(2),
    forwardMeters:+travel.toFixed(2),returnedToOrbit:true}));
  }catch(e){failures++;console.log('FLY_CAMERA_BROWSER_FAIL',device,String(e),errors)}
  await context.close();
 }
 await browser.close();await server.close();
 process.exitCode=failures?1:0;
})().then(()=>process.exit(process.exitCode||0)).catch(e=>{console.error(e);process.exit(1)});
