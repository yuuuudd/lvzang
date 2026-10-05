import test from 'node:test';
import assert from 'node:assert/strict';
import { startModel, readModel, decideRepair, planScene } from '../cloud3d.js';

const image='data:image/png;base64,iVBORw0KGgo=';
const task=data=>Response.json({code:0,data});
const completion=data=>Response.json({choices:[{message:{content:JSON.stringify(data)}}]});
const glb=Buffer.alloc(20);glb.write('glTF');glb.writeUInt32LE(2,4);glb.writeUInt32LE(20,8);glb.writeUInt32LE(0x4e4f534a,16);

test('cloud manufacturing uploads an image with color texture even for white print settings',async()=>{
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/upload/sts'))return task({image_token:'image-token'});
    if(url.endsWith('/task'))return task({task_id:'task-1'});
    if(url.includes('/task/'))return task({status:'success',progress:100,output:{model:'https://cdn.tripo3d.ai/model.glb'}});
    return new Response(glb);
  };
  assert.equal(await startModel({image},{key:'x',fetchImpl}),'task-1');
  assert.deepEqual(JSON.parse(calls[1].options.body),{type:'image_to_model',model_version:'v3.1-20260211',file:{type:'png',file_token:'image-token'},texture:true,pbr:false,export_uv:true,face_limit:100000});
  const result=await readModel('task-1',{key:'x',fetchImpl});
  assert.deepEqual(result,{status:'success',progress:100,glb});
  const status=await readModel('task-1',{key:'x',fetchImpl:async url=>{assert.ok(url.includes('/task/'));return task({status:'success',progress:100});},download:false});
  assert.deepEqual(status,{status:'success',progress:100});
  assert.equal(calls.at(-1).options.headers,undefined);
  assert.equal(calls.at(-1).options.redirect,'error');
});

test('cloud refuses malformed inputs before submitting and rejects unknown upstream states',async()=>{
  const fetchImpl=async()=>{throw new Error('must not fetch');};
  await assert.rejects(startModel({image},{key:'',fetchImpl}),/TRIPO_API_KEY/);
  for(const invalid of [null,'data:image/png;base64,AAAA','data:image/png;base64,'+'A'.repeat(2800000)])await assert.rejects(startModel({image:invalid},{key:'x',fetchImpl}),/图片/);
  await assert.rejects(readModel('../other',{key:'x',fetchImpl}),/编号/);
  await assert.rejects(readModel('id',{key:'x',fetchImpl:async()=>task({status:'surprise'})}),/未知.*状态/);
  assert.deepEqual(await readModel('id',{key:'x',fetchImpl:async()=>task({status:'running',progress:140})}),{status:'running',progress:100});
  assert.deepEqual(await readModel('id',{key:'x',fetchImpl:async()=>task({status:'banned'})}),{status:'failed',progress:0});
});

test('multicolor generation requests real texture and UV data',async()=>{
  let sent;
  await startModel({image,settings:{colors:4}},{key:'x',fetchImpl:async(url,options)=>{
    if(url.endsWith('/upload/sts'))return task({image_token:'token'});
    sent=JSON.parse(options.body);return task({task_id:'colored'});
  }});
  assert.equal(sent.texture,true);assert.equal(sent.export_uv,true);assert.equal(sent.pbr,false);
});

test('cloud rejects hostile asset URLs, invalid GLB and oversized downloads',async()=>{
  for(const url of ['http://127.0.0.1/file','https://tripo3d.ai.evil.test/file','https://user:pass@cdn.tripo3d.ai/file','https://cdn.tripo3d.ai:8080/file']){
    await assert.rejects(readModel('id',{key:'x',fetchImpl:async()=>task({status:'success',output:{model:url}})}),/结果地址/);
  }
  const download=asset=>async url=>url.includes('/task/')?task({status:'success',output:{model:'https://cdn.tripo3d.ai/a.glb'}}):asset;
  await assert.rejects(readModel('id',{key:'x',fetchImpl:download(new Response('not glb'))}),/GLB/);
  await assert.rejects(readModel('id',{key:'x',fetchImpl:download(new Response(glb,{headers:{'Content-Length':'40000001'}}))}),/过大/);
  const truncated=Buffer.from(glb);truncated.writeUInt32LE(24,8);
  await assert.rejects(readModel('id',{key:'x',fetchImpl:download(new Response(truncated))}),/GLB/);
});

test('repair decision uses measured findings, validates actions and has no missing-key fallback',async()=>{
  const body={report:{source:'parametric',componentCount:2,checks:[{name:'connected',status:'fail',detail:'2 connected components'}]},input:{story:'同行'},settings:{},scene:{people:2,archCount:3,detail:'simple'},round:0};
  let sent;
  const result=await decideRepair(body,{key:'x',fetchImpl:async(url,options)=>{assert.equal(url,'https://api.deepseek.com/chat/completions');sent=JSON.parse(options.body);return completion({action:'strengthen',reason:'检测到两个连通部分，尝试加厚连接。'});}});
  assert.equal(result.action,'strengthen');assert.match(sent.messages[1].content,/componentCount/);assert.equal(sent.response_format.type,'json_object');
  await assert.rejects(decideRepair(body,{key:''}),/DEEPSEEK_API_KEY/);
  for(const output of [{action:'run_shell',reason:'x'},{action:'accept',reason:''},{action:'accept',reason:'x',command:'fetch secret'}])await assert.rejects(decideRepair(body,{key:'x',fetchImpl:async()=>completion(output)}),/决策/);
  await assert.rejects(decideRepair({...body,round:2},{key:'x'}),/轮次/);
  await assert.rejects(decideRepair(body,{key:'x',fetchImpl:async()=>completion({action:'accept',reason:'x'})}),/失败.*检查/);
  for(const restricted of [{...body,round:1},{...body,report:{...body.report,source:'glb'}}])await assert.rejects(decideRepair(restricted,{key:'x',fetchImpl:async()=>completion({action:'strengthen',reason:'x'})}),/允许的工具/);
  await assert.rejects(decideRepair({...body,report:{}},{key:'x'}),/报告/);
  const passed={...body,report:{source:'parametric',checks:[{name:'topology',status:'pass',detail:'ok'},{name:'slicing',status:'warn',detail:'not assessed'}]}};
  assert.equal((await decideRepair(passed,{key:'x',fetchImpl:async()=>completion({action:'accept',reason:'实测几何检查通过，仍需切片。'})})).action,'accept');
});

test('scene planner bounds the small set of executable geometry parameters',async()=>{
  assert.deepEqual(await planScene({input:{story:'三人旅行'},design:{subjectCount:3}},{key:'x',fetchImpl:async()=>completion({scene:{people:3,archCount:2,detail:'simple'},reason:'保留三人和两跨拱门。'})}),{scene:{people:3,archCount:2,detail:'simple',strengthened:false},reason:'保留三人和两跨拱门。'});
  await assert.rejects(planScene({input:{}},{key:'x',fetchImpl:async()=>completion({scene:{people:40,archCount:2,detail:'simple'},reason:'x'})}),/场景/);
});
