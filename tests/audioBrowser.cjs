const {chromium,devices}=require('playwright');
(async()=>{
 const {createServer}=await import('vite');
 const server=await createServer({server:{host:'127.0.0.1',port:0}});
 await server.listen();
 const browser=await chromium.launch({headless:true,
  executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--disable-dev-shm-usage']});
 let failed=false;
 for(const deviceName of ['desktop','mobile']){
  const context=await browser.newContext(deviceName==='mobile'
   ?{...devices['Pixel 7'],viewport:{width:412,height:860},deviceScaleFactor:1}
   :{viewport:{width:1320,height:790}});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto('http://127.0.0.1:'+server.httpServer.address().port,{waitUntil:'domcontentloaded',timeout:35000});
   await page.waitForFunction(()=>!!window.disasterDebug?.getAudio,{timeout:120000});
   const initial=await page.evaluate(()=>window.disasterDebug.getAudio());
   if(initial.unlocked)throw Error('Music autoplayed before a user gesture');
   await page.locator('#mixBtn').click({timeout:20000});
   await page.waitForFunction(()=>window.disasterDebug.getAudio().unlocked,{timeout:15000});
   await page.waitForFunction(()=>window.disasterDebug.getAudio().musicNotes>=2&&
      window.disasterDebug.getAudio().loops>=14,{timeout:30000});
   const mixed=await page.evaluate(()=>{
    const x=document.getElementById('mixMusic');x.value='32';x.dispatchEvent(new Event('input',{bubbles:true}));
    const y=document.getElementById('mixEffects');y.value='50';y.dispatchEvent(new Event('input',{bubbles:true}));
    const z=document.getElementById('mixAmbience');z.value='61';z.dispatchEvent(new Event('input',{bubbles:true}));
    window.disasterDebug.playAudioForTest('carCrash');
    window.disasterDebug.playAudioForTest('winch');
    return window.disasterDebug.getAudio();
   });
   if(mixed.musicLevel!==.32||mixed.effectsLevel!==.5||mixed.ambientLevel!==.61)
      throw Error('Audio mixer not wired to WebAudio buses');
   if(mixed.played<2)throw Error('No sounds played after gesture');
   await page.locator(deviceName==='mobile'?'#mixerMuteBtn':'#soundBtn').click();
   if((await page.evaluate(()=>window.disasterDebug.getAudio())).enabled)
     throw Error('Mute button did not silence audio');
   await page.locator(deviceName==='mobile'?'#mixerMuteBtn':'#soundBtn').click();
   if(!(await page.evaluate(()=>window.disasterDebug.getAudio())).enabled)
     throw Error('Unmute did not restore audio');
   const before=await page.evaluate(()=>window.disasterDebug.getAudio().loops);
   await page.evaluate(()=>window.disasterDebug.reset());
   await page.waitForFunction(()=>window.disasterDebug?.getState?.().impacts===0,{timeout:120000});
   await page.waitForTimeout(1500);
   const after=await page.evaluate(()=>window.disasterDebug.getAudio());
   if(after.loops!==before)throw Error('Audio loops leaked after scene reset');
   if(errors.length)throw Error('Browser errors '+errors.join(' | '));
   console.log('AUDIO_BROWSER_PASS',JSON.stringify({device:deviceName,
    musicNotes:after.musicNotes,voices:after.voices,loops:after.loops,
    cachedSamples:after.bufferCount,played:after.played,musicLevel:after.musicLevel}));
  }catch(e){failed=true;console.log('AUDIO_BROWSER_FAILED',deviceName,String(e),errors)}
  await context.close();
 }
 await browser.close();await server.close();
 if(failed)process.exitCode=1;
})().then(()=>process.exit(process.exitCode||0)).catch(e=>{console.error(e);process.exit(1)});
