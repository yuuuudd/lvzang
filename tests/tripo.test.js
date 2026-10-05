import test from 'node:test';
import assert from 'node:assert/strict';
import { startArtwork, readArtwork, artPrompt } from '../tripo.js';
import { createDesign, selectProposal } from '../public/src/design.js';

test('Tripo uploads references, requests a coherent image, then retrieves only the task output',async()=>{
  const calls=[];
  const fetchImpl=async(url,options={})=>{
    calls.push({url,options});
    if(url.endsWith('/upload/sts'))return Response.json({code:0,data:{image_token:'image-token'}});
    if(url.endsWith('/task'))return Response.json({code:0,data:{task_id:'test-task'}});
    if(url.includes('/task/'))return Response.json({code:0,data:{status:'success',progress:100,output:{generated_image:'https://cdn.tripo3d.ai/result.png'}}});
    return new Response(new Uint8Array([137,80,78,71,13,10,26,10]),{headers:{'Content-Type':'image/png'}});
  };
  const payload={story:'和妈妈旅行',place:'赤坎',date:'2026-09-22',style:'enamel',design:createDesign({story:'和妈妈旅行'}),image:'data:image/png;base64,iVBORw0KGgo='};
  assert.ok(artPrompt(payload).length<=1024);
  const id=await startArtwork(payload,{key:'secret',model:'gpt_image_2',fetchImpl});assert.equal(id,'test-task');
  const sent=JSON.parse(calls[1].options.body);assert.equal(sent.type,'generate_image');assert.equal(sent.files[0].file_token,'image-token');assert.match(sent.prompt,/赤坎/);assert.doesNotMatch(sent.prompt,/2026-09-22/);
  const result=await readArtwork(id,{key:'secret',model:'gpt_image_2',fetchImpl});assert.equal(result.status,'success');assert.match(result.image,/^data:image\/png;base64,/);
  assert.equal(calls.at(-1).options.headers?.Authorization,undefined);
});

test('Tripo rejects missing credentials, bad styles, bad asset locations, and invalid images',async()=>{
  const payload={story:'旅行',place:'赤坎',style:'enamel',design:createDesign({})};
  await assert.rejects(()=>startArtwork(payload,{key:''}),/TRIPO_API_KEY/);
  assert.throws(()=>artPrompt({...payload,style:'arbitrary'}),/风格/);
  assert.throws(()=>artPrompt({...payload,style:['enamel']}),/风格/);
  await assert.rejects(()=>readArtwork('id',{key:'x',fetchImpl:async()=>Response.json({code:0,data:{status:'success',output:{generated_image:'http://127.0.0.1/.env'}}})}),/结果地址/);
  await assert.rejects(()=>startArtwork(payload,{key:'x',model:'gpt_image_2',fetchImpl:async()=>new Response('secret-key',{status:401})}),/Tripo 密钥无效/);
  await assert.rejects(()=>startArtwork(payload,{key:'x',model:'gpt_image_2',fetchImpl:async()=>Response.json({code:2010,message:"You don't have enough credit to create this task"},{status:403})}),/积分不足.*2010/);
});

test('Tripo timeout during JSON reading or image download gives a useful retry message',async()=>{
  const timeout=()=>Promise.reject(new DOMException('The operation was aborted due to timeout','TimeoutError'));
  const payload={story:'旅行',style:'enamel',design:createDesign({})};
  await assert.rejects(startArtwork(payload,{key:'x',model:'gpt_image_2',fetchImpl:async()=>({ok:true,json:timeout})}),/Tripo.*超时/);
  await assert.rejects(readArtwork('id',{key:'x',model:'gpt_image_2',fetchImpl:async()=>({ok:true,json:timeout})}),/Tripo.*超时.*继续取生成结果/);
  const task=()=>Response.json({code:0,data:{status:'success',output:{generated_image:'https://cdn.tripo3d.ai/result.png'}}});
  await assert.rejects(readArtwork('id',{key:'x',model:'gpt_image_2',fetchImpl:async url=>url.includes('/task/')?task():timeout()}),/图片下载超时.*继续取生成结果/);
  const stream=new ReadableStream({start(controller){controller.error(new DOMException('The operation was aborted due to timeout','TimeoutError'));}});
  await assert.rejects(readArtwork('id',{key:'x',model:'gpt_image_2',fetchImpl:async url=>url.includes('/task/')?task():new Response(stream)}),/图片下载超时.*继续取生成结果/);
});

