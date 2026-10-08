import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createApp} from '../server.js';
import {initialState} from '../public/src/travel-state.js';
import {emptyTravelProfile,normalizeTravelProfile,updateTravelProfile} from '../public/src/travel-profile.js';
import {normalizeRequest,planFromCatalog} from '../public/src/travel-domain.js';
import {buildDailyPlan} from '../public/src/travel-schedule.js';
import {getExplorationLandmarks} from '../public/src/travel-map-exploration.js';
import {sdkSource} from './fixtures/amap-sdk.js';

const profile=normalizeTravelProfile({...updateTravelProfile(emptyTravelProfile(),{text:'广州一天，每天4小时，喜欢建筑，必去广东省博物馆'}).profile,interview:{status:'completed',topic:null,skipped:[],answers:[{field:'destination',question:'上次去哪里？',answer:'广州'},{field:'dayCount',question:'上次玩几天？',answer:'一天'},{field:'interests',question:'上次喜欢什么？',answer:'建筑和粤菜'}],additions:['上次住在广州东站附近']}});
const plan=buildDailyPlan({...planFromCatalog(normalizeRequest({destination:'广州',hours:4}),undefined,{placeIds:['gz-museum','gz-square'],title:'已保存的广州攻略'}),mode:'ai',trace:[]},profile);
const saved=JSON.stringify({...initialState(),profile,plan}),chat=JSON.stringify({version:1,messages:[{role:'user',content:'上次去广州看建筑。'},{role:'assistant',content:'广州旧攻略已保存。'}]});
const fixtures={};
for(const destination of ['西藏','杭州'])getExplorationLandmarks(destination,{density:'detailed'}).forEach((stop,index)=>{
  const tibet=destination==='西藏',shigatse=stop.city==='日喀则',city=tibet?'540000':'杭州',base=tibet?shigatse?[88.88,29.26]:[91.12,29.65]:[120.15,30.25];
  fixtures[city+'|'+stop.name]={pois:[{id:'fixture-'+stop.id,name:stop.name,cityname:stop.city+'市',pname:tibet?'西藏自治区':'浙江省',adcode:tibet?shigatse?'540202':'540102':'330106',location:[base[0]+index*.002,base[1]+index*.001],address:'仅用于隔离测试的地址'}]};
});
const provider=sdkSource+String.raw`
window.AMap.DistrictSearch=class {
 constructor(options){this.options=options;}
 search(name,callback){window.mock.districtQueries.push(name);const district=window.mock.districts[name];setTimeout(()=>{window.mock.districtCompletions.push(name);callback(district?'complete':'no_data',{districtList:district?[district]:[]});},district?.delay||5);}
};`;
let externalCalls=0;
const server=createApp({key:'fixture',accountsEnabled:false,amapJsKey:'fixture-key',amapSecurityJsCode:'fixture-code',fetchImpl:async()=>{externalCalls++;throw Error('Destination preview and questionnaire must not invoke the model');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const root=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'}),errors=[],requests=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(request.url().endsWith('/api/travel-chat/stream'))requests.push(request.postDataJSON());});
  await page.addInitScript(fixtures=>{window.mock={maps:[],searches:[],poiResults:[],routes:[],fits:[],centers:[],drags:[],pitches:[],rotations:[],offsets:[],projections:[],clustered:false,removes:0,clears:0,destroys:0,mapFailures:0,mapDelay:5,neverComplete:false,failRoutes:false,routeDelay:5,holdRoutes:false,pendingRoutes:[],districtQueries:[],districtCompletions:[],fixtures,districts:{'广州':{name:'广州市',adcode:'440100',level:'city',center:[113.3,23.1]},'西藏':{name:'西藏自治区',adcode:'540000',level:'province',center:[91.13,29.65]},'杭州':{name:'杭州市',adcode:'330100',level:'city',center:[120.15,30.27]},'南京':{name:'南京市',adcode:'320100',level:'city',center:[118.79,32.06],delay:650}}};},fixtures);
  await page.route('**/*',route=>route.request().url().startsWith(root+'/')?route.continue():route.abort());
  await page.route('https://webapi.amap.com/maps?**',route=>route.fulfill({contentType:'application/javascript',body:provider}));
  await page.goto(root+'/travel.html');
  await page.evaluate(({saved,chat})=>{localStorage.setItem('lvzang.v1',saved);localStorage.setItem('lvzang.chat.v1',chat);},{saved,chat});await page.reload();
  await page.waitForFunction(()=>document.querySelector('.route-map').dataset.mapPhase==='ready');
  const bytes=()=>page.evaluate(()=>({state:localStorage.getItem('lvzang.v1'),chat:localStorage.getItem('lvzang.chat.v1')}));
  const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lvzang.v1')));
  const idle=()=>page.waitForFunction(()=>!document.querySelector('#plan-button').disabled&&!document.querySelector('#route-refresh').disabled);
  const changeDestination=async city=>{await page.locator('#route-destination').fill(city);await page.locator('#route-destination').press('Tab');};
  const assertMap=async city=>{
    try{await page.waitForFunction(city=>document.querySelector('#map-title').textContent.startsWith(city)&&!document.querySelector('#map-search-form button').disabled&&document.querySelectorAll('.map-marker').length>0,city,{timeout:5000});}
    catch{const geometry=await page.evaluate(()=>({title:document.querySelector('#map-title').textContent,search:document.querySelector('#map-search-input').placeholder,phase:document.querySelector('.route-map').dataset.mapPhase,center:window.mock.maps.at(-1)?.center,markers:[...document.querySelectorAll('.map-marker')].map(node=>node.dataset.stop)}));assert.fail(`Changing the destination should immediately show ${city} without generating a plan: ${JSON.stringify(geometry)}`);}
    assert.match(await page.locator('#map-search-input').getAttribute('placeholder'),new RegExp(city));
    assert.equal(await page.locator('#map-search-form button').isEnabled(),true,'Search remains available for the selected map destination');
    const markers=await page.locator('.map-marker').evaluateAll(nodes=>nodes.map(node=>node.dataset.stop));
    assert.ok(markers.length>0,'The new destination has resolved exploration buildings');assert.ok(markers.every(id=>!id.startsWith('gz-')),'Previous Guangzhou itinerary points must not be displayed in the new region');
    assert.equal(await page.locator('.fixture-route').count(),0,'The old Guangzhou itinerary line is not overlaid on the new destination');
    const center=await page.evaluate(()=>window.mock.maps.at(-1).center);assert.ok(city==='西藏'?center[0]<100&&center[1]>25:center[0]>119&&center[1]>29,`The camera actually moves to ${city}, not just its label`);
  };
  await page.locator('#route-destination').fill('西藏');await assertMap('西藏');
  assert.equal(await page.locator('#route-destination').evaluate(node=>node===document.activeElement),true,'Typing updates the preview after debounce without requiring blur or submit');
  assert.equal(requests.length,0,'Changing the map destination alone submits no chat or generation request');assert.deepEqual(await bytes(),{state:saved,chat},'Map preview leaves the accepted plan, profile and original Q&A bytes untouched');
  assert.match(await page.locator('#route-title').textContent(),/广州/);assert.equal((await state()).plan.city,'广州');
  await page.locator('#map-search-input').fill('大昭寺');await page.locator('#map-search-form button').click();await page.locator('.map-search-choice').waitFor();
  assert.equal(await page.evaluate(()=>window.mock.searches.at(-1).city),'540000','Search follows the selected region rather than the previous plan');assert.match(await page.locator('.map-search-choice').innerText(),/大昭寺/);
  await page.locator('.map-search-choice').click();await assertMap('西藏');assert.deepEqual(await bytes(),{state:saved,chat},'Inspecting a searched building does not add it to the old itinerary');
  assert.equal(await page.locator('#map-membership').isVisible(),false,'A preview building cannot be inserted into the still-saved old-city itinerary');

  await changeDestination('南京');await page.waitForFunction(()=>window.mock.districtQueries.includes('南京'));
  assert.equal(await page.evaluate(()=>window.mock.districtCompletions.includes('南京')),false,'The old destination request is still pending when switching again');
  await changeDestination('西藏');await assertMap('西藏');await page.waitForFunction(()=>window.mock.districtCompletions.includes('南京'));await assertMap('西藏');
  assert.deepEqual(await bytes(),{state:saved,chat},'A late response for the previous preview never alters the selected map or saved trip');

  let response=page.waitForResponse(r=>r.url().endsWith('/api/travel-chat/stream'));await page.locator('#route-refresh').click();await response;await idle();await assertMap('西藏');
  assert.equal(requests.at(-1).interviewAction,'restart');let current=await state();assert.equal(current.profile.interview.status,'active');assert.equal(current.profile.interview.topic,'destination');assert.deepEqual(current.plan,plan);
  assert.deepEqual(current.previousPlanningContext.profile,profile,'The previous verbatim interview remains available in its archive');
  await page.locator('#travel-brief').fill('先在拉萨慢慢玩');response=page.waitForResponse(r=>r.url().endsWith('/api/travel-chat/stream'));await page.locator('#travel-brief').press('Enter');await response;await idle();await assertMap('西藏');
  current=await state();assert.equal(current.profile.interview.answers.at(-1).answer,'先在拉萨慢慢玩');assert.deepEqual(current.plan,plan);
  const during=await bytes();await page.reload();await idle();await assertMap('西藏');assert.deepEqual(await bytes(),during,'Reload keeps both the current questionnaire and previous itinerary');assert.equal(await page.locator('#route-destination').inputValue(),'西藏');

  await changeDestination('杭州');await assertMap('杭州');assert.deepEqual(await bytes(),during,'A second map preview must not silently restart or edit the in-progress Tibet questionnaire');
  assert.match(await page.locator('#route-title').textContent(),/广州/);assert.equal(await page.locator('.map-search-choice').count(),0,'Previous region search results are cleared on preview switch');
  await page.locator('#map-search-input').fill('雷峰塔');await page.locator('#map-search-form button').click();await page.locator('.map-search-choice').waitFor();assert.equal(await page.evaluate(()=>window.mock.searches.at(-1).city),'杭州');
  assert.equal(externalCalls,0);assert.deepEqual(errors,[]);
  console.log('PASS: destination typing/blur switches map scope, camera and exploration without changing saved routes/Q&A; delayed previous-city results cannot overwrite the selection, preview membership is hidden, search follows province/city, questionnaire and reload keep the map, and a second preview preserves interview progress.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
