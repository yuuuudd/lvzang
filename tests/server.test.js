import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.js';
import { createDesign, selectProposal } from '../public/src/design.js';
const photoImage='data:image/png;base64,iVBORw0KGgo=';

test('local model task resumes after restarting the server without another paid submission',async()=>{
  let submissions=0;
  const glb=Buffer.alloc(20);glb.write('glTF');glb.writeUInt32LE(2,4);glb.writeUInt32LE(20,8);glb.writeUInt32LE(0x4e4f534a,16);
  const fetchImpl=async url=>url.endsWith('/upload/sts')?Response.json({code:0,data:{image_token:'image'}}):url.endsWith('/task')?(submissions++,Response.json({code:0,data:{task_id:'saved-model'}})):url.includes('/task/')?Response.json({code:0,data:{status:'success',progress:100,output:{model:'https://cdn.tripo3d.ai/model.glb'}}}):new Response(glb);
  const options={tripoKey:'test',fetchImpl,build:async()=>({mesh:[0,0,0],report:{source:'glb',checks:[{name:'topology',status:'pass',detail:'ok'}],magnetHoles:[]},parts:[],widthMm:60,heightMm:60,totalDepthMm:10})};
  const first=createApp(options);await new Promise(resolve=>first.listen(0,'127.0.0.1',resolve));
  const root='http://127.0.0.1:'+first.address().port;
  const response=await fetch(root+'/api/model',{method:'POST',headers:{Origin:root,'Content-Type':'application/json'},body:JSON.stringify({image:photoImage,settings:{}})});
  const {taskId}=await response.json();await new Promise(resolve=>first.close(resolve));
  const restarted=createApp(options);await new Promise(resolve=>restarted.listen(0,'127.0.0.1',resolve));
  const next='http://127.0.0.1:'+restarted.address().port;
  try{
    assert.equal((await (await fetch(next+'/api/model/'+taskId)).json()).status,'success');
    const inspected=await fetch(next+'/api/model/'+taskId+'/inspect',{method:'POST',headers:{Origin:next,'Content-Type':'application/json'},body:JSON.stringify({input:{story:'旅行'},settings:{colors:1},mounts:false})});
    assert.equal(inspected.status,200,await inspected.clone().text());
    assert.equal((await inspected.json()).report.source,'glb');
    assert.equal(submissions,1);
  }finally{await new Promise(resolve=>restarted.close(resolve));}
});

test('completed model tasks release batch capacity while their IDs remain readable',async()=>{
  let created=0;
  const fetchImpl=async(url)=>url.endsWith('/upload/sts')?Response.json({code:0,data:{image_token:'image'}}):url.endsWith('/task')?Response.json({code:0,data:{task_id:`batch-model-${++created}`}}):Response.json({code:0,data:{status:'failed',progress:100}});
  const server=createApp({tripoKey:'test',fetchImpl});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const root=`http://127.0.0.1:${server.address().port}`;
  try{
    for(let index=0;index<5;index++){
      const response=await fetch(root+'/api/model',{method:'POST',headers:{Origin:root,'Content-Type':'application/json'},body:JSON.stringify({image:photoImage,settings:{}})});
      assert.equal(response.status,202,`task ${index+1} can start after prior completion`);
      const {taskId}=await response.json();
      assert.equal((await (await fetch(root+'/api/model/'+taskId)).json()).status,'failed');
    }
  }finally{await new Promise(resolve=>server.close(resolve));}
});

