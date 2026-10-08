import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdtemp,rm,readFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createApp} from '../server.js';
import {glbFromPreview} from '../public/src/mesh-glb-export.js';

const dir=await mkdtemp(join(tmpdir(),'lvzang-custom-')),photo=await readFile('public/assets/keepsakes/memory-1.webp');
const tetra=width=>{const a=[-width/2,0,-5],b=[width/2,0,-5],c=[0,30,-5],d=[0,5,12];return [a,c,b,a,b,d,a,d,c,b,c,d].flat();};
const model=(width,color)=>({mesh:tetra(width),originalColors:Array.from({length:12},()=>color).flat(),widthMm:width,heightMm:30,totalDepthMm:17,centerY:15,centerZ:3.5,previewVersion:'raw-1'});
const original=model(40,[255,100,80]),modified=model(24,[80,160,250]),glb=Buffer.from(await glbFromPreview(modified).arrayBuffer()),seedGlb=Buffer.from(await glbFromPreview(original).arrayBuffer());
const task=data=>Response.json({code:0,data});
const fetchImpl=async(url,options)=>{
  if(url.includes('deepseek.com')){const prompt=JSON.parse(options.body).messages[0].content;if(prompt.includes('专门为3D文旅纪念品定制'))return Response.json({choices:[{message:{content:JSON.stringify({intent:'revise_model',summary:'保留人物，将底座缩小并准备打印',reply:'已整理修改方案，请确认后生成新版本。',requirements:{purpose:'print',productType:'figurine',sizeMm:{width:120,height:90,depth:30},material:'resin',colorMode:'color',structure:['round_base'],quantity:1,engraving:'',keep:['人物'],change:['缩小底座']}})}}]});if(prompt.includes('selectedPhotoIds'))return Response.json({choices:[{message:{content:JSON.stringify({story:'照片里的旅行记忆',selectedPhotoIds:['p1'],points:[{photoId:'p1',title:'旅行记忆',evidence:'可见人物',storyDraft:'照片里的旅行记忆',cutoutKind:'scene'}]})}}]});return Response.json({choices:[{message:{content:JSON.stringify({caption:'广州旅行记忆',reason:'按修改要求更新',brief:{summary:'保留广州旅行的人物，将底座缩小',elements:['人物','广州'],composition:'广州旅行人物居中，缩小底座',imagePrompt:'依据广州来源照片保留人物并缩小底座',decisions:['framing','place','lettering','occlusion'].map(topic=>({topic,evidence:'来源照片',action:'保留',uncertainty:'无'}))}})}}]});}
  if(url.endsWith('/files'))return task({file_token:'photo'});
  if(url.includes('/generation/'))return task({task_id:'art'});
  if(url.includes('/tasks/'))return task({status:'success',progress:100,output:{generated_image_url:'https://cdn.tripo3d.ai/reference.webp'}});
  if(url.endsWith('reference.webp'))return new Response(photo);
  if(url.endsWith('/upload/sts'))return task({image_token:'image'});
  if(url.endsWith('/task'))return task({task_id:'model'});
  if(url.includes('/task/'))return task({status:'success',progress:100,output:{model:'https://cdn.tripo3d.ai/model.glb'}});
  if(url.endsWith('model.glb'))return new Response(glb);
  throw Error('unexpected URL '+url);
};
const durable=process.argv.includes('--server-library');
const server=createApp({accountsEnabled:durable,serverLibrary:durable,accountDir:join(dir,'accounts'),libraryDir:join(dir,'library'),key:'test',tripoKey:'test',fetchImpl,collectionDir:dir,collectionPollMs:5,build:async()=>({mesh:[-20,0,0,20,0,0,0,30,0],originalColors:[80,160,250,80,160,250,80,160,250],widthMm:40,heightMm:30,totalDepthMm:2,report:{checks:[]},parts:[]})});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:960}});if(durable){const login=await page.request.post(base+'/api/auth/register',{headers:{Origin:base},data:{username:'traveler',password:'test-password',name:'测试用户'}});assert.ok(login.ok());}await page.goto(base+'/collection.html');await page.locator('.personal-home').waitFor();
  await page.evaluate(async seed=>{const {openKeepsakeStore}=await import('/src/travel-keepsake-store.js'),store=await openKeepsakeStore(),photoBlob=await fetch('/assets/keepsakes/memory-1.webp').then(r=>r.blob()),now=Date.now();await store.save({keepsake:{id:'seed-piece',schemaVersion:1,title:'广州旅行记忆',tripTitle:'广州毕业旅行',tripId:'seed-trip',city:'广州',kind:'miniature',scope:'personal',participants:[{id:'me',name:'我'}],modelRef:'generated:seed-generation-01:0',generationId:'seed-generation-01',assetIndex:0,sourcePhotoId:'seed-photo',memoryIds:['seed-memory'],dateStart:'2026-10-06',dateEnd:'2026-10-06',createdAt:now,updatedAt:now,origin:'generated'},memories:[{id:'seed-memory',keepsakeId:'seed-piece',authorId:'me',date:'2026-10-06',placeName:'广州',story:'毕业旅行',photoIds:['seed-photo']}],photos:[{id:'seed-photo',blob:photoBlob}]});await store.setMeta('generated-asset:seed-generation-01:0',{glb:new Blob([new Uint8Array(seed.glb)],{type:'model/gltf-binary'}),reference:photoBlob,preview:seed.preview,report:{checks:[]},exportable:false,productType:'figurine',baseMode:'round'});store.close();},{glb:[...seedGlb],preview:original});
  await page.reload();await page.getByRole('button',{name:/打开合集/}).click();await page.getByRole('button',{name:'放大查看'}).click();await page.getByRole('button',{name:'和 AI 一起修改'}).click();
  await page.locator('[name=customization-message]').fill('人物保留，底座缩小一点，准备打印');await page.getByRole('button',{name:'发送修改要求'}).click();await page.getByText('信息已齐全').waitFor();await page.getByRole('button',{name:'导出定制需求单'}).waitFor();await mkdir('artifacts/customization-agent',{recursive:true});await page.screenshot({path:'artifacts/customization-agent/desktop-ready.png',fullPage:true});
  await page.getByRole('button',{name:'确认并生成新版本'}).click();await page.getByText('旧版本已保留').waitFor();
  const saved=await page.evaluate(async()=>{const {openKeepsakeStore}=await import('/src/travel-keepsake-store.js'),store=await openKeepsakeStore(),result={ids:(await store.list()).map(item=>item.id),requests:await store.listRequests()};store.close();return result;});assert.ok(saved.ids.includes('seed-piece'));
  try{await page.locator('[name=piece-version]').waitFor();}catch(error){console.log(await page.locator('body').innerText());console.log(await page.evaluate(async()=>{const {openKeepsakeStore}=await import('/src/travel-keepsake-store.js'),s=await openKeepsakeStore(),ids=await s.getMeta('generation-jobs')||[],jobs=await Promise.all(ids.map(id=>fetch('/api/collection-jobs/'+id).then(r=>r.json())));return {works:(await s.list()).map(k=>({id:k.id,source:k.sourcePhotoId,parent:k.versionOf,shell:k.collectionShell})),jobs:jobs.map(j=>({status:j.status,error:j.error,items:j.items,assets:j.assets?.length}))};}));throw error;}
  await page.waitForFunction(()=>document.querySelectorAll('[name=piece-version] option').length===2);
  const newId=await page.locator('[name=piece-version]').inputValue();assert.notEqual(newId,'seed-piece');
  await page.waitForFunction(()=>document.querySelector('.piece-main-model')?.dataset.previewMode==='3d');
  assert.equal(await page.locator('.piece-main-model').getAttribute('data-version-asset'),newId,'completion displays the newly generated model');
  const newFrame=await page.locator('.piece-main-model canvas').evaluate(canvas=>canvas.toDataURL());
  await page.getByRole('button',{name:'和 AI 一起修改',exact:true}).click();assert.equal(await page.locator('.customization-card').count(),0,'editing a different version must not reuse the previous generation plan');await page.getByRole('button',{name:'返回作品信息',exact:true}).click();
  await page.getByRole('button',{name:'对比版本',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.comparison-preview[data-preview-mode="3d"]').length===2);
  assert.notEqual(await page.locator('[data-compare-model=left]').getAttribute('data-version-asset'),await page.locator('[data-compare-model=right]').getAttribute('data-version-asset'));
  await page.getByRole('button',{name:'设计参考图',exact:true}).click();assert.equal(await page.locator('.comparison-preview>img').count(),2);
  await page.locator('[name=compare-right]').selectOption('seed-piece');
  await page.locator('[data-action=adopt-version][data-version=seed-piece]').waitFor();
  await page.getByRole('button',{name:'采用右侧版本',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.piece-main-model')?.dataset.versionAsset==='seed-piece'&&document.querySelector('.piece-main-model')?.dataset.previewMode==='3d');
  const originalFrame=await page.locator('.piece-main-model canvas').evaluate(canvas=>canvas.toDataURL());assert.notEqual(originalFrame,newFrame,'version selection must change the rendered geometry/colors');
  await page.locator('[name=piece-version]').selectOption(newId);await page.waitForFunction(()=>document.querySelector('.piece-main-model')?.dataset.previewMode==='3d');
  await page.getByRole('button',{name:'设为展示版本',exact:true}).click();await page.getByText('已将 V2 设为展示版本。',{exact:true}).waitFor();
  await page.reload();await page.locator('[name=piece-version]').waitFor();assert.equal(await page.locator('[name=piece-version]').inputValue(),newId,'display choice survives reload');
  await page.getByRole('button',{name:'返回合集',exact:true}).first().click();await page.locator('.exhibit-piece').waitFor();assert.equal(await page.locator('.exhibit-piece').count(),1,'all versions share one gallery position');
  assert.equal(await page.locator('.exhibit-piece [data-model]').getAttribute('data-version-asset'),newId);
  const lineage=await page.evaluate(async()=>{const {openKeepsakeStore}=await import('/src/travel-keepsake-store.js'),store=await openKeepsakeStore(),all=await store.list(),root=all.find(k=>k.id==='seed-piece'),version=all.find(k=>k.versionOf==='seed-piece'),requests=await store.listRequests();store.close();return {count:all.length,chosen:root.displayVersionId,parent:version.versionParentId,change:version.versionChange,requests};});
  assert.equal(lineage.count,2);assert.equal(lineage.chosen,newId);assert.equal(lineage.parent,'seed-piece');assert.ok(lineage.change.includes('底座'));assert.equal(lineage.requests.length,1);assert.equal(lineage.requests[0].keepsakeId,newId,'production request must select the generated version');
  await page.getByRole('button',{name:'放大查看',exact:true}).click();await page.getByRole('button',{name:'对比版本',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.comparison-preview[data-preview-mode="3d"]').length===2);await page.screenshot({path:'artifacts/customization-agent/version-compare-desktop.png'});
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'artifacts/customization-agent/version-compare-mobile.png',fullPage:true});
  console.log('PASS: new result appears, versions share one position, actual model switches, side-by-side model/reference comparison, explicit display choice survives reload, lineage retained, mobile; mocked generation only.');
}finally{await browser.close();await (await server.resumeCollections()).close();await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
