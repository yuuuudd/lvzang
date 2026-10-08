import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyTravelProfile,normalizeTravelProfile,updateTravelProfile,travelProfileInput,travelProfileSummary,travelFollowUps} from '../public/src/travel-profile.js';

test('detailed preferences persist explicitly without replacing budget or companions',()=>{
 const before=updateTravelProfile(emptyTravelProfile(),{text:'广州三天，每天6小时，我们两个人，每人全程600元'}).profile;
 const next=updateTravelProfile(before,{text:'热门和小众都要，喜欢粤菜，不吃海鲜，住在珠江新城，从广州南站出发，以公共交通为主，日期2026-10-10到2026-10-12'}).profile;
 assert.equal(next.fields.crowdPreference.value,'mixed');assert.deepEqual(next.fields.diet.value,{preferences:['粤菜'],restrictions:['海鲜']});assert.equal(next.fields.stayArea.value,'珠江新城');assert.equal(next.fields.startArea.value,'广州南站');assert.equal(next.fields.transport.value,'transit');assert.deepEqual(next.fields.travelDates.value,{start:'2026-10-10',end:'2026-10-12'});
 assert.deepEqual(next.fields.budget,before.fields.budget);assert.deepEqual(next.fields.companions,before.fields.companions);
 const revised=updateTravelProfile(next,{text:'住宿改为天河，口味喜欢清淡'}).profile;assert.deepEqual(revised.fields.diet.value.restrictions,['海鲜']);assert.equal(revised.fields.stayArea.value,'天河');assert.equal(revised.fields.transport.value,'transit');
 assert.equal(travelProfileInput(revised).crowdPreference,'mixed');assert.ok(travelProfileSummary(revised).some(row=>row.label==='饮食偏好'&&row.value.includes('海鲜')));
});

test('old ten-field records gain missing detail fields without confirming assumptions',()=>{
 const old=emptyTravelProfile();for(const field of ['crowdPreference','diet','stayArea','startArea','transport','travelDates'])delete old.fields[field];
 const normalized=normalizeTravelProfile(old);for(const field of ['crowdPreference','diet','stayArea','startArea','transport','travelDates'])assert.equal(normalized.fields[field].status,'missing');
 const invented=updateTravelProfile(normalized,{text:'先看看',patch:{crowdPreference:'niche',diet:{restrictions:['海鲜']},stayArea:'天河',transport:'drive',travelDates:{start:'2026-10-10'}}}).profile;
 for(const field of ['crowdPreference','diet','stayArea','transport','travelDates'])assert.notEqual(invented.fields[field].status,'confirmed');
});

test('detailed follow-ups ask at most three new fields and allow a draft without repeating confirmed answers',()=>{
 let profile=updateTravelProfile(emptyTravelProfile(),{text:'广州两天，每天4小时，我们两个人，喜欢建筑，轻松慢游'}).profile;
 const first=travelFollowUps(profile,{detailed:true});assert.ok(first.length>=2&&first.length<=3);assert.ok(first.every(item=>profile.fields[item.field].status!=='confirmed'));
 profile=updateTravelProfile(profile,{text:'喜欢小众，没有饮食禁忌，住宿未定，从广州南站出发，打车为主，日期还没定'}).profile;
 assert.equal(profile.fields.stayArea.value,'未定');assert.deepEqual(profile.fields.travelDates.value,{start:null,end:null});
 const next=travelFollowUps(profile,{detailed:true});assert.ok(next.every(item=>profile.fields[item.field].status!=='confirmed'));assert.deepEqual(travelFollowUps(profile,{detailed:true,allowDefaults:true}),[]);
});

test('detail normalization rejects invalid dates, unsupported enums and overlong text',()=>{
 for(const patch of [{travelDates:{start:'2026-02-30'}},{travelDates:{start:'2026-10-12',end:'2026-10-10'}},{crowdPreference:'random'},{transport:'teleport'},{stayArea:'x'.repeat(81)},{diet:{allergies:['x']}}])assert.throws(()=>updateTravelProfile(emptyTravelProfile(),{text:'先看看',patch}));
});

test('calendar dates are not trip duration and departure clocks are not locations',()=>{
 const before=updateTravelProfile(emptyTravelProfile(),{text:'广州三天，每天6小时，住在天河，从广州南站出发'}).profile;
 const dated=updateTravelProfile(before,{text:'旅行日期2026年10月10日到2026年10月12日，从早上9点出发'}).profile;
 assert.equal(dated.fields.dayCount.value,3);assert.equal(dated.fields.startArea.value,'广州南站');assert.equal(dated.fields.travelDates.value.start,'2026-10-10');
 const moved=updateTravelProfile(dated,{text:'换成北京'}).profile;assert.equal(moved.fields.stayArea.status,'missing');assert.equal(moved.fields.startArea.status,'missing');
});

test('model diet proposals cannot invent an absence of restrictions or turn a preference into an allergy',()=>{
 const unknown=updateTravelProfile(emptyTravelProfile(),{text:'先看看',patch:{diet:{preferences:[],restrictions:[]}}}).profile;assert.notEqual(unknown.fields.diet.status,'confirmed');
 const preference=updateTravelProfile(emptyTravelProfile(),{text:'喜欢海鲜',patch:{diet:{restrictions:['海鲜']}}}).profile;assert.deepEqual(preference.fields.diet.value,{preferences:['海鲜'],restrictions:null});
});

test('detailed interview asks about must-go exclusions budget and pace, and explicit empty answers stop repetition',()=>{
 let profile=updateTravelProfile(emptyTravelProfile(),{text:'广州两天，每天4小时，我们两个人，喜欢建筑，喜欢小众'}).profile;
 assert.deepEqual(travelFollowUps(profile,{detailed:true}).map(item=>item.field),['requiredPlaces','excludedPlaces','budget']);
 profile=updateTravelProfile(profile,{text:'没有特别必去的地方，没有要避开的地方，预算不限'}).profile;
 assert.deepEqual(profile.fields.requiredPlaces,{value:[],status:'confirmed'});assert.deepEqual(profile.fields.excludedPlaces,{value:[],status:'confirmed'});
 assert.ok(travelFollowUps(profile,{detailed:true}).every(item=>!['requiredPlaces','excludedPlaces','budget'].includes(item.field)));
 assert.ok(travelFollowUps(profile,{detailed:true}).some(item=>item.field==='pace'));
});

test('food preferences do not silently confirm no restrictions and later explicit no restrictions clears the follow-up',()=>{
 let profile=updateTravelProfile(emptyTravelProfile(),{text:'广州一天，每天4小时，我们两个人，喜欢建筑，喜欢小众，没有必去地点，没有排除地点，预算不限，轻松慢游，喜欢粤菜'}).profile;
 assert.equal(profile.fields.diet.value.restrictions,null);
 assert.ok(travelProfileSummary(profile).find(item=>item.label==='饮食偏好').value.includes('未记录忌口'));
 assert.ok(travelFollowUps(profile,{detailed:true}).some(item=>item.field==='diet'));
 profile=updateTravelProfile(profile,{text:'没忌口'}).profile;
 assert.deepEqual(profile.fields.diet.value.restrictions,[]);assert.ok(!travelFollowUps(profile,{detailed:true}).some(item=>item.field==='diet'));
});
