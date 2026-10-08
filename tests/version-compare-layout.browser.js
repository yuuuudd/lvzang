import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createApp} from '../server.js';

const server=createApp({key:'',tripoKey:'',accountsEnabled:false});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:2});
  await page.goto(`http://127.0.0.1:${server.address().port}/collection.html`);
  await page.locator('.personal-home').waitFor();
  await page.evaluate(async()=>{
    const {openKeepsakeStore}=await import('/src/travel-keepsake-store.js'),s=await openKeepsakeStore();
    const photo=await fetch('/assets/keepsakes/memory-1.webp').then(r=>r.blob());
    const mesh=[-20,0,0,20,0,0,0,30,0],preview={mesh,originalColors:[80,160,250,80,160,250,80,160,250],widthMm:40,heightMm:30,totalDepthMm:2,centerY:15,centerZ:1,previewVersion:'raw-1'};
    for(let i=1;i<=2;i++){
      await s.save({keepsake:{id:'compare-v'+i,schemaVersion:1,title:'版本 '+i,tripTitle:'对比测试',tripId:'compare-trip',city:'广州',kind:'miniature',scope:'personal',participants:[{id:'me',name:'我'}],modelRef:'generated:compare-job-'+i+':0',generationId:'compare-job-'+i,assetIndex:0,sourcePhotoId:'compare-photo',memoryIds:[],createdAt:i,updatedAt:i,...(i===2?{versionOf:'compare-v1'}:{})},memories:[]});
      await s.setMeta('generated-asset:compare-job-'+i+':0',{glb:new Blob(['fixture']),reference:photo,preview,report:{checks:[]}});
    }
    s.close();
  });
  // Enter through the gallery so this check uses the real compare dialog.
  await page.reload();
  await page.getByRole('button',{name:/打开合集/}).click();
  await page.getByRole('button',{name:'放大查看',exact:true}).click();
  for(const viewport of [{width:1440,height:960},{width:390,height:844}]){
    await page.setViewportSize(viewport);
    await page.getByRole('button',{name:'对比版本',exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll('.comparison-preview[data-preview-mode="3d"]').length===2);
    const samples=await page.evaluate(async()=>{
      const samples=[];
      for(let i=0;i<12;i++){
        await new Promise(resolve=>requestAnimationFrame(resolve));
        samples.push([...document.querySelectorAll('.comparison-preview')].map(box=>{
          const rect=box.getBoundingClientRect(),canvas=box.querySelector('canvas').getBoundingClientRect();
          return {top:rect.top,height:rect.height,canvasTop:canvas.top,canvasHeight:canvas.height};
        }));
      }
      return samples;
    });
    console.log(JSON.stringify({viewport,first:samples[0],last:samples.at(-1)}));
    for(const sample of samples)for(const box of sample){
      assert.ok(Math.abs(box.canvasTop-box.top)<1,'model canvas must stay at the preview top');
      assert.ok(Math.abs(box.canvasHeight-box.height)<1,'model canvas must stay inside its fixed preview height');
    }
    assert.deepEqual(samples.at(-1),samples[0],'model frames must not move as ResizeObserver redraws');
    await page.locator('[name=compare-right]').selectOption('compare-v1');
    await page.waitForFunction(()=>document.querySelectorAll('.comparison-preview[data-preview-mode="3d"]').length===2);
    await page.getByRole('button',{name:'设计参考图',exact:true}).click();
    assert.equal(await page.locator('.comparison-preview>img').count(),2);
    await page.getByRole('button',{name:'3D 模型',exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll('.comparison-preview[data-preview-mode="3d"]').length===2);
    await page.getByRole('button',{name:'关闭窗口',exact:true}).click();
  }
  console.log('PASS: compare canvases stay contained and stable at DPR 2 on desktop and mobile, including version/reference switching.');
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
