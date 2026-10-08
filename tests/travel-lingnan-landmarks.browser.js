import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createApp} from '../server.js';
import {sdkSource} from './fixtures/amap-sdk.js';
import {initialState} from '../public/src/travel-state.js';
import {emptyTravelProfile,updateTravelProfile} from '../public/src/travel-profile.js';
import {getExplorationLandmarks} from '../public/src/travel-map-exploration.js';
import {normalizeRequest,planFromCatalog} from '../public/src/travel-domain.js';
import {buildDailyPlan} from '../public/src/travel-schedule.js';

const profile=updateTravelProfile(emptyTravelProfile(),{text:'佛山一天',patch:{destination:'佛山',dayCount:1,dailyHours:8}}).profile;
const saved=JSON.stringify({...initialState(),profile,planningReset:true});
const regions={佛山:{name:'佛山市',adcode:'440600',level:'city',center:[113.12,23.02]},珠海:{name:'珠海市',adcode:'440400',level:'city',center:[113.55,22.27]}};
const providerNames={
  'foshan-ancestral-temple':'祖庙',
  'foshan-nanfeng-kiln':'南风古灶旅游区',
  'foshan-qinghui-garden':'清晖园博物馆',
  'zhuhai-grand-theatre':'珠海大剧院',
  'zhuhai-new-yuanming-palace':'圆明新园',
  'zhuhai-love-post-lighthouse':'海滨泳场灯塔',
};
// Synthetic provider positions exercise layout and never supply production coordinates.
const fixtures=Object.fromEntries(Object.entries(regions).flatMap(([city,area])=>getExplorationLandmarks(city).map((stop,index)=>[city+'|'+stop.name,{pois:[{id:'provider-'+stop.id,name:providerNames[stop.id],cityname:area.name,pname:'广东省',adcode:area.adcode,address:'隔离测试地址',location:[area.center[0]+index*.008,area.center[1]+(index%2)*.003]}]}])));
const provider=sdkSource+String.raw`window.AMap.DistrictSearch=class{search(name,callback){const area=window.mock.regions[name];callback(area?'complete':'no_data',{districtList:area?[area]:[]});}};`;
const server=createApp({key:'',accountsEnabled:false,amapJsKey:'fixture',amapSecurityJsCode:'fixture',fetchImpl:async()=>{throw Error('No real network');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1500,height:1100},reducedMotion:'reduce'}),errors=[];
  page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(({saved,regions,fixtures})=>{
    localStorage.setItem('lvzang.v1',saved);
    window.mock={maps:[],searches:[],poiResults:[],routes:[],fits:[],centers:[],drags:[],pitches:[],rotations:[],offsets:[],projections:[],clustered:false,removes:0,clears:0,destroys:0,mapFailures:0,mapDelay:5,failRoutes:false,routeDelay:5,holdRoutes:false,pendingRoutes:[],regions,fixtures};
  },{saved,regions,fixtures});
  await page.route('**/*',route=>route.request().url().startsWith(base+'/')?route.continue():route.abort());
  await page.route('https://webapi.amap.com/maps?**',route=>route.fulfill({contentType:'application/javascript',body:provider}));
  await page.goto(base+'/travel.html');
  for(const city of ['佛山','珠海']){
    await page.locator('#route-destination').fill(city);
    const landmarks=getExplorationLandmarks(city);
    assert.equal(landmarks.length,3);
    await page.waitForFunction(ids=>ids.every(id=>document.querySelector(`.map-marker[data-stop="${id}"]`))&&document.querySelectorAll('.map-marker').length===ids.length,landmarks.map(stop=>stop.id));
    await page.locator('#map-fit').click();
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const markers=await page.locator('.map-marker').evaluateAll(nodes=>nodes.map(node=>({id:node.dataset.stop,kind:node.dataset.landmarkKind,style:node.dataset.markerStyle,visibleModel:getComputedStyle(node.querySelector('.landmark-model')).display!=='none',canvas:node.querySelector('.landmark-canvas').width})));
    assert.deepEqual(markers.map(marker=>marker.id).sort(),landmarks.map(stop=>stop.id).sort(),`${city} preview contains exactly its three verified buildings`);
    for(const marker of markers){assert.equal(marker.kind,marker.id);assert.equal(marker.style,'model');assert.ok(marker.visibleModel&&marker.canvas>0,`${marker.id} renders its dedicated ground model`);}
    for(const stop of landmarks){
      await page.locator(`.map-marker[data-stop="${stop.id}"]`).click();
      assert.equal(await page.locator('#map-place-name').textContent(),stop.name,'Normal pointer input reaches each building');
      await page.locator('#map-clear-selection').click();
    }
    const queries=await page.evaluate(city=>window.mock.searches.filter(search=>search.city===city).map(search=>search.name),city);
    for(const stop of landmarks)assert.ok(queries.includes(stop.name),`${stop.id} is resolved through a city-scoped provider search`);
    assert.equal(await page.evaluate(()=>localStorage.getItem('lvzang.v1')),saved,'Exploring another Lingnan city does not replace the accepted trip or questionnaire');
  }
  // Generated itinerary ids and user-facing aliases must still resolve the
  // trusted canonical POI, even when several other POIs share fallback names.
  for(const {city,key,name,canonical,duplicate}of [
    {city:'佛山',key:'foshan-ancestral-temple',name:'佛山祖庙',canonical:'佛山市祖庙博物馆',duplicate:'祖庙'},
    {city:'珠海',key:'zhuhai-grand-theatre',name:'珠海大剧院',canonical:'珠海日月贝',duplicate:'日月贝'},
  ]){
    const cityProfile=updateTravelProfile(emptyTravelProfile(),{text:city+'一天',patch:{destination:city,dayCount:1,dailyHours:8}}).profile;
    const original=planFromCatalog(normalizeRequest({destination:'广州',hours:8}),undefined,{placeIds:['gz-museum']});
    const id='suggested-7',stop={...original.stops[0],id,name,city,aliases:[],kind:'suggested',coords:null,source:'',transit:0,estimatedStart:0};
    const plan=buildDailyPlan({...original,city,title:city+'一日行程',days:undefined,stops:[stop],input:normalizeRequest({destination:city,hours:8}),mode:'ai',trace:[]},cityProfile);
    const state=JSON.stringify({...initialState(),profile:cityProfile,plan});
    const area=regions[city],position=[...area.center],aliasedFixtures={...fixtures,[city+'|'+canonical]:{pois:[
      {id:'canonical-'+key,name:canonical,cityname:area.name,adcode:area.adcode,location:position},
      ...[1,2].map(index=>({id:'alias-'+key+'-'+index,name:duplicate,cityname:area.name,adcode:area.adcode,location:[position[0]+index*.001,position[1]]})),
    ]}};
    const aliasPage=await browser.newPage({viewport:{width:1500,height:1100},reducedMotion:'reduce'});
    aliasPage.setDefaultTimeout(15000);
    await aliasPage.addInitScript(({state,regions,fixtures})=>{
      localStorage.setItem('lvzang.v1',state);
      window.mock={maps:[],searches:[],poiResults:[],routes:[],fits:[],centers:[],drags:[],pitches:[],rotations:[],offsets:[],projections:[],clustered:false,removes:0,clears:0,destroys:0,mapFailures:0,mapDelay:5,failRoutes:false,routeDelay:5,holdRoutes:false,pendingRoutes:[],regions,fixtures};
    },{state,regions,fixtures:aliasedFixtures});
    await aliasPage.route('**/*',route=>route.request().url().startsWith(base+'/')?route.continue():route.abort());
    await aliasPage.route('https://webapi.amap.com/maps?**',route=>route.fulfill({contentType:'application/javascript',body:provider}));
    await aliasPage.goto(base+'/travel.html');
    const marker=aliasPage.locator(`.map-marker[data-stop="${id}"]`);
    await marker.waitFor();
    assert.equal(await marker.getAttribute('data-landmark-kind'),key);
    assert.equal(await marker.locator('.landmark-name').textContent(),name,'The canonical provider lookup retains the original itinerary label');
    assert.deepEqual(await aliasPage.evaluate(id=>window.mock.maps.at(-1).overlays.find(item=>item.content?.dataset.stop===id).position,id),position,'The canonical POI position wins over duplicate aliases');
    await marker.click();assert.equal(await aliasPage.locator('#map-place-name').textContent(),name);
    assert.equal(await aliasPage.evaluate(()=>localStorage.getItem('lvzang.v1')),state,'Canonical matching does not rewrite the accepted AI itinerary');
    await aliasPage.close();
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: Foshan/Zhuhai provider POIs render and select normally; arbitrary AI ids retain original aliases while matching the canonical building over duplicate aliases.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
