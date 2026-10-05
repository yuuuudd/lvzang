import test from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { createApp } from '../server.js';
import { createDesign } from '../public/src/design.js';

const image='data:image/png;base64,iVBORw0KGgo=';
const host='memory-demo.vercel.app';
const origin=`https://${host}`;
const fetchImpl=async url=>Response.json({code:0,data:url.endsWith('/files')?{file_token:'photo'}:url.endsWith('/generation/image-to-image')?{task_id:'paid-artwork'}:url.endsWith('/tasks/paid-artwork')?{status:'processing',progress:35}:{status:'queued',progress:0}});

async function serve(options,run){
  const server=createApp({vercel:true,tripoKey:'demo-secret',fetchImpl,...options});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const root=`http://127.0.0.1:${server.address().port}`;
  const request=(path,init={})=>new Promise((resolve,reject)=>{
    const call=httpRequest(root+path,{method:init.method||'GET',headers:{Host:host,...init.headers}},response=>{
      const chunks=[];response.on('data',chunk=>chunks.push(chunk));response.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:response.statusCode,headers:response.headers})));
    });
    call.on('error',reject);call.end(init.body);
  });
  try{await run(request);}finally{await new Promise(resolve=>server.close(resolve));}
}

test('Vercel serves the public host and retrieves a paid image task after an instance change',async()=>{
  let token;
  await serve({},async request=>{
    assert.equal((await request('/api/config')).status,200);
    const body={story:'旅行',style:'enamel',design:createDesign({}),image};
    const post=source=>request('/api/artwork',{method:'POST',headers:{Origin:source,'Content-Type':'application/json'},body:JSON.stringify(body)});
    assert.equal((await post('http://'+host)).status,403);
    const response=await post(origin);
    assert.equal(response.status,202);
    token=(await response.json()).taskId;
    assert.notEqual(token,'paid-artwork');
  });
  await serve({},async request=>{
    assert.equal((await request('/api/artwork/paid-artwork')).status,404);
    assert.equal((await request('/api/artwork/'+token+'x')).status,404);
    const response=await request('/api/artwork/'+token);
    assert.equal(response.status,200,await response.clone().text());
    assert.deepEqual(await response.json(),{status:'processing',progress:35});
  });
});

test('Vercel retrieves a 3D task after an instance change',async()=>{
  const modelFetch=async url=>Response.json({code:0,data:url.endsWith('/upload/sts')?{image_token:'photo'}:url.endsWith('/task')?{task_id:'paid-model'}:{status:'queued',progress:12}});
  let token;
  await serve({fetchImpl:modelFetch},async request=>{
    const response=await request('/api/model',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({image,settings:{}})});
    assert.equal(response.status,202);
    token=(await response.json()).taskId;
  });
  await serve({fetchImpl:modelFetch},async request=>{
    assert.equal((await request('/api/model/paid-model')).status,404);
    const response=await request('/api/model/'+token);
    assert.equal(response.status,200,await response.clone().text());
    assert.deepEqual(await response.json(),{status:'queued',progress:12});
  });
});

test('large 3D inspection uses a small task request and streams the result',async()=>{
  const glb=Buffer.alloc(20);glb.write('glTF');glb.writeUInt32LE(2,4);glb.writeUInt32LE(20,8);glb.writeUInt32LE(0x4e4f534a,16);
  let downloads=0;
  const modelFetch=async url=>url.includes('/task/')?Response.json({code:0,data:{status:'success',progress:100,output:{model:'https://cdn.tripo3d.ai/model.glb'}}}):(++downloads,new Response(glb));
  const build=async({glb:source})=>{
    assert.deepEqual(source,glb);
    return {mesh:Float32Array.from({length:400_000},(_,i)=>i/7),report:{source:'glb',checks:[{name:'topology',status:'pass',detail:'ok'}],magnetHoles:[]},parts:[],widthMm:60,heightMm:60,totalDepthMm:10};
  };
  await serve({fetchImpl:modelFetch,build},async request=>{
    const token='paid-model.'+await import('node:crypto').then(({createHmac})=>createHmac('sha256','demo-secret').update('paid-model').digest('hex'));
    const poll=await request('/api/model/'+token);
    assert.deepEqual(await poll.json(),{status:'success',progress:100});
    assert.equal(downloads,0);
    const response=await request('/api/model/'+token+'/inspect',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({input:{story:'旅行'},settings:{colors:1},mounts:false})});
    assert.equal(response.status,200,await response.clone().text());
    assert.equal(response.headers.get('transfer-encoding'),'chunked');
    assert.ok((await response.clone().arrayBuffer()).byteLength>4_500_000);
    assert.equal((await response.json()).report.source,'glb');
    assert.equal(downloads,1);
  });
});

test('Vercel retrieves a travel painting after an instance change',async()=>{
  const paintingFetch=async url=>Response.json({code:0,data:url.endsWith('/files')?{file_token:'guide'}:url.endsWith('/generation/image-to-image')?{task_id:'paid-painting'}:{status:'processing',progress:21}});
  const memories=[1,2].map(n=>({id:`m${n}`,photoId:`p${n}`,title:`照片 ${n}`,evidence:'旅行照片',target:'景物',kind:'scene'}));
  let token;
  await serve({fetchImpl:paintingFetch},async request=>{
    const response=await request('/api/trip-painting',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({guide:image,memories,coverId:'p1'})});
    assert.equal(response.status,202,await response.clone().text());
    token=(await response.json()).taskId;
  });
  await serve({fetchImpl:paintingFetch},async request=>{
    assert.equal((await request('/api/trip-painting/paid-painting')).status,404);
    const response=await request('/api/trip-painting/'+token);
    assert.equal(response.status,200,await response.clone().text());
    assert.deepEqual(await response.json(),{status:'processing',progress:21});
  });
});

test('a visitor QR code grants access without exposing API keys or leaving the code in the URL',async()=>{
  await serve({eventCode:'event-pass'},async request=>{
    const blocked=await request('/api/artwork/anything');
    assert.equal(blocked.status,403);
    const entry=await request('/?event=event-pass');
    assert.equal(entry.status,302);
    assert.equal(entry.headers.get('location'),'/');
    const cookie=entry.headers.get('set-cookie').split(';')[0];
    assert.match(cookie,/^shiguang_event=/);
    assert.equal((await request('/api/artwork/anything',{headers:{Cookie:cookie}})).status,404);
    assert.equal((await request('/api/artwork/anything',{headers:{Cookie:'shiguang_event=wrong'}})).status,403);
  });
});

test('live-style DeepSeek output keeps the first JSON object and normalizes short memory decisions',async()=>{
  const content={caption:'赤坎行',reason:'根据照片构图',subjectCount:1,brief:{summary:'在赤坎旅行',elements:['建筑'],composition:'建筑居中',imagePrompt:'赤坎建筑纪念品',label:'',decisions:{framing:'依据照片取景',place:'保留赤坎',lettering:'不加文字',occlusion:'保持可见层次'}}};
  const aiFetch=async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(content)+'，"type":"json_object"}'}}]});
  await serve({key:'demo-deepseek',fetchImpl:aiFetch},async request=>{
    const response=await request('/api/design',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({story:'旅行',place:'赤坎',sculpture:true,image,settings:{colors:1}})});
    assert.equal(response.status,200,await response.clone().text());
    const {design}=await response.json();
    assert.equal(design.brief.decisions.length,4);
    assert.equal(design.brief.decisions.find(item=>item.topic==='place').action,'保留赤坎');
  });
});
