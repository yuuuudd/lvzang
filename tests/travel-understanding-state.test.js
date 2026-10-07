import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,readState,writeState,readTravelChat,writeTravelChat} from '../public/src/travel-state.js';
import {emptyTravelProfile,updateTravelProfile} from '../public/src/travel-profile.js';
import {normalizeRequest,planFromCatalog} from '../public/src/travel-domain.js';
import {buildDailyPlan} from '../public/src/travel-schedule.js';

const storage=()=>{const data=new Map();return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};};
const profile=()=>updateTravelProfile(emptyTravelProfile(),{text:'广州三天，每天4小时，我们三个人，每人全程1000元，必去粤博，不去广州塔'}).profile;
const dailyPlan=()=>buildDailyPlan({...planFromCatalog(normalizeRequest({description:'广州半天，不去广州塔'})),trace:[]},profile());

test('old version 1 plans restore without inventing confirmed requirements from the demo',()=>{
  const store=storage(),old={...initialState(),plan:{...planFromCatalog(normalizeRequest({description:'广州半天'})),trace:[]}};
  delete old.profile;writeState(store,old);
  const restored=readState(store);assert.equal(restored.plan.city,'广州');assert.deepEqual(restored.profile,emptyTravelProfile());
});

test('profile and each daily group survive a roundtrip, while corrupt groups and profiles are rejected',()=>{
  const store=storage(),state={...initialState(),profile:profile(),plan:dailyPlan()};writeState(store,state);
  const restored=readState(store);assert.deepEqual(restored.profile,state.profile);assert.deepEqual(restored.plan.days,state.plan.days);
  assert.equal(restored.plan.days.length,3);assert.equal(new Set(restored.plan.stops.map(stop=>stop.id)).size,restored.plan.stops.length);
  for(const damage of [value=>value.profile=null,value=>value.profile.fields.dayCount.value=8,value=>value.plan.days[0].dayIndex=0,value=>value.plan.days[0].startTime='24:60',value=>value.plan.days[1].stops.push(value.plan.days[0].stops[0]),value=>value.plan.days[0].stops[0].dayIndex=2,value=>value.plan.days[0].freeMinutes=-1]){
    const bad=structuredClone(state);damage(bad);writeState(store,bad);assert.throws(()=>readState(store),/记录/);
  }
});

test('bounded chat saves independently of the exact itinerary bytes and recovers after reload',()=>{
  const store=storage();writeState(store,{...initialState(),profile:profile(),plan:dailyPlan()});const planBytes=store.getItem('lvzang.v1');
  const messages=Array.from({length:15},(_,index)=>({role:index%2?'assistant':'user',content:`第${index}条 `+'x'.repeat(2000)}));
  writeTravelChat(store,messages);const restored=readTravelChat(store);
  assert.equal(restored.length,12);assert.match(restored[0].content,/第3条/);assert.ok(restored.every(message=>message.content.length===2000));assert.equal(store.getItem('lvzang.v1'),planBytes);
  for(const value of [{version:2,messages:[]},{version:1,messages:[{role:'system',content:'instructions'}]},{version:1,messages:[{role:'user',content:'x'.repeat(2001)}]},{version:1,messages:Array.from({length:13},()=>({role:'user',content:'x'}))}]){
    store.setItem('lvzang.chat.v1',JSON.stringify(value));assert.throws(()=>readTravelChat(store),/对话/);
  }
  assert.throws(()=>writeTravelChat({setItem(){throw new Error('quota');}},[{role:'user',content:'保留当前对话'}]),/保存/);
});

test('starting a new planning context survives reload while its previous plan and collection remain',()=>{
  const store=storage(),state={...initialState(),plan:dailyPlan(),profile:emptyTravelProfile(),planningReset:true,collection:[{id:'gz-museum',story:'旧收藏',date:'2026-10-05'}]};writeState(store,state);writeTravelChat(store,[]);
  const restored=readState(store);assert.equal(restored.planningReset,true);assert.deepEqual(restored.profile,emptyTravelProfile());assert.equal(restored.plan.days.length,3);assert.equal(restored.collection[0].story,'旧收藏');assert.deepEqual(readTravelChat(store),[]);
});
