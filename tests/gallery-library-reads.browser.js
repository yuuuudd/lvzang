import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.js';
const dir=await mkdtemp(join(tmpdir(),'gallery-reads-'));
const server=createApp({accountsEnabled:true,serverLibrary:true,accountDir:join(dir,'accounts'),libraryDir:join(dir,'library')});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const context=await browser.newContext();
 const response=await context.request.post(base+'/api/auth/setup',{headers:{Origin:base},data:{username:'reads',password:'only-a-test-password',name:'共享作品库'}});assert.equal(response.status(),200);
 const page=await context.newPage();await page.goto(base+'/collection.html');await page.locator('.travel-home').waitFor();
 await page.evaluate(async()=>{const {openKeepsakeStore}=await import('/src/travel-keepsake-store.js');const store=await openKeepsakeStore();try{for(let i=0;i<4;i++){
  const id='same-photo-version-'+i,memory=id+'-memory';
  await store.save({keepsake:{id,schemaVersion:1,title:'照片版本'+i,tripTitle:'同一趟旅行',tripId:'one-trip',city:'广州',kind:'miniature',scope:'personal',participants:[{id:'me',name:'我'}],modelRef:'pending',generationId:'shared-generation',assetIndex:0,memoryIds:[memory],createdAt:i,updatedAt:i},memories:[{id:memory,keepsakeId:id,authorId:'me',date:'',placeName:'广州',story:'原故事',photoIds:['one-photo']}],photos:[{id:'one-photo',blob:new Blob(['photo'],{type:'image/png'}),story:'手动保存的故事',manualStory:true}]});
 }}finally{store.close();}});
 const counts=new Map(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/library',async route=>{const body=route.request().postDataJSON();if(['getAssetInfo','getPhotoMemory'].includes(body.method)){const key=body.method+':'+body.args[0];counts.set(key,(counts.get(key)||0)+1);}await route.continue();});
 await page.reload();await page.locator('.trip-cover-card').waitFor();
 assert.equal(counts.get('getAssetInfo:generated-asset:shared-generation:0'),1,'shared model summary is read once across versions');
 assert.equal(counts.get('getPhotoMemory:one-photo'),1,'shared photo and manual story are read once across versions');
 await page.getByRole('button',{name:'打开合集',exact:true}).click();await page.getByRole('button',{name:'查看照片与故事',exact:true}).click();
 assert.match(await page.locator('#collection-dialog').textContent(),/手动保存的故事/);
 const updated=await page.evaluate(async()=>{const {openKeepsakeStore}=await import('/src/travel-keepsake-store.js');const store=await openKeepsakeStore();try{await store.getPhotoMemory('one-photo');await store.savePhotoMemory('one-photo',{story:'修改后的故事',manualStory:true});const photo=await store.getPhotoMemory('one-photo');const key='generated-asset:shared-generation:0';await store.getAssetInfo(key);await store.setMeta(key,{report:{status:'updated'},exportable:true});return {story:photo.story,summary:await store.getAssetInfo(key)};}finally{store.close();}});assert.equal(updated.story,'修改后的故事');assert.equal(updated.summary.report.status,'updated');
 assert.deepEqual(errors,[]);console.log('PASS: one reference/photo read across four versions; manual photo story preserved.');
}finally{await browser.close();await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
