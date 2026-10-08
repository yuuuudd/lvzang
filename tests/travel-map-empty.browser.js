import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createApp} from '../server.js';
import {initialState} from '../public/src/travel-state.js';
import {normalizeRequest,planFromCatalog} from '../public/src/travel-domain.js';
import {sdkSource} from './fixtures/amap-sdk.js';

const plan={...planFromCatalog(normalizeRequest({destination:'苏州'}),undefined,{placeIds:['sz-garden']}),mode:'demo',trace:[]};
const profile={...initialState().profile,interview:{status:'active',topic:'budget',skipped:[],answers:[{field:'destination',question:'想去哪里？',answer:'苏州，想看园林'}],additions:[]}};
const saved=JSON.stringify({...initialState(),plan,profile});
const provider=sdkSource+String.raw`
window.AMap.DistrictSearch=class {
 search(name,callback){const area={'苏州':{name:'苏州市',adcode:'320500',level:'city',center:[120.585,31.299]},'深圳':{name:'深圳市',adcode:'440300',level:'city',center:[114.057,22.543]}}[name];setTimeout(()=>callback(area?'complete':'no_data',{districtList:area?[area]:[]}),5);}
};`;
const server=createApp({key:'',accountsEnabled:false,amapJsKey:'fixture-key',amapSecurityJsCode:'fixture-code',fetchImpl:async()=>{throw Error('No real network');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const root=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.setDefaultTimeout(7000);page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(saved=>{
  localStorage.setItem('lvzang.v1',saved);
  window.mock={maps:[],searches:[],poiResults:[],routes:[],fits:[],centers:[],drags:[],pitches:[],rotations:[],offsets:[],projections:[],clustered:false,removes:0,clears:0,destroys:0,mapFailures:0,mapDelay:5,fixtures:{'深圳|深圳湾公园':{pois:[{id:'sz-bay-park',name:'深圳湾公园',cityname:'深圳市',pname:'广东省',adcode:'440305',location:[113.978,22.519],address:'深圳湾畔'}]}}};
 },saved);
 await page.route('**/*',route=>route.request().url().startsWith(root+'/')?route.continue():route.abort());
 await page.route('https://webapi.amap.com/maps?**',route=>route.fulfill({contentType:'application/javascript',body:provider}));
 await page.goto(root+'/travel.html');await page.waitForFunction(()=>document.querySelector('.route-map').dataset.mapPhase==='ready');
 await page.getByLabel('地标密度',{exact:true}).selectOption('itinerary');
 const acceptedRoute=await page.locator('#route-section').textContent();
 const render=city=>page.evaluate(async city=>{const {renderMap}=await import('/src/travel-workspace.js');renderMap({city,stops:[],dayIndex:1},[],[],{onMembershipChange:null});},city);
 await render('深圳');await page.waitForFunction(()=>document.querySelector('.route-map').dataset.mapPhase==='empty');
 assert.deepEqual(await page.evaluate(()=>window.mock.maps.at(-1).center),[114.057,22.543]);
 assert.equal(await page.locator('.map-marker').count(),0,'The empty-state test does not depend on curated landmarks');
 const map=page.locator('#amap-viewport'),notice=page.locator('#map-message');
 await map.scrollIntoViewIfNeeded();
 const bounds=await map.boundingBox(),hint=await notice.boundingBox();
 assert.ok(hint.height<bounds.height*.45,'A successfully positioned empty map must use a compact notice, not a full-map overlay');
 assert.equal(await notice.evaluate(node=>getComputedStyle(node).pointerEvents),'none','An informational empty hint must not intercept map gestures');
 assert.match(await notice.innerText(),/深圳/);
 const drag=async(x,y,dx)=>{const before=await page.evaluate(()=>window.mock.drags.length);await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+12,{steps:5});await page.mouse.up();assert.ok(await page.evaluate(before=>window.mock.drags.length>before,before),'Native map pan must reach the SDK even when starting on the empty notice');};
 await drag(hint.x+hint.width*.4,hint.y+hint.height*.5,40);
 const zoom=await page.evaluate(()=>window.mock.maps.at(-1).zoom);
 await page.locator('#map-zoom-in').click();assert.equal(await page.evaluate(()=>window.mock.maps.at(-1).zoom),zoom+1);
 await page.setViewportSize({width:580,height:900});await map.scrollIntoViewIfNeeded();
 const smallMap=await map.boundingBox(),smallHint=await notice.boundingBox();
 assert.ok(smallHint.x>=smallMap.x&&smallHint.x+smallHint.width<=smallMap.x+smallMap.width+1,'A compact empty notice stays within a narrow map pane');
 assert.ok(smallHint.height<smallMap.height*.5);await drag(smallHint.x+smallHint.width*.3,smallHint.y+smallHint.height*.5,25);
 await page.setViewportSize({width:1440,height:900});
 await page.evaluate(()=>window.mock.maps.at(-1).emit('error'));
 await page.waitForFunction(()=>document.querySelector('.route-map').dataset.mapPhase==='error');
 assert.match(await notice.innerText(),/加载失败/);assert.equal(await notice.evaluate(node=>getComputedStyle(node).pointerEvents),'auto','A genuine SDK error restores the blocking error presentation');
 const failedMap=await map.boundingBox(),failure=await notice.boundingBox();
 assert.ok(failure.height>=failedMap.height*.9);assert.equal(await page.locator('#map-zoom-in').isDisabled(),true);
 await notice.getByRole('button',{name:'重新加载地图'}).click();await page.waitForFunction(()=>document.querySelector('.route-map').dataset.mapPhase==='empty');
 assert.equal(await notice.evaluate(node=>getComputedStyle(node).pointerEvents),'none','Retrying an empty destination returns to its interactive presentation');
 await page.locator('#map-search-input').fill('深圳湾公园');await page.locator('#map-search-form button').click();await page.locator('.map-search-choice').waitFor();
 await page.locator('.map-search-choice').click();await page.waitForFunction(()=>document.querySelector('.map-marker'));
 assert.equal(await notice.isHidden(),true,'An inspected search result clears the empty notice');
 assert.equal(await page.locator('#map-membership').isHidden(),true,'Exploring the new city does not offer adding it into the accepted Suzhou route');
 await render('未知目的地');await page.waitForFunction(()=>document.querySelector('.route-map').dataset.mapPhase==='empty');
 assert.match(await notice.innerText(),/全国|未定位/);assert.equal(await notice.evaluate(node=>getComputedStyle(node).pointerEvents),'none','An unresolved city still leaves the fallback map usable');
 assert.equal(await page.locator('#route-section').textContent(),acceptedRoute);
 assert.equal(await page.evaluate(()=>localStorage.getItem('lvzang.v1')),saved,'Map exploration preserves the accepted route and raw interview');
 assert.deepEqual(errors,[]);
 console.log('PASS: empty destination uses a compact pass-through notice, native map pan/zoom/search work, real failures remain visible, retry recovers, and accepted trip/interview stay unchanged.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}

