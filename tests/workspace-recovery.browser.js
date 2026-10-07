import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createApp} from '../server.js';
let aborted=0,calls=0,started,arrived=new Promise(r=>started=r);
const server=createApp({key:'test',fetchImpl:async(_url,options)=>{calls++;if(JSON.parse(options.body).messages[0].content.includes('DeepSeek 对话助手'))return Response.json({choices:[{message:{content:JSON.stringify({intent:'plan',destination:'广州',reply:'我将调整预算。'})}}]});started();return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>{aborted++;reject(options.signal.reason);},{once:true}));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/travel.html`);
  await page.locator('.plan-options summary').click();await page.locator('#agent-mode').selectOption('demo');await page.locator('.plan-options summary').click();
  await page.locator('#travel-brief').fill('广州半天，每人全程预算500元');await page.getByRole('button',{name:'发送消息',exact:true}).click();await page.waitForFunction(()=>!document.getElementById('plan-button').disabled);
  const saved=await page.evaluate(()=>localStorage.getItem('lvzang.v1')),savedPlan=JSON.parse(saved).plan;
  await page.locator('.plan-options summary').click();await page.locator('#agent-mode').selectOption('ai');await page.locator('.plan-options summary').click();
  await page.locator('#travel-brief').fill('预算改成100元，重新安排路线');await page.getByRole('button',{name:'发送消息',exact:true}).click();await Promise.race([arrived,new Promise((_,reject)=>setTimeout(()=>reject(new Error('上游调用未进入取消测试')),5000))]);await page.waitForFunction(()=>document.getElementById('budget-value').textContent.includes('100'));
  await page.getByRole('button',{name:'停止本次修订',exact:true}).click();await page.waitForFunction(()=>!document.getElementById('plan-button').disabled);assert.match(await page.locator('#budget-value').textContent(),/500/);assert.equal(await page.evaluate(()=>localStorage.getItem('lvzang.v1')),saved);assert.match(await page.locator('#plan-status').textContent(),/保留/);
  for(let i=0;i<10&&!aborted;i++)await new Promise(r=>setTimeout(r,20));assert.equal(aborted,1);assert.equal(calls,2);
  await page.locator('.plan-options summary').click();await page.locator('#agent-mode').selectOption('demo');await page.locator('.plan-options summary').click();await page.locator('#travel-brief').fill('广州每天只有1小时，必须去粤博，不去花城广场和广州塔和广州大剧院');await page.getByRole('button',{name:'发送消息',exact:true}).click();await page.waitForFunction(()=>!document.getElementById('plan-button').disabled);assert.match(await page.locator('.chat-message.assistant').last().textContent(),/无法|必去|增加/);const clarified=await page.evaluate(()=>JSON.parse(localStorage.getItem('lvzang.v1')));assert.deepEqual(clarified.plan,savedPlan);assert.equal(clarified.profile.fields.dailyHours.value,1);assert.ok(clarified.profile.followUps.length>0&&clarified.profile.followUps.length<=2);assert.ok(await page.locator('.stop-card').count()>0);
  console.log('PASS: cancellation restores saved budget and stops upstream calls; impossible itinerary preserves saved route.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
