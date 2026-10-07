import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,readFile} from 'node:fs/promises';
import {createApp} from '../server.js';

const server=createApp({key:'',tripoKey:''});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const root=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:'chrome',headless:true});
await mkdir('artifacts/travel',{recursive:true});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(root+'/travel.html');await page.screenshot({path:'artifacts/travel/home-desktop.png',fullPage:true,animations:'disabled'});
  assert.match(await page.locator('#route-title').textContent(),/广州/);await page.getByRole('button',{name:'发送消息'}).click();await page.waitForFunction(()=>!document.getElementById('plan-button').disabled);
  assert.match(await page.locator('#route-title').textContent(),/广州/);const followUps=await page.evaluate(()=>JSON.parse(localStorage.getItem('lvzang.v1')).profile.followUps);assert.ok(followUps.length>0);const clarification=await page.locator('.chat-message.assistant .message-content').last().textContent();for(const {question} of followUps)assert.ok(clarification.includes(question),`Assistant message contains the complete question: ${question}`);await page.locator('#travel-brief').fill('苏州半天，先按默认安排');await page.getByRole('button',{name:'发送消息'}).click();await page.waitForFunction(()=>!document.getElementById('plan-button').disabled);assert.match(await page.locator('#route-title').textContent(),/苏州/);
  await page.getByRole('button',{name:'查看示意图',exact:true}).click();const marker=await page.locator('.map-marker').first().boundingBox(),map=await page.locator('.route-map').boundingBox();assert.ok(marker.x>map.x+20&&marker.y>map.y+20,'explicitly selected illustration renders markers under CSP');assert.match(await page.locator('#map-status').textContent(),/未经高德核实/);
  await page.getByRole('button',{name:'导入攻略'}).click();
  await page.locator('#note-title').fill('游客体验');await page.locator('#note-content').fill('平江路很好看，周末人多。苏州博物馆需预约。');await page.getByRole('button',{name:'加入资料',exact:true}).click();await page.getByRole('button',{name:'关闭攻略导入'}).click();
  await page.locator('#travel-brief').fill('苏州两小时，少走路');await page.getByRole('button',{name:'发送消息'}).click();await page.waitForFunction(()=>document.getElementById('plan-button').disabled===false);
  assert.ok(await page.locator('.stop-card').count()<=2);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.getByRole('button',{name:'模拟签到 · 解锁'}).first().click();await page.waitForSelector('dialog[open]');
  assert.equal(await page.locator('#webgl-note').isVisible(),false,'real WebGL preview available');
  const beforeRotation=await page.locator('#souvenir-canvas').evaluate(c=>c.toDataURL());await page.locator('#souvenir-canvas').focus();await page.keyboard.press('ArrowRight');assert.notEqual(await page.locator('#souvenir-canvas').evaluate(c=>c.toDataURL()),beforeRotation,'keyboard input rotates rendered geometry');
  await page.locator('#memory-story').fill('毕业旅行，记住小桥。');await page.getByRole('button',{name:'保存这段记忆',exact:true}).click();
  await page.locator('#print-width').fill('');await page.getByRole('button',{name:'导出 STL'}).click();assert.match(await page.locator('#souvenir-status').textContent(),/40/);await page.locator('#print-width').fill('60');
  const [stl]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'导出 STL'}).click()]);assert.match(stl.suggestedFilename(),/\.stl$/);
  const stlBytes=await readFile(await stl.path());assert.equal(stlBytes.length,84+stlBytes.readUInt32LE(80)*50);let minX=Infinity,maxX=-Infinity;for(let i=84;i<stlBytes.length;i+=50)for(let v=0;v<3;v++){const x=stlBytes.readFloatLE(i+12+v*12);assert.ok(Number.isFinite(x));minX=Math.min(minX,x);maxX=Math.max(maxX,x);}assert.ok(Math.abs(maxX-minX-60)<.001,'downloaded STL has the requested physical width');
  await page.getByRole('button',{name:'关闭纪念品详情'}).click();
  await page.reload();await page.locator('.stop-card').first().waitFor();
  assert.match(await page.locator('#route-souvenirs').textContent(),/已解锁/);
  const oldCollection=await page.evaluate(()=>JSON.parse(localStorage.getItem('lvzang.v1')).collection);
  assert.equal(oldCollection.length,1);assert.match(oldCollection[0].story,/记住小桥/);
  // Legacy shared exhibitions remain readable; new creation/order flows have their own navigation tests.
  const link=await page.evaluate(async()=>{const {readState,encodeExhibition}=await import('/src/travel-state.js');return location.origin+'/travel.html#exhibition='+encodeExhibition(readState(localStorage));});
  const other=await browser.newPage();await other.goto(link);await other.waitForSelector('#shared-section:not([hidden])');assert.equal(await other.locator('.exhibit').count(),1);assert.equal(await other.locator('[data-open]').count(),0);assert.equal(await other.evaluate(()=>localStorage.getItem('lvzang.v1')),null);await other.close();
  await page.locator('#travel-brief').fill('北京半天');await page.getByRole('button',{name:'发送消息'}).click();await page.waitForFunction(()=>!document.getElementById('plan-button').disabled);assert.match(await page.locator('#requirements-summary').textContent(),/北京/);assert.match(await page.locator('.chat-message.assistant').last().textContent(),/本地目录|切换 AI/);assert.match(await page.locator('#route-title').textContent(),/苏州/);
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/travel/home-mobile.png',fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile page has no horizontal overflow');
  assert.equal(await page.getByRole('navigation',{name:'主导航'}).getByRole('link',{name:'留回忆',exact:true}).getAttribute('href'),'/collection.html#world/canvas');
  const damaged=await browser.newPage();damaged.on('pageerror',e=>errors.push(e.message));const raw=JSON.stringify({version:1,notes:[{title:'损坏',content:null}]});await damaged.addInitScript(value=>{if(!sessionStorage.getItem('corrupt-seeded')){localStorage.setItem('lvzang.v1',value);sessionStorage.setItem('corrupt-seeded','yes');}},raw);await damaged.goto(root+'/travel.html');assert.equal(await damaged.locator('#storage-recovery').isVisible(),true);assert.equal(await damaged.locator('#reset-storage').isDisabled(),true);await damaged.getByRole('button',{name:'发送消息'}).click();await damaged.waitForFunction(()=>!document.getElementById('plan-button').disabled);assert.equal(await damaged.evaluate(()=>localStorage.getItem('lvzang.v1')),raw,'new actions do not overwrite damaged records');const [backup]=await Promise.all([damaged.waitForEvent('download'),damaged.getByRole('button',{name:'下载原始记录备份'}).click()]);assert.match(backup.suggestedFilename(),/备份/);assert.equal(await readFile(await backup.path(),'utf8'),raw);assert.equal(await damaged.locator('#reset-storage').isEnabled(),true);await Promise.all([damaged.waitForEvent('load'),damaged.getByRole('button',{name:'已备份，重置本机记录'}).click()]);assert.equal(await damaged.locator('#storage-recovery').isVisible(),false);assert.deepEqual(await damaged.evaluate(()=>JSON.parse(localStorage.getItem('lvzang.v1')).notes),[]);await damaged.close();
  assert.deepEqual(errors,[]);
  const quota=await browser.newPage();quota.on('pageerror',e=>errors.push(e.message));await quota.addInitScript(()=>{Storage.prototype.setItem=()=>{throw new DOMException('quota','QuotaExceededError');};});await quota.goto(root+'/travel.html');await quota.getByRole('button',{name:'发送消息'}).click();await quota.waitForFunction(()=>!document.getElementById('plan-button').disabled);await quota.getByRole('button',{name:'模拟签到 · 解锁'}).first().click();assert.match(await quota.locator('#toast').textContent(),/尚未保存/);await quota.locator('#memory-story').fill('暂存故事');await quota.getByRole('button',{name:'保存这段记忆',exact:true}).click();assert.match(await quota.locator('#souvenir-status').textContent(),/尚未保存/);assert.equal(await quota.evaluate(()=>localStorage.getItem('lvzang.v1')),null);await quota.close();assert.deepEqual(errors,[]);
  console.log('PASS: empty recommendation, notes, revision, real 3D, STL, legacy collection and shared links, new memory navigation, damaged-storage recovery, quota failures, unsupported city, desktop and mobile.');
} finally {await browser.close();await new Promise(r=>server.close(r));}
