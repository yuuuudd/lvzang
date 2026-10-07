import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
import {createApp} from '../server.js';
const server=createApp();await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(base+'/');
 await page.evaluate(async()=>{const {openKeepsakeStore}=await import('/src/travel-keepsake-store.js'),s=await openKeepsakeStore();try{await s.save({keepsake:{id:'saved-trip',schemaVersion:1,title:'已有旅行收藏',city:'苏州',kind:'miniature',scope:'personal',participants:[{id:'me',name:'我'}],modelRef:'sz',memoryIds:[],createdAt:1,updatedAt:1},memories:[],photos:[]});}finally{s.close();}});
 await page.addInitScript(()=>{window.__oldImportGate=new Promise(r=>window.__releaseOldImport=r);});
 const source=await readFile('public/src/travel-cover.js','utf8');
 await page.route('**/src/travel-cover.js',route=>route.fulfill({contentType:'text/javascript',body:source.replace('export async function importShiguangCollections(store){','export async function importShiguangCollections(store){await window.__oldImportGate;')}));
 await page.goto(base+'/collection.html#world/canvas',{waitUntil:'domcontentloaded'});
 const start=Date.now();
 try{await page.locator('.trip-cover-card').waitFor({timeout:2000});assert.match(await page.locator('.trip-cover-info h2').textContent(),/已有旅行/);}finally{await page.evaluate(()=>window.__releaseOldImport());}
 console.log('PASS local collection visible while old import is blocked:',Date.now()-start,'ms');
 await page.getByRole('button',{name:'添加旅行回忆',exact:true}).click();await page.locator('[name=note]').fill('未保存的旅行故事');await page.waitForTimeout(250);assert.equal(await page.locator('[name=note]').inputValue(),'未保存的旅行故事');assert.deepEqual(errors,[]);
}finally{await browser.close();await new Promise(r=>server.close(r));}
