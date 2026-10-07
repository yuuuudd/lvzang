import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createApp } from '../server.js';
import { sdkSource } from './fixtures/amap-sdk.js';
import { initialState } from '../public/src/travel-state.js';
import { normalizeRequest, planFromCatalog } from '../public/src/travel-domain.js';
import { emptyTravelProfile, updateTravelProfile } from '../public/src/travel-profile.js';
import { buildDailyPlan } from '../public/src/travel-schedule.js';
import { getExplorationLandmarks } from '../public/src/travel-map-exploration.js';

const profile = updateTravelProfile(emptyTravelProfile(), { text: '广州三天每天8小时', patch: { destination: '广州', dayCount: 3, dailyHours: 8 } }).profile;
const basePlan = planFromCatalog(normalizeRequest({ destination: '广州', hours: 8 }), undefined, { placeIds: ['gz-museum', 'gz-square', 'gz-opera'] });
const plan = buildDailyPlan({ ...basePlan, stops: basePlan.stops.map((stop, index) => ({ ...stop, dayIndex: index ? 2 : 1 })), mode: 'demo', trace: [] }, profile);
assert.equal(plan.days[0].stops.length, 1);
assert.equal(plan.days[1].stops.length, 2);
assert.equal(plan.days[2].stops.length, 0);
const expectedCount = plan.stops.length + getExplorationLandmarks('广州', { acceptedStops: plan.stops }).length;
const saved = JSON.stringify({ ...initialState(), plan, profile });
const server = createApp({ key: '', accountsEnabled: false, amapJsKey: 'fixture-public', amapSecurityJsCode: 'fixture-private', fetchImpl: async () => { throw Error('No external services'); } });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const root = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(15000);
  await page.addInitScript(saved => {
    localStorage.setItem('lvzang.v1', saved);
    window.mock = { maps: [], searches: [], poiResults: [], routes: [], fits: [], centers: [], drags: [], pitches: [], rotations: [], offsets: [], projections: [], clustered: false, removes: 0, clears: 0, destroys: 0, mapFailures: 0, mapDelay: 5, fixtures: {}, failRoutes: false, routeDelay: 5, holdRoutes: false, pendingRoutes: [] };
  }, saved);
  await page.route('**/*', route => route.request().url().startsWith(root + '/') ? route.continue() : route.abort());
  await page.route('https://webapi.amap.com/maps?**', route => route.fulfill({ contentType: 'application/javascript', body: sdkSource }));
  await page.goto(root + '/travel.html');
  await page.waitForFunction(count => document.querySelectorAll('.map-marker').length === count, expectedCount);
  const initial = await page.evaluate(() => {
    const map = window.mock.maps.at(-1);
    const origin = map.overlays.find(marker => marker.content?.dataset.stop === 'gz-museum').position;
    return { center: map.getCenter(), zoom: map.getZoom(), origin, fits: window.mock.fits.length, centers: window.mock.centers.length };
  });
  assert.deepEqual(initial.center, initial.origin, 'Initial view must remain centered on the single accepted stop for the active day');
  assert.equal(initial.zoom, 17);
  assert.equal(initial.fits, 0, 'Other-day and exploration arrivals must never fit a wider initial frame');
  assert.equal(initial.centers, 1, 'Only the accepted daily stop should trigger the initial single-stop framing');

  await page.locator('#map-fit').click();
  assert.equal(await page.evaluate(() => window.mock.fits.at(-1).positions.length), expectedCount, 'Explicit show-current-landmarks still frames every visible landmark');

  await page.locator('#day-selector [data-day="1"]').click();
  await page.waitForFunction(count => document.querySelectorAll('.map-marker').length === count, expectedCount);
  const secondDay = await page.evaluate(() => ({ fitted: window.mock.fits.at(-1).positions, accepted: window.mock.maps.at(-1).overlays.filter(marker => ['gz-square', 'gz-opera'].includes(marker.content?.dataset.stop)).map(marker => marker.position) }));
  assert.deepEqual(secondDay.fitted, secondDay.accepted, 'A multi-stop day must frame its own accepted stops, excluding all other days and exploration');

  await page.locator('#day-selector [data-day="2"]').click();
  await page.waitForFunction(count => document.querySelectorAll('.map-marker').length === count, expectedCount);
  const emptyDay = await page.evaluate(() => ({ fitted: window.mock.fits.at(-1).positions, exploration: window.mock.maps.at(-1).overlays.filter(marker => marker.content?.classList.contains('is-exploration')).map(marker => marker.position) }));
  assert.deepEqual(emptyDay.fitted, emptyDay.exploration, 'Only a day without accepted stops falls back to exploration framing');
  assert.equal(await page.evaluate(() => localStorage.getItem('lvzang.v1')), saved);
  console.log('PASS: automatic framing follows accepted stops for the active day; exploration arrivals cannot shrink that view; explicit fit includes all; empty-day fallback uses exploration.');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
