import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createApp} from '../server.js';
import {initialState} from '../public/src/travel-state.js';
import {emptyTravelProfile,updateTravelProfile} from '../public/src/travel-profile.js';
import {normalizeRequest,planFromCatalog} from '../public/src/travel-domain.js';
import {buildDailyPlan} from '../public/src/travel-schedule.js';

const profile=updateTravelProfile(emptyTravelProfile(),{text:'广州一天，每天4小时，喜欢美食，必去广州塔'}).profile;
const plan={...buildDailyPlan({...planFromCatalog(normalizeRequest({destination:'广州',hours:4}),undefined,{placeIds:['gz-tower'],title:'原广州攻略'}),mode:'ai',trace:[]},profile),kind:'plan'};
const server=createApp({accountsEnabled:false,key:'test',amapJsKey:'',fetchImpl:async()=>{throw Error('No external calls in UI regression');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/travel.html`);
  await page.evaluate(raw=>localStorage.setItem('lvzang.v1',raw),JSON.stringify({...initialState(),profile,plan}));await page.reload();
  assert.equal(await page.locator('#route-refresh').count(),1,'A visible regenerate action must exist on the itinerary');
  assert.equal(await page.locator('#route-destination').inputValue(),'广州');
  let submitted;
  await page.route('**/api/travel-chat/stream',async route=>{
    submitted=route.request().postDataJSON();
    await route.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({type:'error',error:'测试刷新失败，旧攻略保留。'})+'\n'});
  });
  await page.locator('#travel-brief').fill('尚未发送的新想法');
  await page.locator('#route-destination').fill('成都');await page.locator('#route-refresh').click();
  await page.waitForFunction(()=>!document.querySelector('#route-refresh').disabled);
  assert.equal(submitted.destination,'成都');assert.equal(submitted.textRevision,false);assert.equal(submitted.mode,'ai');
  assert.match(submitted.description,/重新规划成都.*完整行程/);assert.equal(submitted.currentPlan.city,'广州');assert.deepEqual(submitted.profile,profile);
  assert.equal(await page.locator('#travel-brief').inputValue(),'尚未发送的新想法');assert.equal(await page.locator('#route-destination').inputValue(),'成都');
  assert.match(await page.locator('#route-refresh-note').textContent(),/失败/);assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem('lvzang.v1')))).plan.title,'原广州攻略');
  const updated={...plan,title:'刷新后的广州攻略',assistantReply:'新的攻略已生成。'};
  await page.route('**/api/travel-chat/stream',async route=>{submitted=route.request().postDataJSON();await route.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({type:'result',response:updated})+'\n'});});
  await page.locator('#route-destination').fill('广州');await page.locator('#route-refresh').click();await page.waitForFunction(()=>!document.querySelector('#route-refresh').disabled);
  assert.match(await page.locator('#route-title').textContent(),/刷新后的广州/);assert.equal(await page.locator('#travel-brief').inputValue(),'尚未发送的新想法');
  await page.reload();assert.match(await page.locator('#route-title').textContent(),/刷新后的广州/);
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);console.log('PASS: regenerate with explicit city and saved context, AI mode, draft preservation, failure rollback, success persistence, mobile width.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
