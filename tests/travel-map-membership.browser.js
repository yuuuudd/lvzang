import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createApp} from '../server.js';
import {sdkSource} from './fixtures/amap-sdk.js';

const server=createApp({key:'',amapJsKey:'fixture-public',amapSecurityJsCode:'fixture-private',fetchImpl:async()=>{throw Error('No external services');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({channel:'chrome',headless:true});
const buttons=['map-camera-toggle','map-fit','map-reset-bearing','map-exploration-toggle','map-zoom-in','map-zoom-out','map-use-location','map-journey-retry','map-set-origin','map-set-destination','map-swap','map-clear-selection','map-membership'];
const labels=['map-status','map-message','map-location-status','map-search-status','map-search-results','map-place-name','map-place-description','map-place-day','map-origin','map-destination','map-journey-result','map-membership-status'];
const html=`<!doctype html><meta charset="utf-8"><style>.route-map{position:relative;width:900px;height:460px}#amap-viewport{position:absolute;inset:0}.map-marker{z-index:2}</style>
${buttons.map(id=>`<button id="${id}">${id}</button>`).join('')}${labels.map(id=>`<div id="${id}"></div>`).join('')}
<select id="map-route-mode"><option value="walk">walk</option><option value="drive">drive</option></select><select id="map-density"><option value="signature">signature</option><option value="itinerary">itinerary</option></select><select id="map-category"><option value="all">all</option></select>
<form id="map-search-form"><input id="map-search-input"><button>search</button></form><div id="map-journey-panel"></div><details id="map-location-details"><div id="map-details"></div></details><div class="route-map"><div id="amap-viewport"></div><div id="map-landmark-caption">map</div></div>
<script type="module">import {createTravelMap} from '/src/travel-map.js';window.auditPlan={city:'广州',stops:[{id:'gz-museum',name:'广东省博物馆',city:'广州'},{id:'gz-square',name:'花城广场',city:'广州'}]};window.membershipCalls=[];window.acceptMembership=async change=>{membershipCalls.push(change);return true};window.auditMap=createTravelMap();window.auditMap.render(auditPlan,{onMembershipChange:acceptMembership});</script>`;
try{
  const page=await browser.newPage({viewport:{width:1200,height:1000}});page.setDefaultTimeout(5000);
  await page.addInitScript(()=>{window.mock={maps:[],searches:[],poiResults:[],routes:[],fits:[],centers:[],drags:[],pitches:[],rotations:[],offsets:[],projections:[],clustered:false,removes:0,clears:0,destroys:0,mapFailures:0,mapDelay:5,fixtures:{},failRoutes:false,routeDelay:5,holdRoutes:false,pendingRoutes:[]};});
  await page.route('**/*',route=>route.request().url().startsWith(base+'/')?route.continue():route.abort());
  await page.route(base+'/membership-review.html',route=>route.fulfill({contentType:'text/html',body:html}));
  await page.route('https://webapi.amap.com/maps?**',route=>route.fulfill({contentType:'application/javascript',body:sdkSource}));
  const ready=()=>page.waitForFunction(()=>document.querySelector('.route-map').dataset.mapPhase==='ready');
  await page.goto(base+'/membership-review.html');await ready();
  await page.locator('#map-density').selectOption('itinerary');await ready();
  await page.locator('.map-marker[data-stop="gz-museum"]').click();
  assert.equal(await page.locator('#map-membership').isVisible(),true);
  await page.locator('#map-membership').click();
  assert.equal(await page.evaluate(()=>membershipCalls.length),1,'Accepted-plan editing still works when enabled');

  await page.evaluate(()=>auditMap.render(auditPlan,{onMembershipChange:null}));await ready();
  await page.locator('.map-marker[data-stop="gz-museum"]').click();
  assert.equal(await page.locator('#map-membership').isVisible(),false,'A read-only map cannot offer an ineffective itinerary edit');
  assert.equal(await page.locator('#map-membership').isDisabled(),true);
  await page.locator('.map-marker[data-stop="gz-square"]').click();
  await page.waitForFunction(()=>document.getElementById('map-journey-result').dataset.state==='ready');
  assert.match(await page.locator('#map-journey-result').textContent(),/公里.*分钟/,'Route comparison stays usable');
  await page.locator('#map-route-mode').selectOption('drive');await ready();
  assert.equal(await page.locator('#map-membership').isVisible(),false,'Internal view re-renders retain the read-only state');
  assert.equal(await page.evaluate(()=>membershipCalls.length),1);

  await page.evaluate(()=>auditMap.render(auditPlan,{onMembershipChange:acceptMembership}));await ready();
  await page.locator('.map-marker[data-stop="gz-museum"]').click();
  assert.equal(await page.locator('#map-membership').isVisible(),true);
  await page.locator('#map-membership').click();
  assert.equal(await page.evaluate(()=>membershipCalls.length),2,'Returning to the accepted itinerary restores editing');
  console.log('PASS: null membership callback hides and disables edits, route comparison works, view changes retain read-only mode, accepted-plan editing recovers.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
