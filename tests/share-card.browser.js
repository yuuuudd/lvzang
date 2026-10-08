import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import sharp from 'sharp';
import {mkdir} from 'node:fs/promises';
import {createApp} from '../server.js';

const server=createApp({key:'',tripoKey:''});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'chrome',headless:true});

try{
  const page=await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/collection.html?demo=1#world/trip/sample-gz`);
  await page.getByRole('button',{name:'生成分享卡',exact:true}).waitFor();
  const [download]=await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button',{name:'生成分享卡',exact:true}).click(),
  ]);
  assert.match(download.suggestedFilename(),/-城市作品卡\.png$/);
  await mkdir('artifacts/share-card',{recursive:true});
  await download.saveAs('artifacts/share-card/share-card.png');
  const {width,height,format}=await sharp('artifacts/share-card/share-card.png').metadata();
  assert.deepEqual({width,height,format},{width:1080,height:1440,format:'png'});
  console.log('PASS: editorial city work card downloads at 1080x1440.');
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
