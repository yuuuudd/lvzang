import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createApp} from '../server.js';
import {sdkSource} from './fixtures/amap-sdk.js';
import {initialState} from '../public/src/travel-state.js';
import {normalizeRequest,planFromCatalog} from '../public/src/travel-domain.js';
import {emptyTravelProfile,updateTravelProfile} from '../public/src/travel-profile.js';
import {buildDailyPlan} from '../public/src/travel-schedule.js';

const profile=updateTravelProfile(emptyTravelProfile(),{text:'广州一天每天六小时',patch:{destination:'广州',dayCount:1,dailyHours:6}}).profile;
const plan=buildDailyPlan({...planFromCatalog(normalizeRequest({destination:'广州',hours:6}),undefined,{placeIds:['gz-museum','gz-square']}),mode:'ai',trace:[]},profile);
plan.guide={status:'ready',summary:'文化与城市漫游',days:[{dayIndex:1,overview:'上午看展，下午散步；中间安排午饭。',stops:plan.stops.map(stop=>({stopId:stop.id,name:stop.name,howToPlay:'先看主题展，再按兴趣选择常设展，累了就在休息区歇一会。',highlights:['建筑外观与展览主题'],food:[{name:'附近粤菜或粥粉面',note:'优先选择步行可达店铺，营业状态出发前核实。',sourceIds:[]}],transport:'步行到下一站，准确距离请用高德地图查询。',reservation:'核对官方预约规则。',rainyAlternative:'留在室内展馆或附近商场。',sourceIds:[]}))}],sources:[],warnings:[]};
const saved=JSON.stringify({...initialState(),profile,plan}),key='lvzang.travel-split.v1';
const server=createApp({accountsEnabled:false,key:'',amapJsKey:'fixture-public',amapSecurityJsCode:'fixture-private',fetchImpl:async()=>{throw Error('No external request');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const root=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1146,height:900},hasTouch:true,reducedMotion:'reduce'}),errors=[];
  page.setDefaultTimeout(7000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(saved=>{
    if(!localStorage.getItem('lvzang.v1'))localStorage.setItem('lvzang.v1',saved);
    localStorage.setItem('lvzang.guide-layout.v1',JSON.stringify({width:650,height:700,fontSize:22}));
    window.mock={maps:[],searches:[],poiResults:[],routes:[],fits:[],centers:[],drags:[],pitches:[],rotations:[],offsets:[],projections:[],clustered:false,removes:0,clears:0,destroys:0,mapFailures:0,mapDelay:5,fixtures:{},failRoutes:false,routeDelay:5,holdRoutes:false,pendingRoutes:[]};
  },saved);
  await page.route('**/*',route=>route.request().url().startsWith(root+'/')?route.continue():route.abort());
  await page.route('https://webapi.amap.com/maps?**',route=>route.fulfill({contentType:'application/javascript',body:sdkSource}));
  await page.goto(root+'/travel.html');await page.waitForSelector('.stop-guide');
  assert.equal(await page.locator('#travel-splitter').count(),1,'A real divider must exist between the map pane and guide pane');
  assert.equal(await page.locator('#travel-splitter').getAttribute('role'),'separator');
  assert.equal(await page.locator('#travel-splitter').getAttribute('aria-orientation'),'vertical');
  assert.equal(await page.locator('#guide-font-size,#guide-resize-handle').count(),0,'The superseded font selector and corner resize handle are removed');
  assert.equal(await page.locator('#canvas-world > #map-pane').count(),1);assert.equal(await page.locator('#canvas-world > #guide-pane').count(),1);
  assert.equal(await page.locator('#map-pane #map-node').count(),1);assert.equal(await page.locator('#guide-pane #route-section').count(),1);assert.equal(await page.locator('#guide-pane #sources-node').count(),1);
  for(const id of ['time-node','budget-node','preferences-node'])assert.equal(await page.locator(`#map-pane #${id}`).count(),1,'Travel conditions move with the map pane');
  await page.waitForFunction(()=>document.querySelector('.route-map').dataset.mapPhase==='ready');
  const originalState=await page.evaluate(()=>localStorage.getItem('lvzang.v1'));
  const geometry=async()=>{await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));return page.evaluate(()=>{
    const box=id=>{const r=document.getElementById(id).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,width:r.width,height:r.height};};
    const map=box('map-pane'),guide=box('guide-pane'),split=box('travel-splitter'),world=box('canvas-world');
    const route=document.querySelector('#route-section').getBoundingClientRect(),sources=document.querySelector('#sources-node').getBoundingClientRect();
    return {map,guide,split,world,ratio:map.width/(map.width+guide.width),span:guide.right-map.left,font:parseFloat(getComputedStyle(document.querySelector('.stop-guide')).fontSize),pageOverflow:document.documentElement.scrollWidth>innerWidth,routeInside:route.left>=guide.left-1&&route.right<=guide.right+1,sourcesBelow:sources.top>=route.bottom-1,worldTransform:getComputedStyle(document.getElementById('canvas-world')).transform};
  });};
  const verifyGeometry=async width=>{
    const g=await geometry();
    assert.ok(!g.pageOverflow,`${width}px: page has no horizontal overflow`);
    assert.ok(g.map.width>0&&g.guide.width>0,`${width}px: both panes remain usable layout columns`);
    assert.ok(g.map.right<=g.split.left+1&&g.split.right<=g.guide.left+1,`${width}px: divider stays between non-overlapping panes`);
    assert.ok(Math.abs(g.map.top-g.guide.top)<2,`${width}px: the two panes share a row`);
    assert.ok(g.routeInside&&g.sourcesBelow,`${width}px: itinerary and sources stay inside their guide pane`);
    assert.ok(g.font>=13.9&&g.font<=18.1,`${width}px: type follows available width, not old 22px preference`);
    assert.ok(await page.locator('#route-refresh').isVisible(),`${width}px: refresh remains available`);
    const refresh=await page.locator('#route-refresh').boundingBox();assert.ok(refresh.x>=0&&refresh.x+refresh.width<=width,`${width}px: the global refresh button fits the viewport width`);
    assert.ok(await page.locator('#route-refresh').evaluate(button=>{const r=button.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('#route-refresh')===button;}),`${width}px: the global refresh action is actually visible and hittable`);
    assert.equal(await page.evaluate(()=>{
      const map=document.querySelector('.route-map').getBoundingClientRect(),inside=r=>r.left>=map.left-1&&r.right<=map.right+1&&r.top>=map.top-1&&r.bottom<=map.bottom+1;
      return [...document.querySelectorAll('#map-explorer-controls button,#map-use-location')].filter(button=>button.getClientRects().length&&getComputedStyle(button).visibility!=='hidden').every(button=>inside(button.getBoundingClientRect()));
    }),true,`${width}px: map controls stay within the map`);
    return g;
  };
  const pointOnDivider=async()=>{
    await page.locator('#travel-splitter').scrollIntoViewIfNeeded();
    const box=await page.locator('#travel-splitter').boundingBox();
    return {x:box.x+box.width/2,y:Math.min(800,Math.max(100,box.y+50))};
  };
  const drag=async delta=>{
    const point=await pointOnDivider();await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x+delta,point.y,{steps:10});await page.mouse.up();
  };
  for(const width of [1146,1440]){
    await page.setViewportSize({width,height:900});await page.locator('#travel-splitter').focus();await page.keyboard.press('Home');
    const before=await verifyGeometry(width);await drag(-110);const wider=await verifyGeometry(width);
    assert.ok(wider.guide.width>before.guide.width+60&&wider.map.width<before.map.width-60,`${width}px: dragging left grows the guide and shrinks the map`);
    assert.ok(Math.abs(wider.span-before.span)<2,`${width}px: resizing conserves total width`);
    assert.ok(wider.font>before.font+.05,`${width}px: wider guide automatically uses larger type`);
    assert.equal(wider.worldTransform,before.worldTransform,'Resizing panes never pans or zooms the workspace');
    await drag(80);const narrower=await verifyGeometry(width);
    assert.ok(narrower.guide.width<wider.guide.width-50&&narrower.map.width>wider.map.width+50,`${width}px: dragging right reverses the allocation`);
    assert.ok(narrower.font<wider.font-.05,`${width}px: type also follows a narrower guide`);
  }
  const preferences=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key),beforeReload=await geometry();assert.ok(Number.isFinite(preferences.mapRatio));
  await page.reload();await page.waitForSelector('.stop-guide');const restored=await geometry();
  assert.ok(Math.abs(restored.ratio-beforeReload.ratio)<.004,'Saved pane proportion survives reload');
  await page.locator('#travel-splitter').focus();const keyBefore=await geometry();await page.keyboard.press('ArrowLeft');const keyAfter=await geometry();
  assert.ok(keyAfter.guide.width>keyBefore.guide.width+10&&keyAfter.map.width<keyBefore.map.width-10,'The divider is operable with the keyboard');
  await page.keyboard.press('Home');assert.ok(Math.abs((await geometry()).ratio-.55)<.004,'Home restores the default map proportion');
  await mkdir('artifacts/guide-layout',{recursive:true});await page.screenshot({path:'artifacts/guide-layout/desktop-split.png'});
  for(const width of [580,390]){
    await page.setViewportSize({width,height:900});
    await page.getByRole('button',{name:'攻略',exact:true}).click();
    assert.ok(await page.locator('.stop-guide').first().isVisible());
    assert.ok((await page.locator('#guide-pane').boundingBox()).width>width-40,'Mobile guide is readable at full width');
    assert.ok(!await page.locator('#travel-splitter').isVisible());
    assert.ok(!await page.locator('#map-pane').isVisible());
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:`artifacts/guide-layout/guide-${width}.png`});
    await page.getByRole('button',{name:'地图',exact:true}).click();
    assert.ok(await page.locator('#map-pane').isVisible());
    assert.ok(!await page.locator('#guide-pane').isVisible());
    await page.screenshot({path:`artifacts/guide-layout/map-${width}.png`});
  }
  assert.equal(await page.evaluate(()=>localStorage.getItem('lvzang.v1')),originalState,'Layout preferences leave the accepted trip bytes unchanged');
  assert.deepEqual(errors,[]);console.log('PASS: desktop split with pointer/keyboard, automatic font, Home and reload; full-width mobile map/guide switching; bounded map controls and unchanged itinerary.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
