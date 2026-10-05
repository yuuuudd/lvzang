import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.js';
import { createDesign } from '../public/src/design.js';
import { artPrompt } from '../tripo.js';

const image='data:image/png;base64,iVBORw0KGgo=';

async function withApp(options,run){
  const server=createApp(options);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const root=`http://127.0.0.1:${server.address().port}`;
  const post=(route,body)=>fetch(root+route,{method:'POST',headers:{Origin:root,'Content-Type':'application/json'},body:JSON.stringify(body)});
  try{await run({root,post});}finally{await new Promise(resolve=>server.close(resolve));}
}

test('new 3D planning and artwork require a source photo and reject bottom text',async()=>{
  await withApp({},async({post})=>{
    for(const route of ['/api/design','/api/artwork']){
      const body={presetId:'shenzhen-hackathon',style:'enamel',sculpture:true,settings:{colors:1},...route==='/api/artwork'?{design:createDesign({})}:{}};
      const missing=await post(route,body);
      assert.equal(missing.status,400);
      assert.match((await missing.json()).error,/照片/);
      const lettering=await post(route,{...body,image,labelText:'嘉兴'});
      assert.equal(lettering.status,400);
      assert.match((await lettering.json()).error,/底部文字/);
    }
  });
});

test('review checks a single composition without a selected proposal',async()=>{
  const brief={summary:'独自在现场',elements:['人物','电脑'],composition:'照片人物在电脑前',imagePrompt:'人物在电脑前的立体纪念物'};
  const design={...createDesign({}),brief};
  let sent;
  await withApp({key:'test',fetchImpl:async(_url,options)=>{
    sent=JSON.parse(options.body);
    return Response.json({choices:[{message:{content:JSON.stringify({checks:[{item:'主体',status:'ok',observation:'人物在电脑前'}],suggestion:'无需修订'})}}]});
  }},async({post})=>{
    const response=await post('/api/reference-review',{image,photo:image,input:{story:'独自在现场'},design});
    assert.equal(response.status,200);
    assert.equal((await response.json()).review.checks[0].status,'ok');
    assert.equal(JSON.parse(sent.messages[1].content[0].text).composition,'照片人物在电脑前');
  });
});

test('prepared demo route is retired',async()=>{
  await withApp({},async({root})=>assert.equal((await fetch(root+'/api/demo')).status,404));
});

test('ceramic and wood styles reach planning and printable image prompts',async()=>{
  const brief={summary:'照片中的旅行',elements:['旅行者'],composition:'人物站在前景',imagePrompt:'照片中的旅行者站在前景。',decisions:['framing','place','lettering','occlusion'].map(topic=>({topic,evidence:'照片',action:'依据照片安排',uncertainty:'无额外未知'}))};
  let sent;
  await withApp({key:'test',fetchImpl:async(_url,options)=>{
    sent=JSON.parse(options.body);
    return Response.json({choices:[{message:{content:JSON.stringify({caption:'旅行时刻',brief})}}]});
  }},async({post})=>{
    for(const [style,word] of [['ceramic','陶瓷'],['wood','木雕']]){
      const response=await post('/api/design',{image,style,sculpture:true,settings:{colors:1}});
      assert.equal(response.status,200);
      assert.match(sent.messages[1].content[0].text,new RegExp(style));
      const {design}=await response.json();
      const prompt=artPrompt({image,style,sculpture:true,design});
      assert.match(prompt,new RegExp(word));
      assert.match(prompt,/厚|实体/);
    }
  });
});

test('regenerating from an old reference explicitly discards its lettering',()=>{
  const design={...createDesign({}),brief:{summary:'旧纪念物',elements:['人物'],composition:'人物居中',imagePrompt:'人物居中，底部名牌“旧字”'}};
  const prompt=artPrompt({image,reference:image,style:'enamel',sculpture:true,design});
  assert.doesNotMatch(prompt,/旧字/);
  assert.match(prompt,/上一版作品[^。]*不沿用旧版文字或名牌/);
});
