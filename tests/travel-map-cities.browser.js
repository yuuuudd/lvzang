import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createApp} from '../server.js';
import {initialState} from '../public/src/travel-state.js';
import {getExplorationLandmarks} from '../public/src/travel-map-exploration.js';
import {sdkSource} from './fixtures/amap-sdk.js';

// Coordinates here are deliberately synthetic fixtures; production coordinates come from AMap.
const scopes={中山:{name:'中山市',adcode:'442000',level:'city',center:[113.39,22.52]},杭州:{name:'杭州市',adcode:'330100',level:'city',center:[120.15,30.27]},苏州:{name:'苏州市',adcode:'320500',level:'city',center:[120.58,31.3]},深圳:{name:'深圳市',adcode:'440300',level:'city',center:[114.06,22.54]},北京:{name:'北京市',adcode:'110000',level:'city',center:[116.4,39.9]},上海:{name:'上海市',adcode:'310000',level:'city',center:[121.47,31.23]},成都:{name:'成都市',adcode:'510100',level:'city',center:[104.06,30.67]},西藏:{name:'西藏自治区',adcode:'540000',level:'province',center:[91.13,29.65]},拉萨:{name:'拉萨市',adcode:'540100',level:'city',center:[91.13,29.65]}};
const fixtures={};
for(const [city,scope] of Object.entries(scopes))for(const [index,stop] of getExplorationLandmarks(city,{density:'detailed'}).entries()){
 const queryCity=scope.level==='province'?scope.adcode:city;
 fixtures[queryCity+'|'+stop.name]={pois:[{id:'provider-'+stop.id,name:stop.name,cityname:stop.city+'市',pname:city==='西藏'||city==='拉萨'?'西藏自治区':'',adcode:scope.adcode,location:[scope.center[0]+index*.012,scope.center[1]+index*.008],address:stop.city+' fixture'}]};
}
const saved=JSON.stringify(initialState());
const provider=sdkSource+String.raw`window.AMap.DistrictSearch=class{search(name,callback){const value=window.mock.districts[name];setTimeout(()=>callback(value?'complete':'no_data',{districtList:value?[value]:[]}),5);}};`;
const server=createApp({key:'',accountsEnabled:false,amapJsKey:'fixture-key',amapSecurityJsCode:'fixture-code',fetchImpl:async()=>{throw Error('No real external services in this test');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const root=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1560,height:1100}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(({saved,scopes,fixtures})=>{
  localStorage.setItem('lvzang.v1',saved);
  window.mock={maps:[],searches:[],poiResults:[],routes:[],fits:[],centers:[],drags:[],pitches:[],rotations:[],offsets:[],projections:[],clustered:false,removes:0,clears:0,destroys:0,mapFailures:0,mapDelay:5,neverComplete:false,failRoutes:false,routeDelay:5,holdRoutes:false,pendingRoutes:[],districts:scopes,fixtures};
 },{saved,scopes,fixtures});
 await page.route('**/*',route=>route.request().url().startsWith(root+'/')?route.continue():route.abort());
 await page.route('https://webapi.amap.com/maps?**',route=>route.fulfill({contentType:'application/javascript',body:provider}));
 await page.goto(root+'/travel.html');
 const render=(city,stops=[])=>page.evaluate(async({city,stops})=>{const {renderMap}=await import('/src/travel-workspace.js');renderMap({city,stops,days:[],input:{dayCount:1,dailyHours:6}},[],stops);},{city,stops});
 for(const city of Object.keys(scopes)){
  const landmarks=getExplorationLandmarks(city);
  assert.ok(landmarks.length>=2,city+' has selectable signature landmarks');
  await render(city);
  await page.waitForFunction(ids=>ids.every(id=>document.querySelector(`.map-marker[data-stop="${id}"]`)),landmarks.map(stop=>stop.id));
  const rendered=await page.locator('.map-marker').evaluateAll(nodes=>nodes.map(node=>({id:node.dataset.stop,kind:node.dataset.landmarkKind})));
  assert.deepEqual(new Set(rendered.map(stop=>stop.id)),new Set(landmarks.map(stop=>stop.id)),city+' only displays its own catalog');
  assert.ok(rendered.every(stop=>stop.kind===landmarks.find(item=>item.id===stop.id).modelKey),city+' displays dedicated shapes');
  for(const stop of landmarks){
   const queryCity=scopes[city].level==='province'?scopes[city].adcode:city;
   const position=await page.evaluate(id=>window.mock.maps.at(-1).overlays.find(item=>item.content?.dataset.stop===id)?.position,stop.id);
   assert.deepEqual(position,fixtures[queryCity+'|'+stop.name].pois[0].location,'Miniature remains anchored to provider POI');
  }
  assert.equal(await page.evaluate(()=>localStorage.getItem('lvzang.v1')),saved,'City exploration does not replace the accepted plan');
 }
 await render('西藏');
 await page.locator('.map-marker[data-stop="xz-potala-palace"]').waitFor();
 await page.locator('.map-marker[data-stop="xz-potala-palace"]').click();
 assert.match(await page.locator('#map-place-day').innerText(),/未加入行程/);
 await page.locator('.map-marker[data-stop="xz-jokhang-temple"]').click();
 await page.waitForFunction(()=>document.getElementById('map-journey-result').dataset.state==='ready');
 assert.equal(await page.evaluate(()=>localStorage.getItem('lvzang.v1')),saved,'Two building clicks compare a journey without adding stops');
 await page.getByLabel('地标密度',{exact:true}).selectOption('detailed');
 await page.locator('.map-marker[data-stop="xz-tashilhunpo"]').waitFor();
 await page.getByLabel('地标密度',{exact:true}).selectOption('signature');
 const potala={id:'suggested-1',name:'拉萨布达拉宫',city:'拉萨',dayIndex:1};
 await render('西藏',[potala]);
 await page.locator('.map-marker[data-stop="suggested-1"]').waitFor();
 assert.equal(await page.locator('.map-marker[data-stop="suggested-1"]').getAttribute('data-landmark-kind'),'xz-potala-palace');
 assert.equal(await page.locator('.map-marker[data-stop="xz-potala-palace"]').count(),0,'An AI-named itinerary landmark is deduplicated against exploration');
 await page.getByRole('searchbox',{name:'搜索西藏的地点',exact:true}).fill('布达拉宫');
 await page.getByRole('button',{name:'搜索地点',exact:true}).click();
 await page.locator('.map-search-choice').first().click();
 assert.equal(await page.locator('.map-marker[data-landmark-kind="xz-potala-palace"]').count(),1,'Searching a known accepted landmark does not add a duplicate');
 const aliasStop={id:'suggested-2',name:'雷峰夕照景区',city:'杭州',aliases:['雷峰塔'],dayIndex:1};
 await render('杭州',[aliasStop]);
 await page.locator('.map-marker[data-stop="suggested-2"]').waitFor();
 assert.equal(await page.locator('.map-marker[data-stop="suggested-2"]').getAttribute('data-landmark-kind'),'hz-leifeng-tower');
 await page.getByRole('searchbox',{name:'搜索杭州的地点',exact:true}).fill('雷峰塔');
 await page.getByRole('button',{name:'搜索地点',exact:true}).click();
 await page.locator('.map-search-choice').first().click();
 assert.equal(await page.locator('.map-marker[data-landmark-kind="hz-leifeng-tower"]').count(),1,'Alias-only AI identity is shared by positioning, models and search');
 assert.deepEqual(errors,[]);
 console.log(`PASS: ${Object.keys(scopes).length} destination scopes, distinct models, provider coordinates, density, AI-ID resolution, search deduplication and no implicit trip edits.`);
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
