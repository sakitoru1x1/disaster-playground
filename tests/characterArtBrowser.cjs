const {chromium,devices}=require('playwright'),fs=require('fs'),path=require('path');
(async()=>{
 const {createServer}=await import('vite');
 const server=await createServer({server:{host:'127.0.0.1',port:0}});await server.listen();
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,
   args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--disable-dev-shm-usage']});
 const folder=path.resolve('docs/screenshots');fs.mkdirSync(folder,{recursive:true});
 let fails=0;
 for(const type of ['desktop','mobile']){
  const ctx=await browser.newContext(type==='mobile'?{
   ...devices['Pixel 7'],viewport:{width:412,height:850},deviceScaleFactor:1
  }:{viewport:{width:1280,height:760},deviceScaleFactor:1});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/');
   await page.waitForFunction(()=>!!window.disasterDebug?.characterShowcase,{timeout:120000});
   const before=await page.evaluate(()=>window.disasterDebug.getCharacterArt());
   const staging=await page.evaluate(()=>window.disasterDebug.characterShowcase());
   await page.waitForTimeout(1200);
   const after=await page.evaluate(()=>window.disasterDebug.getCharacterArt());
   const shot=path.join(folder,'character-art-'+type+'.jpg');
   await page.screenshot({path:shot,type:'jpeg',quality:87,animations:'disabled'});
   // Same real Babylon scene, interface hidden only in second capture.
   await page.addStyleTag({content:'#app,.grain{display:none!important;}'});
   const clean=path.join(folder,'character-art-clean-'+type+'.jpg');
   await page.screenshot({path:clean,type:'jpeg',quality:91,animations:'disabled'});
   const checks={
     type,stage:staging.characters,
     citizens:before.residents,archetypes:before.archetypes,sharedMeshes:before.libraryMasters,
     stagedTotal:after.meshInstances-before.meshInstances,
     fileBytes:fs.statSync(shot).size
   };
   if(before.residents<(type==='desktop'?190:60))throw Error('Citizens missing');
   if(staging.characters!==7||checks.stagedTotal<55)throw Error('Models not constructed '+JSON.stringify(checks));
   if(!before.archetypes.child||!before.archetypes.elder||!before.archetypes.teen)
    throw Error('Missing age archetypes '+JSON.stringify(before.archetypes));
   if(errors.length)throw Error(errors.join('; '));
   console.log('CHARACTER_ART_BROWSER_PASS',JSON.stringify(checks));
  }catch(e){fails++;console.log('CHARACTER_ART_BROWSER_FAIL',type,String(e),errors)}
  await ctx.close();
 }
 await browser.close();await server.close();if(fails)process.exitCode=1;
})().then(()=>process.exit(process.exitCode||0)).catch(e=>{console.error(e);process.exit(1)});
