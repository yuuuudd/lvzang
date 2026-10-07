import test from 'node:test';
import assert from 'node:assert/strict';
import {detectTravelDayEdit,applyTravelDayEdit,reconcileDayOverrides} from '../public/src/travel-day-edit.js';
import {emptyTravelProfile,updateTravelProfile} from '../public/src/travel-profile.js';
import {buildDailyPlan} from '../public/src/travel-schedule.js';
import {normalizeRequest,planFromCatalog} from '../public/src/travel-domain.js';
const profile=updateTravelProfile(emptyTravelProfile(),{text:'广州三天，每天6小时，两个人，每人全程预算600元，正常节奏，必去广州塔'}).profile;
const base=planFromCatalog(normalizeRequest({description:'广州一天',hours:6}),undefined,{placeIds:['gz-museum','gz-square','gz-tower','gz-opera']});
const plan=buildDailyPlan({...base,mode:'ai',trace:[],stops:base.stops.map(stop=>({...stop,dayIndex:stop.id==='gz-museum'?1:2}))},profile);
const apply=(text,current=plan,prior=profile)=>applyTravelDayEdit({currentPlan:current,profile:prior},detectTravelDayEdit(text));

test('ordinal requests target one day and preserve full-trip profile facts',()=>{
 for(const text of ['第二天少走一点','第2天少走一点','第三天下午只玩2小时']){
  const result=updateTravelProfile(profile,{text,patch:{dayCount:2,dailyHours:2,pace:'easy'}});
  for(const field of ['dayCount','dailyHours','pace','startTime'])assert.deepEqual(result.profile.fields[field],profile.fields[field],text+' must not change global '+field);
 }
 assert.equal(updateTravelProfile(profile,{text:'总共改为2天'}).profile.fields.dayCount.value,2);
 assert.deepEqual(detectTravelDayEdit('第2天只玩2.5小时，下午14:00出发').changes,{hours:2.5,startTime:'14:00'});
 for(const question of ['第二天附近有什么好吃的？','第2天玩2小时够吗','第2天的两小时够吗','第二天去哪里吃','第二天有什么好吃的'])assert.equal(detectTravelDayEdit(question),null,question+' is a question rather than an edit');
 assert.deepEqual(detectTravelDayEdit('第2天下午两点半出发').changes,{startTime:'14:30'});
 assert.deepEqual(detectTravelDayEdit('第2天十二点出发').changes,{startTime:'12:00'});assert.deepEqual(detectTravelDayEdit('第2天只玩2小时，轻松一点').changes,{hours:2,pace:'easy'});
 assert.equal(detectTravelDayEdit('第二天去广州塔').unsupported,true);
 assert.equal(detectTravelDayEdit('第二天轻松一点，第三天紧凑一点').unsupported,true);
});

test('single-day pace reflows only accepted places on that day and keeps its mandatory stop',()=>{
 const before=JSON.stringify({plan,profile}),result=apply('第二天少走一点');
 assert.equal(result.kind,'plan');assert.equal(result.mode,'ai');assert.deepEqual(result.profile,profile);assert.equal(result.days.length,3);
 assert.equal(JSON.stringify(result.days[0]),JSON.stringify(plan.days[0]));assert.equal(JSON.stringify(result.days[2]),JSON.stringify(plan.days[2]));
 assert.ok(result.days[1].stops.length<=2);assert.ok(result.days[1].stops.some(stop=>stop.id==='gz-tower'));
 assert.ok(result.days[1].stops.every(stop=>plan.days[1].stops.some(old=>old.id===stop.id)));assert.equal(result.dayOverrides['2'].pace,'easy');
 assert.equal(JSON.stringify({plan,profile}),before);
});

