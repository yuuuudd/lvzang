import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.js';
const dir=await mkdtemp(join(tmpdir(),'compact-collection-')),server=createApp({key:'',tripoKey:'',accountsEnabled:true,testRoles:true,accountDir:dir});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const base='http://127.0.0.1:'+server.address().port;
 await page.goto(base+'/collection.html?demo=1');await page.locator('.personal-viewbar').waitFor();
 assert.equal(await page.locator('.home-heading,.home-utility-bar,[data-world-view=timeline],[data-world-view=map]').count(),0,'only two navigation rows');
 await mkdir('artifacts/collection-tools',{recursive:true});
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});await page.getByRole('button',{name:'查看全部',exact:true}).click();
  const header=await page.locator('.collection-header').boundingBox(),bar=await page.locator('.personal-viewbar').boundingBox(),canvas=await page.locator('.home-viewport').boundingBox();
  assert.ok(header.height+bar.height<=155,JSON.stringify({width,header,bar}));assert.ok(Math.abs(bar.y+bar.height-canvas.y)<3);
  assert.equal(await page.getByRole('button',{name:'导出完整备份',exact:true}).isVisible(),false);
  assert.ok(await page.getByRole('button',{name:'定制我的',exact:true}).isVisible());
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'artifacts/collection-tools/'+width+'.png',fullPage:true});
 }
 await page.getByRole('button',{name:'放大画布',exact:true}).click();
 await page.locator('.collection-more>summary').click();await page.getByRole('button',{name:'整理画布',exact:true}).click();
 await page.locator('.collection-more>summary').click();await page.getByRole('button',{name:'完成摆放',exact:true}).waitFor();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'导出完整备份',exact:true}).click();assert.match((await download).suggestedFilename(),/\.zip$/);
 await page.locator('.collection-more>summary').click();await page.locator('.backup-card input').setInputFiles({name:'invalid.zip',mimeType:'application/zip',buffer:Buffer.from('invalid')});await page.locator('#collection-toast:not([hidden])').waitFor();
 await page.keyboard.press('Escape');assert.equal(await page.locator('.collection-more').getAttribute('open'),null);
 await page.locator('.collection-more>summary').click();await page.getByRole('button',{name:'完成摆放',exact:true}).click();await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'打开合集',exact:true}).first().click();await page.locator('.gallery-breadcrumb .collection-more').waitFor();
 await page.getByRole('button',{name:'返回主画布',exact:true}).click();await page.getByRole('button',{name:'添加旅行回忆',exact:true}).first().click();await page.locator('[name=photo]').waitFor({state:'attached'});
 await page.getByRole('button',{name:'返回主画布',exact:true}).click();await page.getByRole('button',{name:'定制我的',exact:true}).click();await page.locator('[data-identity-role=user]').click();await page.waitForURL('**/orders.html#new');await page.locator('#order-form').waitFor();assert.deepEqual(errors,[]);
 console.log('PASS compact two-row navigation, desktop/mobile, tools menu, backup/restore, detail return, creation, identity and customization form.');
}finally{await browser.close();await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
