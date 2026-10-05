import test from 'node:test';
import assert from 'node:assert/strict';
import { runTripBatch } from '../public/src/trip-batch.js';

test('developer batch makes each memory from its own photo and story, then resumes without duplicate paid tasks',async()=>{
  const records=[],calls=[];
  let designDisconnected=true,pollDisconnected=true;
  const trip={id:'trip-1',place:'青岛',date:'',photos:[{id:'p1',image:'photo-1'},{id:'p2',image:'photo-2'}],memories:[{id:'m1',photoId:'p1',story:'海边吹风'},{id:'m2',photoId:'p2',story:'街上散步'}],painting:{image:'painting',regions:[{memoryId:'m1',visible:true,needsReview:true},{memoryId:'m2',visible:true}]}};
  const api=async(path,body)=>{
    calls.push({path,body});
    if(path==='/api/design'&&designDisconnected){designDisconnected=false;throw new Error('无法连接 DeepSeek，请检查网络后重试');}
    if(path==='/api/artwork/ref-1'&&pollDisconnected){pollDisconnected=false;throw new Error('无法连接 Tripo，请检查网络后重试');}
    if(path==='/api/design')return {design:{caption:'旅行留念',brief:{summary:'留念'}}};
    if(path==='/api/artwork')return {taskId:body.image==='photo-1'?'ref-1':'ref-2'};
    if(path.startsWith('/api/artwork/'))return {status:'success',image:'reference-'+path.at(-1)};
    if(path==='/api/reference-review')return {review:{checks:[{status:'ok'}],suggestion:'无需修订'}};
    if(path==='/api/model')return {taskId:body.image==='reference-1'?'model-1':'model-2'};
    if(path.startsWith('/api/model/'))return {status:'success',glb:'Z2xURg=='};
    if(path==='/api/agent')return {mesh:[0,1,2,3,4,5,6,7,8],exportable:true,settings:body.settings};
    throw new Error(path);
  };
  const history={listHistory:async()=>[...records].reverse(),saveHistory:async record=>{const index=records.findIndex(item=>item.id===record.id);if(index<0)records.push(record);else records[index]=record;}};
  const result=await runTripBatch(trip,'clay',{api,...history});
  assert.equal(result.completed,2);
  assert.deepEqual([...new Set(calls.filter(call=>call.path==='/api/design').map(call=>call.body.story))],['海边吹风','街上散步']);
  assert.ok(calls.filter(call=>call.path==='/api/artwork').every(call=>call.body.style==='clay'));
  assert.equal(records.filter(record=>record.sculpture?.exportable).length,2);
  const paid=calls.filter(call=>call.path==='/api/artwork'||call.path==='/api/model').length;
  assert.equal(paid,4,'transient read failures never resubmit paid tasks');
  await runTripBatch(trip,'clay',{api,...history});
  assert.equal(calls.filter(call=>call.path==='/api/artwork'||call.path==='/api/model').length,paid);
});

test('batch resumes saved image and model task IDs after a page reload',async()=>{
  const trip={id:'trip-2',place:'',date:'',photos:[{id:'p1',image:'photo-1'},{id:'p2',image:'photo-2'}],memories:[{id:'m1',photoId:'p1',story:'第一刻'},{id:'m2',photoId:'p2',story:'第二刻'}],painting:{image:'painting',regions:[{memoryId:'m1',visible:true},{memoryId:'m2',visible:true}]}};
  const base={createdAt:1,design:{caption:'留念'},input:{story:'第一刻',place:'',date:''},settings:{colors:1,widthMm:60},style:'enamel',mode:'tripo3d',presetId:'none',tripId:'trip-2',photo:'photo-1'};
  const records=[{...base,id:'pending-ref',memoryId:'m1',phase:'batch-pending',hidden:true,image:'photo-1',artworkTaskId:'paid-ref'},{...base,id:'pending-model',memoryId:'m2',phase:'reference',hidden:false,image:'reference-2',photo:'photo-2',review:{checks:[]},modelTaskId:'paid-model'}];
  const calls=[];
  const api=async(path,body)=>{
    calls.push(path);
    if(path==='/api/artwork/paid-ref')return {status:'success',image:'reference-1'};
    if(path==='/api/reference-review')return {review:{checks:[]}};
    if(path==='/api/model')return {taskId:'new-model'};
    if(path.startsWith('/api/model/'))return {status:'success',glb:'Z2xURg=='};
    if(path==='/api/agent')return {mesh:[0,1,2,3,4,5,6,7,8],exportable:true,settings:body.settings};
    throw new Error(path);
  };
  const result=await runTripBatch(trip,'enamel',{api,listHistory:async()=>[...records],saveHistory:async record=>{records[records.findIndex(item=>item.id===record.id)]=record;}});
  assert.equal(result.completed,2);
  assert.equal(calls.includes('/api/design'),false);assert.equal(calls.includes('/api/artwork'),false);
  assert.equal(calls.filter(path=>path==='/api/model').length,1,'existing model task is polled, not resubmitted');
});

