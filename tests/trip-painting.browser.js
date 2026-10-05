// NODE_PATH=<bundled node_modules> node tests/trip-painting.browser.js
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { createApp } from '../server.js';
const {chromium}=createRequire(import.meta.url)('playwright');
const red=await sharp({create:{width:120,height:90,channels:3,background:'#bd6655'}}).png().toBuffer();
const blue=await sharp({create:{width:120,height:90,channels:3,background:'#4b739b'}}).png().toBuffer();
const painting='data:image/png;base64,'+blue.toString('base64');
const server=createApp({key:'',tripoKey:''});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  let submitted=0,mapped=0,failed=false,failTask=false,failMap=false,pauseTask=false,calibrated=0,curated=0,cutouts=0,lastCutoutKind='';
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname,request=route.request();
    if(path==='/api/trip-curation'){
      curated++;
      const {photos}=JSON.parse(request.postData());
      return route.fulfill({json:{points:photos.map((photo,index)=>({photoId:photo.id,title:`片段 ${index+1}`,evidence:`照片 ${index+1} 可见`,storyDraft:`照片 ${index+1} 的故事`,cutoutPrompt:curated>1?'新的旅行物件':'旅行物件',cutoutKind:curated>1&&index===0?'scene':'subject',cutoutPoint:{x:.5,y:.5}}))}});
    }
    if(path==='/api/trip-cutout'){cutouts++;lastCutoutKind=JSON.parse(request.postData()).kind;return route.fulfill({json:{kind:lastCutoutKind,cutout:painting}});}
    if(path==='/api/trip-painting'&&request.method()==='POST'){
      const body=JSON.parse(request.postData());assert.ok([2,9].includes(body.memories.length));assert.match(body.guide,/^data:image\/jpeg;base64,/);if(body.memories.length===2&&submitted===0){assert.match(body.story,/老街散步/);assert.equal(body.name,'新的旅行画');assert.equal(body.place,'乌镇');assert.equal(body.date,'2026-09-20');}
      submitted++;return failed?route.fulfill({status:502,json:{error:'模拟生图失败'}}):route.fulfill({status:202,json:{taskId:'painting-task'}});
    }
    if(path==='/api/trip-painting/painting-task')return route.fulfill({json:failTask?{status:'failed'}:pauseTask?{status:'processing',progress:20}:{status:'success',image:painting}});
    if(path==='/api/trip-painting-map'){
      mapped++;
      const {memories}=JSON.parse(request.postData());
      if(failMap){failMap--;return route.fulfill({status:502,json:{error:'模拟定位失败'}});}
      return route.fulfill({json:{regions:memories.map((memory,index)=>index===8||submitted===1&&mapped===1&&index===1?{memoryId:memory.id,visible:false}:{memoryId:memory.id,visible:true,shape:'box',center:{x:index?.75:.25,y:.4},box:index?{x:.65,y:.3,w:.2,h:.2}:{x:.05,y:.05,w:.4,h:.9},scale:1})}});
    }
    if(path==='/api/trip-painting-region'){
      calibrated++;const {center}=JSON.parse(request.postData());
      return route.fulfill({json:{visible:true,shape:'box',center,box:{x:center.x-.1,y:center.y-.1,w:.2,h:.2},needsReview:false}});
    }
    return route.continue();
  });
  const root=`http://127.0.0.1:${server.address().port}`;await page.goto(root);
  await page.locator('#trip-name').fill('新的旅行画');
  await page.locator('#trip-story').fill('我们在老街散步，看到不同的风景');
  await page.locator('#trip-place').fill('乌镇');await page.locator('#trip-date').fill('2026-09-20');
  await page.locator('#trip-photos').setInputFiles([{name:'1.png',mimeType:'image/png',buffer:red},{name:'2.png',mimeType:'image/png',buffer:blue}]);
  await page.waitForFunction(()=>document.querySelectorAll('.trip-upload-thumb').length===2);
  await page.locator('#trip-curate').click();await page.locator('#trip-painting-image').waitFor({state:'visible',timeout:8000});
  await page.waitForFunction(()=>document.getElementById('trip-painting-image').naturalWidth===1536);
  assert.equal(await page.locator('.trip-painting-title').count(),0,'title and date are pixels in the painting, not HTML over it');
  const paper=await page.locator('#trip-painting-image').evaluate(image=>{const canvas=document.createElement('canvas');canvas.width=1536;canvas.height=1024;const context=canvas.getContext('2d');context.drawImage(image,0,0);return [...context.getImageData(100,80,1,1).data].slice(0,3);});
  assert.ok(paper[2]>paper[0],'painting is displayed without a browser-drawn title layer');
  const ticket=await page.locator('#trip-painting-image').evaluate(image=>{const canvas=document.createElement('canvas');canvas.width=1536;canvas.height=1024;const context=canvas.getContext('2d');context.drawImage(image,0,0);return [...context.getImageData(150,850,1,1).data].slice(0,3);});
  assert.ok(ticket[2]>ticket[0],'painting is displayed without a browser-drawn place or date ticket');
  assert.equal(submitted,1,'one creation click also submits the completed trip painting');
  await page.waitForFunction(()=>document.getElementById('trip-status').textContent.includes('新画已生成'),null,{timeout:8000});
  assert.equal(mapped,2,'an uncertain first map is retried automatically');
  assert.equal(await page.locator('#trip-piece-list button.missing').count(),0);
  assert.equal(cutouts,2);
  await page.locator('#trip-curate').click();await page.waitForFunction(()=>!document.getElementById('trip-curate').disabled&&document.getElementById('trip-status').textContent.includes('新画已生成'));
  assert.equal(cutouts,4,'new element selection must refresh existing cutouts');
  assert.equal(lastCutoutKind,'subject');
  await page.locator('.trip-position').first().click();await page.locator('#trip-recut-image').click({position:{x:20,y:20}});
  await page.waitForFunction(()=>document.getElementById('trip-status').textContent.includes('已重新抠取'));
  assert.equal(lastCutoutKind,'subject');
  const recutKind=await page.evaluate(()=>new Promise(resolve=>{const request=indexedDB.open('shiguang-history',2);request.onsuccess=()=>{const db=request.result,get=db.transaction('trips').objectStore('trips').getAll();get.onsuccess=()=>{db.close();resolve(get.result.find(item=>item.name==='新的旅行画').memories[0].piece.targetKind);};};}));
  assert.equal(recutKind,'subject','manual subject recut must update target kind');
  await page.locator('#trip-generate-painting').click();await page.locator('#trip-painting-image').waitFor({state:'visible'});await page.waitForFunction(()=>document.getElementById('trip-status').textContent.includes('新画已生成，点击区域已自动校准'));
  await mkdir('artifacts',{recursive:true});await page.locator('#trip-painting-wrap').screenshot({path:'artifacts/trip-painting.png'});
  assert.equal(submitted,3);assert.equal(await page.locator('#trip-collage-wrap').isHidden(),true);
  await page.getByRole('button',{name:'打开片段：片段 1'}).click();await page.locator('#trip-detail[open]').waitFor();await page.locator('#trip-detail-close').click();
  const image=page.locator('#trip-painting-hit'),box=await image.boundingBox();
  await image.hover({position:{x:box.width*.1,y:box.height*.1}});assert.equal(await image.evaluate(element=>getComputedStyle(element).cursor),'default','title area has no interactive cursor');
  await image.click({position:{x:box.width*.1,y:box.height*.1}});assert.equal(await page.locator('#trip-detail[open]').count(),0,'title area is not interactive');
  await image.click({position:{x:box.width*.1,y:box.height*.85}});assert.equal(await page.locator('#trip-detail[open]').count(),0,'date ticket is not interactive');
  await image.click({position:{x:box.width*.25,y:box.height*.4}});await page.locator('#trip-detail[open]').waitFor();
  assert.equal(await page.locator('#trip-detail-title').textContent(),'片段 1');await page.locator('#trip-detail-close').click();
  await image.click({position:{x:box.width*.75,y:box.height*.4}});await page.locator('#trip-detail[open]').waitFor();
  assert.equal(await page.locator('#trip-detail-title').textContent(),'片段 2');await page.locator('#trip-detail-close').click();
  await page.locator('#trip-painting-edit').click();await page.locator('#trip-painting-target').selectOption({index:1});
  await image.click({position:{x:box.width*.45,y:box.height*.7}});await page.waitForFunction(()=>document.getElementById('trip-status').textContent.includes('点击区域已校准并保存'));
  assert.equal(calibrated,1);
  const previousImage=await page.locator('#trip-painting-image').getAttribute('src');
  await page.waitForFunction(()=>!document.getElementById('trip-generate-painting').disabled);
  failed=true;await page.locator('#trip-generate-painting').click();await page.waitForFunction(()=>document.getElementById('trip-status').textContent.includes('模拟生图失败'));await page.waitForFunction(()=>!document.getElementById('trip-generate-painting').disabled);
  assert.equal(await page.locator('#trip-painting-image').getAttribute('src'),previousImage,'failed regeneration preserves the last painting');
  failed=false;failTask=true;await page.locator('#trip-generate-painting').click();await page.waitForFunction(()=>document.getElementById('trip-status').textContent.includes('Image 生图失败'));await page.waitForFunction(()=>!document.getElementById('trip-generate-painting').disabled);
  const beforeRetry=submitted;failTask=false;failMap=2;await page.locator('#trip-generate-painting').click();await page.waitForFunction(()=>document.getElementById('trip-status').textContent.includes('模拟定位失败'));
  assert.equal(submitted,beforeRetry+1,'failed paid task must allow a new submission');
  await page.waitForFunction(()=>!document.getElementById('trip-generate-painting').disabled);
  await page.locator('#trip-restore-painting').click();await page.waitForFunction(()=>document.getElementById('trip-status').textContent.includes('已恢复上一张新画'));assert.equal(await page.locator('#trip-painting-image').getAttribute('src'),previousImage,'failed localization can restore the previous painting');
  await page.reload();await page.locator('.trip-library-card').filter({hasText:'新的旅行画'}).locator('.trip-open').click();
  await page.locator('#trip-painting-image').waitFor({state:'visible'});
  const saved=await page.evaluate(()=>new Promise(resolve=>{const request=indexedDB.open('shiguang-history',2);request.onsuccess=()=>{const db=request.result,get=db.transaction('trips').objectStore('trips').getAll();get.onsuccess=()=>{db.close();resolve(get.result.find(item=>item.name==='新的旅行画').painting);};};}));
  assert.equal(saved.regions.length,2,JSON.stringify(saved.regions.map(item=>({id:item.memoryId,center:item.center}))));
  assert.ok(Math.abs(saved.regions[1].center.x-.45)<.01);assert.ok(Math.abs(saved.regions[1].center.y-.7)<.01);
  assert.equal(await page.locator('#trip-painting-image').getAttribute('src'),saved.image,'the page displays the generated image without adding text');
  await page.locator('#trip-name').fill('改名后的旅行画');await page.locator('#trip-name').blur();
  await page.waitForFunction(()=>document.getElementById('trip-painting-warning').textContent.includes('需重新生成'),'renaming a painting must mark its baked-in lettering stale');
  assert.equal(await page.locator('#trip-painting-image').getAttribute('src'),saved.image,'editing the name does not repaint the old image');
  await page.locator('#trip-painting-cover').selectOption('p2');await page.waitForFunction(()=>document.getElementById('trip-painting-warning').textContent.includes('需重新生成'));
  await page.locator('#trip-painting-hit').click({position:{x:box.width*.25,y:box.height*.4}});
  assert.equal(await page.locator('#trip-detail').evaluate(node=>node.open),false,'stale artwork does not open a now mismatched memory');
  await page.locator('#trip-new').click();await page.locator('#trip-name').fill('九张旅行');
  await page.locator('#trip-photos').setInputFiles(Array.from({length:9},(_,index)=>({name:`${index}.png`,mimeType:'image/png',buffer:index%2?blue:red})));
  await page.waitForFunction(()=>document.querySelectorAll('.trip-upload-thumb').length===9);
  await page.locator('#trip-curate').click();await page.waitForFunction(()=>document.getElementById('trip-status').textContent.includes('1 个元素在画中仍未找到'));
  assert.equal(await page.locator('#trip-piece-list button').count(),3);assert.equal(await page.locator('#trip-cabinet-grid .trip-cabinet-card').count(),9);assert.equal(await page.locator('#trip-cabinet-grid .trip-cabinet-card.missing').count(),1);
  pauseTask=true;await page.locator('#trip-generate-painting').click();await page.waitForFunction(()=>document.getElementById('trip-status').textContent.includes('Image 正在整体重绘'));
  const beforeResume=submitted;await page.reload();
  const pending=await page.evaluate(()=>new Promise(resolve=>{const request=indexedDB.open('shiguang-history',2);request.onsuccess=()=>{const db=request.result,get=db.transaction('trips').objectStore('trips').getAll();get.onsuccess=()=>{db.close();resolve(get.result.find(item=>item.name==='九张旅行')?.painting);};};}));
  assert.equal(pending?.pendingTaskId,'painting-task',JSON.stringify(pending&&{keys:Object.keys(pending),pendingTaskId:pending.pendingTaskId}));
  await page.locator('.trip-library-card').filter({hasText:'九张旅行'}).locator('.trip-open').click();
  await page.waitForFunction(()=>document.getElementById('trip-generate-painting').textContent==='继续取生成结果');
  assert.equal(await page.locator('#trip-generate-painting').textContent(),'继续取生成结果');
  pauseTask=false;await page.locator('#trip-generate-painting').click();await page.waitForFunction(()=>document.getElementById('trip-status').textContent.includes('1 个元素在画中仍未找到'));
  assert.equal(submitted,beforeResume,'resuming a paid task does not submit another image request');
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);
  console.log('Generated trip painting browser flow passed: 2/9 sources, image, linked regions, calibration, persistence, missing item and recovery.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
