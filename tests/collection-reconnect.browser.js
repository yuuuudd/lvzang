import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createApp} from '../server.js';

const server=createApp({key:'',tripoKey:'',accountsEnabled:false});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true});

try{
  const page=await browser.newPage(),requestId='reconnect-request-0001';
  await page.goto(base+'/collection.html');
  await page.locator('.generation-tray').waitFor({state:'attached'});
  await page.evaluate(async id=>{
    const {openKeepsakeStore}=await import('/src/travel-keepsake-store.js'),store=await openKeepsakeStore();
    await store.setMeta('generation-jobs',[id]);
    await store.setMeta('generation-input:'+id,{requestId:id,name:'中断后恢复的合集',place:'广州',date:'',story:'',style:'clay',memoryMode:'personal',photos:[]});
    await store.setMeta('generation-request:'+id,{requestId:id,name:'中断后恢复的合集',place:'广州',date:'',story:'',style:'clay',memoryMode:'personal',photos:[{id:'p1',image:'data:image/jpeg;base64,/9j/2Q=='}]});
    store.close();
  },requestId);
  let posts=0;
  await page.route(/\/api\/collection-jobs\/[^/]+$/,route=>route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({error:'找不到生成任务'})}));
  await page.route(/\/api\/collection-jobs$/,route=>{
    posts++;
    return route.fulfill({status:202,contentType:'application/json',body:JSON.stringify({id:requestId,name:'中断后恢复的合集',place:'广州',date:'',status:'completed',error:'',story:'',counts:{photos:1,subjects:1,elements:0},photoStories:[],steps:[{title:'读取来源照片',status:'completed',detail:'来源照片已保存'}],mode:'collection',items:[],assets:[],createdAt:1,updatedAt:2,cover:null,coverStatus:'pending',coverError:''})});
  });
  await page.reload();
  await page.waitForFunction(()=>document.querySelector('.generation-job')?.textContent.includes('合集已完成'));
  assert.equal(posts,1,'a missing server task is recreated once with its saved request ID');
  assert.equal(await page.locator('.generation-notice').count(),0);
  console.log('PASS interrupted collection submission resumes automatically with the saved request ID.');
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