test('long valid stories retain redraw requests while dropping tiny date lettering',()=>{
  const prompt=artPrompt({story:'旅'.repeat(300),place:'赤坎',date:'2026-09-22',style:'enamel',design:{...createDesign({}),reason:'理'.repeat(160)},image:'photo',reference:'art',instruction:'修'.repeat(185)+'把日期改成红色'});
  assert.ok(prompt.length<=1024);assert.match(prompt,/把日期改成红色/);assert.doesNotMatch(prompt,/2026-09-22/);assert.match(prompt,/赤坎/);
  assert.doesNotMatch(prompt,/保留上次作品.*场景/);
});

test('redrawing for Jiaxing does not carry the previous image location forward',()=>{
  const design={...createDesign({}),brief:{summary:'和妈妈旅行',elements:['母女'],composition:'母女并肩',imagePrompt:'母女在嘉兴并肩留念。',label:'同行'}};
  const prompt=artPrompt({story:'和妈妈旅行',place:'嘉兴',style:'enamel',sculpture:true,design,reference:'old-art'});
  assert.match(prompt,/嘉兴/);
  assert.doesNotMatch(prompt,/保留上版人物和场景/);
});

test('empty bottom text produces no plaque while custom text is the only lettering',()=>{
  const design={...createDesign({}),brief:{summary:'母女同行',elements:['母女'],composition:'母女并肩',imagePrompt:'母女并肩走在树下。底部名牌写“合影”。',label:'合影'}};
  const blank=artPrompt({story:'母女同行',style:'enamel',sculpture:true,design});
  assert.match(blank,/不加.*文字牌|不加.*名牌/);
  assert.doesNotMatch(blank,/合影|留念/);
  const named=artPrompt({story:'母女同行',place:'嘉兴',labelText:'嘉兴',style:'enamel',sculpture:true,design});
  assert.match(named,/名牌“嘉兴”/);
  assert.doesNotMatch(named,/合影|留念/);
  for(const style of ['enamel','clay','paper']){
    const legacy=artPrompt({story:'母女同行',style,design});
    assert.match(legacy,/不加任何文字/);
    assert.doesNotMatch(legacy,/手写字|艺术字|文字像手绘招牌/);
  }
});

test('sculpture creation preserves the expanded story instead of forcing an arch template',()=>{
  const design={...createDesign({story:'毕业前我们在海边放风筝'}),brief:{summary:'三位毕业生在海边放风筝',elements:['三位毕业生','风筝','海浪'],composition:'人物围着风筝，海浪形成下方连接底座',imagePrompt:'三位穿毕业服的好友并肩坐在礁石上，一人怀抱折叠风筝，另一人伸手指向海平线。卷曲海浪从两侧包围礁石，形成连贯的白色微缩雕塑。保留学士帽、粗衣褶、风筝骨架和波浪凹槽。'}};
  const prompt=artPrompt({story:'毕业前我们在海边放风筝',place:'海边',style:'enamel',sculpture:true,colors:1,settings:{widthMm:80},design});
  assert.match(prompt,/怀抱折叠风筝/);assert.match(prompt,/学士帽/);assert.match(prompt,/80/);
  assert.doesNotMatch(prompt,/以建筑拱廊|简化圆润人物组成/);assert.ok(prompt.length<=1024);
  assert.throws(()=>artPrompt({story:'旅行',style:'enamel',sculpture:true,design:createDesign({})}),/扩写|构思/);
});

test('sculpture reference keeps background architecture compact for single-image 3D',()=>{
  const design={...createDesign({}),brief:{summary:'人物在活动现场',elements:['人物','场地'],composition:'人物在场地前',imagePrompt:'人物站在高耸的活动背景墙前。'}};
  const prompt=artPrompt({story:'人物在活动现场',style:'enamel',sculpture:true,design});
  assert.match(prompt,/禁止.*薄竖板|不得.*薄竖板/);
  assert.match(prompt,/背面.*连续/);
});

