// Opt-in integration check. Uses the running local server and paid text/vision calls.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
if(!process.argv.includes('--allow-live'))throw new Error('此检查会调用已配置的文字/视觉 API。确认后使用 --allow-live。');
const root=process.env.TRAVEL_TEST_ORIGIN||'http://localhost:4180';
const browser=await chromium.launch({channel:'chrome',headless:true});
await mkdir('artifacts/travel',{recursive:true});
try{
  const fixture=await browser.newPage({viewport:{width:720,height:300}});
  await fixture.setContent('<main style="padding:24px;font:24px sans-serif;line-height:1.8;background:white;color:black">演示攻略：苏州半日慢游<br>平江路可以欣赏古城小桥。<br>苏州博物馆的预约要求，请出发前核实。</main>');
  const screenshot=await fixture.screenshot({path:'artifacts/travel/guide-fixture.png'});await fixture.close();
  const response=await fetch(root+'/api/travel-import',{method:'POST',headers:{Origin:root,'Content-Type':'application/json'},body:JSON.stringify({image:'data:image/png;base64,'+screenshot.toString('base64')})});
  const ocr=await response.json();assert.equal(response.status,200,ocr.error);assert.match(ocr.text,/平江路/);assert.match(ocr.text,/苏州博物馆/);
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(root+'/travel.html');await page.locator('.plan-options summary').click();await page.locator('#agent-mode').selectOption('ai');await page.locator('.plan-options summary').click();await page.getByRole('button',{name:'导入攻略'}).click();
  await page.locator('#note-title').fill('演示截图');await page.locator('#note-content').fill(ocr.text);await page.getByRole('button',{name:'加入资料',exact:true}).click();await page.getByRole('button',{name:'关闭攻略导入'}).click();
  await page.locator('#travel-brief').fill('苏州半天，和父母出游，喜欢园林和建筑，希望少走路');
  await page.getByRole('button',{name:'发送消息'}).click();await page.waitForFunction(()=>!document.getElementById('plan-button').disabled,{},{timeout:120000});
  const first=await page.evaluate(()=>JSON.parse(localStorage.getItem('lvzang.v1')).plan);assert.equal(first?.mode,'ai',await page.locator('#plan-status').textContent());assert.equal(first.city,'苏州');assert.equal(first.trace.length,5);assert.ok(first.stops.length<=2&&first.stops.length>0);
  await page.locator('#travel-brief').fill('改成杭州两小时，喜欢风景，希望少走路');await page.getByRole('button',{name:'发送消息'}).click();await page.waitForFunction(()=>!document.getElementById('plan-button').disabled,{},{timeout:120000});
  const revised=await page.evaluate(()=>JSON.parse(localStorage.getItem('lvzang.v1')).plan);assert.equal(revised?.mode,'ai');assert.equal(revised.city,'杭州');assert.equal(revised.input.hours,2);assert.ok(revised.stops.every(p=>p.city==='杭州'));assert.ok(revised.totalMinutes<=120);
  await page.screenshot({path:'artifacts/travel/live-ai-route.png',fullPage:true,animations:'disabled'});
  assert.deepEqual(errors,[]);await writeFile('artifacts/travel/live-integration.json',JSON.stringify({ocr,first,revised,errors},null,2));
  console.log(JSON.stringify({status:'PASS',ocr:ocr.source,first:first.stops.map(p=>p.name),revised:revised.stops.map(p=>p.name),revisedMinutes:revised.totalMinutes}));
}finally{await browser.close();}
