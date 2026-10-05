import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.js';

const image='data:image/png;base64,iVBORw0KGgo=';

async function withServer(fetchImpl,run){
  const server=createApp({key:'test',fetchImpl});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const root=`http://127.0.0.1:${server.address().port}`;
  try{await run(async body=>fetch(root+'/api/trip-curation',{method:'POST',headers:{Origin:root,'Content-Type':'application/json'},body:JSON.stringify(body)}));}
  finally{await new Promise(resolve=>server.close(resolve));}
}

test('trip curation sends numbered photos and preserves cited photo evidence',async()=>{
  let sent;
  await withServer(async(_url,options)=>{
    sent=JSON.parse(options.body);
    return Response.json({choices:[{message:{content:JSON.stringify({points:[{photoId:'p1',title:'路上的花',evidence:'照片中可见花',storyDraft:'路边的花',cutoutPrompt:'flower',cutoutKind:'subject',cutoutPoint:{x:.3,y:.6}},{photoId:'p2',title:'桥边一刻',evidence:'照片中可见石桥',storyDraft:'桥边的合影',cutoutPrompt:'stone bridge',cutoutKind:'scene'}]})}}]});
  },async post=>{
    const response=await post({name:'江南旅行',story:'和妈妈走过桥边',photos:[{id:'p1',image},{id:'p2',image}]});
    assert.equal(response.status,200);
    assert.deepEqual((await response.json()).points,[{photoId:'p1',title:'路上的花',evidence:'照片中可见花',storyDraft:'路边的花',cutoutPrompt:'flower',cutoutKind:'subject',cutoutPoint:{x:.3,y:.6}},{photoId:'p2',title:'桥边一刻',evidence:'照片中可见石桥',storyDraft:'桥边的合影',cutoutPrompt:'stone bridge',cutoutKind:'scene'}]);
    assert.equal(sent.messages[1].content.filter(part=>part.type==='image_url').length,2);
    assert.match(sent.messages[0].content,/不得编造/);
  });
});

test('trip curation rejects invalid references and photos',async()=>{
  await withServer(async()=>Response.json({choices:[{message:{content:JSON.stringify({points:[{photoId:'p9',title:'桥',evidence:'可见桥',storyDraft:''}]})}}]}),async post=>{
    assert.equal((await post({name:'旅行',photos:[{id:'p1',image},{id:'p2',image}]})).status,502);
    assert.equal((await post({name:'旅行',photos:[{id:'p1',image}]})).status,400);
    assert.equal((await post({name:'旅行',photos:[{id:'p1',image},{id:'p2',image:'data:image/png;base64,AAAA'}]})).status,400);
  });
});

test('trip curation requires exactly one grounded fragment per source photo',async()=>{
  await withServer(async()=>Response.json({choices:[{message:{content:JSON.stringify({points:[{photoId:'p1',title:'桥',evidence:'可见桥',storyDraft:'',cutoutPrompt:'bridge',cutoutKind:'scene'}]})}}]}),async post=>{
    assert.equal((await post({name:'旅行',photos:[{id:'p1',image},{id:'p2',image}]})).status,502);
  });
});
