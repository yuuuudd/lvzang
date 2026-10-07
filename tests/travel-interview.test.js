import test from 'node:test';
import assert from 'node:assert/strict';
import {chatTravel} from '../travel-agent.js';
import {handleTravelInterview} from '../travel-interview.js';
import {emptyTravelProfile,normalizeTravelProfile,updateTravelProfile,TRAVEL_INTERVIEW_TOPICS} from '../public/src/travel-profile.js';
import {buildDailyPlan} from '../public/src/travel-schedule.js';
import {normalizeRequest,planFromCatalog} from '../public/src/travel-domain.js';

const noModel={advisorEnabled:true,key:'fixture',fetchImpl:async()=>{throw Error('Plain interview answers must not call the model');}};
const values={destination:'广州',travelDates:'2026年11月1日到11月3日',dayCount:'3',dailyHours:'4',startTime:'早上9点',companions:'2个成年人，没有老人小孩',budget:'每人全程1000元',crowdPreference:'热门小众都想去',interests:'美食，建筑，拍照',requiredPlaces:'很想去广东省博物馆',excludedPlaces:'不去广州塔',pace:'轻松慢游',diet:'不吃辣，没有过敏',stayArea:'天河区',startArea:'体育西路',transport:'地铁和步行'};
const call=(profile,description,interviewAction,extra={},options=noModel)=>chatTravel({profile,description,mode:'ai',textRevision:true,...(interviewAction?{interviewAction}:{}),...extra},options);
const atTopic=topic=>({...emptyTravelProfile(),interview:{status:'active',topic,skipped:TRAVEL_INTERVIEW_TOPICS.slice(0,TRAVEL_INTERVIEW_TOPICS.indexOf(topic))},followUps:[{field:topic,question:'当前问题？'}]});
function savedTrip(){const profile=updateTravelProfile(emptyTravelProfile(),{text:'广州3天，每天4小时，正常节奏'}).profile;return buildDailyPlan({...planFromCatalog(normalizeRequest({destination:'广州',hours:4}),undefined,{placeIds:['gz-museum','gz-square','gz-opera']}),mode:'demo',trace:[]},profile);}
async function fullInterview(){let result=await call(emptyTravelProfile(),'开始完整问答','start');const seen=[];while(result.profile.interview.status==='active'){const topic=result.profile.interview.topic;assert.ok(!seen.includes(topic),`Answer did not advance ${topic}`);seen.push(topic);result=await call(result.profile,values[topic]);}return {result,seen};}

test('all sixteen themes proceed locally one at a time and persist to ready without planning',async()=>{
  const {result,seen}=await fullInterview();assert.deepEqual(seen,TRAVEL_INTERVIEW_TOPICS);assert.equal(result.kind,'clarify');assert.equal(result.stops,undefined);assert.equal(result.profile.interview.status,'ready');assert.equal(result.profile.interview.step,16);assert.deepEqual(result.followUps,[]);
  assert.match(result.assistantReply,/开始规划/);assert.deepEqual(normalizeTravelProfile(JSON.parse(JSON.stringify(result.profile))),result.profile);
  assert.deepEqual(result.profile.fields.travelDates.value,{start:'2026-11-01',end:'2026-11-03'});assert.ok(result.profile.fields.interests.value.includes('建筑'));assert.equal(result.profile.fields.companions.value.count,2);
});

test('unknown skip, pause and resume retain progress without inventing confirmed facts',async()=>{
  let result=await call(emptyTravelProfile(),'开始完整问答','start');result=await call(result.profile,'还没确定');assert.equal(result.profile.fields.destination.status,'missing');assert.deepEqual(result.profile.interview.skipped,['destination']);assert.equal(result.profile.interview.topic,'travelDates');
  result=await call(result.profile,'','pause');assert.equal(result.profile.interview.status,'paused');assert.deepEqual(result.profile.followUps,[]);assert.equal(handleTravelInterview({profile:result.profile,description:'预算改成每人全程500元'}),null);
  result=await call(normalizeTravelProfile(result.profile),'','resume');assert.equal(result.profile.interview.topic,'travelDates');assert.equal(result.followUps.length,1);
  const needed=await call(result.profile,'开始规划','plan');assert.equal(needed.profile.interview.topic,'destination');assert.match(needed.assistantReply,/必要条件/);assert.equal(needed.stops,undefined);
});

