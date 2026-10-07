import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createApp} from '../server.js';
import {initialState} from '../public/src/travel-state.js';
import {normalizeRequest,planFromCatalog} from '../public/src/travel-domain.js';
import {emptyTravelProfile,updateTravelProfile} from '../public/src/travel-profile.js';
import {buildDailyPlan} from '../public/src/travel-schedule.js';

const profile=updateTravelProfile(emptyTravelProfile(),{text:'广州一天每天六小时',patch:{destination:'广州',dayCount:1,dailyHours:6}}).profile;
profile.followUps=[{field:'crowdPreference',question:'喜欢热门还是小众？'},{field:'diet',question:'有什么忌口？'},{field:'requiredPlaces',question:'有没有一定想去的地方？'}];
const plan=buildDailyPlan({...planFromCatalog(normalizeRequest({destination:'广州',hours:6}),undefined,{placeIds:['gz-museum','gz-square']}),mode:'ai',trace:[]},profile);
const sources=[{id:'web-test',title:'博物馆官网',url:'https://www.gdmuseum.com/',accessStatus:'fetched',fetchedAt:'2026-10-07T00:00:00Z'}];
plan.guide={status:'ready',summary:'文化与城市漫游',days:[{dayIndex:1,overview:'上午看展，下午散步；中间安排午饭。',stops:plan.stops.map(stop=>({stopId:stop.id,name:stop.name,howToPlay:'先看主题展，再按兴趣选择常设展，累了就在休息区歇一会。',highlights:['建筑外观与展览主题'],food:[{name:'附近粤菜或粥粉面',note:'优先选择步行可达店铺，避开你的忌口；营业状态出发前核实。',sourceIds:[]}],transport:'步行到下一站，准确距离请用高德地图查询。',reservation:'核对官方预约规则。',rainyAlternative:'留在室内展馆或附近商场。',sourceIds:['web-test']}))}],sources,warnings:[]};
const state={...initialState(),profile,plan},saved=JSON.stringify(state);
const server=createApp({key:'',fetchImpl:async()=>{throw Error('No external request');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const root=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:704}}),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(saved=>{localStorage.setItem('lvzang.v1',saved);localStorage.setItem('lvzang.chat.v1',JSON.stringify({version:1,messages:Array.from({length:10},(_,i)=>({role:i%2?'assistant':'user',content:'持续旅行对话，第'+i+'轮。'+('详细说明。'.repeat(45))}))}));},saved);
 await page.route('**/api/travel-chat/stream',route=>{requests.push(route.request().postDataJSON());return route.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({type:'result',response:{kind:'answer',status:'answered',mode:'ai',assistantReply:'附近可以考虑粥粉面或粤菜；结合你不吃辣的偏好，点单时确认调料。当前路线保持不变。',profile,trace:[],research:{status:'ok',sources}}})+'\n'});});
 await page.goto(root+'/travel.html');await page.waitForSelector('.stop-guide');
 assert.equal(await page.locator('#follow-up-list li').count(),3,'All three questions in a detailed interview round remain visible');
 assert.match(await page.locator('#travel-guide-overview').innerText(),/上午看展/);
 assert.match(await page.locator('.stop-guide').first().innerText(),/怎么玩[\s\S]*附近吃什么[\s\S]*预约与注意事项/);
 const layout=await page.evaluate(()=>{const rect=s=>document.querySelector(s).getBoundingClientRect();return {composer:rect('.composer').bottom,chatHeight:rect('.chat-scroll').height,height:innerHeight};});
 assert.ok(layout.composer<=layout.height+1,'Desktop composer remains in the viewport after long history');assert.ok(layout.chatHeight>100,'The conversation keeps a usable scrolling area');
 await page.locator('.chat-scroll').hover();await page.mouse.wheel(0,3000);await page.locator('#travel-brief').fill('我不吃辣，附近有什么好吃的？');await page.locator('#travel-brief').press('Enter');
 await page.waitForFunction(()=>document.querySelector('#plan-button').disabled===false&&document.getElementById('plan-status').textContent.includes('已回答'));
 assert.equal(requests.length,1);assert.deepEqual(requests[0].currentPlan,plan,'Follow-up retains the accepted full route and guide');
 assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('lvzang.v1')).plan),plan);
 assert.match(await page.locator('#chat-messages').innerText(),/当前路线保持不变/);
 await page.locator('.ask-stop-guide').first().click();await page.waitForFunction(()=>!document.querySelector('#plan-button').disabled);assert.equal(requests.length,2);assert.match(requests[1].description,/附近吃什么/);
 await page.setViewportSize({width:390,height:844});await page.locator('.ask-stop-guide').last().scrollIntoViewIfNeeded();await page.getByRole('button',{name:'继续和旅行顾问聊',exact:true}).click();
 assert.equal(await page.locator('#travel-brief').evaluate(node=>node===document.activeElement),true,'Mobile map/guide can return directly to chat');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
 console.log('PASS: detailed daily guide and sources, food follow-up without route replacement, long-history scrolling, visible desktop composer and mobile return-to-chat.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
