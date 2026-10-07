import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createApp} from '../server.js';
import {initialState} from '../public/src/travel-state.js';
import {emptyTravelProfile,updateTravelProfile} from '../public/src/travel-profile.js';
import {normalizeRequest,planFromCatalog} from '../public/src/travel-domain.js';
import {buildDailyPlan} from '../public/src/travel-schedule.js';

const profile=updateTravelProfile(emptyTravelProfile(),{text:'广州三天，每天4小时，正常节奏'}).profile;
const plan=buildDailyPlan({...planFromCatalog(normalizeRequest({destination:'广州',hours:4}),undefined,{placeIds:['gz-museum','gz-square','gz-opera']}),mode:'ai',trace:[]},profile);
const saved=JSON.stringify({...initialState(),profile,plan});
const server=createApp({accountsEnabled:false,key:'fixture',amapJsKey:'',amapSecurityJsCode:'',fetchImpl:async()=>{throw Error('Fixture forbids external calls');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const root=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),requests=[],errors=[];let failGuide=false;
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(value=>localStorage.setItem('lvzang.v1',value),saved);
 await page.route('**/api/travel-chat/stream',route=>{
  requests.push(route.request().postDataJSON());
  const response=failGuide?{...plan,kind:'plan',status:'ready',mode:'ai',profile,guideUpdateStatus:'failed',assistantReply:'这次未能完成攻略更新，已保留上一版攻略和原路线。',trace:[]}:{kind:'answer',status:'answered',mode:'ai',assistantReply:'我会沿用当前方案，你最想改善哪一部分？',profile,trace:[]};
  return route.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({type:'result',response})+'\n'});
 });
 await page.goto(root+'/travel.html');
 await page.locator('#advisor-continue').waitFor({state:'visible',timeout:5000});
 const entry=await page.locator('#advisor-continue').boundingBox();
 assert.ok(entry.y+entry.height<=844,'The advisor is visible on the initial mobile screen');
 assert.equal(await page.locator('#trip-settings-disclosure').getAttribute('open'),null,'The old time form starts collapsed');
 assert.equal(await page.locator('#trip-day-count').isVisible(),false);
 assert.match(await page.locator('#advisor-guide').innerText(),/补充详细攻略/);
 const savedPlan=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lvzang.v1')).plan);
 await page.locator('#advisor-continue').click();
 assert.equal(await page.locator('#travel-brief').evaluate(el=>el===document.activeElement),true);
 assert.equal(requests.length,0,'Entering chat does not generate a new route');
 await page.locator('#travel-brief').fill('我想保留这段还没发的想法');
 await page.locator('#advisor-feedback').click();
 assert.equal(await page.locator('#travel-brief').inputValue(),'我想保留这段还没发的想法');
 assert.equal(requests.length,0,'Feedback entry does not send prematurely');
 assert.deepEqual(await savedPlan(),plan);
 await page.locator('#travel-brief').fill('');
 await page.locator('#advisor-preferences').click();
 await page.waitForFunction(()=>!document.getElementById('plan-button').disabled);
 assert.equal(requests.length,1);assert.equal(requests[0].mode,'ai');
 assert.match(requests[0].description,/偏好|需求/);assert.match(requests[0].description,/补全|详细|重新/);
 assert.deepEqual(requests[0].currentPlan,plan);assert.deepEqual(requests[0].profile,profile);
 await page.locator('#advisor-guide').click();
 await page.waitForFunction(()=>!document.getElementById('plan-button').disabled);
 assert.equal(requests.length,2);assert.equal(requests[1].mode,'ai');
 assert.match(requests[1].description,/攻略/);assert.match(requests[1].description,/玩法|怎么玩/);
 assert.deepEqual(requests[1].currentPlan,plan);assert.deepEqual(await savedPlan(),plan);
 failGuide=true;await page.locator('#advisor-guide').click();await page.waitForFunction(()=>!document.getElementById('plan-button').disabled);
 assert.match(await page.locator('#plan-status').textContent(),/更新未完成/);
 assert.doesNotMatch(await page.locator('.chat-message.assistant').last().textContent(),/详细攻略已补充|AI 协作已完成/);
 assert.deepEqual((await savedPlan()).stops,plan.stops);assert.deepEqual((await savedPlan()).days,plan.days);
 await page.locator('#trip-settings-disclosure > summary').click();
 assert.equal(await page.locator('#trip-day-count').isVisible(),true);
 assert.equal(await page.locator('#trip-day-count').inputValue(),'3');
 await page.locator('#trip-settings-disclosure > summary').click();
 for(const width of [580,1440]){
  await page.setViewportSize({width,height:900});await page.reload();
  assert.equal(await page.locator('#advisor-continue').isVisible(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: visible advisor entry, folded settings, preserved draft and saved route, explicit AI interview and guide enrichment actions, responsive widths.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