test('a duration answer to calendar dates acknowledges even the same confirmed duration and defers only dates',async()=>{
  const profile=updateTravelProfile(emptyTravelProfile(),{text:'广州3天，每天4小时'}).profile;
  for(const [text,days] of [['3天',3],['玩两天',2]]){
    const start=await call(profile,'开始完整问答','start');assert.equal(start.profile.interview.topic,'travelDates');
    const result=await call(start.profile,text);
    assert.equal(result.profile.fields.dayCount.value,days);assert.equal(result.profile.fields.dayCount.status,'confirmed');
    assert.deepEqual(result.profile.fields.travelDates,{value:null,status:'missing'});assert.ok(result.profile.interview.skipped.includes('travelDates'));
    assert.equal(result.profile.interview.topic,'startTime');assert.match(result.assistantReply,new RegExp(`已记下.*${days}天.*具体日期.*待补充`));assert.equal(result.stops,undefined);
  }
  const start=await call(profile,'开始完整问答','start');
  const dated=await call(start.profile,'2026年11月1日到11月3日，玩3天');
  assert.deepEqual(dated.profile.fields.travelDates.value,{start:'2026-11-01',end:'2026-11-03'});assert.ok(!dated.profile.interview.skipped.includes('travelDates'));
  const vague=await call(start.profile,'随便看看');assert.equal(vague.profile.interview.topic,'travelDates');assert.ok(!vague.profile.interview.skipped.includes('travelDates'));
});

test('partial and repeated budget amounts are acknowledged before asking only the missing basis',async()=>{
  let result=await call(atTopic('budget'),'500');assert.equal(result.profile.interview.topic,'budget');assert.match(result.assistantReply,/已记下预算500元/);assert.match(result.followUps[0].question,/每人还是全团、全程还是每天/);
  result=await call(result.profile,'500');assert.match(result.assistantReply,/已记下预算500元/);assert.doesNotMatch(result.assistantReply,/没有足够明确/);
  result=await call(result.profile,'每人');assert.equal(result.profile.interview.topic,'budget');assert.equal(result.profile.fields.budget.value.scope,'per-person');assert.match(result.followUps[0].question,/全程还是每天/);assert.doesNotMatch(result.followUps[0].question,/每人还是全团/);
  result=await call(result.profile,'全程');assert.equal(result.profile.interview.topic,'crowdPreference');assert.equal(result.profile.fields.budget.value.period,'trip');
  result=await call(atTopic('budget'),'每人全程');assert.equal(result.profile.interview.topic,'budget');assert.match(result.assistantReply,/已记下.*每人.*全程/);assert.match(result.followUps[0].question,/预算金额/);assert.doesNotMatch(result.followUps[0].question,/每人还是全团|全程还是每天/);
  result=await call(result.profile,'每人全程');assert.match(result.assistantReply,/已记下.*每人.*全程/);assert.doesNotMatch(result.assistantReply,/没有足够明确/);
  result=await call(result.profile,'500');assert.equal(result.profile.interview.topic,'crowdPreference');assert.equal(result.profile.fields.budget.value.amount,500);assert.equal(result.profile.fields.budget.value.scope,'per-person');assert.equal(result.profile.fields.budget.value.period,'trip');
});

test('one response records multiple conditions and corrections while leaving the accepted route intact',async()=>{
  const plan=savedTrip(),snapshot=JSON.stringify(plan);let result=await call(plan.profile,'','start',{currentPlan:plan});
  result=await call(result.profile,'改成广州两天，每天3小时，我们2人，喜欢小众，喜欢建筑，不吃辣',undefined,{currentPlan:plan});
  assert.equal(result.profile.fields.dayCount.value,2);assert.equal(result.profile.fields.dailyHours.value,3);assert.equal(result.profile.fields.crowdPreference.value,'niche');assert.deepEqual(result.profile.fields.diet.value.restrictions,['辣']);assert.equal(result.profile.interview.topic,'travelDates');assert.equal(JSON.stringify(plan),snapshot);assert.equal(result.stops,undefined);
});

test('ordinary questions including an introduction do not become preferences or consume the current theme',async()=>{
  for(const text of ['附近哪里好吃？','介绍一下粤博']){
    const profile=atTopic('interests');assert.equal(handleTravelInterview({profile,description:text}),null);
    const result=await call(profile,text,undefined,{}, {...noModel,fetchImpl:async()=>Response.json({choices:[{message:{content:JSON.stringify({intent:'answer',reply:'可以先了解粤博展览内容，具体开放信息待核实。',sourceIds:[]})}}]})});
    assert.equal(result.kind,'answer');assert.equal(result.profile.interview.topic,'interests');assert.equal(result.profile.fields.interests.status,'missing');assert.equal(result.profile.followUps.length,1);
  }
});