test('batch does not resubmit a paid task when its first response was lost',async()=>{
  const trip={id:'uncertain',photos:[{id:'p1',image:'photo-1'},{id:'p2',image:'photo-2'}],memories:[{id:'m1',photoId:'p1'},{id:'m2',photoId:'p2'}],painting:{image:'painting',regions:[{memoryId:'m1',visible:true},{memoryId:'m2',visible:true}]}};
  const records=[];let submits=0;
  const deps={api:async path=>{
    if(path==='/api/design')return {design:{caption:'留念',brief:{summary:'照片'}}};
    if(path==='/api/artwork'){submits++;throw new Error('无法连接 Tripo，请检查网络后重试');}
    throw new Error(path);
  },listHistory:async()=>[...records],saveHistory:async record=>{const index=records.findIndex(item=>item.id===record.id);if(index<0)records.push(record);else records[index]=record;}};
  const first=await runTripBatch(trip,'clay',deps);
  assert.equal(first.failed,2);
  const second=await runTripBatch(trip,'clay',deps);
  assert.equal(second.failed,2);
  assert.equal(submits,2,'rerun does not create another task without a confirmed ID');
  assert.match(second.failures[0],/提交结果未确认/);
});

test('batch runs two memories concurrently and starts the next when a slot opens',async()=>{
  const trip={id:'parallel',photos:[1,2,3].map(n=>({id:`p${n}`,image:`photo-${n}`})),memories:[1,2,3].map(n=>({id:`m${n}`,photoId:`p${n}`,story:`记忆 ${n}`})),painting:{image:'painting',regions:[1,2,3].map(n=>({memoryId:`m${n}`,visible:true}))}};
  const records=[],started=[];let releaseFirst,releaseSecond;
  const first=new Promise(resolve=>{releaseFirst=resolve;}),second=new Promise(resolve=>{releaseSecond=resolve;});
  const api=async(path,body)=>{
    if(path==='/api/design'){started.push(body.story);if(body.story==='记忆 1')await first;if(body.story==='记忆 2')await second;return {design:{caption:'留念'}};}
    if(path==='/api/artwork')return {taskId:`ref-${body.image.at(-1)}`};
    if(path.startsWith('/api/artwork/'))return {status:'success',image:`reference-${path.at(-1)}`};
    if(path==='/api/reference-review')return {review:{checks:[]}};
    if(path==='/api/model')return {taskId:`model-${body.image.at(-1)}`};
    if(path.startsWith('/api/model/'))return {status:'success',glb:'Z2xURg=='};
    if(path==='/api/agent')return {exportable:true};
    throw new Error(path);
  };
  const running=runTripBatch(trip,'clay',{api,listHistory:async()=>[...records],saveHistory:async record=>{const index=records.findIndex(item=>item.id===record.id);if(index<0)records.push(record);else records[index]=record;}});
  try{
    await new Promise(resolve=>setTimeout(resolve,30));
    assert.deepEqual(started,['记忆 1','记忆 2']);
    releaseFirst();
    await new Promise(resolve=>setTimeout(resolve,30));
    assert.deepEqual(started,['记忆 1','记忆 2','记忆 3']);
  }finally{releaseFirst();releaseSecond();}
  assert.equal((await running).completed,3);
});
