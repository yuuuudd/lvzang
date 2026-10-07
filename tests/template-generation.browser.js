import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdtemp,rm,readFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.js';

const dir=await mkdtemp(join(tmpdir(),'template-generation-'));
const image='data:image/webp;base64,'+(await readFile('public/assets/keepsakes/memory-1.webp')).toString('base64');
let art=0,models=0,submitted;
const services={curate:async input=>{submitted=input;return {story:input.story,points:input.photos.map(p=>({photoId:p.id,title:'江南回忆',evidence:'来源照片',storyDraft:input.story,cutoutKind:'scene'}))};},design:async()=>({caption:'江南回忆',brief:{elements:['人物'],summary:'园林里的回忆'}}),startArtwork:async()=>`art-${++art}`,readArtwork:async()=>({status:'success',image}),prepareImage:async x=>x,startModel:async()=>`model-${++models}`,readModel:async()=>({status:'success',glb:Buffer.from('test-model')}),inspect:async()=>({preview:{previewVersion:'raw-1',mesh:[-20,0,0,20,0,0,0,30,0],widthMm:40,heightMm:30,totalDepthMm:2},report:{checks:[]},exportable:false})};
const server=createApp({accountsEnabled:true,testRoles:true,accountDir:join(dir,'accounts'),collectionDir:join(dir,'jobs'),key:'test',tripoKey:'test',collectionServices:services,collectionPollMs:1});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
await mkdir('artifacts/template-generation',{recursive:true});
try{
 await page.goto(base+'/#template/garden');await page.locator('.template-form').waitFor();
 assert.equal(art,0);assert.equal(models,0);
 assert.equal(await page.getByRole('button',{name:'生成我的纪念品 →',exact:true}).count(),1,'template must offer real generation');
 await page.locator('#template-title').fill('我们的园林纪念');await page.locator('#template-story').fill('和朋友一起走过小桥');
 await page.locator('#template-photos').setInputFiles('public/assets/keepsakes/memory-1.webp');await page.locator('.person-photos img').waitFor();
 await page.screenshot({path:'artifacts/template-generation/desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'artifacts/template-generation/mobile.png',fullPage:true});
 await page.getByRole('button',{name:'生成我的纪念品 →',exact:true}).click();
 await page.waitForURL('**/collection.html#world/trip/**');await page.locator('.generated-preview').first().waitFor({timeout:20000});
 assert.equal(art,1);assert.equal(models,1);assert.equal(submitted.name,'我们的园林纪念');assert.equal(submitted.place,'苏州');assert.match(submitted.story,/小桥/);assert.match(submitted.story,/人物 × 江南园林/);assert.equal(submitted.memoryMode,'personal');
 await page.reload();await page.locator('.generated-preview').first().waitFor();assert.equal(models,1,'reload must resume without resubmitting');
 const saved=await page.evaluate(async()=>{const {openKeepsakeStore}=await import('/src/travel-keepsake-store.js'),s=await openKeepsakeStore();try{return (await s.dump()).keepsakes.filter(k=>k.origin==='generated').map(k=>k.modelRef);}finally{s.close();}});assert.equal(saved.length,1);assert.match(saved[0],/^generated:/);
 // With no upload, the template image provides an explicit example generation.
 await page.goto(base+'/#template/city');await page.locator('.template-form').waitFor();await page.getByRole('button',{name:'生成我的纪念品 →',exact:true}).click();await page.waitForURL('**/collection.html#world/trip/**');await page.locator('.generated-preview').first().waitFor();assert.equal(submitted.memoryMode,'city');assert.match(submitted.story,/示例/);assert.equal(models,2);
 assert.deepEqual(errors,[]);console.log('PASS visitor template -> uploaded photo/story -> one real job -> generated asset -> reload; no-upload example; desktop/mobile. Provider calls mocked.');
}finally{await browser.close();await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
