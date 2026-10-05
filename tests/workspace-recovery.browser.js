import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createApp} from '../server.js';
let aborted=0,calls=0,started,arrived=new Promise(r=>started=r);
const server=createApp({key:'test',fetchImpl:async(_url,options)=>{calls++;if(JSON.parse(options.body).messages[0].content.includes('DeepSeek 对话助手'))return Response.json({choices:[{message:{content:JSON.stringify({intent:'plan',destination:'广州',reply:'我将调整预算。'})}}]});started();return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>{aborted++;reject(options.signal.reason);},{once:true}));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/travel.html`);
  await page.locator('.plan-options summary').click();await page.locator('#agent-mode').selectOption('demo');await page.locator('.plan-options summary').click();
  await page.locator('#travel-brief').fill('广州半天，预算500元');await page.getByRole('button',{name:'发送消息',exact:true}).click();await page.waitForFunction(()=>!document.getElementById('plan-button').disabled);
  const saved=await page.evaluate(()=>localStorage.getItem('lvzang.v1'));
  await page.locator('.plan-options summary').click();await page.locator('#agent-mode').selectOption('ai');await page.locator('.plan-options summary').click();
  await page.locator('#travel-brief').fill('预算改成100元');await page.getByRole('button',{name:'发送消息',exact:true}).click();await arrived;await page.waitForFunction(()=>document.getElementById('budget-value').textContent.includes('100'));
  await page.getByRole('button',{name:'停止本次修订',exact:true}).click();await page.waitForFunction(()=>!document.getElementById('plan-button').disabled);assert.match(await page.locator('#budget-value').textContent(),/500/);assert.equal(await page.evaluate(()=>localStorage.getItem('lvzang.v1')),saved);assert.match(await page.locator('#plan-status').textContent(),/保留/);
  for(let i=0;i<10&&!aborted;i++)await new Promise(r=>setTimeout(r,20));assert.equal(aborted,1);assert.equal(calls,2);
  await page.locator('.plan-options summary').click();await page.locator('#agent-mode').selectOption('demo');await page.locator('.plan-options summary').click();await page.locator('#travel-brief').fill('广州1小时，不去花城广场和广州塔和广州大剧院');await page.getByRole('button',{name:'发送消息',exact:true}).click();await page.waitForFunction(()=>!document.getElementById('plan-button').disabled);assert.match(await page.locator('#plan-status').textContent(),/无法安排/);assert.equal(await page.evaluate(()=>localStorage.getItem('lvzang.v1')),saved);assert.ok(await page.locator('.stop-card').count()>0);
  console.log('PASS: cancellation restores saved budget and stops upstream calls; impossible itinerary preserves saved route.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