test('sculpture reference keeps photo colors independent of print filament count',()=>{
  const design={...createDesign({}),brief:{summary:'海边留念',elements:['海浪'],composition:'海浪居中',imagePrompt:'一朵大海浪作为主体。',label:'看海'}};
  const prompts=['enamel','clay','paper'].map(style=>artPrompt({story:'看海',style,sculpture:true,colors:1,design}));
  assert.equal(new Set(prompts).size,3);
  for(const prompt of prompts){assert.match(prompt,/照片.*原色|原色.*照片/);assert.doesNotMatch(prompt,/全件哑光白/);assert.match(prompt,/全部相连/);assert.match(prompt,/不加任何文字/);}
  assert.match(prompts[0],/凸边.*分区/);
  assert.match(prompts[1],/饱满.*手塑/);
  assert.match(prompts[2],/层叠.*剪影.*台阶/);
  const photo=artPrompt({story:'和妈妈在海边散步',place:'海边',style:'paper',sculpture:true,colors:1,image:'photo',design});
  assert.match(photo,/image\[1\].*可辨.*特征/);
  assert.match(photo,/按.*故事.*动作.*照片.*特征|照片.*特征.*故事.*动作/);
  assert.match(photo,/重新造型/);
  assert.match(photo,/背景.*指定地点/);
  const photoOnly=artPrompt({style:'clay',sculpture:true,colors:1,image:'photo',design});
  assert.match(photoOnly,/未提供故事.*不虚构关系或动作/);
  assert.doesNotMatch(photoOnly,/按故事确定关系与动作/);
  const multi=artPrompt({story:'看海',style:'paper',sculpture:true,colors:3,design});
  assert.doesNotMatch(multi,/最多3色|仅用米白/);
  assert.match(multi,/复古|拼贴/);
  assert.match(multi,/照片.*原色|原色.*照片/);
});

test('explicit landscape photo focus does not compete with a generic people-first instruction',()=>{
  const design={...createDesign({}),brief:{summary:'海岸合照',elements:['海岸'],composition:'海岸居中',imagePrompt:'海岸与人物同框。',label:'海岸'}};
  const prompt=artPrompt({photoType:'landscape',image:'photo',style:'clay',sculpture:true,design});
  assert.match(prompt,/照片以风景为主体/);
  assert.doesNotMatch(prompt,/有人物则.*肖像占主体/);
});

test('sculpture reference keeps one large printable label and drops tiny date/caption lettering',()=>{
  const design={...createDesign({}),brief:{summary:'半身旅行合照',elements:['半身人物'],composition:'人物与地点名牌相连',imagePrompt:'景'.repeat(600)}};
  const prompt=artPrompt({place:'地点'.repeat(6),date:'2026-09-23',labelText:'纯正',landmark:'地标'.repeat(30),style:'enamel',sculpture:true,colors:4,settings:{widthMm:120},image:'photo',reference:'art',design});
  assert.ok(prompt.length<=1024);
  assert.match(prompt,/唯一.*大字.*纯正/);assert.doesNotMatch(prompt,/2026-09-23|把今天带回家/);
  assert.match(prompt,/无.*其他.*文字|禁止.*其他.*文字/);assert.match(prompt,/半身/);assert.match(prompt,/不.*补.*腿/);
  assert.match(prompt,/背包.*肩带/);assert.match(prompt,/用户.*地点/);assert.match(prompt,/未.*核验|未.*查证/);
  assert.match(prompt,/景{100}/,'approved scene remains in the prompt');
});

test('sculpture reference does not invent a label when an older brief has none',()=>{
  const design={...createDesign({}),brief:{summary:'旅行',elements:['人物'],composition:'人物在前',imagePrompt:'人物在前。铭牌写下2026-09-23和把今天带回家。'}};
  const prompt=artPrompt({place:'上海迪士尼乐园',date:'2026-09-23',style:'enamel',sculpture:true,design});
  assert.match(prompt,/不加任何文字/);
  assert.doesNotMatch(prompt,/铭牌写下|名牌“留念”/);
  assert.doesNotMatch(prompt,/2026-09-23|把今天带回家/);
  assert.match(prompt,/地点上海迪士尼乐园/);
});

test('visitor may choose a short landmark label instead of cutting a long place name',()=>{
  const design={...createDesign({}),brief:{summary:'旅行',elements:['人物'],composition:'人物在前',imagePrompt:'人物在前。',label:'迪士尼'}};
  const prompt=artPrompt({place:'上海迪士尼乐园',labelText:'迪士尼',style:'enamel',sculpture:true,design});
  assert.match(prompt,/唯一.*大字.*迪士尼/);
  assert.match(prompt,/地点上海迪士尼乐园/);
});

test('free creation keeps the full place in the scene and does not invent a default landmark',()=>{
  const brief={summary:'一个人在深圳啤酒小镇参加黑客松',elements:['一个参赛者','笔记本电脑'],composition:'人在电脑前',imagePrompt:'深圳啤酒小镇入口前，一个人用笔记本电脑参加黑客松。',label:'创客'};
  const design={...createDesign({story:brief.summary}),brief};
  const prompt=artPrompt({story:brief.summary,place:'深圳啤酒小镇',style:'enamel',sculpture:true,design});
  assert.match(prompt,/故事场景：深圳啤酒小镇入口前/);
  const photoOnly=artPrompt({story:'',place:'',style:'enamel',sculpture:true,design:{...design,brief:{...brief,imagePrompt:'按照片里的可见人物做纪念造型。',label:'留念'}}});
  assert.doesNotMatch(photoOnly,/赤坎|用户指定地点\s*[；。]/);
  assert.match(photoOnly,/无地点依据.*真实城市|无可靠地点.*真实城市/);
  assert.match(prompt,/深圳啤酒小镇.*不得.*其他.*地标/);
});

