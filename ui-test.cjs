const {chromium}=require('playwright');(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',args:['--enable-gpu']});
 const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://127.0.0.1:5173');await page.waitForFunction(()=>window.disasterDebug,{timeout:30000});
 await page.locator('[data-tool=tornado]').click();await page.locator('#power').fill('91');
 await page.mouse.click(800,400);await page.waitForTimeout(500);
 const clicked=await page.evaluate(()=>window.disasterDebug.getState());
 await page.keyboard.press('Space');
 const paused=await page.locator('#pauseBtn').innerText();
 await page.keyboard.press('Space');
 await page.keyboard.press('r');await page.waitForFunction(()=>window.disasterDebug && window.disasterDebug.getState().impacts===0,{timeout:30000});
 const reset=await page.evaluate(()=>window.disasterDebug.getState());
 console.log('UI_CLICK',JSON.stringify(clicked));console.log('PAUSE_BUTTON',paused);
 console.log('RESET',JSON.stringify(reset));console.log('ERRORS',JSON.stringify(errors));
 await browser.close();
})().catch(e=>{console.error('UI TEST FAILURE',e);process.exitCode=1});