import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.js';

const dir=await mkdtemp(join(tmpdir(),'multi-photo-upload-'));
const server=createApp({collectionDir:dir,fetchImpl:async()=>{throw Error('Unexpected external request');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage();
const photos=['public/assets/keepsakes/memory-1.webp','public/assets/keepsakes/memory-2.webp','public/assets/keepsakes/memory-3.webp'];

try{
 await page.goto(`http://127.0.0.1:${server.address().port}/collection.html#world/create`);
 const input=page.locator('[name=photo]');
 await input.setInputFiles(photos);
 await page.waitForFunction(()=>document.querySelectorAll('.world-upload-assets img').length===3);
 assert.equal(await page.locator('.world-upload-assets img:visible').count(),3,'one batch shows every selected photo');

 await page.reload();
 for(let i=0;i<photos.length;i++){
  await page.locator('[name=photo]').setInputFiles(photos[i]);
  await page.waitForFunction(expected=>document.querySelectorAll('.world-upload-assets img').length===expected,i+1);
 }
 assert.equal(await page.locator('.world-upload-assets img:visible').count(),3,'later selections append to the existing photos');
 console.log('PASS: batch and repeated photo selections both show every photo.');
}finally{
 await browser.close();
 await new Promise(resolve=>server.close(resolve));
 await rm(dir,{recursive:true,force:true});
}
