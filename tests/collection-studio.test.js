import test from 'node:test';
import assert from 'node:assert/strict';
import {initCollectionGeneration,showGeneratedAsset,defaultCollectionName} from '../public/src/collection-generation.js';
test('unnamed collections use location/date and distinct suffixes, explicit names are preserved',()=>{assert.equal(defaultCollectionName({place:'乌镇'},[],'2026-10-08'),'乌镇 · 2026-10-08');assert.equal(defaultCollectionName({place:'乌镇'},['乌镇 · 2026-10-08'],'2026-10-08'),'乌镇 · 2026-10-08（2）');assert.equal(defaultCollectionName({name:' 我们的早茶 ',place:'乌镇'}),'我们的早茶');});

test('inaccessible tasks stop polling and never resubmit a paid generation',async t=>{
 const tray={hidden:true,innerHTML:'',setAttribute(){},querySelectorAll(){return [];},addEventListener(){},remove(){}};
 const previous={document:Object.getOwnPropertyDescriptor(globalThis,'document'),CustomEvent:Object.getOwnPropertyDescriptor(globalThis,'CustomEvent')};
 Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>tray,getElementById:()=>({append(){}}),dispatchEvent(){}}});
 Object.defineProperty(globalThis,'CustomEvent',{configurable:true,value:class {}});
 t.after(()=>{for(const [key,value] of Object.entries(previous))if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];});
 let requests=0,timers=0;
 t.mock.method(globalThis,'setTimeout',()=>{timers++;return 0;});
 for(const status of [401,403,404]){
  requests=0;timers=0;t.mock.method(globalThis,'fetch',async(path,options)=>{requests++;assert.notEqual(options?.method,'POST');return Response.json({error:'任务不可访问'},{status});});
  const generation=await initCollectionGeneration({getMeta:async key=>key==='generation-jobs'?['old-task']:null},async()=>{});
  try{assert.equal(requests,1);assert.equal(timers,0);assert.match(tray.innerHTML,/自动查询已暂停/);await generation.refresh();assert.equal(requests,1);}finally{generation.destroy();}
 }
});

test('late model loading never overwrites a newer selected scene',async()=>{
 let finish,current=true;const source=new Promise(resolve=>finish=resolve),container={isConnected:true,innerHTML:'new selection'};
 const loading=showGeneratedAsset({getMeta:()=>source},{generationId:'task',assetIndex:0,label:'old'},container,{isCurrent:()=>current});
 current=false;finish({glb:new Blob(['model']),reference:new Blob(['image'])});
 const dispose=await loading;assert.equal(container.innerHTML,'new selection');dispose();
});

test('remote model preview is displayed transiently instead of uploading it back to the server',async t=>{
 let checks=0,writes=0,reads=0,requested='';t.mock.method(globalThis,'fetch',async url=>(requested=url,Response.json({previewVersion:'raw-1',mesh:[0,0,0,1,0,0,0,1,0]})));
 const store={remote:true,getMeta:async()=>{throw Error('remote preview must not download the full saved asset')},getAssetInfo:async()=>{reads++;return {reference:new Blob(['image']),report:{checks:[]},exportable:true,hasModel:true}},setMeta:async()=>writes++};
 const dispose=await showGeneratedAsset(store,{generationId:'remote-task',assetIndex:0,label:'作品'},{isConnected:true,innerHTML:''},{isCurrent:()=>++checks===1});
 assert.equal(reads,1);assert.equal(writes,0);assert.equal(requested,'/api/collection-jobs/remote-task/assets/0.json');dispose();
});

test('generation progress removes stopped jobs and only shows active work while generating',async t=>{
 const ids=['older-active','failed','stopped','current'];
 const jobs=new Map(ids.map((id,index)=>[id,{id,name:id,status:['running','failed','cancelled','running'][index],steps:[],assets:[],items:[]}]));
 const tray={hidden:true,innerHTML:'',setAttribute(){},querySelectorAll(){return [];},addEventListener(){},remove(){}};
 t.mock.method(globalThis,'fetch',async url=>Response.json(jobs.get(url.split('/').at(-1))));
 for(const [key,value] of Object.entries({document:{createElement:()=>tray,getElementById:()=>({append(){}}),dispatchEvent(){}},CustomEvent:class {}})){
  const previous=Object.getOwnPropertyDescriptor(globalThis,key);
  Object.defineProperty(globalThis,key,{value,configurable:true});
  t.after(()=>previous?Object.defineProperty(globalThis,key,previous):delete globalThis[key]);
 }
 const store={getMeta:async key=>key==='generation-jobs'?ids:null};
 const generation=await initCollectionGeneration(store,async()=>{});
 try{
  assert.match(tray.innerHTML,/<h3>older-active<\/h3>/);
  assert.match(tray.innerHTML,/<h3>current<\/h3>/);
  assert.doesNotMatch(tray.innerHTML,/<h3>(failed|stopped)<\/h3>/);
  jobs.get('older-active').status='cancelled';jobs.get('current').status='cancelled';
  await generation.refresh();assert.equal(tray.hidden,true);
  jobs.get('current').status='queued';await generation.refresh();
  assert.equal(tray.hidden,false);assert.match(tray.innerHTML,/<h3>current<\/h3>/);
  jobs.get('current').status='completed';await generation.refresh();
  assert.match(tray.innerHTML,/合集已完成/);assert.doesNotMatch(tray.innerHTML,/<h3>(failed|stopped|older-active)<\/h3>/);
 }finally{generation.destroy();}
});

test('remote collections import every finished model without copying giant previews through the browser',async t=>{
 const tray={hidden:true,innerHTML:'',setAttribute(){},querySelectorAll(){return [];},addEventListener(){},remove(){}};
 const previous={document:Object.getOwnPropertyDescriptor(globalThis,'document'),CustomEvent:Object.getOwnPropertyDescriptor(globalThis,'CustomEvent')};
 Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>tray,getElementById:()=>({append(){}}),dispatchEvent(){}}});
 Object.defineProperty(globalThis,'CustomEvent',{configurable:true,value:class {}});
 t.after(()=>{for(const [key,value] of Object.entries(previous))if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];});
 const id='finished-remote-job',draft={collectionId:id,name:'中山一日游',place:'中山',date:'2026-10-01',photos:[{id:'photo-1',blob:new Blob(['photo'])}]},saved=[],meta=[];
 const job={id,name:draft.name,place:draft.place,date:draft.date,status:'completed',steps:[],items:[],photoStories:[],assets:[0,1].map(index=>({index,photoId:'p1',title:'作品'+index,story:'旅行故事',model:'/model-'+index,reference:'/reference-'+index,preview:'/preview-'+index,printReport:{checks:[]},exportable:true})),cover:null};
 const store={remote:true,getMeta:async key=>key==='generation-jobs'?[id]:key==='generation-input:'+id?draft:null,getPhotoMemory:async()=>null,get:async()=>null,setMeta:async(key,value)=>meta.push([key,value]),save:async bundle=>saved.push(bundle)};
 const requests=[];t.mock.method(globalThis,'fetch',async url=>{requests.push(url);if(url==='/api/collection-jobs/'+id)return Response.json(job);if(url.startsWith('/preview-'))throw Error('giant preview must stay on the server');return new Response(new Blob([url]));});
 const generation=await initCollectionGeneration(store,async()=>{});
 try{assert.equal(saved.length,2);assert.equal(meta.filter(([key])=>key.startsWith('generated-asset:')).length,2);assert.equal(requests.some(url=>url.startsWith('/preview-')),false);assert.ok(meta.every(([,value])=>!value?.preview));}finally{generation.destroy();}
});
