// NODE_PATH=<bundled node_modules> node tests/trip-batch.browser.js
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import sharp from 'sharp';
import { createApp } from '../server.js';
import { createDesign } from '../public/src/design.js';
const {chromium}=createRequire(import.meta.url)('playwright');
const png=async color=>'data:image/png;base64,'+(await sharp({create:{width:120,height:90,channels:3,background:color}}).png().toBuffer()).toString('base64');
const red=await png('#bd6655'),blue=await png('#4b739b');
const trip={id:'batch-trip',createdAt:1,name:'批量测试旅行',place:'青岛',date:'',story:'整趟旅程',photos:[{id:'p1',image:red},{id:'p2',image:blue}],coverId:'p1',collageVersion:1,memories:[{id:'m1',photoId:'p1',title:'海边',story:'吹海风',evidence:'海边照片'},{id:'m2',photoId:'p2',title:'街道',story:'走过老街',evidence:'街道照片'}],painting:{image:red,regions:[{memoryId:'m1',visible:true,center:{x:.25,y:.5},box:{x:.1,y:.3,w:.3,h:.3}},{memoryId:'m2',visible:true,center:{x:.75,y:.5},box:{x:.6,y:.3,w:.3,h:.3}}]}};
const server=createApp({key:'',tripoKey:'',developerBatch3D:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage(),errors=[],calls=[];page.on('pageerror',error=>errors.push(error.message));
  let artworkCount=0,modelCount=0,firstModelDone=false,firstModelPolls=0,overlapped=false;
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname,body=route.request().postData()?JSON.parse(route.request().postData()):null;
    calls.push({path,body});
    if(path==='/api/design')return route.fulfill({json:{design:{...createDesign(body),brief:{summary:'这一刻',elements:['照片主体'],composition:'主体居中',imagePrompt:'厚实的立体纪念物'}}}});
    if(path==='/api/artwork'&&body){artworkCount++;if(artworkCount===2)overlapped=!firstModelDone;return route.fulfill({status:202,json:{taskId:`ref-${artworkCount}`}});}
    if(path.startsWith('/api/artwork/'))return route.fulfill({json:{status:'success',image:blue}});
    if(path==='/api/reference-review')return route.fulfill({json:{review:{checks:[{item:'主体',status:'ok',observation:'可见'}],suggestion:'无需修订'}}});
    if(path==='/api/model'&&body){assert.match(body.image,/^data:image\/jpeg;base64,/,'batch compresses reference like the working manual flow');assert.ok(body.image.length<2_800_000);modelCount++;return route.fulfill({status:202,json:{taskId:`model-${modelCount}`}});}
    if(path==='/api/model/model-1'&&firstModelPolls++<1)return route.fulfill({json:{status:'processing',progress:30}});
    if(path.startsWith('/api/model/')){if(path.endsWith('model-1'))firstModelDone=true;return route.fulfill({json:{status:'success',glb:'Z2xURg=='}});}
    if(path==='/api/agent')return route.fulfill({json:{mesh:[0,1,2,3,4,5,6,7,8],exportable:true,settings:body.settings}});
    return route.continue();
  });
  const root=`http://127.0.0.1:${server.address().port}`;
  await page.route('**/seed',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>seed</title>'}));
  await page.goto(root+'/seed');
  await page.evaluate(item=>new Promise(resolve=>{const open=indexedDB.open('shiguang-history',2);open.onupgradeneeded=()=>{for(const name of ['trips','artworks'])if(!open.result.objectStoreNames.contains(name))open.result.createObjectStore(name,{keyPath:'id'});};open.onsuccess=()=>{const db=open.result,tx=db.transaction('trips','readwrite');tx.objectStore('trips').put(item);tx.oncomplete=()=>{db.close();resolve();};};}),trip);
  await page.goto(root);await page.locator('.trip-library-card').filter({hasText:'批量测试旅行'}).locator('.trip-open').click();
  await page.locator('#trip-batch-dev').waitFor({state:'visible'});await page.locator('#trip-batch-dev summary').click();
  await page.locator('#trip-batch-style').selectOption('wood');await page.locator('#trip-batch-assets').click();
  await page.waitForFunction(()=>document.getElementById('trip-batch-status').textContent.includes('新增 2 件'),null,{timeout:15000});
  assert.equal(overlapped,true,'batch starts the next memory while the first model is still running');
  assert.equal(artworkCount,2);assert.equal(modelCount,2);
  assert.deepEqual(calls.filter(item=>item.path==='/api/design').map(item=>item.body.story),['吹海风','走过老街']);
  assert.ok(calls.filter(item=>item.path==='/api/artwork').every(item=>item.body.style==='wood'));
  await page.locator('#trip-batch-assets').click();await page.waitForFunction(()=>document.getElementById('trip-batch-status').textContent.includes('已有 2 件'));
  assert.equal(artworkCount,2,'rerun does not pay for existing references');assert.equal(modelCount,2,'rerun does not pay for existing models');
  await page.reload();await page.locator('.trip-library-card').filter({hasText:'批量测试旅行'}).locator('.trip-open').click();
  await page.getByRole('button',{name:'打开片段：海边'}).click();await page.waitForFunction(()=>document.getElementById('trip-object-status').textContent.includes('立体作品已生成'));
  assert.deepEqual(errors,[]);
  console.log('Trip batch browser flow passed: parallel memories, compressed model references, saved results and no duplicate paid tasks.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
