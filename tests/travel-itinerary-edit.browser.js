import assert from 'node:assert/strict';
import http from 'node:http';
import {chromium} from 'playwright';
import {createApp} from '../server.js';
import {emptyTravelProfile,updateTravelProfile} from '../public/src/travel-profile.js';
import {buildDailyPlan} from '../public/src/travel-schedule.js';
import {initialState,unlock} from '../public/src/travel-state.js';
import {normalizeRequest,planFromCatalog} from '../public/src/travel-domain.js';
const profile=updateTravelProfile(emptyTravelProfile(),{text:'广州三天，每天6小时，我们两个人，每人全程预算600元，必去粤博，不去广州塔，正常节奏'}).profile;
const plan=buildDailyPlan({...planFromCatalog(normalizeRequest({description:'广州一天'}),undefined,{placeIds:['gz-museum','gz-square','gz-opera']}),kind:'plan',mode:'demo',trace:[]},profile);
plan.mode='ai';plan.guide={status:'ready',summary:'旧路线总览',sources:[{id:'web-guide-fixture',url:'https://www.gz.gov.cn/example',title:'原攻略资料',accessStatus:'fetched',fetchedAt:'2026-10-07T00:00:00.000Z'}],days:plan.days.map(day=>({dayIndex:day.dayIndex,overview:'旧日期总览',stops:day.stops.map(stop=>({stopId:stop.id,name:stop.name,howToPlay:'保留本站玩法',highlights:[],food:[],transport:'旧路线交通',reservation:'预约待确认',rainyAlternative:'',sourceIds:['web-guide-fixture']}))}))};
const saved={...initialState(),profile,plan};unlock(saved,'gz-museum',plan.title);
const app=createApp({key:'',tripoKey:'',amapJsKey:'',amapSecurityJsCode:'',accountsEnabled:false,fetchImpl:async()=>{throw Error('No outside services in this test');}}),handler=app.listeners('request')[0];
let failNext=false;
const server=http.createServer((req,res)=>{if(req.url==='/api/travel-chat/stream'&&failNext){failNext=false;res.writeHead(200,{'Content-Type':'application/x-ndjson'});res.end(JSON.stringify({type:'error',error:'模拟修改失败，原行程保留'})+'\n');return;}handler(req,res);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1500,height:1000},reducedMotion:'reduce'}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());await page.goto(origin+'/travel.html');
 await page.evaluate(value=>{localStorage.setItem('lvzang.v1',JSON.stringify(value));localStorage.setItem('lvzang.chat.v1',JSON.stringify({version:1,messages:[{role:'user',content:'这是之前的旅行对话'}]}));},saved);await page.reload();
 const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lvzang.v1'))),bytes=()=>page.evaluate(()=>[localStorage.getItem('lvzang.v1'),localStorage.getItem('lvzang.chat.v1')]);
 // Exercise the actual HTTP stream for a search-result add. The map's callback uses this same explicit wire request.
 const added=await page.evaluate(async()=>{const current=JSON.parse(localStorage.getItem('lvzang.v1'));const response=await fetch('/api/travel-chat/stream',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({description:'将广州图书馆加入第1天',mode:'demo',profile:current.profile,currentPlan:current.plan,previous:current.plan.input,itineraryEdit:{action:'add',stopId:'gz-library',stopName:'广州图书馆',dayIndex:1}})});const events=(await response.text()).trim().split('\n').map(JSON.parse);const result=events.find(event=>event.type==='result')?.response;if(!result)throw Error(JSON.stringify(events));localStorage.setItem('lvzang.v1',JSON.stringify({...current,profile:result.profile,plan:result}));return result;});
 assert.ok(added.stops.some(stop=>stop.id==='gz-library'));await page.reload();assert.equal(await page.locator('#storage-recovery').isVisible(),false);assert.equal(await page.locator('[data-remove-stop="gz-library"]').count(),1);assert.equal((await state()).plan.mode,'ai');assert.match(await page.locator('[data-stop-card="gz-library"] .stop-guide').textContent(),/待补充/);assert.match(await page.locator('[data-stop-card="gz-museum"] .stop-guide').textContent(),/保留本站玩法/);assert.doesNotMatch(await page.locator('#route-stops').textContent(),/旧路线交通/);assert.doesNotMatch(await page.locator('#travel-guide-overview').textContent(),/旧路线总览|旧日期总览/);
 const stable=await bytes();failNext=true;await page.getByRole('button',{name:'将广州图书馆移出行程',exact:true}).click();await page.waitForFunction(()=>!document.getElementById('plan-button').disabled);assert.deepEqual(await bytes(),stable);assert.match(await page.locator('#plan-status').textContent(),/模拟修改失败/);
 await page.getByRole('button',{name:'将广州图书馆移出行程',exact:true}).click();await page.waitForFunction(()=>!document.getElementById('plan-button').disabled);assert.ok((await state()).plan.stops.every(stop=>stop.id!=='gz-library'));assert.ok((await state()).profile.fields.excludedPlaces.value.includes('广州图书馆'));assert.deepEqual((await state()).collection,saved.collection);
 await page.reload();assert.equal(await page.locator('[data-remove-stop="gz-library"]').count(),0);assert.equal((await state()).profile.fields.budget.value.amount,600);
 for(const [day,id]of [[0,'gz-museum'],[1,'gz-square'],[2,'gz-opera']]){await page.locator(`[data-day="${day}"]`).click();await page.locator(`[data-remove-stop="${id}"]`).click();await page.waitForFunction(()=>!document.getElementById('plan-button').disabled);}
 assert.equal((await state()).plan.stops.length,0);assert.equal((await state()).plan.days.length,3);assert.equal(await page.locator('.day-empty').count(),1);
 await page.reload();assert.equal(await page.locator('#storage-recovery').isVisible(),false);assert.equal((await state()).plan.stops.length,0);assert.deepEqual((await state()).collection,saved.collection);assert.equal((await state()).plan.guide.days.flatMap(day=>day.stops).length,0);assert.deepEqual((await state()).plan.guide.sources,[]);
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
 console.log('PASS: actual HTTP membership add; saved custom landmark reload; card remove rollback and success; profile/collection and AI mode retention; actual cards display new-place pending guide and retained play details without obsolete overview or transport; final accepted stop removal leaves valid empty days; refresh and mobile.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));app.close();}
