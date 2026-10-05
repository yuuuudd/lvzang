import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRequest,planFromCatalog} from '../public/src/travel-domain.js';
import {planTravel} from '../travel-agent.js';
import {createApp} from '../server.js';

test('chat revisions preserve constraints, parse budget/time and respect retained or removed places',()=>{
  const previous=normalizeRequest({description:'苏州一天，喜欢文化建筑，预算500元，必须去苏博'});
  const next=normalizeRequest({description:'下午只有4小时，预算改成300元，想少走路，保留苏州博物馆',previous,textRevision:true});
  assert.equal(next.budget,'300元');assert.equal(next.startTime,'13:00');assert.equal(next.hours,4);assert.ok(next.requiredIds.includes('sz-museum'));
  assert.ok(planFromCatalog(next).stops.some(p=>p.id==='sz-museum'));
  const removed=normalizeRequest({description:'不去博物馆，改去平江路',previous:next,textRevision:true});
  assert.ok(removed.excludedIds.includes('sz-museum'));assert.ok(!planFromCatalog(removed).stops.some(p=>p.id==='sz-museum'));
});
test('actual Agent stages emit started/completed and constraint patches before the route resolves',async()=>{
  const events=[];let count=0;
  const result=await planTravel({description:'苏州半天，预算降到300元',mode:'ai'},{key:'test',model:'test',onProgress:event=>events.push(event),fetchImpl:async()=>Response.json({choices:[{message:{content:JSON.stringify(++count===1?{summary:'整理资料'}:count===2?{placeIds:['sz-museum','sz-pingjiang'],reason:'符合需求',constraints:{budget:'300元'},reply:'我把预算设为300元，并保留文化建筑路线。'}:{placeIds:['sz-museum','sz-pingjiang'],title:'古城慢游',reason:'留出转场时间'})}}]})});
  assert.ok(events.some(e=>e.type==='stage'&&e.status==='working'));
  assert.ok(events.some(e=>e.type==='constraints'&&e.input.budget==='300元'));
  assert.equal(events.filter(e=>e.type==='stage'&&e.status==='complete').length,4);
  assert.match(result.assistantReply,/300/);
});
test('stream endpoint emits newline-delimited events and returns validated final result',async()=>{
  const server=createApp({key:''});await new Promise(r=>server.listen(0,'127.0.0.1',r));const root=`http://127.0.0.1:${server.address().port}`;
  try{
    const res=await fetch(root+'/api/travel-plan/stream',{method:'POST',headers:{Origin:root,'Content-Type':'application/json'},body:JSON.stringify({description:'苏州半天，预算300元',mode:'demo'})});
    assert.equal(res.status,200);assert.match(res.headers.get('content-type'),/ndjson/);const events=(await res.text()).trim().split('\n').map(JSON.parse);assert.equal(events.at(-1).type,'result');assert.equal(events.at(-1).plan.input.budget,'300元');assert.ok(events.some(e=>e.type==='constraints'));
  }finally{await new Promise(r=>server.close(r));}
});
test('model constraints cannot override explicit user limits or remove retained/excluded places',async()=>{
  let calls=0;const plan=await planTravel({description:'广州只有2小时，预算100元，不去广州塔，必须去广东省博物馆',mode:'ai'},{key:'test',fetchImpl:async()=>Response.json({choices:[{message:{content:JSON.stringify(++calls===1?{summary:'资料'}:calls===2?{placeIds:['gz-tower'],constraints:{hours:8,budget:'999元',requiredIds:[],excludedIds:[]}}:{placeIds:['gz-tower'],title:'广州路线'})}}]})});
  assert.equal(plan.input.hours,2);assert.equal(plan.input.budget,'100元');assert.ok(plan.stops.some(p=>p.id==='gz-museum'));assert.ok(!plan.stops.some(p=>p.id==='gz-tower'));
});
test('no feasible stops does not report a ready itinerary or completed stages',async()=>{
  const events=[];const plan=await planTravel({description:'广州1小时，不去花城广场和广州塔和广州大剧院',mode:'demo'},{onProgress:e=>events.push(e)});
  assert.notEqual(plan.status,'ready');assert.ok(plan.assumptions.some(t=>/时间|地点/.test(t)));assert.equal(events.filter(e=>e.type==='stage'&&e.status==='complete').length,0);
});
test('stopping an Agent request aborts its active model call and does not start later stages',async()=>{
  const controller=new AbortController();let calls=0;let started;const gate=new Promise(r=>started=r);
  const pending=planTravel({description:'广州半天',mode:'ai'},{key:'test',signal:controller.signal,fetchImpl:async(_url,options)=>{calls++;started();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('取消没有传到上游')),80);options.signal.addEventListener('abort',()=>{clearTimeout(timer);reject(options.signal.reason);},{once:true});});}});
  await gate;controller.abort();await assert.rejects(pending,{name:'AbortError'});assert.equal(calls,1);
});
test('budget reduction wording and previously required places survive conflicting model proposals',async()=>{
  let calls=0;const previous=normalizeRequest({description:'广州半天，必须去粤博，预算500元'});
  const plan=await planTravel({description:'预算降到300元',previous,mode:'ai'},{key:'test',fetchImpl:async()=>Response.json({choices:[{message:{content:JSON.stringify(++calls===1?{summary:'资料'}:calls===2?{placeIds:['gz-tower'],constraints:{budget:'999元',excludedIds:['gz-museum']}}:{placeIds:['gz-tower'],title:'广州路线'})}}]})});
  assert.equal(plan.input.budget,'300元');assert.ok(plan.stops.some(p=>p.id==='gz-museum'));assert.ok(!plan.input.excludedIds.includes('gz-museum'));
});
