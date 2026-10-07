import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import {createApp} from '../server.js';

const server=createApp({key:'',tripoKey:''});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/collection.html?demo=1#world/trip/sample-gz/gz-0`);
 await page.locator('.piece-main-model canvas').waitFor();
 const sidebar=await page.locator('.gallery-sidebar').boundingBox();
 assert.ok(sidebar.width>=1440*.38&&sidebar.width<=1440*.42,'detail sidebar occupies about 40% of the desktop');
 const toolbar=page.locator('.gallery-breadcrumb .collection-more');
 await toolbar.waitFor();
 const back=await page.locator('.gallery-breadcrumb [data-action=back-trip]').boundingBox();
 const tools=await toolbar.boundingBox();
 assert.ok(Math.abs((tools.y+tools.height/2)-(back.y+back.height/2))<5,'tools align with back navigation');
 assert.ok(tools.x>back.x+back.width,'tools sit on the right');
 assert.equal(await page.locator('.collection-footer').isVisible(),false);
 const download=page.waitForEvent('download');
 await toolbar.locator('summary').click();await toolbar.getByRole('button',{name:'导出完整备份',exact:true}).click();
 await download;
 await mkdir('artifacts/gallery-detail-layout',{recursive:true});
 await page.screenshot({path:'artifacts/gallery-detail-layout/desktop.png',fullPage:true});
 for(const width of [1024,390]){
  await page.setViewportSize({width,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`no overflow at ${width}px`);
  await toolbar.locator('summary').click();assert.equal(await toolbar.getByText('恢复备份',{exact:true}).isVisible(),true);await page.keyboard.press('Escape');
 }
 await page.screenshot({path:'artifacts/gallery-detail-layout/mobile.png',fullPage:true});
 await page.getByRole('button',{name:'返回合集',exact:true}).first().click();
 await page.locator('.collection-view').waitFor();
 await page.getByRole('button',{name:'返回主画布',exact:true}).click();
 await page.locator('.travel-home').waitFor();
 assert.equal(await page.locator('.personal-actions .collection-more').isVisible(),true);await page.locator('.collection-more>summary').click();
 assert.equal(await page.getByRole('button',{name:'导出完整备份',exact:true}).count(),1);
 assert.deepEqual(errors,[]);
 console.log('PASS: wider detail sidebar, top toolbar alignment, backup action, navigation and mobile/tablet layout.');
}finally{
 await browser.close();await new Promise(resolve=>server.close(resolve));
}