test('free text interests and meals are remembered, and unrelated additions do not answer the current theme',async()=>{
  for(const text of ['美食，建筑，拍照','美食、建筑都喜欢']){const result=await call(atTopic('interests'),text);assert.ok(result.profile.fields.interests.value.includes('建筑'));assert.notEqual(result.profile.interview.topic,'interests');}
  let result=await call(atTopic('diet'),'想吃早茶');assert.ok(result.profile.fields.diet.value.preferences.includes('早茶'));assert.equal(result.profile.fields.diet.value.restrictions,null);assert.equal(result.profile.interview.topic,'diet');
  result=await call(result.profile,'没有忌口');assert.deepEqual(result.profile.fields.diet.value.restrictions,[]);assert.notEqual(result.profile.interview.topic,'diet');
  result=await call(atTopic('stayArea'),'再加上天环');assert.ok(result.profile.fields.requiredPlaces.value.includes('天环'));assert.equal(result.profile.fields.stayArea.status,'missing');assert.equal(result.profile.interview.topic,'stayArea');
});

test('ready accepts added and repeated requirements without generating a route, completed is free conversation',async()=>{
  const {result}=await fullInterview(),plan=savedTrip(),before=JSON.stringify(plan);
  let added=await call(result.profile,'再补充一下，还想去天环，预算改为每人全程900元',undefined,{currentPlan:plan});assert.equal(added.profile.interview.status,'ready');assert.ok(added.profile.fields.requiredPlaces.value.includes('天环'));assert.equal(added.profile.fields.budget.value.amount,900);assert.equal(added.stops,undefined);
  added=await call(added.profile,'预算改为每人全程900元',undefined,{currentPlan:plan});assert.equal(added.profile.interview.status,'ready');assert.equal(added.stops,undefined);assert.equal(JSON.stringify(plan),before);
  const completed=normalizeTravelProfile({...added.profile,interview:{...added.profile.interview,status:'completed'}});assert.equal(handleTravelInterview({profile:completed,description:'补充餐饮攻略'}),null);
});

test('budget basis remains one topic until explicit and invalid answers preserve the previous facts',async()=>{
  let result=await call(atTopic('budget'),'500');assert.equal(result.profile.interview.topic,'budget');assert.equal(result.profile.fields.budget.value.scope,'unknown');
  result=await call(result.profile,'每人全程');assert.equal(result.profile.fields.budget.value.scope,'per-person');assert.equal(result.profile.fields.budget.value.period,'trip');assert.notEqual(result.profile.interview.topic,'budget');
  const profile=atTopic('dailyHours'),failed=await call(profile,'每天25小时');assert.equal(failed.profile.fields.dailyHours.status,'missing');assert.equal(failed.profile.interview.topic,'dailyHours');assert.match(failed.assistantReply,/还没记下/);
  assert.throws(()=>normalizeTravelProfile({...emptyTravelProfile(),interview:{status:'active',topic:'key',skipped:[]}}));
});

test('map membership and form settings retain the active interview and current question',async()=>{
  const plan=savedTrip(),start=await call(plan.profile,'','start',{currentPlan:plan});
  const changed=await call(start.profile,'修改设置',undefined,{currentPlan:plan,tripSettings:{dailyHours:5}});assert.equal(changed.kind,'plan');assert.equal(changed.profile.interview.status,'active');assert.equal(changed.profile.interview.topic,'travelDates');assert.equal(changed.profile.followUps.length,1);
  const added=await call(changed.profile,'修改地点',undefined,{currentPlan:changed,itineraryEdit:{action:'add',stopId:'gz-library',stopName:'广州图书馆',dayIndex:1}});assert.equal(added.kind,'plan');assert.equal(added.profile.interview.topic,'travelDates');assert.equal(added.profile.followUps[0].field,'travelDates');
});

test('an explicit plan uses cumulative interview changes; capacity clarification is resumable',async()=>{
  const plan=savedTrip(),profile=updateTravelProfile(plan.profile,{text:'改成1天，每天2小时，正常节奏'}).profile;
  profile.interview={status:'ready',topic:null,skipped:[]};profile.followUps=[];
  const revised=await call(profile,'开始规划','plan',{currentPlan:plan,mode:'demo'});assert.equal(revised.kind,'plan');assert.equal(revised.days.length,1);assert.equal(revised.profile.interview.status,'completed');
  const impossible=updateTravelProfile(emptyTravelProfile(),{text:'广州1天，每天1小时，必去广东省博物馆、广州塔'}).profile;impossible.interview={status:'ready',topic:null,skipped:[]};
  const failed=await call(impossible,'开始规划','plan',{mode:'demo'});assert.equal(failed.kind,'clarify');assert.equal(failed.profile.interview.status,'active');assert.equal(normalizeTravelProfile(failed.profile).followUps.length,1);
  const retry=await call(failed.profile,'每天8小时');assert.equal(retry.profile.fields.dailyHours.value,8);assert.equal(retry.stops,undefined);
});
