import test from 'node:test';
import assert from 'node:assert/strict';
import {customizeAsset} from '../customization-agent.js';
import {createApp} from '../server.js';

test('customization agent normalizes a complete physical revision',async()=>{
  const fetchImpl=async()=>Response.json({choices:[{message:{content:JSON.stringify({
    intent:'revise_model',summary:'保留人物与广州塔，将底座改小并改为冰箱贴',reply:'方案已整理好，请确认后生成新版本。',requirements:{purpose:'print',productType:'magnet',sizeMm:{width:70,height:60,depth:8},material:'resin',colorMode:'color',structure:['flat_back','magnet_slot'],engraving:'',quantity:1,keep:['人物','广州塔'],change:['缩小底座']}
  })}}]});
  const result=await customizeAsset({message:'改成可打印的冰箱贴',current:{productType:'figurine'},history:[]},{key:'test',fetchImpl});
  assert.equal(result.readyForGeneration,true);
  assert.equal(result.needsManufacturingReview,true);
  assert.deepEqual(result.missingFields,[]);
  assert.equal(result.requirements.sizeMm.width,70);
});

test('customization agent reports physical fields that are still missing',async()=>{
  const fetchImpl=async()=>Response.json({choices:[{message:{content:JSON.stringify({
    intent:'revise_model',summary:'改成冰箱贴',reply:'想做多大尺寸、使用什么材料？',requirements:{purpose:'print',productType:'magnet',colorMode:'color',structure:['flat_back'],quantity:1,keep:[],change:['改成冰箱贴']}
  })}}]});
  const result=await customizeAsset({message:'改成冰箱贴',current:{productType:'figurine'},history:[]},{key:'test',fetchImpl});
  assert.equal(result.readyForGeneration,false);
  assert.deepEqual(result.missingFields,['sizeMm','material']);
});

test('customization agent rejects invalid conversation input',async()=>{
  await assert.rejects(()=>customizeAsset({message:'',history:[]},{key:'test',fetchImpl:fetch}),/修改内容/);
});

test('customization endpoint returns the checked agent plan',async()=>{
  const fetchImpl=async()=>Response.json({choices:[{message:{content:JSON.stringify({intent:'revise_model',summary:'缩小底座',reply:'已整理修改方案。',requirements:{purpose:'generate',productType:'figurine',change:['缩小底座'],keep:['人物']}})}}]});
  const server=createApp({key:'test',fetchImpl});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  try{
    const response=await fetch(base+'/api/customization-chat',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({message:'底座小一点',history:[],current:{productType:'figurine'}})});
    assert.equal(response.status,200);
    assert.equal((await response.json()).readyForGeneration,true);
  }finally{await new Promise(resolve=>server.close(resolve));await (await server.resumeCollections()).close();}
});
