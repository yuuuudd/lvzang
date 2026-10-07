import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createApp} from '../server.js';
import {mkdir} from 'node:fs/promises';
let calls=0;
const server=createApp({key:'test',fetchImpl:async(_url,options)=>{
  calls++;const payload=JSON.parse(options.body),data=JSON.parse(payload.messages.at(-1).content);let value;
  if(payload.messages[0].content.includes('DeepSeek 对话助手')){
    if(data.description.includes('预算包含')){assert.equal(data.currentPlan.city,'北京');assert.ok(payload.messages.some(t=>t.role==='user'&&t.content.includes('北京')));value={intent:'answer',reply:'你设置的300元是预算上限，门票、交通和餐饮还需要核价。'};}
    else value={intent:'plan',destination:data.description.includes('珠海')?'珠海':'北京',reply:'我会按你新提出的目的地重新安排。'};
  }else value=data.input.destination==='珠海'?{title:'珠海海滨漫游',stops:[{name:'珠海渔女',minutes:40,transit:0,story:'海滨地标'}]}:{title:'北京文化半日',stops:[{name:'景山公园',minutes:50,transit:0,story:'登高看老城'},{name:'北海公园',minutes:60,transit:20,story:'湖畔漫游'}]};
  return Response.json({choices:[{message:{content:JSON.stringify(value)}}]});
}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});await mkdir('artifacts/workspace',{recursive:true});
try{
  const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/travel.html`);await page.waitForFunction(()=>document.getElementById('agent-mode').value==='ai');
  const send=async value=>{await page.locator('#travel-brief').fill(value);await page.getByRole('button',{name:'发送消息',exact:true}).click();await page.waitForFunction(()=>!document.getElementById('plan-button').disabled);};
  await send('帮我安排北京半天，每人全程预算300元');assert.match(await page.locator('#map-title').textContent(),/北京/);assert.match(await page.locator('#route-title').textContent(),/北京/);assert.equal(await page.locator('.stop-card').count(),2);assert.equal(await page.locator('[data-unlock]').count(),0);assert.equal(await page.locator('#city-map').evaluate(e=>getComputedStyle(e).visibility),'hidden');
  const saved=await page.evaluate(()=>localStorage.getItem('lvzang.v1'));await send('预算包含门票和交通吗？');assert.match(await page.locator('.chat-message.assistant').last().textContent(),/门票、交通/);assert.equal(await page.evaluate(()=>localStorage.getItem('lvzang.v1')),saved);assert.equal(calls,3);assert.equal(await page.locator('#route-state').textContent(),'已确认');
  await page.reload();assert.match(await page.locator('#map-title').textContent(),/北京/);assert.equal(await page.locator('#storage-recovery').isVisible(),false);
  await send('换成珠海，下午两小时');assert.match(await page.locator('#map-title').textContent(),/珠海/);assert.match(await page.locator('#time-detail').textContent(),/2小时/);assert.match(await page.locator('#route-title').textContent(),/珠海/);assert.deepEqual(errors,[]);
  await page.screenshot({path:'artifacts/workspace/chat-other-city.png',animations:'disabled'});console.log('PASS: Beijing route, direct question with history, unchanged itinerary on answer, dynamic route reload, Zhuhai switch, no Guangzhou artwork/model reuse.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
