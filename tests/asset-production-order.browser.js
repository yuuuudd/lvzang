import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createApp} from '../server.js';
import {mkdtemp,mkdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {makeMiniature} from '../public/src/travel-miniature.js';
import {glbFromPreview} from '../public/src/mesh-glb-export.js';

const dir=await mkdtemp(join(tmpdir(),'asset-production-order-'));
const server=createApp({accountsEnabled:true,serverLibrary:true,accountDir:join(dir,'accounts'),libraryDir:join(dir,'library')});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:'chrome',headless:true});

try{
 const page=await browser.newPage(),image=await readFile('public/assets/keepsakes/memory-1.webp');
 const model=makeMiniature('gz'),glb=new Uint8Array(await glbFromPreview({...model,originalColors:model.colors}).arrayBuffer());
 await page.goto(base+'/portal.html');
 await page.evaluate(async()=>{const {accountApi}=await import('/src/account-client.js');await accountApi('/api/auth/register',{username:'maker',password:'safe-password',name:'旅行用户'});});
 await page.goto(base+'/collection.html#world/canvas');
 await page.evaluate(async data=>{const {openKeepsakeStore}=await import('/src/travel-keepsake-store.js'),store=await openKeepsakeStore(),photo=new Blob([Uint8Array.from(atob(data.image),c=>c.charCodeAt(0))],{type:'image/webp'}),model=new Blob([new Uint8Array(data.glb)],{type:'model/gltf-binary'});await store.save({keepsake:{id:'production-work',schemaVersion:1,title:'西湖边的桌面纪念',tripTitle:'杭州旅行',tripId:'hangzhou-trip',city:'杭州',kind:'miniature',productType:'figurine',baseMode:'round',scope:'personal',participants:[{id:'me',name:'我'}],modelRef:'generated:production-job:0',generationId:'production-job',assetIndex:0,sourcePhotoId:'production-photo',memoryIds:['production-memory'],collectionStory:'和朋友一起走过西湖边。',createdAt:1,updatedAt:1,origin:'generated'},memories:[{id:'production-memory',keepsakeId:'production-work',authorId:'me',date:'2026-10-05',placeName:'杭州',story:'和朋友一起走过西湖边。',photoIds:['production-photo']}],photos:[{id:'production-photo',blob:photo}]});await store.setMeta('generated-asset:production-job:0',{reference:photo,glb:model,productType:'figurine',baseMode:'round',exportable:true,report:{checks:[{name:'topology',status:'pass'},{name:'connected',status:'pass'},{name:'standing-stability',status:'pass'}]}});await store.setMeta('generation-input:production-job',{style:'wood'});store.close();},{image:image.toString('base64'),glb:[...glb]});
 await page.reload();
 await page.evaluate(async()=>{const {openKeepsakeStore}=await import('/src/travel-keepsake-store.js'),store=await openKeepsakeStore();await store.savePhotoMemory('production-photo',{story:'西湖船上的最新照片故事。',manualStory:true});store.close();});
 await page.getByRole('button',{name:'打开合集',exact:true}).click();
 await page.getByRole('button',{name:'放大查看',exact:true}).click();
 await page.locator('.piece-view').waitFor();
 assert.equal(await page.getByRole('link',{name:'定制这段回忆',exact:true}).count(),0,'the piece has no duplicate customization link');
 assert.equal(await page.locator('.print-details').count(),0,'the print report is removed from piece details');
 await page.getByRole('button',{name:'提交实体制作',exact:true}).click();
 await page.waitForURL('**/orders.html?work=production-work#new');
 await page.getByRole('heading',{name:'确认实体制作',exact:true}).waitFor();
 await page.locator('#input-asset-preview canvas').waitFor();
 assert.match(await page.locator('#order-form').textContent(),/西湖边的桌面纪念.*摆件.*圆形底座/s);
 assert.match(await page.locator('#order-form').textContent(),/杭州.*2026-10-05.*木雕.*西湖船上的最新照片故事/s,'the production form visibly carries the current work metadata and photo story');
 assert.equal(await page.locator('#order-photo-preview img').count(),1,'source photo is already attached');
 await page.getByRole('button',{name:'返回我的定制订单',exact:true}).click();
 await page.getByRole('heading',{name:'我的订单',exact:true}).waitFor();
 await page.evaluate(()=>{location.hash='new';});
 await page.getByRole('heading',{name:'确认实体制作',exact:true}).waitFor();
 await page.locator('#input-asset-preview canvas').waitFor();
 assert.equal(await page.locator('[name=title]').inputValue(),'西湖边的桌面纪念','reopening the source form must reload the same work');
 assert.equal(await page.locator('#order-photo-preview img').count(),1,'reopening does not duplicate source photos');
 await mkdir('artifacts/asset-production-order',{recursive:true});
 await page.screenshot({path:'artifacts/asset-production-order/form.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'the prefilled production form fits mobile screens');
 await page.setViewportSize({width:1280,height:720});
 assert.equal(await page.locator('.product-choice:visible,[name=photos]:visible,[name=raw]:visible,[name=style]:visible').count(),0,'asset flow must not ask for known creation fields');
 await page.locator('[name=productionNote]').fill('数量和最终尺寸请先与我确认。');
 await page.getByRole('button',{name:'提交给经营者',exact:true}).click();
 await page.getByText('实体制作申请已提交，经营者可以开始生产检查。',{exact:true}).waitFor();
 const order=await page.evaluate(async()=>{const {accountApi}=await import('/src/account-client.js');return accountApi('/api/orders/'+location.hash.slice(1));});
 const saved=JSON.parse(await readFile(join(dir,'accounts','workspace.json'),'utf8')).orders.find(o=>o.id===order.id);
 assert.equal(order.productType,'figurine');assert.equal(order.baseMode,'round');assert.equal(order.deliveryType,'physical');assert.equal(saved.commission.place,'杭州');assert.equal(saved.commission.date,'2026-10-05');assert.equal(saved.commission.style,'wood');assert.match(order.raw,/西湖船上的最新照片故事/);assert.match(order.raw,/数量和最终尺寸/);
 const inputModel=order.inputs.find(f=>f.kind==='model');assert.ok(inputModel,'the existing 3D asset is attached to the order');
 assert.deepEqual(new Uint8Array(await (await page.request.get(base+inputModel.url)).body()),glb,'the submitted GLB is the existing asset');
 await page.getByRole('button',{name:'返回我的订单',exact:true}).click();
 await page.getByRole('button',{name:'提交新的定制需求',exact:true}).click();
 assert.equal(new URL(page.url()).search,'','a new commission must not reuse the previous source work');
 assert.equal(await page.locator('[name=title]').inputValue(),'');

 await page.goto(base+'/orders.html#new');
 assert.equal(await page.locator('.product-choice:visible').count(),1,'ordinary photo commission keeps the full form');
 assert.equal(await page.locator('[name=photos]:visible').count(),1);

 await page.evaluate(async data=>{const {openKeepsakeStore}=await import('/src/travel-keepsake-store.js'),store=await openKeepsakeStore(),photo=await store.getPhoto('production-photo');await store.save({keepsake:{id:'untyped-work',schemaVersion:1,title:'未定类型作品',city:'杭州',kind:'miniature',scope:'personal',participants:[{id:'me',name:'我'}],modelRef:'generated:untyped-job:0',generationId:'untyped-job',assetIndex:0,sourcePhotoId:'production-photo',memoryIds:['untyped-memory'],createdAt:1,updatedAt:1},memories:[{id:'untyped-memory',keepsakeId:'untyped-work',authorId:'me',date:'',placeName:'杭州',story:'未定类型',photoIds:['production-photo']}],photos:[{id:'production-photo',blob:photo}]});await store.setMeta('generated-asset:untyped-job:0',{reference:photo,glb:new Blob([new Uint8Array(data)],{type:'model/gltf-binary'})});store.close();},[...glb]);
 await page.goto(base+'/orders.html?work=untyped-work#new');
 await page.getByText('这件3D作品尚未固定产品类型，暂时不能提交实体制作',{exact:true}).waitFor();
 assert.equal(await page.locator('#order-form').count(),0,'an untyped model cannot masquerade as a production-ready order');
 console.log('PASS: a product-bound GLB opens the fast physical-production form while ordinary commissions keep the full form.');
}finally{
 await browser.close();
 await new Promise(resolve=>server.close(resolve));
 await rm(dir,{recursive:true,force:true});
}
