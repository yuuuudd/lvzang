import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createApp} from '../server.js';
import {initialState} from '../public/src/travel-state.js';
import {emptyTravelProfile,updateTravelProfile} from '../public/src/travel-profile.js';
import {normalizeRequest,planFromCatalog} from '../public/src/travel-domain.js';
import {buildDailyPlan} from '../public/src/travel-schedule.js';

const profile=updateTravelProfile(emptyTravelProfile(),{text:'广州三天，每天4小时'}).profile;
const plan=buildDailyPlan({...planFromCatalog(normalizeRequest({destination:'广州',hours:4}),undefined,{placeIds:['gz-museum','gz-square','gz-opera']}),mode:'ai',trace:[]},profile);
let externalCalls=0;
const server=createApp({accountsEnabled:false,key:'fixture',amapJsKey:'',amapSecurityJsCode:'',fetchImpl:async()=>{externalCalls++;throw Error('Interview must not require a model for plain answers');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const root=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({channel:'chrome',headless:true});
async function verifyIncrementalAnswers(){
 const page=await browser.newPage({viewport:{width:1440,height:844},reducedMotion:'reduce'}),requests=[],errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('request',request=>{if(request.url().endsWith('/api/travel-chat/stream'))requests.push(request.postDataJSON());});
 try{
  await page.goto(root+'/travel.html');
  await page.evaluate(saved=>localStorage.setItem('lvzang.v1',saved),JSON.stringify({...initialState(),profile,plan}));
  await page.reload();
  const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lvzang.v1')));
  const clickSend=async text=>{await page.locator('#travel-brief').fill(text);const response=page.waitForResponse(response=>response.url().endsWith('/api/travel-chat/stream'));await page.getByRole('button',{name:'发送消息',exact:true}).click();await response;await page.waitForFunction(()=>!document.getElementById('plan-button').disabled);};
  const enterSend=async text=>{await page.locator('#travel-brief').fill(text);const response=page.waitForResponse(response=>response.url().endsWith('/api/travel-chat/stream'));await page.locator('#travel-brief').press('Enter');await response;await page.waitForFunction(()=>!document.getElementById('plan-button').disabled);};
  await page.locator('#advisor-preferences').click();await page.waitForFunction(()=>!document.getElementById('plan-button').disabled);
  assert.equal((await state()).profile.interview.topic,'travelDates');
  await clickSend('3天');
  let current=await state();
  assert.equal(current.profile.fields.dayCount.value,3);
  assert.equal(current.profile.fields.dayCount.status,'confirmed');
  assert.equal(current.profile.fields.travelDates.value,null,'A duration answer must not fabricate calendar dates');
  assert.equal(current.profile.fields.travelDates.status,'missing');
  assert.equal(current.profile.interview.topic,'startTime','Repeating the accepted duration at the date question advances to the next unconfirmed topic');
  assert.equal(current.profile.interview.answers.find(answer=>answer.field==='travelDates')?.answer,'3天','The answer is kept verbatim even though it does not specify dates');
  assert.deepEqual(current.plan,plan,'Clarifying dates and duration preserves the accepted route');
  await clickSend('每天早上9点开始');assert.equal((await state()).profile.interview.topic,'companions');
  await clickSend('2个成年人，没有老人小孩');assert.equal((await state()).profile.interview.topic,'budget');
  await clickSend('500');current=await state();
  assert.equal(current.profile.interview.answers.find(answer=>answer.field==='budget')?.answer,'500');
  assert.deepEqual(current.profile.fields.budget,profile.fields.budget,'Recording a raw amount does not invent its scope or confirm a parsed budget');
  assert.equal(current.profile.interview.topic,'crowdPreference','Any nonempty budget answer advances without requiring a prescribed wording');
  assert.deepEqual(current.plan,plan);
  const bytes=()=>page.evaluate(()=>({state:localStorage.getItem('lvzang.v1'),history:localStorage.getItem('lvzang.chat.v1')}));
  const beforeBlank=await bytes(),requestCount=requests.length,messageCount=await page.locator('.chat-message').count();
  await page.locator('#travel-brief').fill('   ');await page.getByRole('button',{name:'发送消息',exact:true}).click();await page.waitForFunction(()=>!document.getElementById('plan-button').disabled);
  assert.equal(requests.length,requestCount,'An empty click submits no HTTP request');
  assert.deepEqual(await bytes(),beforeBlank,'An empty click preserves the exact interview and history bytes');
  assert.equal(await page.locator('.chat-message').count(),messageCount,'An empty click adds no visible user or assistant message');
  const input=await page.locator('#travel-brief').evaluate(element=>({focused:element===document.activeElement,validationMessage:element.validationMessage}));
  assert.equal(input.focused,true,'The empty composer receives focus for correction');
  assert.match(input.validationMessage+' '+await page.locator('#plan-status').textContent(),/输入|填写|内容/,'The input receives an actionable empty-message hint');
  await enterSend('都安排');current=await state();
  assert.equal(requests.at(-1).description,'都安排','Enter sends the actual short answer through HTTP');
  assert.equal(current.profile.interview.answers.find(answer=>answer.field==='crowdPreference')?.answer,'都安排','The contextual short answer is preserved verbatim for final interpretation');
  assert.equal(current.profile.interview.topic,'interests','A contextual both-choice answer advances exactly one topic');
  assert.deepEqual(current.plan,plan);
  await enterSend('美食、建筑、拍照');assert.equal((await state()).profile.interview.topic,'requiredPlaces');
  await enterSend('没什么特别想去的');current=await state();
  assert.equal(current.profile.interview.answers.find(answer=>answer.field==='requiredPlaces')?.answer,'没什么特别想去的');
  assert.equal(current.profile.interview.topic,'excludedPlaces');assert.deepEqual(current.plan,plan);
  await enterSend('没有不想去的');current=await state();
  assert.equal(current.profile.interview.answers.find(answer=>answer.field==='excludedPlaces')?.answer,'没有不想去的');
  assert.deepEqual(current.profile.fields,profile.fields,'Questionnaire collection does not turn raw wording into authoritative profile fields');
  assert.equal(current.profile.interview.topic,'pace');assert.deepEqual(current.plan,plan);
  await enterSend('可以轻松一点吗？');current=await state();
  assert.equal(current.profile.interview.answers.find(answer=>answer.field==='pace')?.answer,'可以轻松一点吗？','A question-shaped answer is also recorded verbatim for the current question');
  assert.equal(current.profile.interview.topic,'diet');assert.deepEqual(current.plan,plan);
  assert.deepEqual(errors,[]);
 }finally{await page.close();}
}
try{
 await verifyIncrementalAnswers();
 const page=await browser.newPage({viewport:{width:1440,height:844},reducedMotion:'reduce'}),errors=[],requests=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('request',request=>{if(request.url().endsWith('/api/travel-chat/stream'))requests.push(request.postDataJSON());});
 await page.goto(root+'/travel.html');
 await page.evaluate(saved=>localStorage.setItem('lvzang.v1',saved),JSON.stringify({...initialState(),profile,plan}));
 await page.reload();
 const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lvzang.v1')));
 const send=async text=>{await page.locator('#travel-brief').fill(text);await page.locator('#travel-brief').press('Enter');await page.waitForFunction(()=>!document.getElementById('plan-button').disabled);};
 const clickAction=async id=>{await page.locator(id).click();await page.waitForFunction(()=>!document.getElementById('plan-button').disabled);};
 const before=await page.locator('.chat-scroll').evaluate(el=>el.clientHeight);
 await page.locator('#travel-brief').fill('还有一个想法没发出去');
 await clickAction('#advisor-preferences');
 assert.equal(requests.at(-1).interviewAction,'start');
 assert.equal(await page.locator('#travel-brief').inputValue(),'还有一个想法没发出去','Starting interview preserves the unsent draft');
 assert.equal(await page.locator('#planner-tools-toggle').getAttribute('aria-expanded'),'false');
 assert.ok((await page.locator('.chat-scroll').evaluate(el=>el.clientHeight))>before+100,'Collapsed tools give substantial space back to conversation');
 assert.ok((await page.locator('#planner-tools').boundingBox()).height<=56);
 let current=await state();
 assert.equal(current.profile.interview.status,'active');
 assert.equal(current.profile.followUps.length,1,'The server asks just one current topic');
 assert.deepEqual(current.plan,plan,'Starting the questionnaire does not regenerate the saved route');
 const firstTopic=current.profile.interview.topic;
 await clickAction('#interview-skip');
 current=await state();assert.ok(current.profile.interview.skipped.includes(firstTopic));
 assert.notEqual(current.profile.fields[firstTopic].status,'confirmed','Skipping never invents a confirmed answer');
 const secondTopic=current.profile.interview.topic;
 await clickAction('#interview-pause');assert.equal((await state()).profile.interview.status,'paused');
 await page.reload();assert.equal((await state()).profile.interview.status,'paused');
 await clickAction('#interview-resume');assert.equal((await state()).profile.interview.topic,secondTopic);
 const answers={
  destination:'广州',travelDates:'2026年11月1日到11月3日',dayCount:'3天',dailyHours:'4小时',
  startTime:'每天早上9点开始',companions:'2个成年人，没有老人小孩',
  budget:'每人全程1000元，包含餐饮、门票和交通',crowdPreference:'热门小众都想去',
  interests:'美食、建筑、拍照',requiredPlaces:'很想去广东省博物馆',excludedPlaces:'不去广州塔',
  pace:'轻松慢游',diet:'不吃辣，没有过敏',stayArea:'住在天河区',startArea:'从体育西路出发',transport:'地铁和步行'
 };
 const seen=[];
 for(let turn=0;turn<20;turn++){
  current=await state();if(current.profile.interview.status==='ready')break;
  assert.equal(current.profile.interview.status,'active');const topic=current.profile.interview.topic;
  assert.ok(answers[topic],`Unexpected topic ${topic}`);assert.ok(!seen.includes(topic),`Plain answer did not advance topic ${topic}`);seen.push(topic);
  assert.equal(current.profile.followUps.length,1);assert.equal(current.profile.followUps[0].field,topic);
  assert.ok((await page.locator('.chat-message.assistant').last().textContent()).includes(current.profile.followUps[0].question));
  await send(answers[topic]);
  assert.deepEqual((await state()).plan,plan,'Every interview answer retains the prior route until explicit planning');
 }
 current=await state();assert.equal(current.profile.interview.status,'ready');
 assert.ok(seen.length>=10,'The interview must cover the full set of unconfirmed preferences');
 for(const field of seen){const answer=current.profile.interview.answers.find(answer=>answer.field===field);assert.equal(answer?.answer,answers[field]);assert.ok(answer.question.length>0,'Each raw answer retains the question that elicited it');}
 assert.deepEqual(current.profile.fields,profile.fields,'Structured preferences wait for the final whole-interview interpretation');
 assert.equal(externalCalls,0,'Collecting the complete raw-answer questionnaire requires no model call');
 assert.equal(await page.locator('#interview-plan').isVisible(),true);
 assert.match(await page.locator('#interview-progress').textContent(),/问答已完成，可以补充或开始规划.*\d+\s*\/\s*16/);
 await page.reload();assert.equal((await state()).profile.interview.status,'ready');
 assert.equal(await page.locator('#interview-plan').isVisible(),true);
 await send('再补充一下，还想去天环，预算改为每人全程900元');
 current=await state();assert.equal(current.profile.interview.status,'ready','Extra preferences after the interview still wait for explicit planning');
 assert.ok(current.profile.interview.additions.includes('再补充一下，还想去天环，预算改为每人全程900元'));
 assert.deepEqual(current.profile.fields,profile.fields);
 assert.deepEqual(current.plan,plan);
 assert.equal(externalCalls,0);
 await send('预算改为每人全程900元');
 assert.equal((await state()).profile.interview.status,'ready','Repeating an accepted preference is not permission to generate a route');
 assert.ok((await state()).profile.interview.additions.includes('预算改为每人全程900元'));
 assert.deepEqual((await state()).plan,plan);
 assert.equal(externalCalls,0);
 current=await state();
 const savedBytes=()=>page.evaluate(()=>({state:localStorage.getItem('lvzang.v1'),chat:localStorage.getItem('lvzang.chat.v1')}));
 const beforeFailure=await savedBytes();
 await clickAction('#interview-plan');
 assert.ok(externalCalls>0,'Only explicit planning hands the collected questionnaire to the model');
 assert.deepEqual(await savedBytes(),beforeFailure,'A failed final interpretation preserves all raw answers, additions, history and the old route');
 assert.equal((await state()).profile.interview.status,'ready');
 // Planning itself has separate real-model coverage. Verify the explicit UI handoff here.
 await page.route('**/api/travel-chat/stream',route=>{
  const response={...plan,kind:'plan',profile:{...current.profile,interview:{...current.profile.interview,status:'completed'}},assistantReply:'已按你确认的条件更新攻略，你也可以继续补充想法。'};
  return route.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({type:'result',response})+'\n'});
 });
 await clickAction('#interview-plan');assert.equal(requests.at(-1).interviewAction,'plan');
 assert.deepEqual(requests.at(-1).profile.interview.answers,current.profile.interview.answers,'Explicit planning receives the complete original question/answer pairs');
 assert.deepEqual(requests.at(-1).profile.interview.additions,current.profile.interview.additions);
 assert.equal((await state()).profile.interview.status,'completed');
 assert.equal(await page.locator('#travel-brief').isEnabled(),true);
 await page.locator('#travel-brief').fill('再补充一下，我还想去天环');
 await page.locator('#planner-tools-toggle').click();
 await page.locator('#planner-tools-toggle').click();
 assert.equal(await page.locator('#planner-tools-content').isVisible(),false);
 assert.equal(await page.locator('#travel-brief').inputValue(),'再补充一下，我还想去天环');
 await page.reload();assert.equal(await page.locator('#planner-tools-toggle').getAttribute('aria-expanded'),'false');
 for(const width of [390,580,1440]){
  await page.setViewportSize({width,height:844});
  assert.ok((await page.locator('#planner-tools').boundingBox()).height<=56);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.locator('#planner-tools-toggle').click();assert.equal(await page.locator('#advisor-preferences').isVisible(),true);
  await page.locator('#planner-tools-toggle').click();assert.equal(await page.locator('#planner-tools-content').isVisible(),false);
 }
 const unavailable=await browser.newPage();
 await unavailable.addInitScript(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='lvzang.travel-ui.v1')throw new DOMException('Blocked','QuotaExceededError');return original.call(this,key,value);};});
 unavailable.on('pageerror',error=>errors.push(error.message));await unavailable.goto(root+'/travel.html');
 await unavailable.locator('#planner-tools-toggle').click();assert.equal(await unavailable.locator('#planner-tools-content').isVisible(),false);
 await unavailable.locator('#planner-tools-toggle').click();assert.equal(await unavailable.locator('#planner-tools-content').isVisible(),true);
 assert.deepEqual(errors,[]);
 console.log('PASS: real HTTP click/Enter accepts and preserves raw date/duration, budget and contextual answers without per-question model calls; empty-submit no request/history/progress changes; full raw Q&A and additions, skip/pause/resume/reload, route and draft preservation, explicit whole-interview plan handoff, responsive collapsed header and blocked UI storage.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