test('reference review inspects the generated image and bounds actionable observations',async()=>{
  const brief={summary:'朋友合作',elements:['朋友'],composition:'朋友在前',imagePrompt:'朋友在前，入口在后',proposals:[
    {id:'people',title:'人物为主角',focus:'朋友',evidence:'照片里有朋友',tradeoff:'入口退后',composition:'朋友在前',imagePrompt:'朋友在前，入口在后'},
    {id:'place',title:'场地为主角',focus:'入口',evidence:'活动预设',tradeoff:'朋友缩小',composition:'入口在前',imagePrompt:'入口在前，朋友在旁'}
  ]};
  const design=selectProposal({...createDesign({}),brief},'people');
  let sent;
  const server=createApp({key:'test',fetchImpl:async(_url,options)=>{sent=JSON.parse(options.body);return Response.json({choices:[{message:{content:JSON.stringify({checks:[{item:'朋友',status:'ok',observation:'画面前方可见一名人物'},{item:'活动入口',status:'issue',observation:'没有看见入口轮廓'}],suggestion:'把活动入口放在人物后方，同时保留朋友在前景'})}}]});}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const root=`http://127.0.0.1:${server.address().port}`;
  try{
    const response=await fetch(root+'/api/reference-review',{method:'POST',headers:{Origin:root,'Content-Type':'application/json'},body:JSON.stringify({image:photoImage,photo:photoImage,input:{story:'和朋友一起写代码'},design,presetId:'shenzhen-hackathon'})});
    assert.equal(response.status,200);const {review}=await response.json();
    assert.equal(review.checks[1].status,'issue');assert.match(review.suggestion,/入口/);
    assert.equal(sent.messages[1].content.filter(item=>item.type==='image_url').length,2);
    assert.equal((await fetch(root+'/api/reference-review',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:'{}'})).status,403);
    const bad=await fetch(root+'/api/reference-review',{method:'POST',headers:{Origin:root,'Content-Type':'application/json'},body:JSON.stringify({image:'https://evil.example/a.png',design})});
    assert.equal(bad.status,400);
  }finally{await new Promise(r=>server.close(r));}
});

test('malformed visual review never reports a pass or exposes parser details',async()=>{
  const proposal={id:'person',title:'人物',focus:'人物',evidence:'照片',tradeoff:'场地退后',composition:'人物在前',imagePrompt:'人物在前'};
  const design=selectProposal({...createDesign({}),brief:{summary:'独自参赛',elements:['人物'],composition:'人物在前',imagePrompt:'人物在前',proposals:[proposal,{...proposal,id:'venue',title:'场地',focus:'场地',composition:'场地在前',imagePrompt:'场地在前'}]}},'person');
  const server=createApp({key:'test',fetchImpl:async()=>Response.json({choices:[{message:{content:'{"checks": ['}}]})});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const root=`http://127.0.0.1:${server.address().port}`;
  try{
    const response=await fetch(root+'/api/reference-review',{method:'POST',headers:{Origin:root,'Content-Type':'application/json'},body:JSON.stringify({image:photoImage,input:{story:'独自参赛'},design})});
    assert.equal(response.status,502);assert.deepEqual(await response.json(),{error:'视觉回看未完成，请人工核对参考图。'});
  }finally{await new Promise(r=>server.close(r));}
});

test('local API validates inputs, protects secrets and calls the configured model',async()=>{
  let sent;
  const server=createApp({key:'private-test-key',fetchImpl:async(url,options)=>{
    sent={url,...options};
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(createDesign({story:'和妈妈旅行'}))}}]}));
  }});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const root=`http://127.0.0.1:${server.address().port}`;
  const post=(body,origin=root)=>fetch(root+'/api/design',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)});
  try {
    assert.deepEqual(await (await fetch(root+'/api/config')).json(),{configured:true,model:'deepseek-flash',tripoConfigured:false,tripoModel:'chat_image_2.5_sunburst',developerBatch3D:false,presets:[{id:'shenzhen-hackathon',name:'深圳啤酒小镇 · 黑客松'}]});
    assert.equal((await fetch(root+'/.env')).status,404);
    assert.equal((await post({story:'旅行'},'https://evil.example')).status,403);
    assert.equal((await post({date:'2026-02-30'})).status,400);
    assert.equal((await post({image:'https://evil.example/a.jpg'})).status,400);
    const image='data:image/png;base64,iVBORw0KGgo=';
    const response=await post({story:'和妈妈旅行',image});
    assert.equal(response.status,200);
    assert.equal((await response.json()).design.theme,'family');
    const payload=JSON.parse(sent.body);
    assert.equal(sent.headers.Authorization,'Bearer private-test-key');
    assert.equal(payload.messages[1].content[1].image_url.url,image);
    assert.equal(payload.messages[1].content[1].image_url.detail,'high');
    assert.equal(payload.thinking.type,'disabled');
    assert.equal((await post({current:{caption:'bad'}})).status,400);
  } finally {await new Promise(r=>server.close(r));}
});

test('missing credentials and upstream failures remain explicit and sanitized',async()=>{
  for(const key of ['', 'secret']) {
    const server=createApp({key,fetchImpl:async()=>new Response('secret credentials',{status:401})});
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const root=`http://127.0.0.1:${server.address().port}`;
    try {
      const res=await fetch(root+'/api/design',{method:'POST',headers:{Origin:root,'Content-Type':'application/json'},body:'{}'});
      assert.equal(res.status,key?502:503);
      assert.doesNotMatch(await res.text(),/secret/);
    } finally {await new Promise(r=>server.close(r));}
  }
});

test('malformed model output is rejected rather than presented as a valid design',async()=>{
  const server=createApp({key:'test',fetchImpl:async()=>new Response(JSON.stringify({choices:[{message:{content:'{"caption":"unfinished"'}}]}))});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const root=`http://127.0.0.1:${server.address().port}`;
  try{
    const res=await fetch(root+'/api/design',{method:'POST',headers:{Origin:root,'Content-Type':'application/json'},body:'{"story":"旅行"}'});
    assert.equal(res.status,502);assert.match((await res.json()).error,/无效 JSON/);
  }finally{await new Promise(r=>server.close(r));}
});

