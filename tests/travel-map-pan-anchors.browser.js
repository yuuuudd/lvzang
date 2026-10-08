import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createApp} from '../server.js';
import {sdkSource} from './fixtures/amap-sdk.js';
import {getExplorationLandmarks} from '../public/src/travel-map-exploration.js';

const stops=getExplorationLandmarks('深圳');
const provider=sdkSource+String.raw`
 window.AMap.DistrictSearch=class{search(name,callback){callback('complete',{districtList:[{name:'深圳市',adcode:'440300',level:'city',center:[114.057,22.543]}]});}};
`;
const server=createApp({key:'',accountsEnabled:false,amapJsKey:'fixture',amapSecurityJsCode:'fixture',fetchImpl:async()=>{throw Error('No external services');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1600,height:1100},reducedMotion:'reduce'});page.setDefaultTimeout(6000);
 await page.addInitScript(stops=>{
  window.mock={maps:[],searches:[],poiResults:[],routes:[],fits:[],centers:[],drags:[],pitches:[],rotations:[],offsets:[],projections:[],clustered:true,removes:0,clears:0,destroys:0,mapFailures:0,mapDelay:5,fixtures:Object.fromEntries(stops.map((stop,index)=>['深圳|'+stop.name,{pois:[{id:stop.id,name:stop.name,cityname:'深圳市',pname:'广东省',adcode:'440300',location:[114.05+index*.002,22.54]}]}]))};
 },stops);
 await page.route('**/*',route=>route.request().url().startsWith(base+'/')?route.continue():route.abort());
 await page.route('https://webapi.amap.com/maps?**',route=>route.fulfill({contentType:'application/javascript',body:provider}));
 await page.goto(base+'/travel.html');
 await page.locator('#route-destination').fill('深圳');await page.locator('#route-destination').press('Tab');
 await page.waitForFunction(count=>document.querySelectorAll('.map-marker').length===count,stops.length);
 const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const geometry=()=>page.evaluate(()=>{
  const map=window.mock.maps.at(-1),bounds=map.node.getBoundingClientRect(),scale=bounds.width/map.node.clientWidth;
  return map.overlays.filter(item=>item.content?.classList.contains('map-marker')).map(item=>{
   const rect=item.content.getBoundingClientRect(),point=map.lngLatToContainer(item.position),offset=item.getOffset();
   return {id:item.content.dataset.stop,dx:offset.x,dy:offset.y,x:point.x,y:point.y,renderX:(rect.left+rect.width/2-bounds.left)/scale,renderY:(rect.bottom-bounds.top)/scale,position:[...item.position]};
  });
 });
 const drag=async(dx,dy)=>{
  const start=await page.locator('#amap-viewport').evaluate(node=>{
   const r=node.getBoundingClientRect();
   for(const fx of [.05,.95,.2,.8])for(const fy of [.85,.5,.7]){
    const x=r.left+r.width*fx,y=r.top+r.height*fy;
    if(document.elementFromPoint(x,y)?.classList.contains('fixture-map-surface'))return {x,y};
   }
   return null;
  });
  assert.ok(start,'A blank part of the map remains available for dragging');
  await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+dx,start.y+dy,{steps:8});await page.mouse.up();await settle();
 };
 await settle();
 const saved=await page.evaluate(()=>localStorage.getItem('lvzang.v1'));
 for(const zoom of [17,14]){
  await page.evaluate(zoom=>window.mock.maps.at(-1).setZoomAndCenter(zoom,[114.057,22.543]),zoom);await settle();
  const before=await geometry();
  assert.ok(before.some(item=>Math.hypot(item.dx,item.dy)>2),'The scene exercises displaced, overlapping landmark hit targets');
  for(const [dx,dy] of [[160,-95],[-250,180]]){
   await drag(dx,dy);const after=await geometry();
   for(const original of before){
    const current=after.find(item=>item.id===original.id);
    assert.deepEqual([current.dx,current.dy],[original.dx,original.dy],`Dragging must not re-pack or slide ${original.id} relative to its POI at zoom ${zoom}`);
    assert.ok(Math.abs((current.renderX-original.renderX)-(current.x-original.x))<.5&&Math.abs((current.renderY-original.renderY)-(current.y-original.y))<.5,`Building ${original.id} moves exactly with its projected POI`);
    assert.deepEqual(current.position,original.position,'Dragging never changes provider longitude/latitude');
   }
  }
 }
 assert.ok((await page.evaluate(()=>window.mock.drags.length))>10,'The scenario used native pointer drags');
 assert.equal(await page.evaluate(()=>localStorage.getItem('lvzang.v1')),saved,'Map navigation preserves itinerary and answers');
 console.log('PASS: native map drags preserve landmark offsets and move buildings exactly with their provider POI anchors at close and nearby zoom.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
