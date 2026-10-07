import test from 'node:test';
import assert from 'node:assert/strict';
import {chatTravel} from '../travel-agent.js';
import {emptyTravelProfile,updateTravelProfile} from '../public/src/travel-profile.js';
import {buildDailyPlan} from '../public/src/travel-schedule.js';
import {normalizeRequest,planFromCatalog} from '../public/src/travel-domain.js';
import {initialState,readState,writeState} from '../public/src/travel-state.js';

const profile=updateTravelProfile(emptyTravelProfile(),{text:'广州三天，每天6小时，我们两个人，每人全程预算600元，必去粤博，不去广州塔，正常节奏'}).profile;
const base={...planFromCatalog(normalizeRequest({description:'广州一天'}),undefined,{placeIds:['gz-museum','gz-square','gz-opera'],title:'广州文化漫游'}),kind:'plan',mode:'demo',trace:[]};
const plan=buildDailyPlan(base,profile),forbidModel={fetchImpl:async()=>{throw new Error('explicit membership must not call the model');}};
const edit=(itineraryEdit,current=plan,prior=profile)=>chatTravel({description:'修改行程地点。',mode:'ai',profile:prior,currentPlan:current,previous:current?.input,itineraryEdit},forbidModel);

test('explicit map add and remove preserve unrelated conditions and original plan',async()=>{
 const snapshot=JSON.stringify({profile,plan});
 const added=await edit({action:'add',stopId:'gz-library',stopName:'广州图书馆',dayIndex:1});
 assert.equal(added.kind,'plan');assert.equal(added.days.length,3);assert.ok(added.days[0].stops.some(stop=>stop.id==='gz-library'));assert.equal(added.stops.length,4);
 assert.ok(added.profile.fields.requiredPlaces.value.includes('广州图书馆'));
 for(const field of ['dayCount','dailyHours','budget','companions','pace'])assert.deepEqual(added.profile.fields[field],profile.fields[field]);
 const removed=await edit({action:'remove',stopId:'gz-museum',stopName:'广东省博物馆'},added,added.profile);
 assert.equal(removed.kind,'plan');assert.ok(removed.stops.every(stop=>stop.id!=='gz-museum'));assert.ok(!removed.profile.fields.requiredPlaces.value.includes('粤博'));assert.ok(removed.profile.fields.excludedPlaces.value.includes('广东省博物馆'));
 const restored=await edit({action:'add',stopId:'gz-museum',stopName:'广东省博物馆',dayIndex:2},removed,removed.profile);assert.ok(restored.days[1].stops.some(stop=>stop.id==='gz-museum'));assert.ok(!restored.profile.fields.excludedPlaces.value.includes('广东省博物馆'));assert.equal(JSON.stringify({profile,plan}),snapshot);
});

test('AMap search names are explicit user choices with no client times, sources or coordinates',async()=>{
 const result=await edit({action:'add',stopId:'amap-B001TEST99',stopName:'测试地点',dayIndex:1});
 const stop=result.stops.find(item=>item.id==='amap-B001TEST99');assert.ok(stop);assert.equal(stop.kind,'suggested');assert.equal(stop.coords,null);assert.equal(stop.source,'');assert.equal(stop.minutes,30);assert.match(result.assumptions.join(' '),/30分钟.*估算/);
 for(const invalid of [{action:'add',stopId:'gz-library',stopName:'广州图书馆',minutes:5},{action:'drop',stopId:'gz-library',stopName:'广州图书馆'},{action:'add',stopId:'gz-library',stopName:'伪造同ID名称'},{action:'add',stopId:'gz-library',stopName:'广州图书馆',dayIndex:9},{action:'add',stopId:'amap-!',stopName:'错误地点'}])await assert.rejects(edit(invalid));
});

test('the final stop can be removed while retaining a valid empty daily plan',async()=>{
 const singleProfile=updateTravelProfile(emptyTravelProfile(),{text:'广州一天，每天2小时，必去粤博'}).profile;
 const single=buildDailyPlan({...base,stops:base.stops.filter(stop=>stop.id==='gz-museum')},singleProfile);
 const result=await edit({action:'remove',stopId:'gz-museum',stopName:'广东省博物馆'},single,singleProfile);
 assert.equal(result.status,'ready');assert.equal(result.stops.length,0);assert.equal(result.days.length,1);assert.equal(result.days[0].freeMinutes,120);assert.equal(result.days[0].stops.length,0);
});

test('an addition that exceeds the selected day refuses instead of dropping an accepted stop',async()=>{
 const tight=updateTravelProfile(profile,{text:'每天只有1.5小时，轻松慢游'}).profile;
 const current=buildDailyPlan({...base,stops:base.stops.filter(stop=>stop.id==='gz-museum')},tight);
 await assert.rejects(edit({action:'add',stopId:'gz-library',stopName:'广州图书馆',dayIndex:1},current,tight),/时间|强度|容纳/);
 assert.equal(current.stops.length,1);
});

