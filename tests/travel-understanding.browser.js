import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createApp} from '../server.js';
import {emptyTravelProfile,updateTravelProfile} from '../public/src/travel-profile.js';
import {buildDailyPlan} from '../public/src/travel-schedule.js';
import {initialState} from '../public/src/travel-state.js';
import {normalizeRequest,planFromCatalog} from '../public/src/travel-domain.js';

const firstText='广州三天，每天六小时，我们三个人，预算1000元，必去粤博，不去广州塔';
const first=updateTravelProfile(emptyTravelProfile(),{text:firstText}).profile;
const complete=updateTravelProfile(first,{text:'每人全程，每天4小时',patch:{budget:{scope:'per-person',period:'trip'},dailyHours:4}}).profile;
const base={...planFromCatalog(normalizeRequest({description:'广州一天'}),undefined,{placeIds:['gz-museum','gz-square','gz-opera'],title:'广州三日文化漫游'}),kind:'plan',mode:'ai',trace:[],assistantReply:'已按三天安排，保留粤博，避开广州塔。'};
const planned=buildDailyPlan(base,complete);
const cheaper=updateTravelProfile(complete,{text:'预算改为每人全程800元'}).profile;
const revised={...buildDailyPlan(planned,cheaper),assistantReply:'已将每人全程预算改成800元，其余条件沿用。'};
const pending=updateTravelProfile(cheaper,{text:'预算改成每人全程100元'}).profile;
const hourConflict=updateTravelProfile(cheaper,{text:'每天只有1小时，必去粤博'}).profile;
hourConflict.followUps=[{field:'dailyHours',question:'必去粤博无法放入每天1小时的安排，要增加可用时间还是减少必去地点？'}];
const beijingProfile=updateTravelProfile(emptyTravelProfile(),{text:'帮我安排北京两天，每天4小时',patch:{destination:'北京',dayCount:2,dailyHours:4}}).profile;
const suggested=(id,name)=>({id,kind:'suggested',city:'北京',name,minutes:40,transit:0,estimatedStart:0,story:'本地协议样例，真实游览条件待确认。',task:'记录旅行记忆。',coords:null,source:'',availability:'开放与交通待核实',souvenir:'可用照片定制',aliases:[],tags:[],evidence:[]});
const beijing=buildDailyPlan({...base,city:'北京',title:'北京两日漫游',input:{...base.input,destination:'北京'},stops:[suggested('suggested-1','景山公园'),suggested('suggested-2','北海公园')],assistantReply:'北京两日方案已整理。'},beijingProfile);
const app=createApp({key:'test',tripoKey:'',fetchImpl:async()=>{throw new Error('本测试禁止任何外部模型调用');}}),staticHandler=app.listeners('request')[0];
let turns=0,cancelled=0;const openResponses=new Set();
const server=http.createServer(async(req,res)=>{
  if(req.url!=='/api/travel-chat/stream')return staticHandler(req,res);
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=JSON.parse(Buffer.concat(chunks).toString());
  res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store'});res.flushHeaders();
  const event=value=>res.write(JSON.stringify(value)+'\n'),result=response=>{event({type:'result',response});res.end();};
  try{
    turns++;
    if(turns===1){assert.deepEqual(body.profile,emptyTravelProfile());assert.equal(body.currentPlan,undefined);return result({kind:'clarify',status:'needs-info',mode:'ai',trace:[],assistantReply:'这笔预算是每人还是全团、全程还是每天？',profile:first,followUps:first.followUps});}
    if(turns===2){assert.deepEqual(body.profile,first);assert.ok(body.history.some(message=>message.content===firstText));return result(planned);}
    if(turns===3){assert.deepEqual(body.profile,complete);return result({kind:'answer',status:'answered',mode:'ai',trace:[],assistantReply:'粤博的预约与当日开放需要出发前确认。',profile:complete});}
    if(turns===4){assert.deepEqual(body.profile,complete);assert.ok(body.history.some(message=>message.content==='粤博需要预约吗？'));return result(revised);}
    if(turns===5){assert.deepEqual(body.profile,cheaper);event({type:'profile',profile:pending});event({type:'constraints',input:{...revised.input,budget:'每人全程100元'},profile:pending});openResponses.add(res);res.once('close',()=>{openResponses.delete(res);cancelled++;});return;}
    if(turns===6){assert.deepEqual(body.profile,cheaper);assert.ok(!body.history.some(message=>message.content==='预算改成每人全程100元'));event({type:'constraints',input:{...revised.input,budget:'每人全程600元'}});event({type:'error',error:'本地模拟服务失败，当前方案保留。'});return res.end();}
    if(turns===7){assert.deepEqual(body.profile,cheaper);return result({kind:'clarify',status:'needs-info',mode:'ai',trace:[],assistantReply:'必去粤博无法放入每天1小时，请增加时间或调整必去地点。',profile:hourConflict,followUps:hourConflict.followUps});}
    if(turns===8){assert.deepEqual(body.profile,emptyTravelProfile());assert.equal(body.currentPlan,undefined);assert.equal(body.previous,undefined);assert.deepEqual(body.history,[]);return result(beijing);}
    throw new Error(`未预期的对话轮次 ${turns}`);
  }catch(error){event({type:'error',error:error.message});res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'chrome',headless:true}),root=`http://127.0.0.1:${server.address().port}`;
try{
  const page=await browser.newPage({viewport:{width:1500,height:1000},reducedMotion:'reduce'}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lvzang.v1')));
  const bytes=()=>page.evaluate(()=>({plan:localStorage.getItem('lvzang.v1'),chat:localStorage.getItem('lvzang.chat.v1')}));
  const assertAssistantQuestions=async followUps=>{const reply=await page.locator('.chat-message.assistant .message-content').last().textContent();for(const {question} of followUps)assert.ok(reply.includes(question),`Assistant message contains the complete question: ${question}`);};
  const send=async text=>{await page.locator('#travel-brief').fill(text);await page.getByRole('button',{name:'发送消息',exact:true}).click();await page.waitForFunction(()=>!document.getElementById('plan-button').disabled);};
  await page.goto(root+'/travel.html');await page.waitForFunction(()=>document.getElementById('agent-mode').value==='ai');
  assert.match(await page.locator('#requirements-summary').textContent(),/待补充/);assert.equal(await page.evaluate(()=>localStorage.getItem('lvzang.v1')),null);
  const sampleTitle=await page.locator('#route-title').textContent();await send(firstText);
  assert.equal((await state()).plan,null);assert.equal(await page.locator('#route-title').textContent(),sampleTitle);await assertAssistantQuestions(first.followUps);assert.ok(first.followUps.length>0&&first.followUps.length<=2);assert.equal(await page.locator('#time-value').textContent(),'每天6小时');assert.match(await page.locator('#time-detail').textContent(),/共3天.*每日6小时.*尚待排入路线/);assert.equal(await page.locator('#time-state').textContent(),'待补充条件');assert.equal(await page.locator('#route-state').textContent(),'待补充条件');assert.equal(await page.locator('#budget-value').textContent(),'¥1000');
  await page.reload();assert.equal(await page.locator('.chat-message.user').count(),1);await assertAssistantQuestions(first.followUps);assert.match(await page.locator('#requirements-summary').textContent(),/3 天/);assert.equal(await page.locator('#time-value').textContent(),'每天6小时');assert.match(await page.locator('#time-detail').textContent(),/每日6小时.*尚待排入路线/);
  await send('每人全程，每天4小时');assert.equal((await state()).plan.days.length,3);assert.equal(await page.locator('#day-selector button').count(),3);assert.match(await page.locator('#budget-detail').textContent(),/每人.*全程/);
  await page.getByRole('button',{name:'查看示意图',exact:true}).click();assert.match(await page.locator('#map-status').textContent(),/未经高德核实/);const dayStops=[];for(let index=0;index<3;index++){await page.locator(`[data-day="${index}"]`).click();const names=await page.locator('.stop-card h3').allTextContents();dayStops.push(...names);assert.deepEqual(await page.locator('.map-marker span').allTextContents(),names);assert.match(await page.locator('#time-detail').textContent(),new RegExp(`第${index+1}天 / 共3天`));}
  assert.equal(new Set(dayStops).size,dayStops.length);assert.ok(dayStops.includes('广东省博物馆'));assert.ok(!dayStops.includes('广州塔'));
  const afterPlan=await bytes();await send('粤博需要预约吗？');const afterAnswer=await bytes();assert.equal(afterAnswer.plan,afterPlan.plan);assert.notEqual(afterAnswer.chat,afterPlan.chat);
  await page.reload();assert.ok((await page.locator('.chat-message.user').last().textContent()).includes('粤博需要预约吗？'));assert.ok((await page.locator('.chat-message.assistant .message-content').last().textContent()).includes('粤博的预约与当日开放需要出发前确认。'));await send('预算改为每人全程800元');assert.equal((await state()).profile.fields.budget.value.amount,800);assert.equal((await state()).profile.fields.companions.value.count,3);assert.deepEqual((await state()).plan.stops.map(stop=>stop.id),planned.stops.map(stop=>stop.id));
  const stable=await bytes(),stableProfile=(await state()).profile;await page.locator('#travel-brief').fill('预算改成每人全程100元');await page.getByRole('button',{name:'发送消息',exact:true}).click();await page.waitForFunction(()=>document.getElementById('budget-value').textContent.includes('100'));await page.getByRole('button',{name:'停止本次修订',exact:true}).click();await page.waitForFunction(()=>!document.getElementById('plan-button').disabled);assert.deepEqual(await bytes(),stable);assert.deepEqual((await state()).profile,stableProfile);assert.match(await page.locator('#budget-value').textContent(),/800/);
  await send('预算改成每人全程600元，重新安排路线');assert.match(await page.locator('#plan-status').textContent(),/服务失败/);assert.deepEqual(await bytes(),stable);assert.deepEqual((await state()).profile,stableProfile);
  const stablePlan=(await state()).plan;await send('每天只有1小时，必去粤博');assert.match(await page.locator('.chat-message.assistant').last().textContent(),/必去.*无法/);assert.deepEqual((await state()).plan,stablePlan);assert.deepEqual((await state()).profile,hourConflict);await assertAssistantQuestions(hourConflict.followUps);await page.reload();assert.deepEqual((await state()).plan,stablePlan);await assertAssistantQuestions(hourConflict.followUps);
  await mkdir('artifacts/workspace',{recursive:true});await page.screenshot({path:'artifacts/workspace/understanding-desktop.png',animations:'disabled'});await page.setViewportSize({width:390,height:844});await page.locator('[data-day="2"]').click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'artifacts/workspace/understanding-mobile.png',fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:'模拟签到 · 解锁',exact:true}).first().click();await page.getByRole('button',{name:'关闭纪念品详情'}).click();const collection=(await state()).collection;assert.equal(collection.length,1);
  if(await page.locator('#planner-tools-content').isHidden())await page.locator('#planner-tools-toggle').click();await page.getByRole('button',{name:'开始新方案',exact:true}).click();assert.deepEqual((await state()).profile,emptyTravelProfile());assert.deepEqual((await state()).collection,collection);assert.equal((await state()).plan.days.length,3);
  await page.reload();assert.deepEqual((await state()).profile,emptyTravelProfile());await send('帮我安排北京两天，每天4小时');assert.match(await page.locator('#route-title').textContent(),/北京/);assert.equal(await page.locator('[data-unlock]').count(),0);assert.equal(await page.locator('#city-map').evaluate(element=>getComputedStyle(element).visibility),'hidden');
  await page.reload();assert.equal(await page.locator('#storage-recovery').isVisible(),false);assert.equal(await page.locator('#day-selector button').count(),2);
  const old=await browser.newPage();old.on('pageerror',error=>errors.push(error.message));const oldState={...initialState(),plan:base};delete oldState.profile;await old.addInitScript(value=>localStorage.setItem('lvzang.v1',value),JSON.stringify(oldState));await old.goto(root+'/travel.html');assert.equal(await old.locator('#storage-recovery').isVisible(),false);assert.match(await old.locator('#route-title').textContent(),/广州/);assert.match(await old.locator('#requirements-summary').textContent(),/待补充/);await old.close();
  assert.equal(turns,8);assert.equal(cancelled,1);assert.deepEqual(errors,[]);console.log('PASS: clarify persistence without replacing demo; profile/chat reload; independent Q&A bytes; budget-only revision; daily map/time switching; failure/cancellation rollback; impossible one-hour clarification preserves plan and reloads follow-up; mobile; new-trip reload isolation; old records; Beijing daily reload.');
}finally{await browser.close();for(const res of openResponses)res.end();await new Promise(resolve=>server.close(resolve));app.close();}
