'use strict';
const {createServer}=require('node:http');
const {readFile,writeFile}=require('node:fs/promises');
const {resolve,extname,join}=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.json':'application/json','.webmanifest':'application/manifest+json'};
const root=resolve(process.cwd(),'dist');
const server=createServer(async(req,res)=>{
  try{
    const raw=decodeURIComponent(new URL(req.url,'http://local.test').pathname);
    const name=raw==='/'?'index.html':raw.replace(/^\/+/, '');
    const file=resolve(root,name);
    if(!file.startsWith(root+'/')&&file!==root){res.writeHead(403).end();return;}
    const data=await readFile(file);
    res.writeHead(200,{'Content-Type':MIME[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
    res.end(data);
  }catch{res.writeHead(404).end('Not found');}
});
const visible=async page=>await page.locator('.page.souvenir-page').evaluate(el=>el.classList.contains('is-active')&&!el.inert);
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;
  const executablePath=process.env.CHROME_PATH||'/usr/bin/google-chrome';
  const browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'ja-JP',serviceWorkers:'block'});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('dialog',dialog=>dialog.accept());
  try{
    await page.goto('http://127.0.0.1:'+port+'/',{waitUntil:'domcontentloaded'});
    await page.locator('#souvenirGroupSwitch [data-owner-tab]').first().waitFor({state:'attached'});
    await page.locator('.nav-item[data-nav="3"]').click();
    assert.equal(await visible(page),true,'Souvenir tab should be active after click');
    assert.equal(await page.locator('#souvenirGroupSwitch [data-owner-tab]').count(),2,'Group chooser should show the default two tabs');
    await page.locator('#souvenirGroupSwitch [data-owner-tab="owner-wife"]').click();
    assert.equal(await page.locator('.souvenir-group-card h2').innerText(),'妻','Tapping group tabs must change visible group');
    await page.locator('#souvenirGroupSwitch [data-owner-tab="owner-husband"]').click();
    await page.locator('[data-owner-add="owner-husband"]').click();
    assert.equal(await page.locator('#souvenirBackdrop').evaluate(el=>el.classList.contains('open')),true,'Gift add button must open the modal');
    await page.locator('#souvenirRecipientTypeTabs [data-recipient-type="company"]').click();
    await page.locator('#souvenirRecipientName').fill('テスト株式会社');
    const form=page.locator('#souvenirForm');
    await form.locator('[name="name"]').fill('チョコレート');
    await form.locator('[name="quantity"]').fill('3');
    await form.locator('[name="unitPrice"]').fill('12');
    await form.locator('[name="shop"]').fill('ABCストア');
    await form.locator('button[type="submit"]').click();
    const wrap=page.locator('[data-souvenir-swipe]').first();
    await wrap.waitFor();
    assert.match(await wrap.innerText(),/テスト株式会社/);
    assert.match(await wrap.innerText(),/\$36/);
    assert.match(await wrap.innerText(),/買う場所：ABCストア/);
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('#souvenirGroupSwitch [data-owner-tab]').first().waitFor({state:'attached'});
    await page.locator('.nav-item[data-nav="3"]').click();
    const restored=page.locator('[data-souvenir-swipe]').first();
    await restored.waitFor();
    assert.match(await restored.innerText(),/買う場所：ABCストア/,'Gift should persist across reload');
    const bounding=await restored.boundingBox();
    assert.ok(bounding,'Gift row should be visible for swipe');
    const y=bounding.y+Math.min(bounding.height/2,22),x=bounding.x+bounding.width-25;
    await page.mouse.move(x,y);
    await page.mouse.down();
    await page.mouse.move(x-100,y,{steps:9});
    await page.mouse.up();
    await page.waitForTimeout(250);
    assert.equal(await restored.evaluate(el=>el.classList.contains('is-swiped')),true,'Swipe left should reveal delete action');
    await restored.locator('[data-souvenir-delete]').click();
    await page.waitForTimeout(100);
    assert.equal(await page.locator('[data-souvenir-swipe]').count(),0,'Delete button should remove saved gift');
    // Exercise the transport editor in a real mobile browser after setting up a trip.
    await page.waitForTimeout(200);
    await page.evaluate(async()=>{
      const trip={
        id:'smoke-journey',destination:'Hawaii',travelers:2,
        startDate:'2027-02-21',endDate:'2027-02-24',datesConfigured:true,
        hotels:[],meals:{},daySummaries:{},places:[],transfers:[],
        groups:['観光','グルメ','ビーチ'],packingItems:[],todoItems:[],
        souvenirs:[],souvenirPeople:[],souvenirOwners:[]
      };
      await new Promise((resolve,reject)=>{
        const request=indexedDB.open('malie-honeymoon',1);
        request.onerror=()=>reject(request.error);
        request.onsuccess=()=>{
          const db=request.result,tx=db.transaction('app','readwrite');
          tx.objectStore('app').put({version:3,activeTripId:trip.id,trips:[trip]},'state');
          tx.oncomplete=()=>{db.close();resolve();};
          tx.onerror=()=>reject(tx.error);
        };
      });
    });
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('#dayTabs [data-day="0"]').waitFor({state:'attached'});
    await page.locator('.nav-item[data-nav="2"]').click();
    await page.locator('[data-add-transfer="0"]').click();
    assert.equal(await page.locator('#transferBackdrop').evaluate(el=>el.classList.contains('open')),true,'Transport registration must open');
    const transferForm=page.locator('#transferForm');
    await transferForm.locator('[name="mode"]').selectOption('bus');
    await transferForm.locator('[name="start"]').fill('09:15');
    await transferForm.locator('[name="end"]').fill('09:47');
    await transferForm.locator('[name="from"]').fill('Halepuna');
    await transferForm.locator('[name="to"]').fill('Waikiki');
    await transferForm.locator('[name="line"]').fill('TheBus 2');
    await transferForm.locator('button[type="submit"]').click();
    const leg=page.locator('.itinerary-transfer').first();
    await leg.waitFor();
    assert.match(await leg.innerText(),/09:15/);
    assert.match(await leg.innerText(),/09:47/);
    assert.match(await leg.innerText(),/Halepuna/);
    assert.match(await leg.innerText(),/TheBus 2/);
    await page.waitForTimeout(250);
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('#dayTabs [data-day="0"]').waitFor({state:'attached'});
    await page.locator('.nav-item[data-nav="1"]').click();
    assert.equal(await page.locator('.timeline-transfer').count(),1,'Transport interval should appear on the time grid');
    await page.locator('.nav-item[data-nav="2"]').click();
    const afterReload=page.locator('.itinerary-transfer').first();
    await afterReload.waitFor();
    assert.match(await afterReload.innerText(),/Waikiki/,'Transport should survive a restart');
    await afterReload.locator('[data-edit-transfer]').click();
    await transferForm.locator('[name="end"]').fill('10:10');
    await transferForm.locator('button[type="submit"]').click();
    assert.match(await page.locator('.itinerary-transfer').first().innerText(),/10:10/);
    await page.locator('.itinerary-transfer [data-edit-transfer]').click();
    await page.locator('#deleteTransfer').click();
    assert.equal(await page.locator('.itinerary-transfer').count(),0,'Transport should be removable');
    if(errors.length)throw Error('Browser runtime errors: '+errors.join('; '));
    console.log('PASS: iPhone viewport gift/group/button/price/shop/persistence/swipe/delete checks.');
  }catch(error){
    console.error(error);
    console.error('Browser errors:',errors);
    await page.screenshot({path:'souvenir-smoke-failed.png',fullPage:true}).catch(()=>{});
    process.exitCode=1;
  }finally{
    await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
