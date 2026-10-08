import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createApp} from '../server.js';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const dir=await mkdtemp(join(tmpdir(),'photo-product-choice-'));
const server=createApp({key:'test',tripoKey:'test',collectionDir:dir});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  await page.goto(base+'/collection.html');
  const image=(await readFile('public/assets/keepsakes/memory-1.webp')).toString('base64');
  await page.evaluate(async image=>{const {openKeepsakeStore}=await import('/src/travel-keepsake-store.js'),store=await openKeepsakeStore(),blob=new Blob([Uint8Array.from(atob(image),c=>c.charCodeAt(0))],{type:'image/webp'});await store.save({keepsake:{id:'choice-shell',schemaVersion:1,title:'产品分流测试',tripTitle:'产品分流测试',tripId:'choice-trip',city:'广州',dateStart:'2026-10-06',dateEnd:'2026-10-06',kind:'miniature',scope:'personal',participants:[{id:'me',name:'我'}],modelRef:'collection-shell',collectionShell:true,collectionStory:'舞台记忆',memoryIds:['choice-memory'],createdAt:Date.now(),updatedAt:Date.now(),origin:'user'},memories:[{id:'choice-memory',keepsakeId:'choice-shell',authorId:'me',date:'2026-10-06',placeName:'广州',story:'绿光舞台',photoIds:['choice-photo']}],photos:[{id:'choice-photo',blob}]});store.close();},image);
  await page.reload();
  await page.getByRole('button',{name:'打开合集',exact:true}).click();
  await page.getByRole('button',{name:'查看照片与故事',exact:true}).click();
  await page.locator('#collection-dialog [data-photo=choice-photo]').click();
  const generate=page.getByRole('button',{name:'生成这张照片的3D模型',exact:true});
  assert.equal(await generate.isDisabled(),true,'paid generation stays blocked until a product is chosen');
  await page.getByRole('radio',{name:/桌面摆件/}).check();
  await page.getByLabel('造型风格').selectOption('wood');
  assert.equal(await generate.isEnabled(),true);
  await page.screenshot({path:'artifacts/photo-product-choice.png',fullPage:true});
  const request=page.waitForRequest(r=>r.url()===base+'/api/collection-jobs'&&r.method()==='POST');
  await generate.click({noWaitAfter:true});
  const body=(await request).postDataJSON();
  assert.deepEqual({productType:body.productType,baseMode:body.baseMode,style:body.style},{productType:'figurine',baseMode:'round',style:'wood'});
  console.log('PASS: photo 3D generation requires product choice and submits product geometry plus style.');
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
  await rm(dir,{recursive:true,force:true});
}
