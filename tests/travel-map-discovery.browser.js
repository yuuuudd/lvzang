import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createApp} from '../server.js';
import {sdkSource} from './fixtures/amap-sdk.js';
import {initialState} from '../public/src/travel-state.js';
import {normalizeRequest,planFromCatalog} from '../public/src/travel-domain.js';
import {emptyTravelProfile,updateTravelProfile} from '../public/src/travel-profile.js';
import {buildDailyPlan} from '../public/src/travel-schedule.js';

const profile=updateTravelProfile(emptyTravelProfile(),{text:'广州一天每天8小时',patch:{destination:'广州',dayCount:1,dailyHours:8}}).profile;
const plan=buildDailyPlan({...planFromCatalog(normalizeRequest({destination:'广州',hours:8}),undefined,{placeIds:['gz-museum','gz-square']}),mode:'demo',trace:[]},profile);
const saved=JSON.stringify({...initialState(),plan,profile});
const server=createApp({key:'',amapJsKey:'fixture-public',amapSecurityJsCode:'fixture-private',fetchImpl:async()=>{throw Error('No external services in this test');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const root=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1500,height:1100},reducedMotion:'reduce'});
  page.setDefaultTimeout(6000);
  await page.addInitScript(saved=>{localStorage.setItem('lvzang.v1',saved);window.mock={maps:[],searches:[],poiResults:[],routes:[],fits:[],centers:[],drags:[],pitches:[],rotations:[],offsets:[],projections:[],clustered:false,removes:0,clears:0,destroys:0,mapFailures:0,mapDelay:5,fixtures:{},failRoutes:false,routeDelay:5,holdRoutes:false,pendingRoutes:[],locationCalls:0,locationError:false};},saved);
  await page.route('**/*',route=>route.request().url().startsWith(root+'/')?route.continue():route.abort());
  const geolocation=`class Geolocation{constructor(options){window.mock.geolocationOptions=options;}getCurrentPosition(callback){window.mock.locationCalls++;setTimeout(()=>window.mock.locationError?callback('error',{message:'User denied Geolocation',info:'PERMISSION_DENIED'}):callback('complete',{position:[113.321,23.131],accuracy:25,location_type:'h5',isConverted:true,addressComponent:{city:'广州市'},formattedAddress:'测试当前位置'}),5);}};`;
  await page.route('https://webapi.amap.com/maps?**',route=>route.fulfill({contentType:'application/javascript',body:sdkSource.replace('const sdkCallback=',geolocation+'\n const sdkCallback=').replace('window.AMap={Map:','window.AMap={Geolocation,Map:')}));
  await page.goto(root+'/travel.html');
  await page.waitForFunction(()=>document.querySelector('.route-map').dataset.mapPhase==='ready');
  assert.equal(await page.getByRole('button',{name:'当前位置',exact:true}).count(),1,'A visible current-position origin action must exist');
  assert.equal(await page.locator('.route-map #map-use-location').count(),1,'The single location action belongs inside the map');
  assert.equal(await page.locator('#map-use-location').getAttribute('title'),'当前位置');
  assert.equal(await page.locator('#map-use-location').textContent(),'','The location action is a compact icon, not a text banner');
  assert.equal(await page.locator('#map-location-status').isVisible(),false,'An idle map has no default location explanation');
  assert.equal(await page.evaluate(()=>window.mock.locationCalls),0,'Opening the map never requests location');
  await page.getByRole('button',{name:'当前位置',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('map-origin').textContent==='我的位置');
  await page.locator('.map-marker[data-stop="gz-museum"]').click();
  await page.waitForFunction(()=>document.getElementById('map-journey-result').dataset.state==='ready');
  assert.deepEqual(await page.evaluate(()=>window.mock.routes.at(-1).from),[113.321,23.131]);
  assert.equal(await page.evaluate(()=>localStorage.getItem('lvzang.v1')),saved,'Location and route comparison do not modify the accepted trip');
  await page.evaluate(()=>window.mock.locationError=true);
  await page.getByRole('button',{name:'当前位置',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('map-location-status').dataset.state==='error');
  assert.equal(await page.locator('#map-location-status').isVisible(),true,'Denied location remains visibly explained next to the compact action');
  assert.match(await page.locator('#map-location-status').textContent(),/拒绝|未获允许|权限|未允许/);
  for(const width of [390,580,1440]){
    await page.setViewportSize({width,height:1000});
    const geometry=await page.evaluate(()=>{
      const map=document.querySelector('.route-map').getBoundingClientRect();
      const button=document.getElementById('map-use-location').getBoundingClientRect();
      const status=document.getElementById('map-location-status').getBoundingClientRect();
      const inside=rect=>rect.left>=map.left-1&&rect.right<=map.right+1&&rect.top>=map.top-1&&rect.bottom<=map.bottom+1;
      return {noOverflow:document.documentElement.scrollWidth<=innerWidth,buttonInside:inside(button),statusInside:inside(status),statusAboveButton:status.bottom<=button.top};
    });
    assert.deepEqual(geometry,{noOverflow:true,buttonInside:true,statusInside:true,statusAboveButton:true},`Location control and failure state fit at ${width}px`);
  }
  await page.setViewportSize({width:1500,height:1100});
  assert.equal(await page.locator('#map-origin').textContent(),'我的位置','Denied retry preserves prior comparison');
  await page.getByLabel('地标密度',{exact:true}).selectOption('detailed');
  await page.waitForFunction(()=>!!document.querySelector('.map-marker[data-stop="gz-parc-central"]')&&!!document.querySelector('.map-marker[data-stop="gz-grandview"]'));
  await page.getByLabel('地标分类',{exact:true}).selectOption('shopping');
  await page.waitForFunction(()=>!!document.querySelector('.map-marker[data-stop="gz-grandview"]')&&!document.querySelector('.map-marker[data-stop="gz-youth-palace"]'));
  assert.equal(await page.locator('.map-marker[data-stop="gz-museum"]').count(),1,'Category filters never hide accepted itinerary stops');
  await page.getByRole('searchbox',{name:'搜索当前城市的地点',exact:true}).fill('测试新景点');
  await page.getByRole('button',{name:'搜索地点',exact:true}).click();
  await page.getByRole('button',{name:/测试新景点.*测试地址/}).click();
  await page.waitForFunction(()=>document.getElementById('map-place-name').textContent==='测试新景点');
  assert.equal(await page.locator('#map-place-day').textContent(),'探索地标 · 未加入行程');
  assert.equal(await page.evaluate(()=>localStorage.getItem('lvzang.v1')),saved,'Searching and filtering never adds a trip stop');
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Controls fit a narrow viewport');
  console.log('PASS: explicit current-position origin, denied retry, density/category coverage, city search, no implicit trip edits, responsive controls.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
