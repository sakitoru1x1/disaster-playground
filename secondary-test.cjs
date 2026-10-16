const {chromium}=require('playwright');
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',args:['--enable-gpu','--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1400,height:850}});
  const errors=[],bad=[];
  page.on('pageerror',e=>errors.push(e.stack||String(e)));
  page.on('response',r=>{if(r.status()>=400)bad.push(r.status()+':'+r.url())});
  await page.goto('http://127.0.0.1:5173/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!window.disasterDebug?.getBuildings,{timeout:40000});
  await page.waitForTimeout(550);
  const b=await page.evaluate(()=>window.disasterDebug.getBuildings().filter(v=>v.floors>=5).sort((a,b)=>a.topY-b.topY)[0]);
  console.log('TARGET',JSON.stringify(b));
  await page.evaluate(b=>window.disasterDebug.deploy('meteor',b.x,b.z,1),b);
  for(let t=0;t<12;t++){
    await page.waitForTimeout(1050);
    const s=await page.evaluate(()=>window.disasterDebug.getState());
    console.log('T+'+(t+1),JSON.stringify({fps:Math.round(s.fps),broken:s.broken,frags:s.fragments,secondary:s.secondaryBreaks,pieces:s.secondaryPieces,events:s.secondaryImpactEvents,flying:s.fallingVisual,impact:s.lastMeteorImpact,unsupported:s.unsupportedFloors}));
    if(t===6)await page.screenshot({path:'secondary-impact.png'});
  }
  const s=await page.evaluate(()=>window.disasterDebug.getState());
  console.log('RESULT',JSON.stringify(s));
  const second=await page.evaluate(x=>window.disasterDebug.getBuildings().filter(b=>Math.hypot(b.x-x.x,b.z-x.z)>80&&b.floors>=4)[0],b);
  if(second){
    await page.evaluate(b=>window.disasterDebug.deploy('meteor',b.x,b.z,1),second);
    await page.waitForTimeout(4700);
    const later=await page.evaluate(()=>window.disasterDebug.getState());
    console.log('SECOND_METEOR',JSON.stringify({before:s.secondaryBreaks,after:later.secondaryBreaks,
      added:later.secondaryBreaks-s.secondaryBreaks,fragments:later.fragments,issues:later.unsupportedFloors,
      fps:Math.round(later.fps)}));
    if(later.secondaryBreaks<=s.secondaryBreaks)throw Error('Fracture budget did not replenish for a second catastrophe');
  }
  console.log('ERRORS',JSON.stringify(errors));console.log('MISSING',JSON.stringify(bad));
  if(s.secondaryBreaks<1)throw Error('No actual secondary slab fracture took place');
  if(s.secondaryPieces<s.secondaryBreaks*2)throw Error('Secondary fragment count invalid');
  if(s.unsupportedFloors!==0)throw Error('Unsupported static floors remain');
  if(errors.length||bad.length)throw Error('Browser errors');
  await browser.close();
  console.log('PASS');
})().catch(e=>{console.error('FAILED',e);process.exitCode=1});