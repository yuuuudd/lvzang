import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createApp} from '../server.js';
import {chatTravel} from '../travel-agent.js';
import {emptyTravelProfile,updateTravelProfile} from '../public/src/travel-profile.js';
import {buildDailyPlan} from '../public/src/travel-schedule.js';
import {initialState,unlock} from '../public/src/travel-state.js';
import {normalizeRequest,planFromCatalog} from '../public/src/travel-domain.js';

const profile=updateTravelProfile(emptyTravelProfile(),{text:'广州三天，每天6小时，我们两个人，每人全程预算600元，必去粤博，不去广州塔，正常节奏'}).profile;
const base={...planFromCatalog(normalizeRequest({description:'广州一天'}),undefined,{placeIds:['gz-museum','gz-square','gz-opera'],title:'广州3天文化漫游'}),kind:'plan',mode:'demo',trace:[],assistantReply:'三天方案已保存。'};
const planned=buildDailyPlan(base,profile),saved={...initialState(),profile,plan:planned};unlock(saved,'gz-museum',planned.title);
const noModel=async()=>{throw new Error('browser settings fixture forbids external models');};
const app=createApp({key:'',tripoKey:'',amapKey:'',fetchImpl:noModel}),staticHandler=app.listeners('request')[0];
let nextFailure=false,nextPause=false;const requests=[],open=new Set();
const server=http.createServer(async(req,res)=>{
  if(req.url!=='/api/travel-chat/stream')return staticHandler(req,res);
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=JSON.parse(Buffer.concat(chunks).toString());requests.push(body);
  res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store'});res.flushHeaders();const emit=event=>res.write(JSON.stringify(event)+'\n');
  if(nextFailure){nextFailure=false;emit({type:'error',error:'本地模拟失败，原方案保留'});return res.end();}
  if(nextPause){nextPause=false;open.add(res);res.once('close',()=>open.delete(res));return;}
  try{const response=await chatTravel(body,{fetchImpl:noModel,onProgress:emit});emit({type:'result',response});}catch(error){emit({type:'error',error:error.message});}res.end();
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1500,height:1000},reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await page.goto(origin+'/travel.html');
  assert.equal(await page.locator('#trip-day-count').inputValue(),'');assert.equal(await page.locator('#trip-daily-hours').inputValue(),'');assert.equal(await page.locator('#trip-pace').inputValue(),'');
  assert.equal(await page.evaluate(()=>localStorage.getItem('lvzang.v1')),null);
  await page.evaluate(value=>{localStorage.setItem('lvzang.v1',JSON.stringify(value));localStorage.setItem('lvzang.chat.v1',JSON.stringify([{role:'user',content:'广州三天，每天6小时'}]));},saved);
  await page.reload();assert.equal(await page.locator('#trip-day-count').inputValue(),'3');assert.equal(await page.locator('#trip-daily-hours').inputValue(),'6');assert.equal(await page.locator('#trip-pace').inputValue(),'normal');
  const bytes=()=>page.evaluate(()=>({state:localStorage.getItem('lvzang.v1'),chat:localStorage.getItem('lvzang.chat.v1')})),state=async()=>JSON.parse((await bytes()).state);
  const openSettings=async()=>{if(await page.locator('#planner-tools-content').isHidden())await page.locator('#planner-tools-toggle').click();if(!await page.locator('#trip-settings-disclosure').evaluate(node=>node.open))await page.locator('#trip-settings-disclosure > summary').click();};
  const apply=async(values)=>{await openSettings();if(values.dayCount!==undefined)await page.locator('#trip-day-count').fill(String(values.dayCount));if(values.dailyHours!==undefined)await page.locator('#trip-daily-hours').fill(String(values.dailyHours));if(values.pace!==undefined)await page.locator('#trip-pace').selectOption(values.pace);await page.getByRole('button',{name:'应用并调整行程',exact:true}).click();await page.waitForFunction(()=>!document.getElementById('plan-button').disabled);};
  const unchanged=await bytes();await apply({});assert.equal(requests.length,0);assert.deepEqual(await bytes(),unchanged);
  await page.locator('#travel-brief').fill('这段还没发送的想法保留');
  await apply({dayCount:1,dailyHours:2.5,pace:'easy'});
  assert.deepEqual(requests[0].tripSettings,{dayCount:1,dailyHours:2.5,pace:'easy'});assert.equal((await state()).plan.days.length,1);assert.equal((await state()).profile.fields.dailyHours.value,2.5);assert.equal((await state()).profile.fields.pace.value,'easy');assert.equal(await page.locator('#day-selector').isVisible(),false);assert.doesNotMatch(await page.locator('#route-title').textContent(),/3天/);assert.equal(await page.locator('#travel-brief').inputValue(),'这段还没发送的想法保留');
  assert.deepEqual((await state()).collection,saved.collection);
  for(const field of ['budget','companions','requiredPlaces','excludedPlaces'])assert.deepEqual((await state()).profile.fields[field],profile.fields[field]);
  await page.reload();assert.equal(await page.locator('#trip-day-count').inputValue(),'1');assert.equal(await page.locator('#trip-daily-hours').inputValue(),'2.5');assert.equal(await page.locator('#trip-pace').inputValue(),'easy');assert.equal(await page.locator('#day-selector').isVisible(),false);
  await apply({dayCount:4,dailyHours:4,pace:'active'});assert.equal((await state()).plan.days.length,4);assert.equal(await page.locator('#day-selector button').count(),4);assert.equal((await state()).profile.fields.pace.value,'active');
  await page.reload();assert.equal(await page.locator('#trip-day-count').inputValue(),'4');assert.equal(await page.locator('#trip-daily-hours').inputValue(),'4');assert.equal(await page.locator('#trip-pace').inputValue(),'active');
  const stable=await bytes();nextFailure=true;await apply({dailyHours:3.5});assert.deepEqual(requests.at(-1).tripSettings,{dailyHours:3.5});assert.deepEqual(await bytes(),stable);assert.equal(await page.locator('#trip-daily-hours').inputValue(),'4');assert.match(await page.locator('#plan-status').textContent(),/模拟失败/);
  nextPause=true;await openSettings();await page.locator('#trip-day-count').fill('2');await page.getByRole('button',{name:'应用并调整行程',exact:true}).click();await page.waitForFunction(()=>document.getElementById('trip-settings-fields').disabled);await page.getByRole('button',{name:'停止本次修订',exact:true}).click();await page.waitForFunction(()=>!document.getElementById('plan-button').disabled);assert.deepEqual(await bytes(),stable);assert.equal(await page.locator('#trip-day-count').inputValue(),'4');
  const beforeInvalid=requests.length;await openSettings();await page.locator('#trip-daily-hours').fill('2.2');await page.getByRole('button',{name:'应用并调整行程',exact:true}).click();assert.equal(requests.length,beforeInvalid);assert.deepEqual(await bytes(),stable);
  await page.reload();await page.setViewportSize({width:390,height:844});await apply({dayCount:2,dailyHours:2.5,pace:'normal'});assert.equal((await state()).plan.days.length,2);assert.equal(await page.locator('#trip-pace').inputValue(),'normal');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await mkdir('artifacts/workspace',{recursive:true});await page.screenshot({path:'artifacts/workspace/trip-settings-mobile.png',fullPage:true,animations:'disabled'});
  await page.setViewportSize({width:1500,height:1000});await page.reload();await page.screenshot({path:'artifacts/workspace/trip-settings-desktop.png',animations:'disabled'});
  assert.deepEqual(errors,[]);console.log('PASS: blank unknown settings; no-op; saved 3 days to 1 day at 2.5h/easy; expand to 4 days at 4h/active; exact partial fields; profile/collection/chat retention; reload; failed/cancelled revisions byte-identical rollback; half-hour validation; mobile 2-day update.');
}finally{await browser.close();for(const response of open)response.end();await new Promise(resolve=>server.close(resolve));app.close();}
