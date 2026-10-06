import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createApp} from '../server.js';
import {mkdir} from 'node:fs/promises';

const server=createApp();
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true});
await mkdir('artifacts/operator',{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/operator.html');await page.getByRole('heading',{name:'经营者工作台',exact:true}).waitFor();
 assert.equal(await page.locator('.commission-card').filter({hasText:'抖音创作者大会'}).count(),1);assert.equal(await page.locator('.commission-card').filter({hasText:'嘉兴夜游纪念摆件'}).count(),1);
 assert.ok(await page.getByText('需要协助创作',{exact:true}).count());assert.ok(await page.getByText('已有 3D 资产',{exact:true}).count());
 assert.deepEqual(await page.locator('[data-real-count]').allTextContents(),['0','0','0','0']);
 assert.equal(await page.locator('.commission-cards').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),2);
 await page.reload();assert.equal(await page.locator('.list-row').filter({hasText:'抖音创作者大会'}).count(),1);assert.equal(await page.locator('.list-row').filter({hasText:'嘉兴夜游纪念摆件'}).count(),1);
 await page.getByRole('button',{name:'新建代客委托',exact:true}).click();await page.locator('[name=raw]').waitFor();assert.ok(await page.locator('[name=sourcePhotos]').isVisible());assert.doesNotMatch(await page.locator('.commission-detail').textContent(),/数字交付/);await page.getByRole('button',{name:'返回列表',exact:true}).click();
 await page.locator('.commission-card').filter({hasText:'抖音创作者大会'}).click();await page.getByRole('heading',{name:'用户的故事',exact:true}).waitFor();
 const assisted=await page.locator('.commission-detail').textContent();assert.match(assisted,/已从用户端同步/);assert.match(assisted,/发送给用户确认/);assert.match(assisted,/尚未确认，不会开始建模/);assert.doesNotMatch(assisted,/导出交付包|数字交付/);
 assert.equal(await page.locator('.assisted-layout').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),3);
 await page.getByRole('button',{name:'返回列表',exact:true}).click();await page.locator('.commission-card').filter({hasText:'嘉兴夜游纪念摆件'}).click();await page.getByRole('heading',{name:'用户提交的 3D 资产',exact:true}).waitFor();
 const production=await page.locator('.commission-detail').textContent();assert.match(production,/生产检查/);assert.match(production,/发送报价与打样方案/);assert.doesNotMatch(production,/打开单件创作|导出交付包|数字交付/);
 assert.equal(await page.locator('.production-layout').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),2);
 await page.keyboard.press('Tab');assert.notEqual(await page.locator(':focus').evaluate(el=>getComputedStyle(el).outlineStyle),'none');
 const modeling=await page.evaluate(async()=>{const {openKeepsakeStore}=await import('/src/travel-keepsake-store.js'),{createCommission,saveCommission,confirmBrief,attachSelection,confirmReference}=await import('/src/operator-domain.js'),{loadOperatorCreation}=await import('/src/operator-bridge.js');const s=await openKeepsakeStore(),blob=await (await fetch('/assets/keepsakes/memory-1.webp')).blob(),k={id:'guard-source',schemaVersion:1,title:'确认守卫',city:'嘉兴',kind:'miniature',scope:'personal',participants:[{id:'me',name:'我'}],modelRef:'pending',memoryIds:['guard-memory'],revision:0,createdAt:1,updatedAt:1};await s.save({keepsake:k,memories:[{id:'guard-memory',keepsakeId:k.id,authorId:'me',date:'',placeName:'嘉兴',story:'用户故事',photoIds:['guard-photo']}],photos:[{id:'guard-photo',blob}]});let c=confirmBrief(createCommission({title:'确认守卫',productType:'figurine',raw:'用户故事',summary:'用户故事',photoIds:['guard-photo']}));c=await saveCommission(s,c);const before=await loadOperatorCreation(c.id);c=attachSelection(c,{id:k.id,revision:k.revision});c=await saveCommission(s,c);c=await saveCommission(s,confirmReference(c));const after=await loadOperatorCreation(c.id);s.close();return [before.modelingAllowed,after.modelingAllowed];});assert.deepEqual(modeling,[false,true]);
 await page.screenshot({path:'artifacts/operator/desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'artifacts/operator/mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS operator: seeded paths, story synchronization, branch-specific actions, physical delivery only, desktop/mobile; no paid calls.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
