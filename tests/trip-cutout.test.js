import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createApp } from '../server.js';
import { makeCutout } from '../trip-cutout.js';

const source='data:image/png;base64,'+(await sharp({create:{width:8,height:8,channels:3,background:'#c65340'}}).png().toBuffer()).toString('base64');
const pixels=Buffer.alloc(64);for(let y=2;y<6;y++)for(let x=2;x<6;x++)pixels[y*8+x]=255;
const mask='data:image/png;base64,'+(await sharp(pixels,{raw:{width:8,height:8,channels:1}}).png().toBuffer()).toString('base64');

async function withServer(options,run){
  const server=createApp(options);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const root=`http://127.0.0.1:${server.address().port}`;
  try{await run((body,origin=root)=>fetch(root+'/api/trip-cutout',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)}));}
  finally{await new Promise(resolve=>server.close(resolve));}
}

test('subject mask keeps source pixels with transparent edges',async()=>{
  let call;
  await withServer({segmentImage:async input=>{call=input;return mask;}},async post=>{
    const response=await post({image:source,prompt:'red souvenir',kind:'subject',point:{x:.5,y:.5}});
    assert.equal(response.status,200);
    const result=await response.json();assert.equal(result.kind,'subject');assert.match(result.cutout,/^data:image\/webp;base64,/);
    const {data,info}=await sharp(Buffer.from(result.cutout.split(',')[1],'base64')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    assert.equal(data[3],0,'outside the mask is transparent');
    const center=(Math.floor(info.height/2)*info.width+Math.floor(info.width/2))*4;
    assert.equal(data[center+3],255,'inside the mask is opaque');
    assert.ok(data[center]>data[center+1],'cutout keeps the original red pixels');
    assert.equal(call.prompt,'red souvenir');assert.ok(call.point);
  });
});

test('scene fragments and failed masks fall back to torn original-photo pieces',async()=>{
  await withServer({segmentImage:async()=>{throw new Error('local model unavailable');}},async post=>{
    for(const kind of ['scene','subject']){
      const response=await post({image:source,prompt:'travel scene',kind,...(kind==='subject'?{point:{x:.5,y:.5}}:{})});assert.equal(response.status,200);
      const result=await response.json();assert.equal(result.kind,'paper');assert.match(result.cutout,/^data:image\/webp;base64,/);
      const {data}=await sharp(Buffer.from(result.cutout.split(',')[1],'base64')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      assert.equal(data[3],0,'paper edges are transparent');
    }
  });
});

test('cutout needs no extra key and rejects invalid client inputs',async()=>{
  await withServer({segmentImage:async()=>mask},async post=>{
    assert.equal((await post({image:source,prompt:'cup',kind:'subject',point:{x:.5,y:.5}})).status,200);
    assert.equal((await post({image:source,prompt:'cup',kind:'subject'})).status,400);
    assert.equal((await post({image:source,prompt:'cup',kind:'subject'},'http://example.com')).status,403);
    assert.equal((await post({image:'bad',prompt:'cup',kind:'subject'})).status,400);
  });
});

test('clicked point is remapped into the padded square sent to SAM',async()=>{
  const rectangle='data:image/png;base64,'+(await sharp({create:{width:8,height:4,channels:3,background:'#c65340'}}).png().toBuffer()).toString('base64');
  let squarePoint;
  await makeCutout({image:rectangle,prompt:'red item',kind:'subject',point:{x:.5,y:.25}},async input=>{squarePoint=input.point;return mask;});
  assert.equal(squarePoint.x,.5);assert.equal(squarePoint.y,.375);
});

test('Vercel uses a paper piece before loading the memory-heavy SAM model',async()=>{
  const previous=process.env.VERCEL;process.env.VERCEL='1';
  try{
    const result=await makeCutout({image:source,prompt:'red item',kind:'subject',point:{x:.5,y:.5}},async()=>{throw new Error('SAM must not run');});
    assert.equal(result.kind,'paper');assert.match(result.warning,/撕纸照片片段/);
  }finally{if(previous===undefined)delete process.env.VERCEL;else process.env.VERCEL=previous;}
});
