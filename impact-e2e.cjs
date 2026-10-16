const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({
  headless:true,executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args:['--enable-gpu','--no-sandbox']
 });
 const page=await browser.newPage({viewport:{width:1440,height:850},deviceScaleFactor:1});
 const errors=[],missing=[];
 page.on('pageerror',e=>errors.push(String(e.stack||e)));
 page.on('response',r=>{if(r.status()>=400)missing.push(r.status()+' '+r.url())});
 page.on('console',m=>{if(m.type()==='error')errors.push('console '+m.text())});
 await page.goto('http://127.0.0.1:5173/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.disasterDebug?.getBuildings()?.length>0,{timeout:35000});
 await page.waitForTimeout(750);
 const initial=await page.evaluate(()=>window.disasterDebug.getState());
 const candidates=await page.evaluate(()=>{
  const points=[];
  for(const y of [280,335,390,440,490,540,600])for(const x of [590,690,790,890,990,1090]){
   const p=window.disasterDebug.getPick(x,y);
   if(p?.y>7)points.push({x,y,p});
  }
  return points;
 });
 const chosen=candidates.sort((a,b)=>Math.abs(a.x-760)+Math.abs(a.y-390)-Math.abs(b.x-760)-Math.abs(b.y-390))[0];
 console.log('INITIAL',JSON.stringify(initial));
 console.log('HIT_CANDIDATES',candidates.length,'CHOSEN',JSON.stringify(chosen));
 if(!chosen)throw Error('Could not target a visible building with mouse');
 await page.screenshot({path:'meteor-before.png'});
 await page.locator('[data-tool="meteor"]').click();
 await page.locator('#power').fill('100');
 await page.mouse.move(chosen.x,chosen.y);
 await page.mouse.down();await page.mouse.up();
 await page.waitForFunction(()=>window.disasterDebug.getState().lastMeteorImpact!==null,{timeout:15000});
 const landed=await page.evaluate(()=>window.disasterDebug.getState());
 await page.waitForTimeout(1700);
 const after=await page.evaluate(()=>window.disasterDebug.getState());
 await page.screenshot({path:'meteor-after.png'});
 console.log('METEOR_LANDED',JSON.stringify(landed));
 console.log('METEOR_AFTER',JSON.stringify(after));
 if(landed.lastMeteorImpact.buildingId===null)throw Error('Meteor did NOT physically collide with a building');
 if(landed.lastMeteorImpact.directBroken<1)throw Error('No deterministic destruction on the impacted building');
 if(after.broken===0)throw Error('Meteor damage counter unchanged');
 console.log('METEOR_IMPACT_PASS',after.broken,'destroyed sections');
 await page.keyboard.press('r');
 await page.waitForFunction(()=>window.disasterDebug && window.disasterDebug.getState().impacts===0,{timeout:30000});
 await page.evaluate(()=>window.disasterDebug.deploy('quake',0,0,1));
 await page.waitForTimeout(9000);
 const quake=await page.evaluate(()=>window.disasterDebug.getState());
 await page.screenshot({path:'quake-after.png'});
 console.log('QUAKE_AFTER',JSON.stringify(quake));
 if(quake.unsupportedFloors!==0)throw Error('Unsupported floating floors remain: '+quake.unsupportedFloors);
 if(quake.broken<1)throw Error('Quake failed to damage buildings');
 console.log('QUAKE_SUPPORT_PASS');
 console.log('ERRORS',JSON.stringify(errors));console.log('MISSING',JSON.stringify(missing));
 if(errors.length||missing.length)throw Error('Runtime errors');
 await browser.close();
})().catch(e=>{console.error('E2E_FAILED',e);process.exitCode=1});