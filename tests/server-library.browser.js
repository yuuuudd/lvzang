import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdtemp,rm,readFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.js';
import {exportKeepsakeBackup} from '../public/src/travel-keepsake-backup.js';

const dir=await mkdtemp(join(tmpdir(),'lvzang-shared-ui-'));
const server=createApp({accountsEnabled:true,serverLibrary:true,testRoles:false,accountDir:join(dir,'accounts'),libraryDir:join(dir,'library'),fetchImpl:async()=>{throw Error('Unexpected paid request');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true});const a=await browser.newContext(),b=await browser.newContext(),p=await a.newPage(),q=await b.newPage(),errors=[];
for(const page of [p,q])page.on('pageerror',e=>errors.push(e.message));
try{
 await p.goto(base+'/portal.html');await p.locator('[name=username]').fill('teammates');await p.locator('[name=password]').fill('only-a-test-password');await p.getByRole('button',{name:'创建账号',exact:true}).click();await p.waitForURL('**/collection.html#world/canvas');await p.getByRole('heading',{name:'这里，等着你的第一段旅行。'}).waitFor();
 const id='shared-trip',mid='shared-memory',photo='shared-photo';
 const data={keepsakes:[{id,schemaVersion:1,title:'共享乌镇测试',tripTitle:'共享乌镇测试',city:'乌镇',kind:'miniature',scope:'personal',participants:[{id:'me',name:'我'}],modelRef:'pending',memoryIds:[mid],createdAt:1,updatedAt:1}],memories:[{id:mid,keepsakeId:id,authorId:'me',date:'',placeName:'乌镇',story:'两台设备看见同一段记忆',photoIds:[photo]}],photos:[{id:photo,blob:new Blob([await readFile('public/assets/keepsakes/memory-1.webp')],{type:'image/webp'}),story:'早茶'}],meta:[],requests:[]};
 const zip=await exportKeepsakeBackup({dump:async()=>data});
 await p.locator('[name=world-backup]').setInputFiles({name:'旅藏备份.zip',mimeType:'application/zip',buffer:Buffer.from(await zip.arrayBuffer())});await p.getByRole('heading',{name:'共享乌镇测试',exact:true}).waitFor();
 await p.getByRole('button',{name:'打开合集',exact:true}).click();await p.getByRole('button',{name:'编辑合集',exact:true}).click();await p.getByLabel('合集名称',{exact:true}).fill('乌镇 · 我们的早茶');await p.getByRole('button',{name:'保存合集',exact:true}).click();await p.getByRole('heading',{name:'乌镇 · 我们的早茶',exact:true}).waitFor();
 await q.goto(base+'/portal.html');await q.locator('[name=username]').fill('teammates');await q.locator('[name=password]').fill('only-a-test-password');await q.getByRole('button',{name:'登录',exact:true}).click();await q.waitForURL('**/collection.html#world/canvas');await q.getByRole('heading',{name:'乌镇 · 我们的早茶',exact:true}).waitFor();
 await q.reload();await q.getByRole('heading',{name:'乌镇 · 我们的早茶',exact:true}).waitFor();
 await mkdir('artifacts/lvzang-verification',{recursive:true});await q.screenshot({path:'artifacts/lvzang-verification/shared-library.png',fullPage:true});let activeModels=0,maximumModels=0,modelReads=0;
 await q.route(base+'/api/library',async route=>{const body=route.request().postDataJSON();if(body.method!=='getMeta'||!body.args[0]?.startsWith('generated-asset:queue-test-'))return route.continue();modelReads++;activeModels++;maximumModels=Math.max(maximumModels,activeModels);const response=await route.fetch();await new Promise(r=>setTimeout(r,80));await route.fulfill({response});activeModels--;});
 await q.evaluate(async()=>{const {openServerKeepsakeStore}=await import('/src/server-keepsake-store.js'),s=openServerKeepsakeStore();await Promise.all([s.getMeta('generated-asset:queue-test-one:0'),s.getMeta('generated-asset:queue-test-two:0'),s.getMeta('generated-asset:queue-test-one:0')]);});
 assert.equal(modelReads,2,'one download per unique model');assert.equal(maximumModels,1,'full model responses must not overlap');await q.unroute(base+'/api/library');
 assert.deepEqual(errors,[]);console.log('PASS: two browser contexts share the uploaded backup after login and reload; no paid requests');
}finally{await browser.close();await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
