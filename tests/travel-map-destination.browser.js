import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createApp} from '../server.js';
import {initialState} from '../public/src/travel-state.js';
import {normalizeRequest,planFromCatalog} from '../public/src/travel-domain.js';
import {sdkSource} from './fixtures/amap-sdk.js';

const base={...planFromCatalog(normalizeRequest({destination:'广州'}),undefined,{placeIds:['gz-museum']}),mode:'demo',trace:[]};
const saved=JSON.stringify({...initialState(),plan:base});
const provider=sdkSource+String.raw`
window.AMap.DistrictSearch=class {
 constructor(options){this.options=options;}
 search(name,callback){window.mock.districtQueries.push(name);const value=window.mock.districts[name];setTimeout(()=>callback(value?'complete':'no_data',{districtList:value?[value]:[]}),value?.delay||5);}
};`;
const server=createApp({key:'',accountsEnabled:false,amapJsKey:'fixture-key',amapSecurityJsCode:'fixture-code',fetchImpl:async()=>{throw Error('No real external requests');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const root=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(saved=>{
  localStorage.setItem('lvzang.v1',saved);
  window.mock={maps:[],searches:[],poiResults:[],routes:[],fits:[],centers:[],drags:[],pitches:[],rotations:[],offsets:[],projections:[],clustered:false,removes:0,clears:0,destroys:0,mapFailures:0,mapDelay:5,neverComplete:false,failRoutes:false,routeDelay:5,holdRoutes:false,pendingRoutes:[],districtQueries:[],
   districts:{'杭州':{name:'杭州市',adcode:'330100',level:'city',center:[120.15,30.27]},'西藏':{name:'西藏自治区',adcode:'540000',level:'province',center:[91.13,29.65]},'南京':{name:'南京市',adcode:'320100',level:'city',center:[118.79,32.06],delay:150}},
   fixtures:{'540000|布达拉宫':{pois:[{id:'tibet-palace',name:'布达拉宫',cityname:'拉萨市',pname:'西藏自治区',adcode:'540102',location:[91.118,29.654],address:'北京中路35号'}]},'540000|大昭寺':{pois:[{id:'tibet-temple',name:'大昭寺',cityname:'拉萨市',pname:'西藏自治区',adcode:'540102',location:[91.13,29.65],address:'八廓街'}]}}
  };
 },saved);
 await page.route('**/*',route=>route.request().url().startsWith(root+'/')?route.continue():route.abort());
 await page.route('https://webapi.amap.com/maps?**',route=>route.fulfill({contentType:'application/javascript',body:provider}));
 await page.goto(root+'/travel.html');await page.waitForFunction(()=>document.querySelector('.route-map').dataset.mapPhase==='ready');
 await page.getByLabel('地标密度',{exact:true}).selectOption('itinerary');
 const render=plan=>page.evaluate(async plan=>{const {renderMap}=await import('/src/travel-workspace.js');renderMap(plan,[],plan.stops);},plan);
 await render({...base,city:'杭州',stops:[]});
 await page.waitForFunction(()=>document.querySelector('.route-map').dataset.mapPhase==='empty');
 assert.deepEqual(await page.evaluate(()=>window.mock.maps.at(-1).center),[120.15,30.27],'A new city with no resolved stops must not retain the Guangzhou map center');
 assert.equal(await page.locator('.map-marker').count(),0);assert.match(await page.locator('#map-title').innerText(),/^杭州/);
 await page.locator('#map-view-toggle').click();assert.equal(await page.locator('.route-map').evaluate(node=>node.classList.contains('illustration')),true);
 const tibet={...base,city:'西藏',stops:[{...base.stops[0],id:'tibet-palace',name:'布达拉宫',city:'拉萨'}]};
 await render(tibet);await page.waitForFunction(()=>document.querySelector('.route-map').dataset.mapPhase==='ready');
 assert.equal(await page.locator('.route-map').evaluate(node=>node.classList.contains('illustration')),false,'Changing destination exits the previous illustration');
 assert.deepEqual(await page.locator('.map-marker .landmark-name').allTextContents(),['布达拉宫']);
 assert.deepEqual(await page.evaluate(()=>window.mock.maps.at(-1).center),[91.118,29.654]);
 await page.locator('#map-search-input').fill('大昭寺');await page.locator('#map-search-form button').click();await page.locator('.map-search-choice').waitFor();
 assert.equal(await page.evaluate(()=>window.mock.searches.at(-1).city),'540000','Province search uses the verified administrative scope');
 assert.match(await page.locator('.map-search-choice').innerText(),/大昭寺/);
 await render({...base,city:'南京',stops:[]});await page.waitForFunction(()=>window.mock.districtQueries.includes('南京'));
 await render({...tibet,stops:[]});await page.waitForFunction(()=>document.querySelector('.route-map').dataset.mapPhase==='empty');
 await page.waitForTimeout(220);assert.deepEqual(await page.evaluate(()=>window.mock.maps.at(-1).center),[91.13,29.65],'A delayed previous-city district result cannot change the new destination');
 assert.equal(await page.locator('#map-search-input').inputValue(),'');assert.equal(await page.locator('.map-search-choice').count(),0);
 await render({...base,city:'未识别目的地',stops:[]});await page.waitForFunction(()=>document.querySelector('.route-map').dataset.mapPhase==='empty');
 assert.deepEqual(await page.evaluate(()=>window.mock.maps.at(-1).center),[104,35]);assert.match(await page.locator('#map-message').innerText(),/全国|尚未定位|暂未定位/);
 assert.equal(await page.evaluate(()=>localStorage.getItem('lvzang.v1')),saved,'Map destination changes never rewrite the accepted itinerary');
 assert.deepEqual(errors,[]);console.log('PASS: city/region framing, verified province POIs and search, illustration reset, stale district results, safe unknown destination and unchanged trip.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
