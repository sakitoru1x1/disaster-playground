const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',args:['--enable-gpu','--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
 const errs=[];const warnings=[];
 page.on('pageerror',e=>errs.push(e.stack||e.message));
 page.on('console',msg=>{if(['error','warning'].includes(msg.type()))warnings.push(msg.type()+': '+msg.text())});
 page.on('requestfailed',req=>warnings.push('network '+req.url()+': '+req.failure()?.errorText));
 await page.goto('http://127.0.0.1:5173',{waitUntil:'domcontentloaded',timeout:40000});
 try{await page.waitForFunction(()=>typeof window.disasterDebug==='object',{timeout:30000});}catch(e){console.log('READY_WAIT_ERROR',String(e))}
 await page.waitForTimeout(1800);
 const renderer=await page.evaluate(()=>{const g=document.querySelector('canvas').getContext('webgl2');if(!g)return 'n/a';const e=g.getExtension('WEBGL_debug_renderer_info');return e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):'unknown'});console.log('RENDERER',renderer);const before=await page.evaluate(()=>window.disasterDebug?.getState()||null);
 await page.screenshot({path:'test-initial.png'});
 if(before){
   await page.evaluate(()=>window.disasterDebug.deploy('meteor',0,0,.9));
   await page.waitForTimeout(2900);
   const after=await page.evaluate(()=>window.disasterDebug.getState());
   await page.screenshot({path:'test-impact.png'});
   console.log('BEFORE',JSON.stringify(before),'AFTER',JSON.stringify(after));
   await page.evaluate(()=>window.disasterDebug.deploy('tornado',20,-20,.8));
   await page.waitForTimeout(1700);
   console.log('TORNADO',JSON.stringify(await page.evaluate(()=>window.disasterDebug.getState())));
   await page.evaluate(()=>window.disasterDebug.deploy('quake',-20,20,.8));
   await page.waitForTimeout(1500);
   console.log('QUAKE',JSON.stringify(await page.evaluate(()=>window.disasterDebug.getState())));
   await page.evaluate(()=>window.disasterDebug.deploy('tsunami',0,0,.6));
   await page.waitForTimeout(1600);
   console.log('TSUNAMI',JSON.stringify(await page.evaluate(()=>window.disasterDebug.getState())));
 }
 console.log('ERRORS',JSON.stringify(errs),'WARNINGS',JSON.stringify(warnings.slice(0,30)));
 await browser.close();
})().catch(e=>{console.error('TEST FAILURE',e);process.exitCode=1});