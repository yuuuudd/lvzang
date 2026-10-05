// NODE_PATH=<bundled node_modules> node tests/trip-recovery.browser.js
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import sharp from 'sharp';
import { createApp } from '../server.js';

const {chromium}=createRequire(import.meta.url)('playwright');
const png=await sharp({create:{width:16,height:16,channels:3,background:'#b85d43'}}).png().toBuffer();
const image=`data:image/png;base64,${png.toString('base64')}`;
const server=createApp({key:'',tripoKey:''});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage(),root=`http://127.0.0.1:${server.address().port}`;
  await page.goto(root);
  await page.evaluate(image=>new Promise(resolve=>{
    const request=indexedDB.open('shiguang-history',2);
    request.onsuccess=()=>{
      const db=request.result,tx=db.transaction('trips','readwrite'),store=tx.objectStore('trips');
      store.put({id:'broken',createdAt:2,name:'旧格式',photos:null});
      store.put({id:'good',createdAt:1,name:'原有旅行',photos:[{id:'p1',image}],memories:[],coverId:'p1'});
      tx.oncomplete=()=>{db.close();resolve();};
    };
  }),image);
  await page.reload();
  assert.equal(await page.locator('.trip-library').isVisible(),true,'collection area stays visible');
  await page.getByText('原有旅行').waitFor();
  assert.equal(await page.locator('.trip-add-tile').evaluate(node=>node.tagName),'LABEL','the visible upload tile is an accessible file picker');
  const chooser=page.waitForEvent('filechooser',{timeout:2000});
  await page.locator('.trip-add-tile').click();
  await (await chooser).setFiles({name:'new.png',mimeType:'image/png',buffer:png});
  await page.locator('.trip-upload-thumb').waitFor();
  await page.reload();
  await page.locator('.trip-library-card').filter({hasText:'我的旅行'}).locator('.trip-open').click();
  await page.locator('.trip-upload-thumb').waitFor();
  assert.equal(await page.locator('.trip-upload-thumb img').evaluate(img=>img.complete&&img.naturalWidth>0),true);
  console.log('Trip recovery passed: malformed old record, collection visibility, immediate draft persistence.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
