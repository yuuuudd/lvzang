import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRequest, analyzeNotes, planFromCatalog } from '../public/src/travel-domain.js';
import { planTravel } from '../travel-agent.js';
import { createApp } from '../server.js';

test('empty input offers honest defaults and explicit destinations never silently change', () => {
  const empty=planFromCatalog(normalizeRequest({}));
  assert.equal(empty.city,'苏州');
  assert.ok(empty.assumptions.length);
  const hz=planFromCatalog(normalizeRequest({description:'杭州半天，喜欢手作'}));
  assert.equal(hz.city,'杭州');
  assert.ok(hz.stops.every(p=>p.city==='杭州'));
  assert.equal(planFromCatalog(normalizeRequest({destination:'北京'})).status,'needs-destination');
});
test('revisions preserve constraints but overwrite the changed duration and reduce visits', () => {
  const previous=normalizeRequest({description:'苏州一天，喜欢园林'});
  const next=normalizeRequest({description:'只有两小时，少走路',previous});
  assert.equal(next.destination,'苏州');
  assert.equal(next.hours,2);
  assert.equal(next.easy,true);
  const plan=planFromCatalog(next);
  assert.ok(plan.stops.length<planFromCatalog(previous).stops.length);
  assert.ok(plan.totalMinutes<=120);
  assert.match(plan.transport,/公共交通/);
});
test('notes merge aliases while preserving independent source evidence and unmatched places', () => {
  const analysis=analyzeNotes([{id:'n1',title:'游记',content:'平江路很好，苏州博物馆记得预约',url:'https://example.com/a'},
    {id:'n2',title:'另一篇',content:'平江历史街区周末人多。另有无名小店'}]);
  const pg=analysis.places.find(p=>p.id==='sz-pingjiang');
  assert.deepEqual(pg.evidence.map(e=>e.noteId),['n1','n2']);
  assert.ok(analysis.findings.length>=2);
  assert.equal(analysis.notes[0].url,'https://example.com/a');
});
test('latest text changes override stale form values only when marked as textual revision',()=>{
  const input=normalizeRequest({description:'改成杭州两小时，喜欢手作',destination:'苏州',hours:8,textRevision:true});
  assert.equal(input.destination,'杭州');assert.equal(input.hours,2);
  const manual=normalizeRequest({description:'苏州半天',destination:'杭州',hours:8});assert.equal(manual.destination,'杭州');assert.equal(manual.hours,8);
});
test('AI orchestration makes distinct calls and rejects fabricated place IDs', async () => {
  const calls=[];
  const options={key:'test',model:'test-model',fetchImpl:async(_url,init)=>{
    const body=JSON.parse(init.body);calls.push(body.messages[0].content);
    const payload=calls.length===1?{summary:'资料已整理'}:calls.length===2?{placeIds:['sz-pingjiang','sz-museum'],reason:'符合文化兴趣'}:{placeIds:['sz-pingjiang','sz-museum'],title:'古城半日',reason:'留出交通时间'};
    return Response.json({choices:[{message:{content:JSON.stringify(payload)}}]});
  }};
  const result=await planTravel({description:'苏州半天',mode:'ai'},options);
  assert.equal(calls.length,3);assert.equal(result.mode,'ai');assert.equal(result.trace.length,4);
  assert.equal(new Set(calls).size,3);
  await assert.rejects(()=>planTravel({mode:'ai'},{...options,fetchImpl:async()=>Response.json({choices:[{message:{content:'{"placeIds":["fabricated"]}'}}]})}),/地点|格式/);
  await assert.rejects(()=>planTravel({mode:'ai'},{key:''}),/配置/);
});
test('API rejects cross-origin and invalid input; serves travel without breaking original page', async () => {
  const server=createApp({key:''});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const root=`http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(root+'/travel.html')).status,200);
    assert.equal((await fetch(root+'/')).status,200);
    assert.equal((await fetch(root+'/api/travel-plan',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
    const post=body=>fetch(root+'/api/travel-plan',{method:'POST',headers:{Origin:root,'Content-Type':'application/json'},body:JSON.stringify(body)});
    assert.equal((await post({notes:'bad'})).status,400);
    assert.equal((await post({description:'x'.repeat(3000)})).status,400);
    const good=await post({description:'苏州半天',mode:'demo'});assert.equal(good.status,200);
    assert.equal((await good.json()).mode,'demo');
    assert.equal((await post({notes:Array.from({length:8},(_,i)=>({title:`攻略${i}`,content:'苏州'.repeat(3000)}))})).status,200);
  } finally {await new Promise(r=>server.close(r));}
});
test('coordinator makes adjusted model proposals explicit rather than describing rejected stops as final',async()=>{
  let stage=0;const ids=['sz-garden','sz-museum','sz-pingjiang'];
  const result=await planTravel({description:'苏州半天，少走路',mode:'ai'},{key:'test',model:'test',fetchImpl:async()=>Response.json({choices:[{message:{content:JSON.stringify(++stage===1?{summary:'资料整理'}:{placeIds:ids,title:'苏州慢游',reason:'三个候选地点'})}}]})});
  assert.equal(result.stops.length,2);assert.match(result.changeSummary,/3.*2/);assert.match(result.trace[2].detail,/原始提案/);assert.match(result.trace[3].detail,/2 个/);
});
