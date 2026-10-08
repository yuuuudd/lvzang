import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createApp} from '../server.js';
import {initialState} from '../public/src/travel-state.js';
import {normalizeRequest,planFromCatalog} from '../public/src/travel-domain.js';

const plan={...planFromCatalog(normalizeRequest({destination:'广州',hours:4}),undefined,{placeIds:['gz-museum','gz-square','gz-tower'],title:'广州 · 珠江两岸漫游'}),mode:'demo',trace:[]};
plan.input.travelDates={start:'2026-10-18',end:'2026-10-18'};
const server=createApp({accountsEnabled:false,key:'',amapJsKey:'',fetchImpl:async()=>{throw Error('No external requests');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(state=>localStorage.setItem('lvzang.v1',JSON.stringify(state)),{...initialState(),plan});
  await page.route('**/*',route=>route.request().url().startsWith(base+'/')?route.continue():route.abort());
  await page.goto(base+'/travel.html');
  await page.locator('#route-stops .stop-card').first().waitFor();
  // Every creation link, including the footer and dynamically rendered stops, carries the trip.
  const links=await page.locator('a[href="/collection.html#world/create"]').count();
  assert.ok(links>=3);
  for(let index=0;index<links;index++){
    await page.locator('a[href="/collection.html#world/create"]').nth(index).evaluate(link=>link.addEventListener('click',event=>event.preventDefault(),{once:true}));
    await page.evaluate(()=>sessionStorage.removeItem('lvzang-generation-context'));
    await page.locator('a[href="/collection.html#world/create"]').nth(index).dispatchEvent('click');
    const value=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('lvzang-generation-context')||'null'));
    assert.equal(value?.name,plan.title,`Entry ${index} retains trip title`);
    assert.equal(value?.place,'广州');assert.equal(value?.date,'2026-10-18');
  }
  await page.goto(base+'/collection.html#world/create');
  await page.waitForFunction(()=>document.querySelector('[name="trip-name"]')?.value==='广州 · 珠江两岸漫游');
  assert.equal(await page.locator('[name="trip-date"]').inputValue(),'2026-10-18');
  await page.goto(base+'/travel.html');await page.locator('#route-stops .stop-card').first().waitFor();
  const saved=await page.evaluate(()=>localStorage.getItem('lvzang.v1'));
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'攻略',exact:true}).click();
  assert.ok(await page.locator('#guide-pane').isVisible());assert.ok(!await page.locator('#map-pane').isVisible());
  assert.ok(await page.locator('#amap-viewport').evaluate(node=>node.clientWidth>0&&node.clientHeight>0),'Hidden map keeps dimensions so the real SDK never projects NaN pixels');
  assert.ok((await page.locator('#guide-pane').boundingBox()).width>350,'Mobile guide uses full width');
  await page.getByRole('button',{name:'地图',exact:true}).click();
  assert.ok(await page.locator('#map-pane').isVisible());assert.ok(!await page.locator('#guide-pane').isVisible());
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await mkdir('artifacts/travel-redesign',{recursive:true});
  await page.screenshot({path:'artifacts/travel-redesign/mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:960});
  assert.ok(await page.locator('#map-pane').isVisible());assert.ok(await page.locator('#guide-pane').isVisible());
  assert.ok(await page.locator('#travel-splitter').isVisible());
  assert.equal(await page.evaluate(()=>localStorage.getItem('lvzang.v1')),saved,'Switching views preserves the itinerary');
  await page.screenshot({path:'artifacts/travel-redesign/desktop.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS: all memory entrances retain trip and date; creation form prefills; mobile full-width map/guide; desktop split restored; no itinerary mutations.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
