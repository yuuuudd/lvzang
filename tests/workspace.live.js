// Opt-in: eight configured text-model calls, no image/3D generation.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
if(!process.argv.includes('--allow-live'))throw new Error('此检查调用真实文字API，请显式使用 --allow-live。');
const root=process.env.TRAVEL_TEST_ORIGIN||'http://localhost:4180';
const browser=await chromium.launch({channel:'chrome',headless:true});await mkdir('artifacts/workspace',{recursive:true});
try{
  const page=await browser.newPage({viewport:{width:1600,height:1000},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(root+'/travel.html');await page.waitForFunction(()=>document.getElementById('agent-mode').value==='ai');
  await page.locator('#travel-brief').fill('广州半天，预算300元，喜欢文化建筑和拍照，想去广东省博物馆和花城广场和广州塔');await page.getByRole('button',{name:'发送消息',exact:true}).click();await page.waitForFunction(()=>!document.getElementById('plan-button').disabled,{},{timeout:165000});
  const first=await page.evaluate(()=>JSON.parse(localStorage.getItem('lvzang.v1')).plan);assert.equal(first.mode,'ai',await page.locator('#plan-status').textContent());assert.equal(first.city,'广州');assert.equal(first.input.budget,'300元');assert.equal(first.trace.length,5);
  await page.locator('#travel-brief').fill('下午只有2小时，预算改成100元，少走路，不去博物馆和花城广场，保留广州塔');await page.getByRole('button',{name:'发送消息',exact:true}).click();await page.waitForFunction(()=>!document.getElementById('plan-button').disabled,{},{timeout:165000});
  const revised=await page.evaluate(()=>JSON.parse(localStorage.getItem('lvzang.v1')).plan);assert.equal(revised.mode,'ai');assert.equal(revised.input.hours,2);assert.equal(revised.input.budget,'100元');assert.ok(revised.stops.some(p=>p.id==='gz-tower'));assert.ok(revised.stops.every(p=>!['gz-museum','gz-square'].includes(p.id)));assert.ok(revised.totalMinutes<=120);assert.equal(await page.locator('.chat-message.user').count(),2);assert.equal(await page.locator('#route-state').textContent(),'已确认');assert.deepEqual(errors,[]);
  await page.screenshot({path:'artifacts/workspace/live-guangzhou-desktop.png',animations:'disabled'});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/workspace/live-guangzhou-mobile.png',fullPage:true,animations:'disabled'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await writeFile('artifacts/workspace/live-guangzhou.json',JSON.stringify({first,revised,errors},null,2));console.log(JSON.stringify({status:'PASS',first:first.stops.map(p=>p.name),revised:revised.stops.map(p=>p.name),hours:revised.input.hours,budget:revised.input.budget,minutes:revised.totalMinutes}));
}finally{await browser.close();}
