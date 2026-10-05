import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { startTripPainting } from '../tripo.js';
import { createApp } from '../server.js';
import { paintingRegion } from '../trip-painting.js';

const image='data:image/png;base64,'+(await sharp({create:{width:32,height:32,channels:3,background:'#a86950'}}).png().toBuffer()).toString('base64');
const points=count=>Array.from({length:count},(_,i)=>({id:`m${i+1}`,photoId:`p${i+1}`,title:`记忆 ${i+1}`,evidence:`照片 ${i+1} 中的物件`,target:'souvenir',kind:'subject'}));

async function withServer(options,run){
  const server=createApp(options);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const root=`http://127.0.0.1:${server.address().port}`;
  const post=(path,body,origin=root)=>fetch(root+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
  try{await run({root,post});}finally{await new Promise(resolve=>server.close(resolve));}
}

test('trip painting submits one landscape Image task from the element guide',async()=>{
  let submitted;
  const fetchImpl=async(url,init)=>{
    if(url.endsWith('/files'))return Response.json({code:0,data:{file_token:'guide-token'}});
    submitted=JSON.parse(init.body);return Response.json({code:0,data:{task_id:'painting-1'}});
  };
  assert.equal(await startTripPainting({guide:image,memories:points(9),coverId:'p1',name:'乌镇一日游',place:'乌镇',date:'2026-09-20',story:'我们沿着河边走，最后在桥上看日落'},{key:'demo',fetchImpl}),'painting-1');
  assert.equal(submitted.size,'1536x1024');
  assert.equal(submitted.input,'guide-token');
  assert.match(submitted.prompt,/记忆 9/);
  assert.match(submitted.prompt,/完整.*插画/);
  assert.match(submitted.prompt,/不能.*照片/);
  assert.match(submitted.prompt,/撕纸.*票根/);
  assert.match(submitted.prompt,/标题.*乌镇一日游/);
  assert.match(submitted.prompt,/地点.*乌镇/);
  assert.match(submitted.prompt,/日期.*2026\.09\.20/);
  assert.doesNotMatch(submitted.prompt,/预留无字|稍后直接绘入|不能.*生成任何文字/);
  assert.match(submitted.prompt,/沿着河边走.*桥上看日落/);
});

test('Vercel painting regions use an editable box without loading SAM',async()=>{
  const previous=process.env.VERCEL;process.env.VERCEL='1';
  try{
    const result=await paintingRegion({image,center:{x:.5,y:.5},box:{x:.3,y:.3,w:.4,h:.4},kind:'subject'},async()=>{throw new Error('SAM must not run');});
    assert.equal(result.shape,'box');assert.equal(result.needsReview,true);
  }finally{if(previous===undefined)delete process.env.VERCEL;else process.env.VERCEL=previous;}
});

test('trip painting API preserves task and validates 2–9 distinct source elements',async()=>{
  const fetchImpl=async(url,init)=>url.endsWith('/files')?Response.json({code:0,data:{file_token:'guide-token'}}):url.endsWith('/generation/image-to-image')?Response.json({code:0,data:{task_id:'painting-2'}}):Response.json({code:0,data:{status:'success',output:{generated_image_url:'https://cdn.tripo3d.ai/a.png'}}});
  await withServer({tripoKey:'demo',fetchImpl},async({post})=>{
    assert.equal((await post('/api/trip-painting',{guide:image,memories:points(2),coverId:'p1',story:'河边日落'})).status,202);
    assert.equal((await post('/api/trip-painting',{guide:image,memories:points(2),coverId:'p1',name:5})).status,400);
    assert.equal((await post('/api/trip-painting',{guide:image,memories:points(2),coverId:'p1',date:'下周末'})).status,400);
    assert.equal((await post('/api/trip-painting',{guide:image,memories:points(2),coverId:'p1',story:'x'.repeat(1001)})).status,400);
    assert.equal((await post('/api/trip-painting',{guide:image,memories:points(1),coverId:'p1'})).status,400);
    assert.equal((await post('/api/trip-painting',{guide:image,memories:[points(2)[0],points(2)[0]],coverId:'p1'})).status,400);
    assert.equal((await post('/api/trip-painting',{guide:image,memories:points(2),coverId:'p1'},'http://example.com')).status,403);
  });
});

test('painting result can be recovered by task ID after the local service restarts',async()=>{
  const fetchImpl=async(url)=>url.endsWith('/tasks/painting-recover')?Response.json({code:0,data:{status:'processing',progress:36}}):Response.json({code:1,message:'unexpected request'});
  await withServer({tripoKey:'demo',fetchImpl},async({root})=>{
    const response=await fetch(root+'/api/trip-painting/painting-recover');
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{status:'processing',progress:36});
  });
});

test('generated painting localization reports missing items and segments visible subjects',async()=>{
  const ai=async(url,init)=>{
    const ids=JSON.parse(init.body).messages[1].content[0].text;
    assert.match(ids,/m2/);
    return Response.json({choices:[{message:{content:JSON.stringify({regions:[{memoryId:'m1',visible:true,center:{x:.25,y:.4},box:{x:.1,y:.2,w:.3,h:.4}},{memoryId:'m2',visible:false}]})}}]});
  };
  const mask='data:image/png;base64,'+(await sharp({create:{width:32,height:32,channels:3,background:'#000'}}).png().toBuffer()).toString('base64');
  await withServer({key:'demo',fetchImpl:ai,segmentImage:async()=>mask},async({post})=>{
    const response=await post('/api/trip-painting-map',{image,guide:image,memories:points(2)});
    assert.equal(response.status,200);
    const result=await response.json();assert.equal(result.regions.length,2);
    assert.equal(result.regions[1].visible,false);
    assert.equal(result.regions[0].visible,true);
    assert.equal(result.regions[0].shape,'box','unreliable mask falls back to reviewable box');
  });
});

test('a reliable local mask becomes the exact clickable region',async()=>{
  const pixels=Buffer.alloc(32*32);for(let y=9;y<18;y++)for(let x=5;x<14;x++)pixels[y*32+x]=255;
  const mask='data:image/png;base64,'+(await sharp(pixels,{raw:{width:32,height:32,channels:1}}).png().toBuffer()).toString('base64');
  const result=await paintingRegion({image,center:{x:.25,y:.4},box:{x:.1,y:.2,w:.4,h:.5},kind:'subject'},async()=>mask);
  assert.equal(result.shape,'mask');assert.equal(result.needsReview,false);assert.match(result.mask,/^data:image\/png;base64,/);
});

test('a bad model box cannot place a hotspot away from its own target point',async()=>{
  const region=await paintingRegion({image,center:{x:.9,y:.9},box:{x:.1,y:.1,w:.2,h:.2},kind:'scene'},async()=>{throw new Error('unused');});
  assert.ok(region.box.x<=region.center.x&&region.center.x<=region.box.x+region.box.w);
  assert.ok(region.box.y<=region.center.y&&region.center.y<=region.box.y+region.box.h);
  assert.equal(region.needsReview,true);
});
