import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createApp } from '../server.js';
import { sdkSource } from './fixtures/amap-sdk.js';
import { initialState } from '../public/src/travel-state.js';
import { normalizeRequest, planFromCatalog } from '../public/src/travel-domain.js';
import { emptyTravelProfile, updateTravelProfile } from '../public/src/travel-profile.js';
import { buildDailyPlan } from '../public/src/travel-schedule.js';

const profile = updateTravelProfile(emptyTravelProfile(), { text: '广州一天每天8小时', patch: { destination: '广州', dayCount: 1, dailyHours: 8 } }).profile;
const plan = buildDailyPlan({ ...planFromCatalog(normalizeRequest({ destination: '广州', hours: 8 }), undefined, { placeIds: ['gz-museum', 'gz-square'] }), mode: 'demo', trace: [] }, profile);
const saved = JSON.stringify({ ...initialState(), plan, profile });
const server = createApp({ key: '', amapJsKey: 'fixture-public', amapSecurityJsCode: 'fixture-private', fetchImpl: async () => { throw Error('No external services'); } });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(6000);
  await page.addInitScript(saved => {
    localStorage.setItem('lvzang.v1', saved);
    window.mock = { maps: [], searches: [], poiResults: [], routes: [], fits: [], centers: [], drags: [], pitches: [], rotations: [], offsets: [], projections: [], clustered: false, removes: 0, clears: 0, destroys: 0, mapFailures: 0, mapDelay: 5, fixtures: {}, failRoutes: false, routeDelay: 5, holdRoutes: false, pendingRoutes: [], locationCalls: 0 };
  }, saved);
  await page.route('**/*', route => route.request().url().startsWith(base + '/') ? route.continue() : route.abort());
  const geo = `class Geolocation { getCurrentPosition(callback) { window.mock.locationCalls++; callback('complete', { position: [113.321,23.131], accuracy: 25, location_type:'h5',isConverted:true }); } };`;
  await page.route('https://webapi.amap.com/maps?**', route => route.fulfill({ contentType: 'application/javascript', body: sdkSource.replace('const sdkCallback=', geo + '\nconst sdkCallback=').replace('window.AMap={Map:', 'window.AMap={Geolocation,Map:') }));
  await page.goto(base + '/travel.html');
  await page.waitForFunction(() => document.querySelector('.route-map').dataset.mapPhase === 'ready');
  await page.getByRole('button', { name: '当前位置', exact: true }).click();
  await page.locator('.map-marker[data-stop="gz-museum"]').click();
  await page.waitForFunction(() => document.getElementById('map-journey-result').dataset.state === 'ready');
  const before = await page.evaluate(() => {
    const map = window.mock.maps.at(-1);
    map.setCenter([113.34, 23.14]);
    map.emit('dragstart');
    return { fits: window.mock.fits.length, center: [...map.getCenter()], stored: JSON.stringify({ ...localStorage }) };
  });
  await page.getByLabel('地标密度', { exact: true }).selectOption('detailed');
  await page.waitForFunction(() => document.getElementById('map-journey-result').dataset.state === 'ready');
  const after = await page.evaluate(() => ({ fits: window.mock.fits.length, center: [...window.mock.maps.at(-1).getCenter()], stored: JSON.stringify({ ...localStorage }) }));
  assert.equal(after.stored, before.stored, 'Exploring and filtering never persist device location or alter the accepted itinerary');
  assert.equal(after.fits, before.fits, 'Changing landmark density must not recenter an existing comparison after the user moved the map');
  assert.deepEqual(after.center, before.center);
  console.log('PASS: density changes preserve a user-selected camera and do not persist location or edit the itinerary.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
