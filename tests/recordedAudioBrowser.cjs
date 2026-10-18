const {chromium,devices}=require('playwright');
(async()=>{
 const {createServer}=await import('vite');
 const server=await createServer({server:{host:'127.0.0.1',port:0}});
 await server.listen();
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,
 args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage','--autoplay-policy=user-gesture-required']});
 let failures=0;
 for(const type of ['desktop','mobile']){
  const context=await browser.newContext(type==='mobile'?{...devices['Pixel 7'],viewport:{width:412,height:880}}:{viewport:{width:1280,height:780}});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push('PAGE: '+e.message));
  page.on('console',m=>{if(m.type()==='error'&&m.text().includes('Recorded sound unavailable'))errors.push(m.text())});
  try{
   await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/',{waitUntil:'domcontentloaded',timeout:45000});
   await page.waitForFunction(()=>!!window.disasterDebug?.getAudio,{timeout:115000});
   const before=await page.evaluate(()=>window.disasterDebug.getAudio());
   if(before.unlocked)throw Error('Unsolicited autoplay');
   await page.locator(type==='mobile'?'#mobileMenuBtn':'#cameraBtn').click({force:true});
   await page.waitForFunction(()=>window.disasterDebug.getAudio().unlocked,{timeout:14000});
   await page.waitForFunction(()=>window.disasterDebug.getAudio().decoded>=5&&window.disasterDebug.getAudio().loops>=2,{timeout:40000});
   await page.evaluate(()=>window.disasterDebug.playAudioForTest('boom'));
   await page.waitForTimeout(250);
   const active=await page.evaluate(()=>window.disasterDebug.getAudio());
   if(active.started<1)throw Error('Recorded explosions never played');
   await page.evaluate(()=>window.disasterDebug.deploy('meteor',20,15,.7));
   await page.waitForTimeout(450);
   const state=await page.evaluate(()=>window.disasterDebug.getAudio());
   if(state.errors)throw Error('Audio download/decoding failed: '+state.errors);
   await page.locator('#soundBtn').click({force:true});
   if((await page.evaluate(()=>window.disasterDebug.getAudio())).enabled)throw Error('Mute failed');
   await page.locator('#soundBtn').click({force:true});
   if(!(await page.evaluate(()=>window.disasterDebug.getAudio())).enabled)throw Error('Unmute failed');
   await page.evaluate(()=>window.disasterDebug.reset());
   await page.waitForFunction(()=>window.disasterDebug?.getState?.().impacts===0,{timeout:115000});
   const restored=await page.evaluate(()=>window.disasterDebug.getAudio());
   if(!restored.unlocked)throw Error('Audio context lost on scene reset');
   if(errors.length)throw Error(errors.join(' | '));
   console.log('RECORDED_AUDIO_PASS',JSON.stringify({device:type,...restored}));
  }catch(e){failures++;console.log('RECORDED_AUDIO_FAIL',type,String(e),errors)}
  await context.close();
 }
 await browser.close();await server.close();
 if(failures)process.exitCode=1;
})().then(()=>process.exit(process.exitCode||0)).catch(e=>{console.error(e);process.exit(1)});
