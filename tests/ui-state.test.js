import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as designFns from '../public/src/design.js';
import {productLabels,productRulesVersion} from '../public/src/product-rules.js';
import {glbFromPreview} from '../public/src/mesh-glb-export.js';
import { validatePrintSettings } from '../public/src/print-settings.js';

function harness(fetchImpl=async()=>({json:async()=>({configured:false})})){
  const nodes=new Map(),saved=[];
  function element(id){
    if(!nodes.has(id))nodes.set(id,{
      value:'',firstChild:{textContent:''},classList:{toggle(){},add(){},remove(){}},handlers:{},dataset:{},
      addEventListener(type,fn){this.handlers[type]=fn;},dispatchEvent(event){this.handlers[event.type]?.(event);},focus(){},
      replaceChildren(){},append(){},setAttribute(){},removeAttribute(){},scrollIntoView(){},
      toDataURL(){return 'data:image/png;base64,iVBORw0KGgo=';},getContext(){return {drawImage(){},fillRect(){},getImageData(){return {};}};}
    });return nodes.get(id);
  }
  for(const [id,value] of Object.entries({place:'','preset':'none','photo-type':'auto',mode:'tripo3d',style:'enamel'}))element(id).value=value;
  let recognizer;
  // Mock browser/device boundaries; run the actual application handlers and design rules.
  const context=vm.createContext({...designFns,productLabels,productRulesVersion,glbFromPreview,validatePrintSettings,Date,Event,console,AbortController,DOMException,crypto,
    listHistory:async()=>saved,saveHistory:async record=>{const index=saved.findIndex(item=>item.id===record.id);if(index<0)saved.push(record);else saved[index]=record;},getHistory:async id=>saved.find(r=>r.id===id),
    document:{getElementById:element,querySelectorAll:()=>[],querySelector:()=>element('result'),createElement:()=>element('canvas'),addEventListener(){}},
    window:{addEventListener(){},SpeechRecognition:class{constructor(){recognizer=this;}start(){}stop(){}abort(){}}},
    fetch:fetchImpl,Image:class{naturalWidth=400;naturalHeight=400;decode(){return Promise.resolve();}},binaryStl(){},createPreview:()=>null
  });
  vm.runInContext(readFileSync(new URL('../public/src/app.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,''),context);
  return {element,context,saved,recognizer:()=>recognizer};
}

test('3D creation needs a photo and moves directly to one reference and review',async()=>{
  const requests=[];
  const brief={summary:'这一刻的合影',elements:['两个人'],composition:'两人并肩',imagePrompt:'照片中的两人并肩站立'};
  const {element,context}=harness(async(url,options)=>{
    requests.push({url,body:options?.body?JSON.parse(options.body):null});
    if(url==='/api/config')return Response.json({configured:true,tripoConfigured:true});
    if(url==='/api/design')return Response.json({design:{...designFns.createDesign({}),brief}});
    if(url==='/api/artwork')return Response.json({taskId:'moment'});
    if(url==='/api/artwork/moment')return Response.json({status:'success',image:'data:image/png;base64,iVBORw0KGgo='});
    if(url==='/api/reference-review')return Response.json({review:{checks:[{item:'人物',status:'ok',observation:'两人可见'}],suggestion:'无需修订'}});
    throw new Error('unexpected '+url);
  });
  element('preset').value='shenzhen-hackathon';
  for(const [id,value] of Object.entries({'print-colors':'1','print-width':'60'}))element(id).value=value;
  assert.equal(element('refine').hidden,true);
  await vm.runInContext('generate()',context);
  assert.match(element('status').textContent,/照片/);
  assert.equal(requests.some(item=>item.url==='/api/design'),false);
  vm.runInContext('photo={width:100,height:100}',context);
  element('revision').value='不要那两个人';
  await vm.runInContext('generate(true)',context);
  assert.match(element('status').textContent,/先生成参考图/);
  assert.equal(requests.some(item=>item.url==='/api/design'),false);
  await vm.runInContext('generate()',context);
  assert.equal(requests.filter(item=>item.url==='/api/artwork').length,1);
  assert.equal(requests.filter(item=>item.url==='/api/reference-review').length,1);
  assert.equal(requests.find(item=>item.url==='/api/design').body.coCreate,undefined);
  assert.equal(requests.find(item=>item.url==='/api/design').body.labelText,'');
  assert.equal(element('build-reference').hidden,false);
  assert.equal(element('refine').hidden,false);
});
test('stale speech cannot overwrite a newer story or recognition session',async()=>{
  const {element,context,recognizer}=harness();
  await new Promise(resolve=>setImmediate(resolve));
  element('story').value='原来的故事';element('voice').handlers.click();const oldRecognizer=recognizer();
  vm.runInContext('stopSpeech()',context);element('story').value='新输入的旅行故事';const speech=[{transcript:'迟到的语音'}];speech.isFinal=true;
  oldRecognizer.onresult({results:[speech]});assert.equal(element('story').value,'新输入的旅行故事');
  element('voice').handlers.click();oldRecognizer.onend();assert.equal(element('story').readOnly,true);
  await vm.runInContext('generate()',context);
  assert.equal(element('story').readOnly,false);
});

test('story mode passes the brief to image generation and preserves reference when modeling fails',async()=>{
  const brief={summary:'毕业海边回忆',elements:['风筝','毕业服'],composition:'三人并肩抱着风筝',imagePrompt:'三个毕业生抱着风筝坐在海边礁石上'};
  const requests=[];
  const {element,context,saved}=harness(async(url,options)=>{
    const body=options?.body?JSON.parse(options.body):null;requests.push({url,body});
    if(url==='/api/config')return Response.json({configured:true,tripoConfigured:true});
    if(url==='/api/design')return Response.json({design:{...designFns.createDesign({}),brief}});
    if(url==='/api/artwork')return Response.json({taskId:'reference-task'});
    if(url==='/api/artwork/reference-task')return Response.json({status:'success',image:'data:image/png;base64,iVBORw0KGgo='});
    if(url==='/api/reference-review')return Response.json({review:{checks:[{item:'人物',status:'ok',observation:'可见三人'}],suggestion:'无需修订'}});
    if(url==='/api/model')return Response.json({error:'建模暂不可用'},{status:502});
    throw new Error('unexpected '+url);
  });
  element('mode').value='tripo3d';element('preset').value='shenzhen-hackathon';element('story').value='毕业去海边';element('style').value='clay';element('label-text').value='嘉兴';
  vm.runInContext('photo={width:100,height:100}',context);
  for(const [id,value] of Object.entries({'print-colors':'1','print-width':'60','magnet-diameter':'6','magnet-depth':'2','magnet-clearance':'0.2'}))element(id).value=value;
  await vm.runInContext('generate()',context);
  assert.equal(requests.filter(r=>r.url==='/api/artwork').length,1);
  assert.equal(requests.find(r=>r.url==='/api/design').body.sculpture,true);
  assert.equal(requests.find(r=>r.url==='/api/design').body.style,'clay');
  assert.equal(requests.find(r=>r.url==='/api/design').body.presetId,'shenzhen-hackathon');
  assert.equal(requests.find(r=>r.url==='/api/design').body.photoType,'auto');
  assert.equal(requests.find(r=>r.url==='/api/design').body.place,'');
  assert.equal(requests.find(r=>r.url==='/api/design').body.labelText,'');
  assert.equal(requests.find(r=>r.url==='/api/design').body.date,'');
  assert.equal(Object.hasOwn(requests.find(r=>r.url==='/api/design').body,'caption'),false);
  assert.equal(Object.hasOwn(requests.find(r=>r.url==='/api/design').body,'landmark'),false);
  assert.equal(requests.find(r=>r.url==='/api/artwork').body.presetId,'shenzhen-hackathon');
  assert.equal(requests.find(r=>r.url==='/api/artwork').body.style,'clay');
  assert.equal(requests.find(r=>r.url==='/api/artwork').body.labelText,'');
  assert.equal(requests.find(r=>r.url==='/api/artwork').body.design.brief.selectedProposalId,undefined);
  assert.equal(requests.find(r=>r.url==='/api/artwork').body.design.brief.imagePrompt,brief.imagePrompt);
  assert.equal(element('concept-preview').hidden,false);assert.equal(element('brief-prompt').textContent,brief.imagePrompt);
  assert.equal(element('model-empty').hidden,true);
  assert.equal(saved.length,1);assert.equal(saved[0].phase,'reference');assert.equal(saved[0].presetId,'shenzhen-hackathon');
  assert.equal(requests.some(r=>r.url==='/api/model'),false,'reference must be reviewable before paying for 3D');
  await element('build-reference').handlers.click();
  assert.equal(element('export').disabled,true);assert.match(element('status').textContent,/建模暂不可用/);
  saved[0].input.landmark='旧地标';saved[0].caption='旧短句';
  await vm.runInContext(`openHistory('${saved[0].id}')`,context);
  assert.equal(element('preset').value,'shenzhen-hackathon');
  assert.equal(element('label-text').value,'嘉兴','obsolete hidden test value is ignored');
  assert.equal(element('concept-preview').hidden,false);assert.equal(element('model-stage').hidden,true);
  assert.equal(Object.hasOwn(vm.runInContext('inputs()',context),'landmark'),false);
  assert.equal(Object.hasOwn(vm.runInContext('recordContext()',context),'caption'),false);
  element('legacy-relief').hidden=false;
  await vm.runInContext(`openHistory('${saved[0].id}')`,context);
  assert.equal(element('legacy-relief').hidden,true);
  await element('relief-depth').handlers.change();assert.equal(element('export').disabled,true);
});

test('full automatic mode starts 3D after the reference review while manual mode waits',async()=>{
  const requests=[];
  const brief={summary:'旅行照片',elements:['街道'],composition:'街道纪念物',imagePrompt:'厚实街道纪念物'};
  const {element,context,saved}=harness(async(url,options)=>{
    requests.push(url);
    if(url==='/api/config')return Response.json({configured:true,tripoConfigured:true});
    if(url==='/api/design')return Response.json({design:{...designFns.createDesign({}),brief}});
    if(url==='/api/artwork')return Response.json({taskId:'auto-ref'});
    if(url==='/api/artwork/auto-ref')return Response.json({status:'success',image:'data:image/png;base64,iVBORw0KGgo='});
    if(url==='/api/reference-review')return Response.json({review:{checks:[{item:'街道',status:'ok',observation:'可见'}],suggestion:'无需修订'}});
    if(url==='/api/model')return Response.json({error:'模拟建模失败'},{status:502});
    throw new Error('unexpected '+url);
  });
  element('mode').value='tripo3d';element('creation-flow').value='auto';
  element('print-colors').value='1';element('print-width').value='60';
  vm.runInContext('photo={width:100,height:100}',context);
  await vm.runInContext('generate()',context);
  assert.equal(requests.filter(url=>url==='/api/model').length,1);
  assert.equal(saved[0].phase,'reference');
  assert.equal(element('build-reference').hidden,false,'failed modeling keeps the saved reference available');
});

test('automatic mode does not pay for 3D when its reference cannot be saved',async()=>{
  const requests=[];
  const brief={summary:'旅行',elements:['海'],composition:'海边',imagePrompt:'厚实的海边纪念物'};
  const {element,context}=harness(async(url)=>{
    requests.push(url);
    if(url==='/api/config')return Response.json({configured:true,tripoConfigured:true});
    if(url==='/api/design')return Response.json({design:{...designFns.createDesign({}),brief}});
    if(url==='/api/artwork')return Response.json({taskId:'unsaved-ref'});
    if(url==='/api/artwork/unsaved-ref')return Response.json({status:'success',image:'data:image/png;base64,iVBORw0KGgo='});
    if(url==='/api/reference-review')return Response.json({review:{checks:[{item:'海',status:'ok',observation:'可见'}],suggestion:'无需修订'}});
    if(url==='/api/model')return Response.json({taskId:'should-not-start'});
    throw new Error(url);
  });
  context.saveHistory=async()=>{throw new Error('storage full');};
  element('mode').value='tripo3d';element('creation-flow').value='auto';element('print-colors').value='1';element('print-width').value='60';
  vm.runInContext('photo={width:100,height:100}',context);
  await vm.runInContext('generate()',context);
  assert.equal(requests.includes('/api/model'),false);
  assert.equal(element('build-reference').hidden,false);
});

test('single composition goes straight to reference while review suggestion waits for a click',async()=>{
  const brief={summary:'独自参加黑客松',elements:['一个人','电脑','场地入口'],composition:'人物占前景，入口在后',imagePrompt:'照片人物占前景，入口在后，机器人作陪衬'};
  const requests=[];
  const {element,context,saved}=harness(async(url,options)=>{
    requests.push({url,body:options?.body?JSON.parse(options.body):null});
    if(url==='/api/config')return Response.json({configured:true,tripoConfigured:true});
    if(url==='/api/design')return Response.json({design:{...designFns.createDesign({}),brief}});
    if(url==='/api/artwork')return Response.json({taskId:'chosen-art'});
    if(url==='/api/artwork/chosen-art')return Response.json({status:'success',image:'data:image/png;base64,iVBORw0KGgo='});
    if(url==='/api/reference-review')return Response.json({review:{checks:[{item:'活动入口',status:'issue',observation:'入口不明显'}],suggestion:'加大活动入口'}});
    throw new Error('unexpected '+url);
  });
  element('preset').value='shenzhen-hackathon';element('story').value='我一个人到深圳啤酒小镇打 EvoMap 的黑客松，主题是攻壳护卫队';
  vm.runInContext('photo={width:100,height:100}',context);
  for(const [id,value] of Object.entries({'print-colors':'1','print-width':'60','magnet-diameter':'6','magnet-depth':'2','magnet-clearance':'0.2'}))element(id).value=value;
  await vm.runInContext('generate()',context);
  assert.equal(requests.filter(r=>r.url==='/api/design').length,1);
  assert.equal(requests.filter(r=>r.url==='/api/artwork').length,1);
  assert.equal(requests.find(r=>r.url==='/api/artwork').body.design.brief.imagePrompt,brief.imagePrompt);
  assert.equal(saved[0].design.brief.selectedProposalId,undefined);
  assert.equal(saved[0].review.checks[0].status,'issue');
  assert.equal(element('birth-card').hidden,false);
  assert.match(element('birth-story').textContent,/攻壳护卫队/);
  assert.match(element('birth-check').textContent,/三维：待生成/);
  assert.equal(element('revision').value,'','review cannot automatically redraw');
  await element('apply-review-suggestion').handlers.click();
  assert.equal(element('revision').value,'加大活动入口');
  assert.equal(requests.filter(r=>r.url==='/api/artwork').length,1,'suggestion only fills the edit box');
});

test('failed visual review asks for human inspection and keeps the reference',async()=>{
  const brief={summary:'独自参赛',elements:['一个人'],composition:'人物在前',imagePrompt:'人物在前'};
  const {element,context,saved}=harness(async url=>{
    if(url==='/api/config')return Response.json({tripoConfigured:true});
    if(url==='/api/design')return Response.json({design:{...designFns.createDesign({}),brief}});
    if(url==='/api/artwork')return Response.json({taskId:'review-fails'});
    if(url==='/api/artwork/review-fails')return Response.json({status:'success',image:'data:image/png;base64,iVBORw0KGgo='});
    if(url==='/api/reference-review')return Response.json({error:'视觉服务暂不可用'},{status:502});
    throw new Error('unexpected '+url);
  });
  element('preset').value='shenzhen-hackathon';element('story').value='独自参赛';
  vm.runInContext('photo={width:100,height:100}',context);
  for(const [id,value] of Object.entries({'print-colors':'1','print-width':'60'}))element(id).value=value;
  await vm.runInContext('generate()',context);
  assert.equal(saved[0].phase,'reference');assert.equal(element('build-reference').hidden,false);
  assert.match(element('review-suggestion').textContent,/人工核对/);
  assert.match(element('trail-review').textContent,/未完成/);
  assert.match(element('build-reference').textContent,/人工核对后/);
  assert.equal(element('apply-review-suggestion').hidden,true);
});

test('cloud timeout keeps resume, while failed geometry blocks export',async()=>{
  const {element,context}=harness();
  let tick=0;context.Date={now:()=>tick++?300001:0};
  vm.runInContext("currentJob={id:'still-running',context:{mode:'tripo3d'}}",context);
  await element('resume').handlers.click();
  assert.match(element('status').textContent,/仍在进行/);
  assert.notEqual(element('resume').hidden,true);
  const failed={mesh:new Float32Array(9),widthMm:60,heightMm:60,totalDepthMm:4,settings:{colors:1},report:{source:'glb',magnetHoles:[],checks:[{name:'topology',status:'fail',detail:'开放边'}]},versions:[{label:'原始模型',report:{checks:[]}}],parts:[],trace:[],exportable:false};
  vm.runInContext('applySculpture',context)(failed,designFns.createDesign({}), '测试模型',{place:''});
  assert.equal(element('export').disabled,true);
  assert.match(element('trail-model').textContent,/禁止导出/);
  const colored={...failed,originalColors:[255,0,0,255,0,0,255,0,0],faceColors:[0],palette:['#F0EBDD'],colorMode:'single',exportable:true};
  vm.runInContext('applySculpture',context)(colored,designFns.createDesign({}), '原色模型',{place:''});
  assert.equal(vm.runInContext('viewMode',context),'color');
  assert.equal(element('color-view').textContent,'原色三维');
  assert.equal(element('export-3mf').disabled,false,'white print export remains available');
});

test('photo alone can start the default story flow without hidden text inputs',async()=>{
  const requests=[];
  const {element,context}=harness(async(url,options)=>{
    requests.push({url,body:options?.body?JSON.parse(options.body):null});
    if(url==='/api/config')return Response.json({configured:true,tripoConfigured:true});
    if(url==='/api/design')return Response.json({design:{...designFns.createDesign({}),brief:{summary:'照片',elements:['画面主体'],composition:'主体居中',imagePrompt:'以照片构图'}}});
    if(url==='/api/artwork')return Response.json({taskId:'photo-task'});
    return Response.json({status:'success',image:'data:image/png;base64,iVBORw0KGgo='});
  });
  for(const [id,value] of Object.entries({'print-colors':'1','print-width':'60','magnet-diameter':'6','magnet-depth':'2','magnet-clearance':'0.2'}))element(id).value=value;
  vm.runInContext('photo={width:100,height:100}',context);
  await vm.runInContext('generate()',context);
  const input=requests.find(r=>r.url==='/api/design').body;
  assert.equal(input.story,'');assert.equal(input.place,'');assert.equal(input.date,'');
  assert.equal(input.photoType,'auto');assert.match(input.image,/^data:image\/(jpeg|png);base64,/);
  assert.equal(Object.hasOwn(input,'caption'),false);
  assert.equal(element('build-reference').hidden,false);
});

test('a theme preset cannot replace the required photo',async()=>{
  const requests=[];
  const {element,context}=harness(async(url,options)=>{
    requests.push({url,body:options?.body?JSON.parse(options.body):null});
    if(url==='/api/config')return Response.json({configured:true,tripoConfigured:true});
    if(url==='/api/design')return Response.json({design:{...designFns.createDesign({}),brief:{summary:'活动纪念',elements:['活动入口'],composition:'场地为主体',imagePrompt:'活动入口与电脑',proposals:[{id:'venue',title:'入口',focus:'入口',evidence:'预设入口',tradeoff:'电脑退后',composition:'场地为主体',imagePrompt:'活动入口与电脑'},{id:'activity',title:'活动',focus:'电脑',evidence:'预设活动',tradeoff:'入口退后',composition:'电脑为主体',imagePrompt:'电脑与活动入口'}]}}});
    if(url==='/api/artwork')return Response.json({taskId:'preset-task'});
    if(url==='/api/reference-review')return Response.json({review:{checks:[{item:'入口',status:'ok',observation:'入口可见'}],suggestion:'无需修订'}});
    return Response.json({status:'success',image:'data:image/png;base64,iVBORw0KGgo='});
  });
  for(const [id,value] of Object.entries({'print-colors':'1','print-width':'60','magnet-diameter':'6','magnet-depth':'2','magnet-clearance':'0.2'}))element(id).value=value;
  element('story').value='只有故事';
  await vm.runInContext('generate()',context);
  assert.match(element('status').textContent,/照片/);
  assert.equal(element('creation-error').hidden,false);
  assert.match(element('creation-error').textContent,/照片/);
  assert.equal(requests.some(r=>r.url==='/api/design'),false);
  element('story').value='';element('preset').value='shenzhen-hackathon';
  await vm.runInContext('generate()',context);
  assert.equal(requests.some(r=>r.url==='/api/design'),false);
  vm.runInContext('photo={width:100,height:100}',context);
  await vm.runInContext('generate()',context);
  const input=requests.find(r=>r.url==='/api/design').body;
  assert.equal(input.story,'');assert.match(input.image,/^data:image\/png;base64,/);assert.equal(input.presetId,'shenzhen-hackathon');
  assert.equal(requests.some(r=>r.url==='/api/artwork'),true);
  assert.equal(element('build-reference').hidden,false);
});

test('failed story generation restores the brief belonging to the previous exportable model',async()=>{
  const oldBrief={summary:'旧故事',elements:['旧人物'],composition:'旧场景',imagePrompt:'旧提示词'};
  const {element,context}=harness(async(url)=>{
    if(url==='/api/config')return Response.json({tripoConfigured:true});
    if(url==='/api/design')return Response.json({design:{...designFns.createDesign({}),brief:{...oldBrief,summary:'新故事'}}});
    return Response.json({error:'生图失败'},{status:502});
  });
  vm.runInContext(`design.brief=${JSON.stringify(oldBrief)};model={mesh:[]};`,context);
  element('mode').value='tripo3d';element('story').value='新故事';
  vm.runInContext('photo={width:100,height:100}',context);
  for(const [id,value]of Object.entries({'print-colors':'1','print-width':'60','magnet-diameter':'6','magnet-depth':'2','magnet-clearance':'0.2'}))element(id).value=value;
  await vm.runInContext('generate()',context);
  assert.equal(element('brief-summary').textContent,'旧故事');
});

test('failed first reference request does not leave an empty reference panel',async()=>{
  const brief={summary:'海边',elements:['海浪'],composition:'海浪居中',imagePrompt:'海浪居中'};
  const {element,context}=harness(async url=>{
    if(url==='/api/config')return Response.json({configured:true,tripoConfigured:true});
    if(url==='/api/design')return Response.json({design:{...designFns.createDesign({}),brief}});
    return Response.json({error:'生图失败'},{status:502});
  });
  element('story').value='看海';
  vm.runInContext('photo={width:100,height:100}',context);
  for(const [id,value] of Object.entries({'print-colors':'1','print-width':'60','magnet-diameter':'6','magnet-depth':'2','magnet-clearance':'0.2'}))element(id).value=value;
  await vm.runInContext('generate()',context);
  assert.equal(element('story-brief').hidden,true);
  assert.match(element('status').textContent,/生图失败/);
  assert.match(element('creation-error').textContent,/生图失败/);
});

test('revising a new memory does not reuse an old invented town or its image',async()=>{
  const requests=[];
  const brief={summary:'毕业合影',elements:['三个人'],composition:'三人并肩',imagePrompt:'三人并肩合影'};
  const {element,context}=harness(async(url,options)=>{
    const body=options?.body?JSON.parse(options.body):null;requests.push({url,body});
    if(url==='/api/config')return Response.json({configured:true,tripoConfigured:true});
    if(url==='/api/design')return Response.json({design:{...designFns.createDesign({}),brief}});
    return Response.json({error:'test stop'},{status:502});
  });
  element('story').value='我们三个人毕业时拍了一张合影';
  element('revision').value='把人物放大';
  vm.runInContext("design.brief={summary:'赤坎旧景',elements:['骑楼'],composition:'赤坎骑楼',imagePrompt:'赤坎骑楼'};referenceJob={design,concept:'data:image/png;base64,iVBORw0KGgo='};photo={width:100,height:100};",context);
  for(const [id,value] of Object.entries({'print-colors':'1','print-width':'60','magnet-diameter':'6','magnet-depth':'2','magnet-clearance':'0.2'}))element(id).value=value;
  await vm.runInContext('generate(true)',context);
  assert.equal(requests.find(item=>item.url==='/api/design').body.current,undefined);
  assert.equal(requests.find(item=>item.url==='/api/artwork').body.reference,undefined);
});

test('default reference flow ignores hidden magnet specifications',async()=>{
  let designRequest;
  const {element,context}=harness(async(url,options)=>{
    if(url==='/api/config')return Response.json({configured:true,tripoConfigured:true});
    if(url==='/api/design'){designRequest=JSON.parse(options.body);return Response.json({error:'test stop'},{status:502});}
    throw new Error('unexpected request');
  });
  await new Promise(resolve=>setImmediate(resolve));
  element('mode').value='tripo3d';element('story').value='旅行';
  vm.runInContext('photo={width:100,height:100}',context);
  for(const [id,value] of Object.entries({'print-colors':'1','print-width':'60','magnet-diameter':'6','magnet-depth':'99','magnet-clearance':'0.2'}))element(id).value=value;
  await vm.runInContext('generate()',context);
  assert.equal(designRequest.settings.magnetDepth,2);
});

test('confirmed reference checks the Tripo task without uploading its GLB',async()=>{
  const requests=[];
  const {element,context,saved}=harness(async(url,options)=>{
    const body=options?.body?JSON.parse(options.body):null;requests.push({url,body});
    if(url==='/api/model')return Response.json({taskId:'model-task'});
    if(url==='/api/model/model-task')return Response.json({status:'success'});
    return Response.json({error:'test stop'},{status:502});
  });
  for(const [id,value] of Object.entries({'print-colors':'1','print-width':'60','magnet-diameter':'6','magnet-depth':'2','magnet-clearance':'0.2'}))element(id).value=value;
  const design={...designFns.createDesign({story:'合影'}),brief:{summary:'合影',elements:['两人'],composition:'两人并肩',imagePrompt:'两人并肩'}};
  saved.push({id:'reference-task',phase:'reference',image:'data:image/png;base64,iVBORw0KGgo=',design,input:{story:'合影',place:''},settings:{colors:1,widthMm:60},style:'enamel',mode:'tripo3d'});
  context.testDesign=design;
  vm.runInContext("referenceJob={design:testDesign,input:{story:'合影',place:''},context:{style:'enamel',mode:'tripo3d'},settings:{colors:1,widthMm:60},concept:'data:image/png;base64,iVBORw0KGgo=',recordId:'reference-task'}",context);
  await element('build-reference').handlers.click();
  const check=requests.find(item=>item.url==='/api/model/model-task/inspect');
  assert.ok(check,'the model task must be inspected on the server');
  assert.equal(requests.some(item=>item.url==='/api/agent'),false);
  assert.equal(check.body.mounts,false);
  assert.equal(check.body.glb,undefined);
  assert.equal(saved[0].modelTaskId,'model-task');
  await vm.runInContext("openHistory('reference-task')",context);
  assert.equal(vm.runInContext('currentJob.id',context),'model-task');
  assert.equal(element('resume').hidden,false);
});

test('an existing paid model task attaches to its saved reference without resubmission',async()=>{
  const requests=[];
  const {context,saved,element}=harness(async url=>{requests.push(url);return Response.json({error:'unexpected request'},{status:500});});
  const token='paid-model.'+'a'.repeat(64);
  const design={...designFns.createDesign({story:'合影'}),brief:{summary:'合影',elements:['两人'],composition:'两人并肩',imagePrompt:'两人并肩'}};
  saved.push({id:'old-reference',phase:'reference',image:'data:image/png;base64,iVBORw0KGgo=',design,input:{story:'合影',place:''},settings:{colors:1,widthMm:60},style:'enamel',mode:'tripo3d'});
  await vm.runInContext(`recoverModelTask('${token}')`,context);
  assert.equal(saved[0].modelTaskId,token);
  assert.equal(vm.runInContext('currentJob.id',context),token);
  assert.equal(element('resume').hidden,false);
  assert.equal(requests.includes('/api/model'),false);
});

test('stopping during paid submission preserves the returned task ID for resume',async()=>{
  let submitted,finishSubmission,options;
  const reached=new Promise(resolve=>submitted=resolve);
  const {element,context}=harness(async(url,opts)=>{
    if(url==='/api/config')return Response.json({configured:true,tripoConfigured:true});
    if(url==='/api/design')return Response.json({design:designFns.createDesign({story:'旅行'})});
    if(url==='/api/artwork'){options=opts;submitted();return new Promise(resolve=>finishSubmission=resolve);}
    throw new Error('Polling should stop after cancellation');
  });
  await new Promise(resolve=>setImmediate(resolve));
  element('mode').value='tripo';element('style').value='enamel';element('story').value='旅行';
  vm.runInContext('photo={width:100,height:100}',context);
  const run=vm.runInContext('generate()',context);await reached;element('cancel').handlers.click();
  assert.equal(options.signal,undefined);
  finishSubmission(Response.json({taskId:'paid-task'}));await run;
  assert.equal(vm.runInContext('currentJob.id',context),'paid-task');
  assert.equal(element('resume').hidden,false);assert.equal(element('resume').disabled,false);
});

test('magnet production reads actual mounting dimensions',()=>{
  const {element,context}=harness();for(const [id,value]of Object.entries({'product-type':'magnet','print-colors':'1','print-width':'60','magnet-diameter':'8','magnet-depth':'3','magnet-clearance':'0.3'}))element(id).value=value;
  const settings=vm.runInContext('readPrintSettings()',context);assert.equal(settings.magnetDiameter,8);assert.equal(settings.magnetDepth,3);assert.equal(settings.clearance,.3);
});
test('a locked order cannot restore history from another product or commission',async()=>{
  const {element,context,saved}=harness();saved.push({id:'other',operatorId:'other-order',operatorBriefVersion:1,input:{productType:'magnet'},phase:'reference',image:'data:image/png;base64,iVBORw0KGgo=',design:designFns.createDesign({}),settings:validatePrintSettings(),style:'clay'});
  await new Promise(resolve=>setImmediate(resolve));vm.runInContext("operatorCreationContext={operatorId:'current',operatorBriefVersion:1,productType:'figurine',baseMode:'none'}",context);element('product-type').value='figurine';await vm.runInContext("openHistory('other')",context);assert.equal(element('product-type').value,'figurine');assert.match(element('status').textContent,/当前委托|历史/);
});
