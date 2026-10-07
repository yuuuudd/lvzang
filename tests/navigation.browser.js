import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.js';
const dir=await mkdtemp(join(tmpdir(),'navigation-')),server=createApp({accountsEnabled:true,testRoles:true,accountDir:dir,key:'',tripoKey:''});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 assert.equal((await page.request.get(base+'/production.html?operator=missing',{maxRedirects:0})).status(),302);
 await page.goto(base+'/');await page.locator('.home-hero').waitFor();
 await page.getByRole('navigation',{name:'主导航'}).getByRole('link',{name:'去旅行',exact:true}).click();await page.locator('.stop-card').first().waitFor();
 assert.equal(await page.locator('#merchant-section,#collection-section').count(),0);
 await page.locator('[data-unlock]').first().click();await page.locator('#memory-story').fill('珠江边的一次旅行');await page.locator('#print-text').fill('毕业快乐');
 await page.locator('#print-form button[type=submit]').click();await page.locator('[data-identity-role=user]').click();await page.waitForURL('**/orders.html#new');await page.locator('#order-form').waitFor();assert.match(await page.locator('[name=raw]').inputValue(),/毕业快乐/);
 await page.goto(base+'/travel.html');await page.locator('[data-unlock]').first().click();await page.locator('#memory-story').fill('珠江边的一次旅行');await page.locator('#print-text').fill('毕业快乐');await page.locator('#print-form button[type=submit]').click();await page.waitForURL('**/orders.html#new');await page.locator('#order-form').waitFor();assert.match(await page.locator('[name=raw]').inputValue(),/毕业快乐/);
 for(const path of ['/','/travel.html','/collection.html','/orders.html']){
  await page.goto(base+path);await page.getByRole('navigation',{name:'主导航'}).waitFor();assert.deepEqual(await page.getByRole('navigation',{name:'主导航'}).locator('a').allTextContents(),['去旅行','留回忆']);assert.equal(await page.locator('a[href*="index.html"],a[href*="simple.html"]').count(),0);
 }
 await page.goto(base+'/travel.html');await page.locator('.stop-card').first().waitFor();await page.locator('#make-travel-collection').click();await page.waitForURL('**/collection.html#world/create');await page.locator('[name=trip-name]').waitFor({state:'attached'});assert.equal(await page.locator('[name=trip-name]').inputValue(),'广州 · 珠江两岸漫游');
 await mkdir('artifacts/navigation',{recursive:true});for(const width of [1440,390]){await page.setViewportSize({width,height:900});await page.goto(base+'/travel.html');await page.locator('.stop-card').first().waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'travel header fits '+width);await page.screenshot({path:'artifacts/navigation/travel-'+width+'.png'});}
 await page.goto(base+'/travel.html#collection');await page.waitForURL('**/collection.html#world/canvas');
 await page.locator('.identity-menu summary').click();await page.locator('[data-identity-role=operator]').click();await page.waitForURL('**/operator.html');await page.locator('#operator-root').waitFor();assert.equal(await page.locator('a[href*="index.html"],a[href*="simple.html"],a[href*="#merchant"]').count(),0);
 await page.goto(base+'/travel.html#merchant');await page.waitForURL('**/operator.html');assert.deepEqual(errors,[]);console.log('PASS two-area navigation, travel → memory, customization draft, mobile, operator isolation and old bookmarks.');
}finally{await browser.close();await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
