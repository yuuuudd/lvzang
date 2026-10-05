// NODE_PATH=<bundled node_modules> node tests/trip-collapse.browser.js
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import sharp from 'sharp';
import { createApp } from '../server.js';

const {chromium}=createRequire(import.meta.url)('playwright');
const image=await sharp({create:{width:2,height:2,channels:3,background:'#c85e49'}}).png().toBuffer();
const server=createApp({key:'',tripoKey:''});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('#trip-photos').setInputFiles({name:'photo.png',mimeType:'image/png',buffer:image});
  await page.locator('#trip-add-memory').click();
  await page.locator('#trip-add-memory').click();
  const panel=page.locator('#trip-point-panel'),first=page.locator('.trip-point-editor').first();
  assert.equal(await panel.evaluate(node=>node.open),true);
  assert.match(await panel.locator('summary').textContent(),/收起全部记忆点.*2/);
  await first.locator('.trip-point-title').fill('新的标题');
  await first.locator('.trip-point-title').blur();
  await panel.locator('summary').click();
  assert.equal(await panel.evaluate(node=>node.open),false);
  assert.equal(await page.locator('.trip-point-editor:visible').count(),0,'one control hides every editor');
  await page.waitForFunction(()=>document.getElementById('trip-point-toggle').textContent.startsWith('展开'));
  assert.match(await panel.locator('summary').textContent(),/展开全部记忆点.*2/);
  await panel.locator('summary').click();
  assert.equal(await page.locator('.trip-point-editor:visible').count(),2);
  assert.equal(await first.locator('.trip-point-title').inputValue(),'新的标题');
  console.log('The entire memory editor section collapses and reopens without losing edits.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