test('manually added IDs survive refresh, budget-only revisions and later duration replanning',async()=>{
 const added=await edit({action:'add',stopId:'gz-library',stopName:'广州图书馆',dayIndex:1});
 const records=new Map(),storage={getItem:name=>records.get(name)??null,setItem:(name,value)=>records.set(name,value)};
 writeState(storage,{...initialState(),profile:added.profile,plan:added});assert.equal(readState(storage).plan.stops.find(stop=>stop.id==='gz-library').coords,null);
 const budget=await chatTravel({description:'预算改为每人全程500元',mode:'demo',profile:added.profile,currentPlan:added,previous:added.input},forbidModel);assert.equal(budget.kind,'plan');assert.ok(budget.stops.some(stop=>stop.id==='gz-library'));
 const hours=await chatTravel({description:'每天4小时，重新安排路线',mode:'demo',profile:budget.profile,currentPlan:budget,previous:budget.input},forbidModel);assert.equal(hours.kind,'plan');assert.ok(hours.stops.some(stop=>stop.id==='gz-library'));
});

test('editing the duration of an explicitly empty plan does not repopulate it',async()=>{
 let current=plan;
 for(const stop of plan.stops)current=await edit({action:'remove',stopId:stop.id,stopName:stop.name},current,current.profile);
 const changed=await chatTravel({description:'调整行程。',mode:'ai',profile:current.profile,currentPlan:current,previous:current.input,tripSettings:{dayCount:2,dailyHours:4}},forbidModel);
 assert.equal(changed.kind,'plan');assert.equal(changed.days.length,2);assert.equal(changed.stops.length,0);
 const records=new Map(),storage={getItem:name=>records.get(name)??null,setItem:(name,value)=>records.set(name,value)};writeState(storage,{...initialState(),profile:changed.profile,plan:changed});assert.equal(readState(storage).plan.stops.length,0);
});

const withGuide=()=>({...plan,mode:'ai',guide:{status:'ready',summary:'旧总览：先博物馆后广场',generatedAt:'2026-10-07T00:00:00.000Z',sources:plan.stops.map(stop=>({id:'web-'+stop.id,url:'https://www.gz.gov.cn/'+stop.id,title:stop.name,accessStatus:'fetched',fetchedAt:'2026-10-07T00:00:00.000Z',untrusted:true})),days:[...plan.days.map(day=>({dayIndex:day.dayIndex,overview:'旧每日总览 '+day.dayIndex,stops:day.stops.map(stop=>({stopId:stop.id,name:stop.name,howToPlay:stop.name+'保留玩法',highlights:['保留亮点'],food:[{name:'当地小食',note:'具体店家待确认',sourceIds:['web-'+stop.id]}],transport:'旧交通：走到下个地点',reservation:'预约待确认',rainyAlternative:'室内参观',sourceIds:['web-'+stop.id]}))})),{dayIndex:4,overview:'失效日期',stops:[]}]}});

test('membership changes reconcile guide days and stops without presenting old transport or summary as current',async()=>{
 const current=withGuide(),before=JSON.stringify(current);
 const removed=await edit({action:'remove',stopId:'gz-museum',stopName:'广东省博物馆'},current);
 assert.equal(removed.mode,'ai','manual edits preserve the origin mode of the accepted plan');assert.equal(removed.guide.status,'partial');
 assert.equal(removed.guide.days.length,3);assert.deepEqual(removed.guide.days.flatMap(day=>day.stops.map(stop=>stop.stopId)),removed.stops.map(stop=>stop.id));
 assert.doesNotMatch(removed.guide.summary,/旧总览/);assert.ok(removed.guide.days.every(day=>!day.overview));assert.ok(removed.guide.days.flatMap(day=>day.stops).every(stop=>!stop.transport));
 assert.equal(removed.guide.days[0].stops.length,0,'a now-empty day has no stale museum guide');
 const retained=removed.guide.days.flatMap(day=>day.stops).find(stop=>stop.stopId==='gz-square');assert.equal(retained.howToPlay,'花城广场保留玩法');assert.deepEqual(retained.food,current.guide.days[1].stops[0].food);
 assert.ok(!removed.guide.sources.some(source=>source.id==='web-gz-museum'));assert.equal(removed.guide.sources.length,2);assert.equal(removed.guide.sources[0].accessStatus,'fetched');assert.equal(removed.guide.sources[0].fetchedAt,'2026-10-07T00:00:00.000Z');assert.equal(JSON.stringify(current),before);
 const added=await edit({action:'add',stopId:'gz-library',stopName:'广州图书馆',dayIndex:2},removed,removed.profile),detail=added.guide.days[1].stops.find(stop=>stop.stopId==='gz-library');
 assert.equal(added.mode,'ai');assert.match(detail.howToPlay,/待补充/);assert.deepEqual(detail.sourceIds,[]);assert.deepEqual(detail.food,[]);assert.ok(added.guide.days.flatMap(day=>day.stops).every(stop=>!stop.transport));assert.equal(added.guide.sources.length,2);
 const records=new Map(),storage={getItem:name=>records.get(name)??null,setItem:(name,value)=>records.set(name,value)};writeState(storage,{...initialState(),profile:added.profile,plan:added});assert.deepEqual(readState(storage).plan.guide,added.guide);
});

test('membership no-ops retain the accepted plan mode and new guide placeholders do not invent research',async()=>{
 const noop=await edit({action:'add',stopId:'gz-museum',stopName:'广东省博物馆'},withGuide());assert.equal(noop.mode,'ai');
 const added=await edit({action:'add',stopId:'amap-B001GUIDE',stopName:'新增测试地点',dayIndex:2});
 const detail=added.guide.days[1].stops.find(stop=>stop.stopId==='amap-B001GUIDE');assert.match(detail.howToPlay,/待补充/);assert.equal(added.guide.status,'partial');assert.deepEqual(added.guide.sources,[]);
});
