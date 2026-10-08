import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createApp } from '../server.js';
import { sdkSource } from './fixtures/amap-sdk.js';

const server = createApp({ key: '', amapJsKey: 'fixture-public', amapSecurityJsCode: 'fixture-private', fetchImpl: async () => { throw Error('No external services'); } });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const buttons = ['map-camera-toggle','map-fit','map-reset-bearing','map-exploration-toggle','map-zoom-in','map-zoom-out','map-use-location','map-journey-retry','map-set-origin','map-set-destination','map-swap','map-clear-selection','map-membership'];
const labels = ['map-status','map-message','map-location-status','map-search-status','map-search-results','map-place-name','map-place-description','map-place-day','map-origin','map-destination','map-journey-result','map-membership-status'];
const html = `<!doctype html><meta charset="utf-8"><style>.route-map{position:relative;width:900px;height:460px}#amap-viewport{position:absolute;inset:0}.map-marker{z-index:2}</style>
${buttons.map(id=>`<button id="${id}">${id}</button>`).join('')}
${labels.map(id=>`<div id="${id}"></div>`).join('')}
<select id="map-route-mode"><option value="walk">walk</option><option value="drive">drive</option></select><select id="map-density"><option value="signature">signature</option><option value="itinerary">itinerary</option></select><select id="map-category"><option value="all">all</option></select>
<form id="map-search-form"><input id="map-search-input"><button>search</button></form><div id="map-journey-panel"></div><details id="map-location-details"><div id="map-details"></div></details><div class="route-map"><div id="amap-viewport"></div><div id="map-landmark-caption">map</div></div>
<script type="module">import {createTravelMap} from '/src/travel-map.js'; window.auditPlan={city:'广州',stops:[{id:'audit-museum',name:'广州博物馆',city:'广州'}]};window.auditMap=createTravelMap();window.auditMap.render(window.auditPlan);</script>`;

try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
  page.setDefaultTimeout(5000);
  await page.addInitScript(() => {
    window.mock = { maps: [], searches: [], poiResults: [], routes: [], fits: [], centers: [], drags: [], pitches: [], rotations: [], offsets: [], projections: [], clustered: false, removes: 0, clears: 0, destroys: 0, mapFailures: 0, mapDelay: 5, fixtures: {}, failRoutes: false, routeDelay: 5, holdRoutes: false, pendingRoutes: [], pendingLocations: [] };
  });
  await page.route('**/*', route => route.request().url().startsWith(base + '/') ? route.continue() : route.abort());
  await page.route(base + '/map-review.html', route => route.fulfill({ contentType: 'text/html', body: html }));
  const geo = `class Geolocation { getCurrentPosition(callback) { window.mock.pendingLocations.push(callback); } };`;
  await page.route('https://webapi.amap.com/maps?**', route => route.fulfill({ contentType: 'application/javascript', body: sdkSource.replace('const sdkCallback=', geo + '\nconst sdkCallback=').replace('window.AMap={Map:', 'window.AMap={Geolocation,Map:') }));
  await page.goto(base + '/map-review.html');
  await page.waitForFunction(() => document.querySelector('.route-map').dataset.mapPhase === 'ready');
  await page.locator('#map-density').selectOption('itinerary');
  await page.waitForFunction(() => !document.getElementById('map-use-location').disabled);
  const storageBefore = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  const completeLocation = () => page.evaluate(() => window.mock.pendingLocations.shift()('complete', { position:[113.321,23.131], accuracy:25, location_type:'h5', isConverted:true }));
  const beginLocation = async () => { await page.locator('#map-use-location').click(); await page.waitForFunction(() => window.mock.pendingLocations.length === 1); };
  const ready = () => page.waitForFunction(() => document.querySelector('.route-map').dataset.mapPhase === 'ready' && !document.getElementById('map-use-location').disabled);

  await beginLocation();
  await page.locator('.map-marker[data-stop="audit-museum"]').click();
  assert.equal(await page.locator('#map-origin').textContent(), '广州博物馆');
  await completeLocation();
  await page.evaluate(() => new Promise(requestAnimationFrame));
  assert.equal(await page.locator('#map-origin').textContent(), '广州博物馆', 'A late location result must not replace a newer manual origin');
  assert.equal(await page.locator('.map-current-location').count(), 0);

  await beginLocation();
  await page.locator('#map-set-origin').click();
  await completeLocation();
  await page.evaluate(() => new Promise(requestAnimationFrame));
  assert.equal(await page.locator('#map-origin').textContent(), '广州博物馆', 'Explicitly resetting the same manual origin also supersedes an older location request');
  assert.equal(await page.locator('.map-current-location').count(), 0);

  await beginLocation();
  await page.locator('#map-camera-toggle').click();
  assert.equal(await page.locator('#map-use-location').isDisabled(), true, 'Changing 3D view must not enable duplicate location requests');
  await page.evaluate(() => window.auditMap.pause());
  await completeLocation();
  assert.equal(await page.evaluate(() => window.auditMap.available), false);
  assert.equal(await page.locator('.map-current-location').count(), 0, 'Paused illustration cannot receive a late location marker');

  await page.evaluate(() => window.auditMap.render(window.auditPlan));
  await ready();
  await beginLocation();
  await page.evaluate(() => window.mock.maps.at(-1).emit('error'));
  await completeLocation();
  assert.equal(await page.locator('.route-map').getAttribute('data-map-phase'), 'error');
  assert.equal(await page.locator('.map-current-location').count(), 0, 'Failed map cannot receive a late location marker');

  await page.evaluate(() => window.auditMap.render(window.auditPlan));
  await ready();
  await beginLocation();
  await page.evaluate(() => window.auditMap.render({city:'北京',stops:[{id:'audit-beijing',name:'故宫博物院',city:'北京'}]},{preserveSelection:true,preserveCamera:true}));
  await ready();
  await completeLocation();
  assert.equal(await page.locator('#map-origin').textContent(), '点击建筑选择', 'Changing city invalidates previous location intent');
  assert.equal(await page.locator('.map-current-location').count(), 0);
  await beginLocation();
  await completeLocation();
  await page.waitForFunction(() => document.getElementById('map-origin').textContent === '我的位置');
  await page.evaluate(() => window.auditMap.render(window.auditPlan, {preserveSelection:true,preserveCamera:true}));
  await ready();
  assert.equal(await page.locator('#map-origin').textContent(), '点击建筑选择', 'A previously completed device origin is reset for another city even when caller requests selection preservation');
  assert.equal(await page.locator('.map-current-location').count(), 0);
  assert.equal(await page.evaluate(() => JSON.stringify({ ...localStorage })), storageBefore);
  console.log('PASS: late location results cannot override manual origin, pause, failure or city changes; no duplicate request or persistent coordinate.');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
