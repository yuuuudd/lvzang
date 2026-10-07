import test from 'node:test';
import assert from 'node:assert/strict';
import {initCollectionGeneration,showGeneratedAsset} from '../public/src/collection-generation.js';

test('late model loading never overwrites a newer selected scene',async()=>{
 let finish,current=true;const source=new Promise(resolve=>finish=resolve),container={isConnected:true,innerHTML:'new selection'};
 const loading=showGeneratedAsset({getMeta:()=>source},{generationId:'task',assetIndex:0,label:'old'},container,{isCurrent:()=>current});
 current=false;finish({glb:new Blob(['model']),reference:new Blob(['image'])});
 const dispose=await loading;assert.equal(container.innerHTML,'new selection');dispose();
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