test('single-day hours and start clock apply locally and impossible edits preserve the previous plan',()=>{
 const result=apply('第二天只玩4小时，下午14:00出发');
 assert.equal(result.kind,'plan');assert.equal(result.days[1].hours,4);assert.equal(result.days[1].startTime,'14:00');assert.equal(result.days[1].stops[0].clockStart,'14:00');assert.equal(result.days[0].hours,6);assert.equal(result.input.dailyHours,6);assert.deepEqual(result.profile,profile);
 const mandatory=updateTravelProfile(profile,{text:'必须去广州大剧院'}).profile,before=JSON.stringify(result),rejected=apply('第二天只玩1小时',result,mandatory);
 assert.equal(rejected.kind,'clarify');assert.match(rejected.assistantReply,/必去|无法|时间/);assert.equal(JSON.stringify(result),before);assert.deepEqual(rejected.profile,mandatory);
 assert.equal(apply('第二天晚上20:00出发').kind,'clarify');
 assert.equal(apply('第4天少走一点').kind,'clarify');assert.equal(apply('第二天下午出发').kind,'clarify');
});

test('budget-only rebuild preserves local overrides; explicit global settings supersede only related overrides',()=>{
 const edited=apply('第二天只玩4小时，下午14:00出发，轻松一点'),budget=updateTravelProfile(profile,{text:'预算改为每人全程500元'}).profile;
 const rebuilt=buildDailyPlan({...edited},budget);assert.deepEqual(rebuilt.dayOverrides,edited.dayOverrides);assert.equal(rebuilt.days[1].hours,4);assert.equal(rebuilt.days[1].startTime,'14:00');assert.ok(rebuilt.days[1].stops.length<=2);assert.equal(rebuilt.input.dailyHours,6);
 assert.deepEqual(reconcileDayOverrides(edited.dayOverrides,['budget'],3),edited.dayOverrides);
 assert.deepEqual(reconcileDayOverrides(edited.dayOverrides,['dailyHours'],3),{'2':{startTime:'14:00',pace:'easy'}});
 assert.deepEqual(reconcileDayOverrides(edited.dayOverrides,['pace','startTime'],3),{'2':{hours:4}});
 assert.deepEqual(reconcileDayOverrides(edited.dayOverrides,['dayCount'],2),{});
});

test('local edit invalidates changed-day guide transport and keeps other days unchanged',()=>{
 const current={...plan,guide:{status:'ready',summary:'旧总览',sources:[],days:plan.days.map(day=>({dayIndex:day.dayIndex,overview:'原每日攻略',stops:day.stops.map(stop=>({stopId:stop.id,name:stop.name,howToPlay:'保留玩法',food:[],highlights:[],transport:'旧交通',sourceIds:[]}))}))}};
 const result=apply('第二天少走一点',current);assert.equal(result.kind,'plan');assert.deepEqual(result.guide.days[0],current.guide.days[0]);assert.deepEqual(result.guide.days[2],current.guide.days[2]);assert.equal(result.guide.days[1].overview,'');assert.ok(result.guide.days[1].stops.every(stop=>!stop.transport));assert.doesNotMatch(result.guide.summary,/旧总览/);
});

test('explicit adult count, no other dietary restrictions and mixed transport remain grounded',()=>{
 const next=updateTravelProfile(emptyTravelProfile(),{text:'广州三天，两位成年人，喜欢粤菜、不吃辣，无其他忌口，步行结合地铁'}).profile;
 assert.equal(next.fields.companions.value.count,2);assert.equal(next.fields.companions.value.adults,2);assert.deepEqual(next.fields.diet.value.restrictions,['辣']);assert.equal(next.fields.transport.value,'mixed');assert.equal(updateTravelProfile(emptyTravelProfile(),{text:'步行+地铁'}).profile.fields.transport.value,'mixed');
 const prior=updateTravelProfile(emptyTravelProfile(),{text:'不吃海鲜'}).profile;
 assert.deepEqual(updateTravelProfile(prior,{text:'无其他忌口'}).profile.fields.diet.value.restrictions,['海鲜']);
 assert.deepEqual(updateTravelProfile(prior,{text:'没有忌口'}).profile.fields.diet.value.restrictions,[]);
});