test('an empty DeepSeek JSON response gets one retry before failing clearly',async()=>{
  const brief={summary:'乌镇墙上的字',elements:['白墙和题字'],composition:'白墙题字成为厚实的场景主体',imagePrompt:'以照片中的白墙和题字形态设计厚实立体场景，不添加文字或名牌',decisions:['framing','place','lettering','occlusion'].map(topic=>({topic,evidence:'来源照片',action:'按照片构图',uncertainty:'无'}))};
  let calls=0;
  const server=createApp({key:'test',fetchImpl:async()=>Response.json({choices:[{finish_reason:'stop',message:{content:++calls===2?JSON.stringify({caption:'乌镇一刻',brief}):''}}]})});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const root=`http://127.0.0.1:${server.address().port}`;
  try{
    const response=await fetch(root+'/api/design',{method:'POST',headers:{Origin:root,'Content-Type':'application/json'},body:JSON.stringify({story:'',image:photoImage,sculpture:true})});
    assert.equal(response.status,200);
    assert.equal((await response.json()).design.caption,'乌镇一刻');
    assert.equal(calls,2);
    const repeated=await fetch(root+'/api/design',{method:'POST',headers:{Origin:root,'Content-Type':'application/json'},body:JSON.stringify({image:photoImage,sculpture:true})});
    assert.equal(repeated.status,502);
    assert.match((await repeated.json()).error,/连续返回空内容/);
    assert.equal(calls,4);
  }finally{await new Promise(r=>server.close(r));}
});

test('a single stray closing brace in DeepSeek output does not discard a complete design',async()=>{
  const brief={summary:'活动入口留影',elements:['活动入口'],composition:'入口装置构成立体主体',imagePrompt:'保留照片中的入口装置，做成厚实立体纪念物',decisions:['framing','place','lettering','occlusion'].map(topic=>({topic,evidence:'来源照片',action:'按照片构图',uncertainty:'无'}))};
  const valid=JSON.stringify({caption:'入口一刻',brief});
  for(const content of [valid+'}',valid.slice(0,-1)]){
    const server=createApp({key:'test',fetchImpl:async()=>Response.json({choices:[{finish_reason:'stop',message:{content}}]})});
    await new Promise(r=>server.listen(0,'127.0.0.1',r));const root=`http://127.0.0.1:${server.address().port}`;
    try{
      const response=await fetch(root+'/api/design',{method:'POST',headers:{Origin:root,'Content-Type':'application/json'},body:JSON.stringify({image:photoImage,sculpture:true})});
      assert.equal(response.status,200);
      assert.equal((await response.json()).design.caption,'入口一刻');
    }finally{await new Promise(r=>server.close(r));}
  }
});

