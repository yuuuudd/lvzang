import test from 'node:test';
import assert from 'node:assert/strict';
import {chatTravel} from '../travel-agent.js';
import {emptyTravelProfile,updateTravelProfile,applyTravelSettings} from '../public/src/travel-profile.js';
import {buildDailyPlan} from '../public/src/travel-schedule.js';
import {normalizeRequest,planFromCatalog} from '../public/src/travel-domain.js';

const profile=updateTravelProfile(emptyTravelProfile(),{text:'广州三天，每天6小时，我们两个人，每人全程预算600元，必去广东省博物馆，不去广州塔，正常节奏'}).profile;
const base={...planFromCatalog(normalizeRequest({description:'广州一天'}),undefined,{placeIds:['gz-museum','gz-square','gz-opera'],title:'广州3天文化漫游'}),kind:'plan',mode:'demo',trace:[]};
const plan=buildDailyPlan(base,profile);
const noModel={fetchImpl:async()=>{throw new Error('settings must not invoke an external model');}};
const change=(settings,current=plan,saved=profile)=>chatTravel({description:'调整行程。',mode:'ai',profile:saved,currentPlan:current,previous:current.input,tripSettings:settings},noModel);

test('explicit settings confirm only submitted fields and reject unrecognized or invalid values',()=>{
  const changed=applyTravelSettings(profile,{dayCount:1,dailyHours:2.5,pace:'easy'});
  assert.deepEqual(changed.changes,['dayCount','dailyHours','pace']);assert.equal(changed.profile.revision,profile.revision+1);
  for(const field of ['destination','budget','companions','requiredPlaces','excludedPlaces','interests','startTime'])assert.deepEqual(changed.profile.fields[field],profile.fields[field]);
  for(const settings of [{},{dayCount:0},{dayCount:8},{dayCount:1.5},{dayCount:'2'},{dailyHours:0.5},{dailyHours:13},{dailyHours:2.2},{dailyHours:Infinity},{pace:'whatever'},{pace:null},{budget:1},[]])assert.throws(()=>applyTravelSettings(profile,settings));
  const draft=emptyTravelProfile();draft.fields.dayCount={value:3,status:'tentative'};
  const partial=applyTravelSettings(draft,{dailyHours:2.5});assert.deepEqual(partial.profile.fields.dayCount,draft.fields.dayCount);assert.equal(partial.profile.fields.pace.status,'missing');
});

test('three old day assignments can shrink to one day and expand again without model extraction',async()=>{
  assert.equal(plan.days.length,3);assert.deepEqual(plan.stops.map(stop=>stop.dayIndex),[1,2,3]);
  const before=JSON.stringify({plan,profile}),one=await change({dayCount:1,dailyHours:2.5,pace:'easy'});
  assert.equal(one.kind,'plan');assert.equal(one.days.length,1);assert.equal(one.days[0].hours,2.5);assert.ok(one.stops.length<=2);assert.ok(one.stops.every(stop=>stop.dayIndex===1));assert.ok(one.stops.some(stop=>stop.id==='gz-museum'));assert.doesNotMatch(one.title,/3天/);
  assert.equal(JSON.stringify({plan,profile}),before);
  for(const field of ['budget','companions','requiredPlaces','excludedPlaces'])assert.deepEqual(one.profile.fields[field],profile.fields[field]);
  const expanded=await change({dayCount:4,dailyHours:4,pace:'active'},one,one.profile);
  assert.equal(expanded.days.length,4);assert.ok(expanded.days.every(day=>day.hours===4));assert.equal(expanded.profile.fields.pace.value,'active');assert.doesNotMatch(expanded.title,/1天/);
  assert.ok(expanded.stops.every(stop=>stop.id!=='gz-tower'));assert.equal(new Set(expanded.stops.map(stop=>stop.id)).size,expanded.stops.length);
});

test('schedule reflow removes previous dates only when explicitly requested',()=>{
  const smaller=applyTravelSettings(profile,{dayCount:1,dailyHours:6,pace:'active'}).profile;
  assert.throws(()=>buildDailyPlan(plan,smaller),/日序号/);
  const flowed=buildDailyPlan(plan,smaller,{reflow:true});assert.equal(flowed.stops.length,3);assert.ok(flowed.stops.every(stop=>stop.dayIndex===1));
});

test('an impossible duration asks about the mandatory stop and does not mutate the previous plan',async()=>{
  const before=JSON.stringify(plan),result=await change({dayCount:1,dailyHours:1});assert.equal(result.kind,'clarify');assert.match(result.assistantReply,/必去.*无法/);assert.equal(result.profile.fields.dailyHours.value,1);assert.equal(JSON.stringify(plan),before);
});

test('same settings produce an answer without new plan, and missing facts remain unconfirmed',async()=>{
  const same=await change({dayCount:3});assert.equal(same.kind,'answer');assert.deepEqual(same.profile,profile);assert.equal(same.stops,undefined);
  const partial=await chatTravel({description:'调整行程。',mode:'ai',profile:emptyTravelProfile(),tripSettings:{dailyHours:2.5,pace:'active'}},noModel);
  assert.equal(partial.kind,'clarify');assert.equal(partial.profile.fields.dayCount.status,'missing');assert.equal(partial.profile.fields.destination.status,'missing');assert.equal(partial.profile.fields.dailyHours.value,2.5);
});

test('suggested city routes also reflow old later-day stops while preserving required places',async()=>{
  const beijing=updateTravelProfile(emptyTravelProfile(),{text:'北京三天，每天4小时，必去景山公园'}).profile;
  const stops=['景山公园','北海公园','天坛公园'].map((name,i)=>({id:`suggested-${i+1}`,name,city:'北京',minutes:40,transit:15,dayIndex:i+1,story:'待核实建议',aliases:[]}));
  const old=buildDailyPlan({...base,city:'北京',title:'北京3天漫游',stops},beijing);
  const result=await change({dayCount:1,pace:'active'},old,beijing);assert.equal(result.kind,'plan');assert.equal(result.stops.length,3);assert.ok(result.stops.every(stop=>stop.dayIndex===1));assert.deepEqual(result.stops.map(stop=>stop.id),stops.map(stop=>stop.id));
});