test('selected event sends venue and Tachikoma references in the numbered prompt order',async()=>{
  const image=n=>`data:image/png;base64,${Buffer.from([137,80,78,71,13,10,26,10,n]).toString('base64')}`;
  const preset={venue:'深圳啤酒小镇',activity:'黑客松',character:'塔奇克马',venueImage:image(2),characterImage:image(3)};
  const brief={summary:'一人在现场参赛',elements:['一位观众'],composition:'观众居中',imagePrompt:'一位观众坐在桌前。',label:'创客'};
  const body={story:'一个人在深圳啤酒小镇参加黑客松',style:'enamel',sculpture:true,design:{...createDesign({}),brief},image:image(1),reference:image(4),preset};
  assert.match(artPrompt(body),/不要添加其他人物/);
  assert.ok(artPrompt({...body,colors:4,settings:{widthMm:120}}).length<=1024);
  const uploaded=[],fetchImpl=async(url,options)=>{
    if(url.endsWith('/upload/sts')){uploaded.push(new Uint8Array(await options.body.get('file').arrayBuffer()).at(-1));return Response.json({code:0,data:{image_token:`token-${uploaded.length}`}});}
    if(url.endsWith('/task')){
      const sent=JSON.parse(options.body);
      assert.deepEqual(uploaded,[1,2,3,4]);
      assert.deepEqual(sent.files.map(file=>file.file_token),['token-1','token-2','token-3','token-4']);
      assert.match(sent.prompt,/image\[2\].*深圳啤酒小镇/);
      assert.match(sent.prompt,/image\[3\].*塔奇克马/);
      assert.match(sent.prompt,/黑客松/);
      assert.ok(sent.prompt.length<=1024);
      return Response.json({code:0,data:{task_id:'event-task'}});
    }
    throw new Error('unexpected URL');
  };
  assert.equal(await startArtwork(body,{key:'test',model:'gpt_image_2',fetchImpl}),'event-task');
  assert.doesNotMatch(artPrompt({...body,preset:null}),/塔奇克马|image\[3\]/);
});

test('a solo visitor can choose venue-first without adding other people',()=>{
  const brief={summary:'独自参赛',elements:['参赛者','入口'],composition:'人物在前',imagePrompt:'人物在前，入口在后',proposals:[
    {id:'person',title:'人物主角',focus:'参赛者',evidence:'照片中一人',tradeoff:'入口在后',composition:'人物在前',imagePrompt:'人物在前，入口在后'},
    {id:'venue',title:'场地主角',focus:'入口',evidence:'预设入口',tradeoff:'人物缩小',composition:'入口在前',imagePrompt:'入口在前，人物在旁'}
  ]};
  const design=selectProposal({...createDesign({}),brief},'venue');
  const prompt=artPrompt({story:'我一个人打黑客松',style:'enamel',sculpture:true,design,preset:{venue:'深圳啤酒小镇',activity:'黑客松',character:'塔奇克马',venueImage:'venue',characterImage:'robot'},image:'photo'});
  assert.match(prompt,/不要添加其他人物/);
  assert.match(prompt,/按所选构图决定主次/);
  assert.doesNotMatch(prompt,/观众为主角/);
  assert.match(prompt,/入口在前，人物在旁/);
});

test('selected signature wall stays the venue focus instead of forcing a different entrance',()=>{
  const proposals=[
    {id:'person',title:'人物',focus:'人物',evidence:'照片',tradeoff:'墙退后',composition:'人物在前',imagePrompt:'人物在前，签名墙在后'},
    {id:'venue',title:'场地',focus:'照片签名墙',evidence:'照片',tradeoff:'人物缩小',composition:'签名墙占主体',imagePrompt:'照片里的活动签名墙占主体，一个参赛者缩小在旁'}
  ];
  const design=selectProposal({...createDesign({}),brief:{summary:'独自参赛',elements:['签名墙'],composition:'人物在前',imagePrompt:'人物在前',proposals}},'venue');
  const prompt=artPrompt({story:'一个人打黑客松',style:'enamel',sculpture:true,design,preset:{venue:'深圳啤酒小镇',activity:'黑客松',character:'塔奇克马',venueImage:'venue',characterImage:'robot'},image:'photo'});
  assert.match(prompt,/照片里的活动签名墙占主体/);
  assert.match(prompt,/照片可见场地应保留/);
  assert.doesNotMatch(prompt,/建筑入口；/);
});

