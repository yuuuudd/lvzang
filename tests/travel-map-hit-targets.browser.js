import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createApp} from '../server.js';
import {sdkSource} from './fixtures/amap-sdk.js';
import {getExplorationLandmarks} from '../public/src/travel-map-exploration.js';

// Real public POI positions and projected pixels from a 598x460 AMap 3D view.
const positions=[
 [[114.055473,22.533544],[346.265,250.744]],
 [[114.106854,22.543012],[429.053,237.816]],
 [[114.10991,22.542397],[434.246,238.599]],
 [[114.059614,22.543673],[351.584,236.977]],
 [[113.946487,22.514871],[157.366,276.022]],
 [[113.945026,22.511935],[153.786,280.308]]
];
const stops=getExplorationLandmarks('深圳');
const provider=sdkSource+String.raw`
 window.AMap.DistrictSearch=class{search(name,callback){callback('complete',{districtList:[{name:'深圳市',adcode:'440300',level:'city',center:[114.057,22.543]}]});}};
 window.AMap.Map.prototype.lngLatToContainer=function(position){const record=window.mock.positions.find(row=>row[0][0]===position[0]&&row[0][1]===position[1]);return new window.AMap.Pixel((record?.[1][0]??299)/598*this.node.clientWidth,(record?.[1][1]??230)/460*this.node.clientHeight);};
`;
const server=createApp({key:'',accountsEnabled:false,amapJsKey:'fixture',amapSecurityJsCode:'fixture',fetchImpl:async()=>{throw Error('No real network');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const root=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1600,height:1100},reducedMotion:'reduce'});page.setDefaultTimeout(5000);
 await page.addInitScript(({stops,positions})=>{
  window.mock={maps:[],searches:[],poiResults:[],routes:[],fits:[],centers:[],drags:[],pitches:[],rotations:[],offsets:[],projections:[],clustered:false,removes:0,clears:0,destroys:0,mapFailures:0,mapDelay:5,positions,fixtures:Object.fromEntries(stops.map((stop,index)=>['深圳|'+stop.name,{pois:[{id:stop.id,name:stop.name,cityname:'深圳市',pname:'广东省',adcode:'440300',location:positions[index][0]}]}]))};
 },{stops,positions});
 await page.route('**/*',route=>route.request().url().startsWith(root+'/')?route.continue():route.abort());
 await page.route('https://webapi.amap.com/maps?**',route=>route.fulfill({contentType:'application/javascript',body:provider}));
 await page.goto(root+'/travel.html');
 await page.locator('#route-destination').fill('深圳');await page.locator('#route-destination').press('Tab');
 await page.waitForFunction(()=>document.querySelectorAll('.map-marker').length===6);
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const geometry=await page.locator('.map-marker').evaluateAll(nodes=>nodes.map(node=>({id:node.dataset.stop,rect:node.getBoundingClientRect().toJSON()})));
 for(let i=0;i<geometry.length;i++)for(let j=i+1;j<geometry.length;j++){
  const a=geometry[i].rect,b=geometry[j].rect;
  assert.ok(a.right<=b.left+.1||b.right<=a.left+.1||a.bottom<=b.top+.1||b.bottom<=a.top+.1,`Transparent hit rectangles must not overlap: ${geometry[i].id} / ${geometry[j].id}`);
 }
 for(const stop of stops){
  await page.locator(`.map-marker[data-stop="${stop.id}"]`).click();
  assert.equal(await page.locator('#map-place-name').textContent(),stop.name,'Normal clicks must reach the intended building');
 }
 assert.deepEqual(await page.evaluate(()=>window.mock.maps.at(-1).overlays.filter(item=>item.kind==='marker').map(item=>item.position)),positions.map(item=>item[0]),'Layout shifts marker pixels, never the provider POI coordinates');
 console.log('PASS: real Shenzhen adjacent projections keep all six hit targets separate and normally clickable without changing POI coordinates.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}

