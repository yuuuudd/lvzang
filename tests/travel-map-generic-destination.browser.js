import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createApp} from '../server.js';
import {initialState} from '../public/src/travel-state.js';
import {emptyTravelProfile,normalizeTravelProfile,updateTravelProfile} from '../public/src/travel-profile.js';
import {normalizeRequest,planFromCatalog} from '../public/src/travel-domain.js';
import {buildDailyPlan} from '../public/src/travel-schedule.js';
import {getExplorationLandmarks} from '../public/src/travel-map-exploration.js';
import {sdkSource} from './fixtures/amap-sdk.js';

// Dongguan intentionally has no curated miniature catalog. Coordinates below
// are isolated provider fixtures, never a source of production map positions.
assert.deepEqual(getExplorationLandmarks('东莞'),[]);
const oldProfile=updateTravelProfile(emptyTravelProfile(),{text:'苏州一天，每天4小时，喜欢园林'}).profile;
const oldPlan=buildDailyPlan({...planFromCatalog(normalizeRequest({destination:'苏州',hours:4}),undefined,{placeIds:['sz-garden'],title:'上一份苏州园林攻略'}),mode:'ai',trace:[]},oldProfile);
const profile=normalizeTravelProfile({...updateTravelProfile(emptyTravelProfile(),{text:'杭州一天'}).profile,interview:{status:'active',topic:'destination',skipped:[],answers:[{field:'destination',question:'这次想去哪里？',answer:'杭州，想慢慢看西湖'}],additions:[]}});
const saved=JSON.stringify({...initialState(),plan:oldPlan,profile,planningReset:true}),chat=JSON.stringify({version:1,messages:[{role:'user',content:'杭州，想慢慢看西湖'},{role:'assistant',content:'已保留杭州的问答记录。'}]});
const scopes={苏州:{name:'苏州市',adcode:'320500',level:'city',center:[120.585,31.299]},杭州:{name:'杭州市',adcode:'330100',level:'city',center:[120.15,30.27]},东莞:{name:'东莞市',adcode:'441900',level:'city',center:[113.751,23.02]}};
const fixtures={
  '东莞|可园':{pois:[{id:'dg-keyuan',name:'可园',cityname:'东莞市',pname:'广东省',adcode:'441900',location:[113.744,23.048],address:'隔离测试中的东莞地址'}]},
  '东莞|松山湖':{pois:[{id:'dg-lake',name:'松山湖',cityname:'东莞市',pname:'广东省',adcode:'441900',location:[113.875,22.924],address:'隔离测试中的东莞地址'}]},
};
const provider=sdkSource+String.raw`window.AMap.DistrictSearch=class{search(name,callback){window.mock.districtQueries.push(name);const area=window.mock.districts[name];setTimeout(()=>callback(area?'complete':'no_data',{districtList:area?[area]:[]}),5);}};`;
let externalCalls=0;
const server=createApp({key:'fixture',accountsEnabled:false,amapJsKey:'fixture-key',amapSecurityJsCode:'fixture-code',fetchImpl:async()=>{externalCalls++;throw Error('This regression must not invoke external model services');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const root=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[],requests=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(request.url().endsWith('/api/travel-chat/stream'))requests.push(request.postDataJSON());});
  await page.addInitScript(({saved,chat,scopes,fixtures})=>{
    // Seed once so later reloads exercise the application's persisted state.
    if(!sessionStorage.getItem('generic-destination-seeded')){localStorage.setItem('lvzang.v1',saved);localStorage.setItem('lvzang.chat.v1',chat);sessionStorage.setItem('generic-destination-seeded','1');}
    window.mock={maps:[],searches:[],poiResults:[],routes:[],fits:[],centers:[],drags:[],pitches:[],rotations:[],offsets:[],projections:[],clustered:false,removes:0,clears:0,destroys:0,mapFailures:0,mapDelay:5,neverComplete:false,failRoutes:false,routeDelay:5,holdRoutes:false,pendingRoutes:[],districtQueries:[],districts:scopes,fixtures};
  },{saved,chat,scopes,fixtures});
  await page.route('**/*',route=>route.request().url().startsWith(root+'/')?route.continue():route.abort());
  await page.route('https://webapi.amap.com/maps?**',route=>route.fulfill({contentType:'application/javascript',body:provider}));
  await page.goto(root+'/travel.html');
  await page.waitForFunction(()=>['ready','empty'].includes(document.querySelector('.route-map').dataset.mapPhase));
  const bytes=()=>page.evaluate(()=>({state:localStorage.getItem('lvzang.v1'),chat:localStorage.getItem('lvzang.chat.v1')}));
  const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lvzang.v1')));
  const idle=()=>page.waitForFunction(()=>!document.querySelector('#plan-button').disabled&&!document.querySelector('#route-refresh').disabled);
  const action=async selector=>{const response=page.waitForResponse(r=>r.url().endsWith('/api/travel-chat/stream'));await page.locator(selector).click();await response;await idle();};

  await page.locator('#route-destination').fill('东莞');
  await page.waitForFunction(()=>document.querySelector('#map-title').textContent.startsWith('东莞')&&document.querySelector('.route-map').dataset.mapPhase==='empty');
  assert.equal(await page.locator('#route-destination').evaluate(node=>node===document.activeElement),true,'Generic destination typing previews without requiring blur');
  assert.deepEqual(await page.evaluate(()=>window.mock.maps.at(-1).center),scopes.东莞.center,'A city absent from the catalog still moves the actual map to its provider district center');
  assert.equal(await page.locator('.map-marker').count(),0,'No unrelated catalog buildings or previous-city stops appear');
  assert.match(await page.locator('#map-title').textContent(),/高德地图/,'An unmodeled city is presented as a normal AMap map');
  assert.equal(await page.locator('#map-search-form button').isEnabled(),true);
  assert.equal(await page.locator('#map-message').evaluate(node=>getComputedStyle(node).pointerEvents),'none');
  assert.deepEqual(await bytes(),{state:saved,chat},'Preview preserves the accepted Suzhou plan and in-progress Hangzhou questionnaire byte for byte');
  assert.equal(requests.length,0,'Preview does not submit generation or questionnaire requests');
  assert.match(await page.locator('#route-current-destination').textContent(),/苏州/);
  assert.equal(await page.locator('.fixture-route').count(),0,'No previous itinerary line is reused');
  assert.equal(await page.locator('#map-exploration-toggle').isHidden(),true,'A city without a catalog does not offer nonexistent exploration buildings');
  assert.equal(await page.locator('#map-fit').textContent(),'返回目的地');
  const viewport=page.locator('#amap-viewport');await viewport.scrollIntoViewIfNeeded();
  const bounds=await viewport.boundingBox(),x=bounds.x+bounds.width*.4,y=bounds.y+bounds.height*.6;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+45,y+15,{steps:5});await page.mouse.up();
  assert.notDeepEqual(await page.evaluate(()=>window.mock.maps.at(-1).center),scopes.东莞.center,'The empty base map accepts native dragging');
  await page.locator('#map-fit').click();
  assert.deepEqual(await page.evaluate(()=>window.mock.maps.at(-1).center),scopes.东莞.center,'Return to destination restores the verified provider center even without stops or catalog');
  assert.equal(await page.evaluate(()=>window.mock.maps.at(-1).zoom),11);
  const beforeZoom=await page.evaluate(()=>window.mock.maps.at(-1).zoom);
  await page.locator('#map-zoom-in').click();assert.equal(await page.evaluate(()=>window.mock.maps.at(-1).zoom),beforeZoom+1);
  await page.locator('#map-search-input').fill('可园');await page.locator('#map-search-form button').click();await page.locator('.map-search-choice').click();
  await page.locator('.map-marker').waitFor();
  assert.equal(await page.evaluate(()=>window.mock.searches.at(-1).city),'东莞','Search is scoped to the generic destination');
  assert.equal(await page.locator('.map-marker canvas,.map-marker .landmark-model').count(),0,'A generic search result uses an ordinary POI marker without a fabricated miniature');
  assert.equal(await page.locator('#map-membership').isHidden(),true,'A new-city search result cannot enter the previous accepted itinerary');
  assert.deepEqual(await bytes(),{state:saved,chat});
  await page.locator('#map-search-input').fill('松山湖');await page.locator('#map-search-form button').click();await page.locator('.map-search-choice').click();
  await page.waitForFunction(()=>document.querySelector('#map-journey-result').dataset.state==='ready');
  await page.locator('#map-clear-selection').click();
  await page.locator('.map-marker[data-stop="amap-dg-keyuan"]').click();
  await page.locator('.map-marker[data-stop="amap-dg-lake"]').focus();await page.locator('.map-marker[data-stop="amap-dg-lake"]').press('Enter');
  await page.waitForFunction(()=>document.querySelector('#map-journey-result').dataset.state==='ready');
  assert.equal(await page.locator('.map-marker[data-stop="amap-dg-keyuan"]').getAttribute('data-endpoint'),'origin');
  assert.equal(await page.locator('.map-marker[data-stop="amap-dg-lake"]').getAttribute('data-endpoint'),'destination');
  assert.deepEqual(await bytes(),{state:saved,chat},'Pointer and keyboard pin selection compare routes without changing the accepted trip or questionnaire');

  // The fresh 16-question lifecycle is real HTTP; only the explicit model result
  // below is stubbed. This checks the same handoff users take after answering.
  await action('#route-refresh');
  assert.equal(requests.at(-1).interviewAction,'restart');
  let current=await state();assert.deepEqual(current.plan,oldPlan);assert.deepEqual(current.previousPlanningContext.profile,profile);
  assert.equal(current.profile.fields.destination.value,'东莞');
  const response=page.waitForResponse(r=>r.url().endsWith('/api/travel-chat/stream'));
  await page.locator('#travel-brief').fill('东莞，想看看可园和松山湖');await page.locator('#travel-brief').press('Enter');await response;await idle();
  for(let turn=0;turn<16&&(await state()).profile.interview.status==='active';turn++)await action('#interview-skip');
  current=await state();assert.equal(current.profile.interview.status,'ready');assert.deepEqual(current.plan,oldPlan);
  assert.equal(externalCalls,0,'Destination preview and questionnaire collection need no model call');
  let submitted;
  await page.route('**/api/travel-chat/stream',route=>{
    submitted=route.request().postDataJSON();
    const completed=normalizeTravelProfile({...submitted.profile,fields:{...submitted.profile.fields,dayCount:{value:1,status:'confirmed'},dailyHours:{value:6,status:'confirmed'}},interview:{...submitted.profile.interview,status:'completed',topic:null}});
    const stops=['可园','松山湖'].map((name,index)=>({id:`suggested-${index+1}`,kind:'suggested',city:'东莞',name,aliases:[],coords:null,source:'',minutes:60,transit:index?20:0,estimatedStart:index?80:0,story:'东莞行程地点',task:'游览并记录旅行感受'}));
    const plan={...buildDailyPlan({...oldPlan,city:'东莞',title:'东莞一日行程',days:undefined,stops,input:{...normalizeRequest({destination:'东莞',hours:6}),placeConstraints:{city:'东莞',required:[],excluded:[]}}},completed),kind:'plan',status:'ready',mode:'ai',profile:completed,assistantReply:'东莞行程已生成。'};
    return route.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({type:'result',response:plan})+'\n'});
  });
  await action('#interview-plan');
  assert.equal(submitted.interviewAction,'plan');assert.equal(submitted.profile.fields.destination.value,'东莞');
  assert.equal(submitted.currentPlan,undefined);assert.equal(submitted.previous,undefined,'Previous-city planning input stays isolated');
  await page.waitForFunction(()=>document.querySelectorAll('.map-marker[data-stop^="suggested-"]').length===2&&document.querySelector('.route-map').dataset.mapPhase==='ready');
  assert.equal((await state()).plan.city,'东莞');assert.equal((await state()).profile.interview.status,'completed');
  assert.match(await page.locator('#route-current-destination').textContent(),/东莞/);
  assert.match(await page.locator('#map-title').textContent(),/东莞.*高德地图/);
  assert.equal(await page.locator('.map-marker canvas,.map-marker .landmark-model').count(),0,'Generated generic itinerary points also use ordinary AMap markers');
  for(const [index,name] of ['可园','松山湖'].entries())assert.deepEqual(await page.evaluate(id=>window.mock.maps.at(-1).overlays.find(item=>item.content?.dataset.stop===id)?.position,`suggested-${index+1}`),fixtures['东莞|'+name].pois[0].location,'Generated stops use provider coordinates in the new city');
  assert.ok(await page.evaluate(()=>window.mock.searches.filter(item=>['可园','松山湖'].includes(item.name)).every(item=>item.city==='东莞')));
  await page.reload();await idle();await page.waitForFunction(()=>document.querySelectorAll('.map-marker[data-stop^="suggested-"]').length===2);
  assert.equal((await state()).plan.city,'东莞');assert.equal(await page.locator('#storage-recovery').isVisible(),false);
  assert.deepEqual(errors,[]);assert.equal(externalCalls,0);
  console.log('PASS: unmodeled Dongguan switches through destination UI to normal AMap; preview/search preserve prior plan and questionnaire; fresh interview handoff accepts and reloads the new-city itinerary at provider POI coordinates without fabricated 3D markers.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