test('a theme preset alone uses event elements without inventing the visitor',()=>{
  const preset={venue:'深圳啤酒小镇',activity:'黑客松',character:'塔奇克马',venueImage:'venue',characterImage:'character'};
  const design={...createDesign({}),brief:{summary:'活动纪念',elements:['场地入口'],composition:'入口与机器人',imagePrompt:'场地入口、电脑和机器人组成纪念品。'}};
  const prompt=artPrompt({style:'paper',sculpture:true,colors:1,design,preset});
  assert.match(prompt,/场地入口.*电脑.*塔奇克马/);
  assert.match(prompt,/不添加.*观众人物/);
  assert.doesNotMatch(prompt,/观众为主角/);
});

test('GPT Image 2.5 uses Tripo v3 multi-image upload, task polling and result fields',async()=>{
  const image=n=>`data:image/png;base64,${Buffer.from([137,80,78,71,13,10,26,10,n]).toString('base64')}`;
  const brief={summary:'参赛',elements:['参赛者'],composition:'人物居中',imagePrompt:'一个人使用电脑。',label:'创客'};
  const body={story:'参加黑客松',style:'enamel',sculpture:true,design:{...createDesign({}),brief},image:image(1),preset:{venue:'深圳啤酒小镇',activity:'黑客松',character:'塔奇克马',venueImage:image(2),characterImage:image(3)}};
  const urls=[],fetchImpl=async(url,options={})=>{
    urls.push(url);
    if(url.endsWith('/v3/files'))return Response.json({code:0,data:{file_token:`file-${urls.length}`}});
    if(url.endsWith('/v3/generation/image-to-image')){
      const sent=JSON.parse(options.body);
      assert.equal(sent.model,'chat_image_2.5_sunburst');
      assert.deepEqual(sent.inputs,['file-1','file-2','file-3']);
      assert.equal(sent.quality,'medium');
      assert.equal(sent.background,'opaque');
      assert.match(sent.prompt,/image\[2\].*深圳啤酒小镇/);
      return Response.json({code:0,data:{task_id:'v3-image'}});
    }
    if(url.endsWith('/v3/tasks/v3-image'))return Response.json({code:0,data:{status:'success',progress:100,output:{generated_image_url:'https://cdn.tripo3d.ai/v3-result.png'}}});
    if(url==='https://cdn.tripo3d.ai/v3-result.png')return new Response(new Uint8Array([137,80,78,71,13,10,26,10]));
    throw new Error('unexpected '+url);
  };
  assert.equal(await startArtwork(body,{key:'test',model:'chat_image_2.5_sunburst',fetchImpl}),'v3-image');
  assert.match((await readArtwork('v3-image',{key:'test',model:'chat_image_2.5_sunburst',fetchImpl})).image,/^data:image\/png;base64,/);
  assert.equal(urls.some(url=>url.includes('/v2/')),false);
});

test('GPT Image 2.5 without references uses Tripo v3 text-to-image',async()=>{
  const body={story:'一段没有照片的故事',style:'enamel',design:createDesign({story:'一段没有照片的故事'})};
  const fetchImpl=async(url,options)=>{
    assert.ok(url.endsWith('/v3/generation/text-to-image'));
    const sent=JSON.parse(options.body);assert.equal(sent.model,'chat_image_2.5_flare');assert.equal(sent.inputs,undefined);
    return Response.json({code:0,data:{task_id:'text-only'}});
  };
  assert.equal(await startArtwork(body,{key:'test',model:'chat_image_2.5_flare',fetchImpl}),'text-only');
});

test('free photo-only creation uploads only the visitor photo',async()=>{
  const image=`data:image/png;base64,${Buffer.from([137,80,78,71,13,10,26,10]).toString('base64')}`;
  const body={story:'',style:'enamel',design:createDesign({hasPhoto:true}),image};
  const calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push(url);
    if(url.endsWith('/v3/files'))return Response.json({code:0,data:{file_token:'visitor-photo'}});
    const sent=JSON.parse(options.body);
    assert.ok(url.endsWith('/v3/generation/image-to-image'));
    assert.equal(sent.input,'visitor-photo');assert.equal(sent.inputs,undefined);
    assert.doesNotMatch(sent.prompt,/深圳啤酒小镇|塔奇克马|活动预设/);
    return Response.json({code:0,data:{task_id:'free-photo'}});
  };
  assert.equal(await startArtwork(body,{key:'test',fetchImpl}),'free-photo');
  assert.equal(calls.length,2);
});
