import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createApp} from '../server.js';
import {initialState} from '../public/src/travel-state.js';
import {emptyTravelProfile,normalizeTravelProfile,TRAVEL_INTERVIEW_TOPICS,updateTravelProfile} from '../public/src/travel-profile.js';
import {normalizeRequest,planFromCatalog} from '../public/src/travel-domain.js';
import {buildDailyPlan} from '../public/src/travel-schedule.js';

const oldValues={destination:'广州',travelDates:{start:'2026-11-01',end:'2026-11-03'},dayCount:3,dailyHours:4,startTime:'09:00',companions:{count:2,adults:2,children:0,seniors:0,description:'两位成年人'},budget:{amount:900,currency:'CNY',scope:'per-person',period:'trip',includes:['餐饮','门票']},crowdPreference:'popular',interests:['美食','购物'],requiredPlaces:['广州塔'],excludedPlaces:['长隆'],pace:'easy',diet:{preferences:['粤菜'],restrictions:['辣']},stayArea:'广州珠江新城',startArea:'广州东站',transport:'transit'};
const oldProfile=normalizeTravelProfile({...emptyTravelProfile(),fields:Object.fromEntries(Object.entries(oldValues).map(([field,value])=>[field,{value,status:'confirmed'}])),interview:{status:'completed',topic:null,skipped:[],answers:TRAVEL_INTERVIEW_TOPICS.map(field=>({field,question:`原广州旅行的${field}条件？`,answer:`原广州回答：${JSON.stringify(oldValues[field])}`})),additions:['原广州补充：还想去天河城']}});
const oldPlan=buildDailyPlan({...planFromCatalog(normalizeRequest({destination:'广州',hours:4}),undefined,{placeIds:['gz-tower','gz-square','gz-museum'],title:'此前保存的广州三天攻略'}),mode:'ai',trace:[]},oldProfile);
const oldState={...initialState(),profile:oldProfile,plan:oldPlan,notes:[{title:'原广州攻略笔记',content:'广州塔之后去天河城购物。',url:''}],collection:[{id:'gz-tower',story:'原旅行的收藏',date:'2026-10-08'}]};
let externalCalls=0;
const server=createApp({accountsEnabled:false,key:'fixture',amapJsKey:'',amapSecurityJsCode:'',fetchImpl:async()=>{externalCalls++;throw Error('Collecting a new destination questionnaire must not invoke generation');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'}),requests=[],errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(request.url().endsWith('/api/travel-chat/stream'))requests.push(request.postDataJSON());});
  await page.goto(`http://127.0.0.1:${server.address().port}/travel.html`);
  await page.evaluate(saved=>{localStorage.setItem('lvzang.v1',JSON.stringify(saved));localStorage.setItem('lvzang.chat.v1',JSON.stringify({version:1,messages:[{role:'user',content:'原广州对话：我想去广州塔，喜欢粤菜。'},{role:'assistant',content:'原广州方案已完成。'}]}));},oldState);
  await page.reload();
  const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lvzang.v1')));
  const idle=()=>page.waitForFunction(()=>!document.getElementById('plan-button').disabled&&!document.getElementById('route-refresh').disabled);
  const send=async text=>{await page.locator('#travel-brief').fill(text);const response=page.waitForResponse(r=>r.url().endsWith('/api/travel-chat/stream'));await page.locator('#travel-brief').press('Enter');await response;await idle();};
  const action=async selector=>{const response=page.waitForResponse(r=>r.url().endsWith('/api/travel-chat/stream'));await page.locator(selector).click();await response;await idle();};
  const assertOldPlan=async()=>{
    const current=await state();assert.deepEqual(current.plan,oldPlan,'The previous accepted route stays intact throughout the new interview');assert.deepEqual(current.collection,oldState.collection,'Starting a destination interview never removes souvenirs');
    assert.match(await page.locator('#route-current-destination').textContent(),/广州/,'The previous-guide label still describes the accepted previous trip');
    assert.match(await page.locator('#map-title').textContent(),/西藏/,'The map follows this destination independently of the previous accepted guide');
  };
  const assertFreshPayload=payload=>{
    assert.equal(payload.currentPlan,undefined,'The old Guangzhou route is display-only, never input to the new trip');
    assert.equal(payload.previous,undefined,'The old Guangzhou planning constraints must not leak');
    assert.doesNotMatch(JSON.stringify(payload),/原广州|广州塔|天河城|珠江新城|广州东站|粤菜|长隆/,'No old interview, conditions, notes or chat are submitted to the new destination');
  };
  await page.locator('#travel-brief').fill('这条草稿还没发送');
  await page.locator('#route-destination').fill('西藏');await action('#route-refresh');
  let current=await state();
  console.log('Destination refresh initial state:',JSON.stringify({externalCalls,action:requests.at(-1)?.interviewAction,status:current.profile.interview?.status,topic:current.profile.interview?.topic,destination:current.profile.fields.destination.value}));
  assert.equal(externalCalls,0,'Changing destination starts questions; it must not call DeepSeek generation');
  assert.equal(current.profile.interview?.status,'active','A completed old-city interview cannot authorize immediate generation for the new city');
  assert.equal(requests.at(-1).interviewAction,'restart');
  assert.equal(current.profile.interview.total,16);
  assert.equal(current.profile.interview.step,1);assert.equal(current.profile.interview.topic,'destination');
  assert.equal(current.profile.fields.destination.value,'西藏');
  for(const [field,record] of Object.entries(current.profile.fields))if(field!=='destination')assert.deepEqual(record,{value:null,status:'missing'},`${field} must be asked afresh for this destination`);
  assert.ok(!JSON.stringify(current.profile.interview).includes('原广州'));
  assert.equal(current.profile.followUps.length,1);
  assert.equal(current.profile.followUps[0].field,current.profile.interview.topic);
  assert.ok((await page.locator('.chat-message.assistant').last().textContent()).includes(current.profile.followUps[0].question));
  assert.equal(await page.locator('#travel-brief').inputValue(),'这条草稿还没发送','The refresh action preserves the unsent draft');
  assertFreshPayload(requests.at(-1));await assertOldPlan();
  assert.match(await page.locator('#route-refresh').textContent(),/继续问答/);
  const firstQuestionnaire=current.profile;await page.locator('#route-refresh').click();await idle();
  assert.deepEqual((await state()).profile,firstQuestionnaire,'Clicking the destination action during collection resumes this question rather than planning or restarting');
  assert.notEqual(requests.at(-1).interviewAction,'plan');assertFreshPayload(requests.at(-1));assert.equal(externalCalls,0);

  const answers={destination:'西藏',travelDates:'日期还没定',dayCount:'两天吧，第一天先慢慢适应',dailyHours:'每天四小时左右',startTime:'上午十点再出门',companions:'一个人，按自己的节奏走',budget:'每天五百左右，酒店另外算',crowdPreference:'都安排',interests:'建筑和人文，想慢慢看',requiredPlaces:'布达拉宫',excludedPlaces:'这次不去珠峰',pace:'轻松一点，别赶路',diet:'想试藏餐，不吃花生',stayArea:'拉萨市中心，还没订酒店',startArea:'从住宿处出发',transport:'能步行就步行，远一点打车'};
  const answered=new Map(),seen=new Set();let skippedField=null,reloaded=false;
  for(let turn=0;turn<17;turn++){
    current=await state();if(current.profile.interview.status==='ready')break;
    const {topic}=current.profile.interview;assert.equal(current.profile.interview.status,'active');assert.ok(answers[topic],`Unexpected topic: ${topic}`);assert.ok(!seen.has(topic),`A free-text answer failed to advance ${topic}`);seen.add(topic);
    assert.equal(current.profile.followUps.length,1);
    assert.ok((await page.locator('.chat-message.assistant').last().textContent()).includes(current.profile.followUps[0].question));
    if(topic==='travelDates'){
      skippedField=topic;await action('#interview-skip');assert.ok((await state()).profile.interview.skipped.includes(topic));
    }else{
      const question=current.profile.followUps[0].question;await send(answers[topic]);answered.set(topic,{field:topic,question,answer:answers[topic]});
      assert.deepEqual((await state()).profile.interview.answers.find(answer=>answer.field===topic),answered.get(topic),'Free text must be preserved verbatim beside its actual question');
    }
    assertFreshPayload(requests.at(-1));await assertOldPlan();assert.equal(externalCalls,0);
    if(!reloaded&&seen.size>=3){
      const beforeReload=await state();await page.reload();await idle();current=await state();assert.deepEqual(current,beforeReload,'Reload retains the full new interview progress and the previous route');
      assert.equal(await page.locator('#route-destination').inputValue(),'西藏','Refresh restores the pending destination, not the still-displayed old route');reloaded=true;
    }
  }
  current=await state();assert.equal(current.profile.interview.status,'ready');assert.equal(seen.size,16,'All 16 topics are asked anew, rather than reused from Guangzhou');assert.equal(skippedField,'travelDates');
  assert.equal(current.profile.interview.total,16);assert.equal(current.profile.interview.step,16);assert.equal(externalCalls,0);
  for(const record of answered.values())assert.deepEqual(current.profile.interview.answers.find(item=>item.field===record.field),record);
  assert.equal(await page.locator('#interview-plan').isVisible(),true);await send('再补充：第一天尽量少上台阶');
  current=await state();assert.deepEqual(current.profile.interview.additions,['再补充：第一天尽量少上台阶']);
  await page.reload();await idle();assert.deepEqual((await state()).profile,current.profile);await assertOldPlan();

  // Collection and persistence above use the real HTTP server. Only the explicit
  // model handoff is stubbed, so this regression never requests real AI output.
  let submitted,fail=true;
  const nextProfile=normalizeTravelProfile({...updateTravelProfile(emptyTravelProfile(),{text:'西藏两天，每天4小时'}).profile,interview:{...current.profile.interview,status:'completed',topic:null}});
  const nextStop={...oldPlan.stops[0],id:'suggested-1',kind:'suggested',city:'西藏',name:'布达拉宫',aliases:[],source:'',coords:null,minutes:60,transit:0,estimatedStart:0,dayIndex:1};
  const nextPlan={...buildDailyPlan({...oldPlan,city:'西藏',title:'本次西藏攻略',days:undefined,stops:[nextStop],profile:nextProfile,input:{...oldPlan.input,destination:'西藏',placeConstraints:{city:'西藏',required:[],excluded:[]}}},nextProfile),kind:'plan',status:'ready',mode:'ai',profile:nextProfile,assistantReply:'本次西藏攻略已生成。'};
  await page.route('**/api/travel-chat/stream',route=>{
    submitted=route.request().postDataJSON();
    const event=fail?{type:'error',error:'测试生成失败，请保留当前问答和上一份路线。'}:{type:'result',response:nextPlan};
    return route.fulfill({contentType:'application/x-ndjson',body:JSON.stringify(event)+'\n'});
  });
  const beforeFailure=await state();await action('#interview-plan');
  assert.equal(submitted.interviewAction,'plan');assertFreshPayload(submitted);
  assert.deepEqual(submitted.profile.interview.answers,current.profile.interview.answers);assert.deepEqual(submitted.profile.interview.additions,current.profile.interview.additions);
  assert.deepEqual(await state(),beforeFailure,'A failed generation keeps this questionnaire and the previous accepted plan');await assertOldPlan();
  fail=false;await action('#interview-plan');assertFreshPayload(submitted);
  assert.equal((await state()).plan.city,'西藏');assert.equal((await state()).profile.interview.status,'completed');assert.match(await page.locator('#map-title').textContent(),/西藏/);assert.match(await page.locator('#route-current-destination').textContent(),/西藏/);
  await page.reload();assert.equal((await state()).plan.city,'西藏');assert.equal((await state()).profile.interview.status,'completed');assert.deepEqual(errors,[]);assert.equal(externalCalls,0);
  console.log('PASS: destination switch starts a fresh 16-topic interview without generation; free answers/skip/reload persist, old route stays display-only, and explicit planning submits only new-city context with failure preservation and successful replacement.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