test('artwork routes require same-origin creation and only expose locally created tasks',async()=>{
  const server=createApp({key:'test',tripoKey:'tripo-test',tripoModel:'gpt_image_2',fetchImpl:async(url)=>Response.json({code:0,data:url.endsWith('/upload/sts')?{image_token:'visitor-photo'}:url.endsWith('/task')?{task_id:'owned-task'}:{status:'queued',progress:0}})});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const root=`http://127.0.0.1:${server.address().port}`;
  const payload={story:'旅行',place:'赤坎',style:'enamel',design:createDesign({}),image:photoImage};
  const post=(origin,body=payload)=>fetch(root+'/api/artwork',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
  try{
    assert.equal((await fetch(root+'/api/artwork/not-owned')).status,404);
    assert.equal((await post('https://evil.example')).status,403);
    assert.equal((await post(root,{...payload,image:'https://evil.example/photo'})).status,400);
    const created=await post(root);assert.equal(created.status,202);assert.equal((await created.json()).taskId,'owned-task');
    const state=await (await fetch(root+'/api/artwork/owned-task')).json();assert.equal(state.status,'queued');assert.equal(state.progress,0);
  }finally{await new Promise(r=>server.close(r));}
});

test('manufacturing builds real pockets, executes one repair, and rejects invalid settings before paid calls',async()=>{
  let calls=0;
  const server=createApp({key:'',tripoKey:'test',fetchImpl:async()=>{calls++;throw new Error('must not call upstream');}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const root=`http://127.0.0.1:${server.address().port}`;
  const post=(path,body,origin=root)=>fetch(root+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
  try{
    const payload={input:{story:'结构试样'},scene:{people:2,archCount:3,detail:'detailed'},settings:{colors:4,magnetDiameter:8,magnetDepth:3},mode:'offline'};
    assert.equal((await post('/api/agent',payload,'https://evil.example')).status,403);
    const response=await post('/api/agent',payload);assert.equal(response.status,200);const result=await response.json();
    assert.equal(result.parts.length,4);assert.equal(result.versions.length,2);assert.equal(result.scene.detail,'simple');
    assert.equal(result.settings.colors,4);assert.equal(result.report.magnetHoles.length,2);
    assert.equal(result.report.magnetHoles[0].diameter,8.2);assert.equal(result.report.pocketRayChecks[0].floorZ,3);
    assert.equal(result.exportable,true);assert.equal(result.report.printabilityVerified,false);
    assert.equal((await post('/api/agent',{...payload,settings:{colors:5}})).status,400);
    for(const path of ['/api/artwork','/api/model']){
      const response=await post(path,{story:'旅行',style:'enamel',design:createDesign({}),sculpture:true,image:'data:image/png;base64,iVBORw0KGgo=',settings:{magnetDepth:99}});
      assert.equal(response.status,400);
    }
    assert.equal(calls,0);
  }finally{await new Promise(resolve=>server.close(resolve));}
});

test('story planning retains the expanded brief and sends printing constraints to DeepSeek',async()=>{
  const brief={summary:'雨中母女相依',elements:['母女','共撑一把伞','骑楼檐口'],composition:'母女靠在一起站在骑楼转角，雨伞与檐口形成可见空隙',imagePrompt:'白色立体纪念雕塑，母女共撑一把伞走过骑楼转角；保留伞面骨线、相依动作、屋檐窗框和石板纹理。'};
  brief.decisions=['framing','place','lettering','occlusion'].map(topic=>({topic,evidence:'用户故事与照片',action:'保留已知细节',uncertainty:'未查证地标'}));
  let sent;
  const server=createApp({key:'test',fetchImpl:async(_url,options)=>{sent=JSON.parse(options.body);return Response.json({choices:[{message:{content:JSON.stringify({...createDesign({}),brief})}}]});}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const root=`http://127.0.0.1:${server.address().port}`;
  const post=body=>fetch(root+'/api/design',{method:'POST',headers:{Origin:root,'Content-Type':'application/json'},body:JSON.stringify({...body,image:photoImage})});
  try{
    const response=await post({story:'和妈妈在骑楼下躲雨',landmark:'赤坎古镇骑楼',style:'clay',sculpture:true,settings:{colors:2,widthMm:80}});
    assert.equal(response.status,200);const generated=(await response.json()).design.brief;
    assert.deepEqual(Object.fromEntries(Object.entries(generated).filter(([key])=>key!=='keyElements'&&key!=='label')),{...brief,decisions:brief.decisions.map(item=>item.topic==='lettering'?{topic:'lettering',evidence:'本流程不设置底部文字',action:'不添加文字或名牌',uncertainty:'无'}:item)});
    assert.equal(generated.label,'');
    assert.deepEqual(generated.keyElements.map(item=>item.source),['观众故事／照片','观众故事／照片','观众故事／照片']);
    const context=JSON.parse(sent.messages[1].content[0].text);assert.equal(context.settings.colors,2);assert.equal(context.settings.widthMm,80);
    assert.equal(context.style,'clay');assert.match(context.styleDirection,/饱满.*手塑/);
    assert.match(sent.messages[0].content,/风格.*构图.*imagePrompt|风格.*imagePrompt/);
    assert.equal((await post({story:'旅行',style:'unknown',sculpture:true})).status,400);
    assert.equal((await post({story:'旅行',style:['clay'],sculpture:true})).status,400);
    assert.equal(context.landmark,'赤坎古镇骑楼');
    assert.match(sent.messages[0].content,/framing[\s\S]*place[\s\S]*lettering[\s\S]*occlusion/);
    assert.match(sent.messages[0].content,/半身/);assert.match(sent.messages[0].content,/不得宣称/);
    assert.equal((await post({story:'旅行',sculpture:true,settings:{colors:8}})).status,400);
    brief.decisions.pop();
    const missingDecision=await post({story:'旅行',sculpture:true});
    assert.equal(missingDecision.status,502,'new story plans require all four decisions');
    assert.match((await missingDecision.json()).error,/缺少设计决策：前后遮挡/);
    delete brief.decisions;
    assert.equal((await post({story:'旅行',sculpture:true})).status,502,'legacy briefs can be loaded but are not new story plans');
  }finally{await new Promise(r=>server.close(r));}
});

test('photo-only planning accepts blank decision details without asking for a story',async()=>{
  const brief={summary:'照片中的主体',elements:['照片主体'],composition:'以照片可见主体为中心',imagePrompt:'按照片可见主体制作一件立体纪念物',decisions:['framing','place','lettering','occlusion'].map(topic=>({topic,evidence:'',action:'',uncertainty:''}))};
  const server=createApp({key:'test',fetchImpl:async()=>Response.json({choices:[{message:{content:JSON.stringify({caption:'留住此刻',brief})}}]})});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const root=`http://127.0.0.1:${server.address().port}`;
  try{
    const response=await fetch(root+'/api/design',{method:'POST',headers:{Origin:root,'Content-Type':'application/json'},body:JSON.stringify({image:photoImage,style:'clay',sculpture:true,settings:{colors:1}})});
    assert.equal(response.status,200);
    const {design}=await response.json();
    assert.equal(design.brief.decisions.length,4);
    assert.ok(design.brief.decisions.every(item=>item.evidence&&item.action&&item.uncertainty));
    assert.equal(design.brief.decisions.find(item=>item.topic==='place').action.includes('不指定'),true);
  }finally{await new Promise(resolve=>server.close(resolve));}
});

test('a story request is retried from the source photo with or without optional story',async()=>{
  const brief={summary:'照片中的海边人物',elements:['海边人物'],composition:'人物站在海边',imagePrompt:'照片中的人物站在海边，制作立体纪念物',decisions:['framing','place','lettering','occlusion'].map(topic=>({topic,evidence:'来源照片',action:'依据照片构图',uncertainty:'无'}))};
  const requests=[];
  const server=createApp({key:'test',fetchImpl:async(_url,options)=>{
    const payload=JSON.parse(options.body);requests.push(payload);
    return Response.json({choices:[{message:{content:JSON.stringify(requests.length%2?{needsInput:{kind:'story_missing',detail:'需要补故事'}}:{caption:'海边留念',brief})}}]});
  }});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const root=`http://127.0.0.1:${server.address().port}`;
  try{
    for(const story of ['','和家人在海边留念']){
      const response=await fetch(root+'/api/design',{method:'POST',headers:{Origin:root,'Content-Type':'application/json'},body:JSON.stringify({story,image:photoImage,sculpture:true})});
      assert.equal(response.status,200);
      assert.equal((await response.json()).design.brief.imagePrompt,brief.imagePrompt);
      assert.equal(JSON.parse(requests.at(-1).messages[1].content[1].text).story,story);
      assert.equal(requests.at(-1).messages[1].content.at(-1).image_url.url,photoImage);
      assert.match(requests.at(-1).messages[1].content[0].text,/故事.*可选.*照片/);
    }
    assert.equal(requests.length,4);
  }finally{await new Promise(resolve=>server.close(resolve));}
});

test('free story planning does not seed or accept an unrequested old town',async()=>{
  const brief={summary:'毕业合影在赤坎古镇',elements:['三位毕业生','赤坎骑楼'],composition:'三人在赤坎骑楼前合影',imagePrompt:'三位毕业生在赤坎古镇骑楼前合影。',decisions:['framing','place','lettering','occlusion'].map(topic=>({topic,evidence:'故事',action:'按场景构图',uncertainty:'无'}))};
  let sent;
  const server=createApp({key:'test',fetchImpl:async(_url,options)=>{sent=JSON.parse(options.body);return Response.json({choices:[{message:{content:JSON.stringify({caption:'毕业留念',brief})}}]});}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const root=`http://127.0.0.1:${server.address().port}`;
  const post=body=>fetch(root+'/api/design',{method:'POST',headers:{Origin:root,'Content-Type':'application/json'},body:JSON.stringify({sculpture:true,image:photoImage,...body})});
  try{
    assert.equal((await fetch(root+'/assets/chikan-style-sample.png')).status,404);
    const invented=await post({story:'我们三个人毕业时拍了一张合影'});
    assert.equal(invented.status,502);
    assert.match((await invented.json()).error,/未提供.*赤坎|赤坎.*未提供/);
    assert.doesNotMatch(sent.messages[0].content,/赤坎|骑楼|拱廊|拱门/);
    await post({story:'我们三个人毕业时拍了一张合影',current:{...createDesign({}),brief}});
    assert.equal(JSON.parse(sent.messages[1].content[0].text).current,undefined,'old invented place is not sent back to DeepSeek');
    const requested=await post({story:'我们三个人在赤坎古镇骑楼前拍毕业合影'});
    assert.equal(requested.status,200);
  }finally{await new Promise(r=>server.close(r));}
});

test('story planning ignores obsolete design enums and keeps a valid story brief',async()=>{
  const brief={summary:'三位同学在海边毕业',elements:['三位同学','海浪'],composition:'三人并肩站在海浪前',imagePrompt:'三个大头人物并肩站在海边的粗线条海浪前，少量留白，只有一处大字名牌。',label:'海边'};
  const decisions=['framing','place','lettering','occlusion'].map(topic=>({topic,evidence:'用户故事',action:'按毕业合照处理',uncertainty:'无额外未知'}));
  const output={theme:'graduation',motif:'sunset',layout:'freeform',photoStyle:'realistic',threshold:3,subjectScale:5,subjectCount:3,caption:'毕业海边',reason:'让三个人与海浪形成一个整体',brief,decisions};
  const server=createApp({key:'test',fetchImpl:async()=>Response.json({choices:[{message:{content:JSON.stringify(output)}}]})});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const root=`http://127.0.0.1:${server.address().port}`;
  try{
    const response=await fetch(root+'/api/design',{method:'POST',headers:{Origin:root,'Content-Type':'application/json'},body:JSON.stringify({story:'三位同学在海边毕业',place:'海边',sculpture:true,image:photoImage})});
    assert.equal(response.status,200);
    const {design}=await response.json();assert.deepEqual(Object.fromEntries(Object.entries(design.brief).filter(([key])=>key!=='keyElements')),{...brief,label:'',decisions:decisions.map(item=>item.topic==='lettering'?{topic:'lettering',evidence:'本流程不设置底部文字',action:'不添加文字或名牌',uncertainty:'无'}:item)});assert.equal(design.subjectCount,3);assert.equal(design.caption,'毕业海边');
  }finally{await new Promise(r=>server.close(r));}
});

test('story planning accepts keyed memory decisions returned by DeepSeek',async()=>{
  const decisions=Object.fromEntries(['framing','place','lettering','occlusion'].map(topic=>[topic,{evidence:'用户故事',action:'保留主体',uncertainty:'无额外未知'}]));
  const brief={summary:'雨中同行',elements:['母女','雨伞'],composition:'两人在屋檐下相依',imagePrompt:'两位大头人物在赤坎共撑一把粗骨架雨伞，身后是简化骑楼。',label:'赤坎',decisions};
  const server=createApp({key:'test',fetchImpl:async()=>Response.json({choices:[{message:{content:JSON.stringify({caption:'雨中同行',brief})}}]})});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const root=`http://127.0.0.1:${server.address().port}`;
  try{
    const response=await fetch(root+'/api/design',{method:'POST',headers:{Origin:root,'Content-Type':'application/json'},body:JSON.stringify({story:'和妈妈一起躲雨',place:'赤坎',sculpture:true,image:photoImage})});
    assert.equal(response.status,200);
    const {design}=await response.json();assert.deepEqual(design.brief.decisions.map(item=>item.topic),['framing','place','lettering','occlusion']);
  }finally{await new Promise(r=>server.close(r));}
});

test('a story without a location can proceed when the model omits the place decision',async()=>{
  const brief={summary:'和妈妈一起庆祝生日',elements:['妈妈','生日蛋糕'],composition:'母女围着蛋糕坐在一起',imagePrompt:'母女围着生日蛋糕坐在一起，背景为不指向任何城市的简洁场景。',decisions:['framing','lettering','occlusion'].map(topic=>({topic,evidence:'故事',action:'保留已知要素',uncertainty:'无额外未知'}))};
  const server=createApp({key:'test',fetchImpl:async()=>Response.json({choices:[{message:{content:JSON.stringify({caption:'生日留念',brief})}}]})});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const root=`http://127.0.0.1:${server.address().port}`;
  try{
    const response=await fetch(root+'/api/design',{method:'POST',headers:{Origin:root,'Content-Type':'application/json'},body:JSON.stringify({story:'和妈妈一起庆祝生日',sculpture:true,image:photoImage})});
    assert.equal(response.status,200);
    const {design}=await response.json();
    assert.deepEqual(design.brief.decisions.map(item=>item.topic),['framing','lettering','occlusion','place']);
    assert.match(design.brief.decisions[3].action,/不指定|不添加/);
  }finally{await new Promise(r=>server.close(r));}
});

test('a conflicting model scene is rejected before artwork can use a specified place',async()=>{
  const brief={summary:'在深圳留念',elements:['人物'],composition:'人物站在深圳街头',imagePrompt:'人物站在深圳街头，身后是深圳建筑。',decisions:['framing','place','lettering','occlusion'].map(topic=>({topic,evidence:'故事',action:'按故事构图',uncertainty:'无额外未知'}))};
  const server=createApp({key:'test',fetchImpl:async()=>Response.json({choices:[{message:{content:JSON.stringify({caption:'旅行留念',brief})}}]})});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const root=`http://127.0.0.1:${server.address().port}`;
  try{
    const response=await fetch(root+'/api/design',{method:'POST',headers:{Origin:root,'Content-Type':'application/json'},body:JSON.stringify({story:'和妈妈去旅行',place:'嘉兴',sculpture:true,image:photoImage})});
    assert.equal(response.status,502);
    assert.match((await response.json()).error,/嘉兴|地点/);
  }finally{await new Promise(r=>server.close(r));}
});

test('new planning removes model-invented lettering and rejects submitted bottom text',async()=>{
  const brief={summary:'母女同行',elements:['母女'],composition:'母女并肩',imagePrompt:'母女在嘉兴并肩留念。',label:'合影',decisions:['framing','place','lettering','occlusion'].map(topic=>({topic,evidence:'故事',action:'保留主体',uncertainty:'无额外未知'}))};
  const server=createApp({key:'test',fetchImpl:async()=>Response.json({choices:[{message:{content:JSON.stringify({caption:'同行',brief})}}]})});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const root=`http://127.0.0.1:${server.address().port}`;
  const post=body=>fetch(root+'/api/design',{method:'POST',headers:{Origin:root,'Content-Type':'application/json'},body:JSON.stringify({...body,image:photoImage})});
  try{
    const blankResponse=await post({story:'和妈妈旅行',place:'嘉兴',sculpture:true});
    assert.equal(blankResponse.status,200);
    const blank=await blankResponse.json();
    assert.equal(blank.design.brief.label,'');
    assert.match(blank.design.brief.decisions.find(item=>item.topic==='lettering').action,/不添加.*名牌|不加.*名牌/);
    const custom=await post({story:'和妈妈旅行',place:'嘉兴',labelText:'嘉兴',sculpture:true});
    assert.equal(custom.status,400);
  }finally{await new Promise(r=>server.close(r));}
});

test('event context appears only when selected and records element provenance',async()=>{
  const brief={summary:'一位观众参加活动',elements:['一位观众','笔记本电脑','塔奇克马机器人'],composition:'观众在电脑前',imagePrompt:'一位观众在桌前使用电脑。',label:'创客',decisions:['framing','place','lettering','occlusion'].map(topic=>({topic,evidence:'观众故事',action:'保留已知要素',uncertainty:'无额外未知'}))};
  const contexts=[];
  const server=createApp({key:'test',loadEventImages:async()=>({venueImage:'data:image/png;base64,iVBORw0KGgo=',characterImage:'data:image/png;base64,iVBORw0KGgo='}),fetchImpl:async(_url,options)=>{
    contexts.push(JSON.parse(JSON.parse(options.body).messages[1].content[0].text));
    return Response.json({choices:[{message:{content:JSON.stringify({caption:'创客',brief})}}]});
  }});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const root=`http://127.0.0.1:${server.address().port}`;
  const post=body=>fetch(root+'/api/design',{method:'POST',headers:{Origin:root,'Content-Type':'application/json'},body:JSON.stringify(body)});
  try{
    const free=await (await post({story:'一个人在深圳啤酒小镇参加黑客松',sculpture:true,image:'data:image/png;base64,iVBORw0KGgo='})).json();
    assert.equal(contexts[0].preset,undefined);
    assert.ok(free.design.brief.keyElements.every(item=>item.source==='观众故事／照片'));
    const event=await (await post({story:'一个人在深圳啤酒小镇参加黑客松',sculpture:true,image:photoImage,presetId:'shenzhen-hackathon'})).json();
    assert.equal(contexts[1].preset.character,'塔奇克马');
    assert.deepEqual(event.design.brief.keyElements.slice(-3).map(item=>[item.text,item.source]),[['深圳啤酒小镇','活动预设'],['黑客松','活动预设'],['塔奇克马','活动预设']]);
    assert.ok(event.design.brief.keyElements.filter(item=>item.source==='观众故事／照片').every(item=>!item.text.includes('塔奇克马')),'preset-only robot cannot be attributed to the visitor');
    assert.equal((await post({story:'旅行',place:'赤坎',sculpture:true,image:photoImage,presetId:'shenzhen-hackathon'})).status,400);
    assert.equal((await post({story:'旅行',sculpture:true,image:photoImage,presetId:'unknown'})).status,400);
  }finally{await new Promise(r=>server.close(r));}
});

test('a theme preset supplements the required source photo',async()=>{
  const brief={summary:'活动场地纪念',elements:['入口','电脑','机器人'],composition:'入口为主体，电脑和机器人相连',imagePrompt:'深圳啤酒小镇入口、电脑和塔奇克马组成单件纪念品。',decisions:['framing','place','lettering','occlusion'].map(topic=>({topic,evidence:'活动预设',action:'采用预设造型',uncertainty:'无观众照片'}))};
  let sent;
  const server=createApp({key:'test',loadEventImages:async()=>({venueImage:photoImage,characterImage:photoImage}),fetchImpl:async(_url,options)=>{sent=JSON.parse(options.body);return Response.json({choices:[{message:{content:JSON.stringify({caption:'活动留念',brief})}}]});}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const root=`http://127.0.0.1:${server.address().port}`;
  try{
    const response=await fetch(root+'/api/design',{method:'POST',headers:{Origin:root,'Content-Type':'application/json'},body:JSON.stringify({presetId:'shenzhen-hackathon',style:'paper',sculpture:true,image:photoImage})});
    assert.equal(response.status,200);
    const {design}=await response.json();assert.deepEqual(design.brief.keyElements.map(item=>item.source),['观众故事／照片','活动预设','活动预设','活动预设']);
    const context=JSON.parse(sent.messages[1].content[0].text);assert.equal(context.hasPhoto,true);assert.equal(context.story,'');assert.equal(context.style,'paper');
    assert.match(sent.messages[0].content,/不杜撰用户经历/);
  }finally{await new Promise(r=>server.close(r));}
});

test('design failures name missing evidence or model output without asking for invented stories',async()=>{
  let call=0;
  const replies=[
    {content:JSON.stringify({needsInput:{kind:'photo_unreadable',detail:'人物面部被遮挡'}})},
    {content:JSON.stringify({caption:'留念',brief:{summary:'真实记忆',elements:['人物'],imagePrompt:'人物在前',decisions:[]}})},
    {content:'{"caption":',finish_reason:'length'},
    {content:JSON.stringify({needsInput:{kind:'story_missing',detail:'没有故事'}})},
    {content:JSON.stringify({needsInput:{kind:'story_missing',detail:'没有故事'}})}
  ];
  const server=createApp({key:'test',loadEventImages:async()=>({venueImage:photoImage,characterImage:photoImage}),fetchImpl:async()=>{const reply=replies[call++];return Response.json({choices:[{message:{content:reply.content},finish_reason:reply.finish_reason}]});}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const root=`http://127.0.0.1:${server.address().port}`;
  const post=body=>fetch(root+'/api/design',{method:'POST',headers:{Origin:root,'Content-Type':'application/json'},body:JSON.stringify({sculpture:true,...body})});
  try{
    const photoGap=await post({image:photoImage});assert.equal(photoGap.status,422);
    assert.match((await photoGap.json()).error,/照片.*人物面部被遮挡.*更清晰/);
    const modelGap=await post({image:photoImage,story:'构图测试'});assert.equal(modelGap.status,502);
    assert.match((await modelGap.json()).error,/DeepSeek.*构图.*请重试/);
    const truncated=await post({image:photoImage,story:'截断测试'});assert.equal(truncated.status,502);
    assert.match((await truncated.json()).error,/输出.*截断.*不是.*故事/);
    const optionalStory=await post({presetId:'shenzhen-hackathon',image:photoImage});assert.equal(optionalStory.status,502);
    assert.match((await optionalStory.json()).error,/DeepSeek.*来源照片.*请重试/);
  }finally{await new Promise(r=>server.close(r));}
});

test('missing event images stop before any paid artwork submission',async()=>{
  let paid=0;
  const server=createApp({tripoKey:'test',loadEventImages:async()=>{throw new Error('活动预设缺少参考图');},fetchImpl:async()=>{paid++;throw new Error('unexpected upstream call');}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const root=`http://127.0.0.1:${server.address().port}`;
  try{
    const response=await fetch(root+'/api/artwork',{method:'POST',headers:{Origin:root,'Content-Type':'application/json'},body:JSON.stringify({story:'旅行',style:'enamel',design:createDesign({}),presetId:'shenzhen-hackathon'})});
    assert.equal(response.status,400);assert.match((await response.json()).error,/参考图/);assert.equal(paid,0);
  }finally{await new Promise(r=>server.close(r));}
});

test('AI 3D creation requires a photo before paid calls',async()=>{
  let paid=0;
  const server=createApp({key:'test',tripoKey:'test',fetchImpl:async()=>{paid++;throw new Error('must not call upstream');}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const root=`http://127.0.0.1:${server.address().port}`;
  const post=(path,body)=>fetch(root+path,{method:'POST',headers:{Origin:root,'Content-Type':'application/json'},body:JSON.stringify(body)});
  try{
    const design=await post('/api/design',{story:'只有故事',style:'clay',sculpture:true});
    assert.equal(design.status,400);assert.match((await design.json()).error,/照片/);
    const artwork=await post('/api/artwork',{story:'只有故事',style:'clay',sculpture:true,design:createDesign({})});
    assert.equal(artwork.status,400);assert.match((await artwork.json()).error,/照片/);
    assert.equal(paid,0);
  }finally{await new Promise(r=>server.close(r));}
});
