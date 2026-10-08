import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createApp} from '../server.js';
import {sdkSource} from './fixtures/amap-sdk.js';
import {initialState} from '../public/src/travel-state.js';
import {normalizeRequest,planFromCatalog} from '../public/src/travel-domain.js';
import {emptyTravelProfile,updateTravelProfile} from '../public/src/travel-profile.js';
import {buildDailyPlan} from '../public/src/travel-schedule.js';
import {getExplorationLandmarks} from '../public/src/travel-map-exploration.js';

const profile=updateTravelProfile(emptyTravelProfile(),{text:'广州一天每天8小时',patch:{destination:'广州',dayCount:1,dailyHours:8}}).profile;
const plan=buildDailyPlan({...planFromCatalog(normalizeRequest({destination:'广州',hours:8}),undefined,{placeIds:['gz-museum','gz-square']}),mode:'demo',trace:[]},profile);
const expected=plan.stops.length+getExplorationLandmarks('广州',{acceptedStops:plan.stops}).length;
const saved=JSON.stringify({...initialState(),plan,profile});
const server=createApp({key:'',accountsEnabled:false,amapJsKey:'fixture',amapSecurityJsCode:'fixture',fetchImpl:async()=>{throw Error('No external services');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1500,height:1100},reducedMotion:'reduce'});
  page.setDefaultTimeout(6000);
  await page.addInitScript(saved=>{
    localStorage.setItem('lvzang.v1',saved);
    window.mock={maps:[],searches:[],poiResults:[],routes:[],fits:[],centers:[],drags:[],pitches:[],rotations:[],offsets:[],projections:[],clustered:false,removes:0,clears:0,destroys:0,mapFailures:0,mapDelay:5,fixtures:{},failRoutes:false,routeDelay:5,holdRoutes:false,pendingRoutes:[]};
  },saved);
  await page.route('**/*',route=>route.request().url().startsWith(base+'/')?route.continue():route.abort());
  await page.route('https://webapi.amap.com/maps?**',route=>route.fulfill({contentType:'application/javascript',body:sdkSource}));
  await page.goto(base+'/travel.html');
  await page.waitForFunction(count=>document.querySelectorAll('.map-marker').length===count,expected);
  await page.locator('#map-search-input').fill('测试地点');
  await page.locator('#map-search-form button').click();
  await page.locator('.map-search-choice').click();
  await page.waitForFunction(count=>document.querySelectorAll('.map-marker').length===count,expected+1);
  await page.locator('#map-clear-selection').click();
  await page.locator('#map-fit').click();
  const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const markers=()=>page.evaluate(()=>{
    const map=window.mock.maps.at(-1),bounds=map.node.getBoundingClientRect(),scale=bounds.width/map.node.clientWidth;
    return map.overlays.filter(item=>item.content?.classList.contains('map-marker')).map(item=>{
      const content=item.content,rect=content.getBoundingClientRect(),point=map.lngLatToContainer(item.position),offset=item.getOffset();
      const model=content.querySelector('.landmark-model'),label=content.querySelector('.landmark-label');
      return {id:content.dataset.stop,style:content.dataset.markerStyle,width:content.offsetWidth,height:content.offsetHeight,modelVisible:Boolean(model&&getComputedStyle(model).display!=='none'),labelVisible:getComputedStyle(label).display!=='none',dx:offset.x,dy:offset.y,anchorDx:(rect.left+rect.width/2-bounds.left)/scale-point.x,anchorDy:(rect.bottom-bounds.top)/scale-point.y,position:[...item.position]};
    });
  });
  await settle();
  const initial=await markers();
  assert.ok(initial.some(item=>item.modelVisible),'Nearby curated landmarks initially show dedicated architecture');
  assert.ok(initial.some(item=>item.style==='pin'),'The scenario also contains ordinary POIs');
  await page.evaluate(()=>window.mock.maps.at(-1).setZoom(16));await settle();
  const closeMinus=(await markers()).find(item=>item.id==='gz-museum');
  assert.ok(closeMinus.width<initial.find(item=>item.id==='gz-museum').width,'One zoom-out step must already shrink the building within the close-view tier');
  await page.evaluate(()=>window.mock.maps.at(-1).setZoom(16.5));await settle();
  const between=(await markers()).find(item=>item.id==='gz-museum');
  assert.ok(between.width>closeMinus.width&&between.width<initial.find(item=>item.id==='gz-museum').width,'Fractional zoom continuously adjusts the model rather than waiting for a tier boundary');

  // A regional overview compresses real POI anchors. Large collision packing
  // here used to spread fixed-size buildings and leaders across the whole map.
  await page.evaluate(()=>window.mock.maps.at(-1).setZoom(9));await settle();
  const overview=await markers();
  for(const item of overview){
    assert.ok(item.width<=30&&item.height<=36,`Regional overview must use a small marker: ${item.id} is ${item.width}x${item.height}`);
    assert.equal(item.modelVisible,false,`Regional overview hides architecture: ${item.id}`);
    assert.equal(item.labelVisible,false,`Regional overview does not pack every POI label: ${item.id}`);
    assert.deepEqual([item.dx,item.dy],[0,0],`Regional pins stay at the actual POI: ${item.id}`);
    assert.ok(Math.abs(item.anchorDx)<1&&Math.abs(item.anchorDy)<1,`Rendered pin tip is anchored to its projected POI: ${item.id}`);
  }
  assert.equal(await page.locator('.landmark-leaders line').count(),0,'Regional overview has no long displaced leaders');
  const clickable=await page.locator('.map-marker').evaluateAll(nodes=>nodes.map(node=>{const rect=node.getBoundingClientRect();return {id:node.dataset.stop,name:node.querySelector('.landmark-name').textContent,receivesClick:document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2)?.closest('.map-marker')===node};}).find(item=>item.receivesClick));
  assert.ok(clickable,'At least one compact regional marker receives normal pointer input');
  await page.locator(`.map-marker[data-stop="${clickable.id}"]`).click();
  assert.equal(await page.locator('#map-place-name').textContent(),clickable.name,'A normal pointer click selects the compact POI');
  await page.locator('#map-clear-selection').click();
  await page.locator('.map-marker[data-stop="gz-museum"]').focus();
  await page.locator('.map-marker[data-stop="gz-museum"]').press('Enter');
  assert.equal(await page.locator('#map-place-name').textContent(),'广东省博物馆','Compact markers retain selection and accessible labels');
  await page.locator('#map-clear-selection').click();

  let cityWidth=0;
  for(const zoom of [10,12,13.5]){
    await page.evaluate(zoom=>window.mock.maps.at(-1).setZoom(zoom),zoom);await settle();
    const cityModel=(await markers()).find(item=>item.id==='gz-museum');
    assert.ok(cityModel.modelVisible,`A city overview must already show the small building at zoom ${zoom}, without requiring street-level zoom`);
    assert.ok(cityModel.width>cityWidth&&cityModel.width<closeMinus.width,'City buildings grow continuously while remaining smaller than close views');
    cityWidth=cityModel.width;
  }
  await page.locator('.map-marker[data-stop="gz-museum"]').click();
  assert.equal(await page.locator('#map-place-name').textContent(),'广东省博物馆','Small city-view buildings remain normally clickable');
  await page.locator('#map-clear-selection').click();

  await page.evaluate(()=>window.mock.maps.at(-1).setZoom(14));await settle();
  const nearby=await markers();
  const nearbyModel=nearby.find(item=>item.id==='gz-museum');
  assert.ok(nearbyModel.modelVisible&&nearbyModel.width<initial.find(item=>item.id==='gz-museum').width,'Neighborhood zoom restores a smaller dedicated building');
  await page.evaluate(()=>window.mock.maps.at(-1).setZoom(17));await settle();
  const detail=await markers(),detailModel=detail.find(item=>item.id==='gz-museum');
  assert.ok(detailModel.modelVisible&&detailModel.width>=90,'Close zoom restores the full dedicated building');
  assert.deepEqual(detail.map(item=>item.position),initial.map(item=>item.position),'Zooming changes presentation, never provider POI positions');
  await page.locator('.map-marker[data-stop="gz-museum"]').click();
  assert.equal(await page.locator('#map-place-name').textContent(),'广东省博物馆','Normal close-zoom clicks still reach the dedicated building');
  assert.equal(await page.evaluate(()=>localStorage.getItem('lvzang.v1')),saved);
  console.log('PASS: regional pins retain true POI anchors, neighborhood miniatures scale down, close buildings and normal selection return.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
