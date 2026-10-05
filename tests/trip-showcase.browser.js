// NODE_PATH=<bundled node_modules> node tests/trip-showcase.browser.js
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createApp } from '../server.js';

const { chromium } = createRequire(import.meta.url)('playwright');
const server = createApp({ key: '', tripoKey: '' });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const root = `http://127.0.0.1:${server.address().port}`;
  await page.goto(root);
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('shiguang-history', 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const photo = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="90"><rect width="120" height="90" fill="%23c85e49"/></svg>';
    const trip = { id: 'showcase-trip', createdAt: 1, name: '十四件作品', place: '广州', date: '', story: '', photos: [{ id: 'p1', image: photo }], coverId: 'p1', collageVersion: 1, memories: Array.from({ length: 14 }, (_, i) => ({ id: `m${i + 1}`, photoId: 'p1', title: `作品 ${i + 1}`, story: '' })) };
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['trips', 'artworks'], 'readwrite');
      tx.objectStore('trips').put(trip);
      for (let i = 1; i <= 14; i++) tx.objectStore('artworks').put({ id: `art-${i}`, createdAt: i, tripId: trip.id, memoryId: `m${i}`, image: photo, sculpture: { mesh: new Float32Array([-25, -15, 5, 25, -15, 5, 0, 25, 5]), widthMm: 60, heightMm: 40, totalDepthMm: 5, exportable: true } });
      tx.objectStore('artworks').put({ id: 'art-1-earlier', createdAt: 0, tripId: trip.id, memoryId: 'm1', image: photo, sculpture: { mesh: new Float32Array([-15, -15, 5, 15, -15, 5, 0, 15, 5]), widthMm: 30, heightMm: 30, totalDepthMm: 5, exportable: true } });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload();
  await page.locator('.trip-library-card').filter({ hasText: '十四件作品' }).locator('.trip-open').click();
  await page.waitForFunction(() => document.querySelectorAll('#trip-piece-list .trip-model-card').length > 0);
  await page.waitForTimeout(900);
  const rotatingStage = await page.locator('#trip-piece-list .trip-model-card').first().evaluate(card => ({ cardBottom: card.getBoundingClientRect().bottom, stageBottom: card.querySelector('.trip-model-card-stage').getBoundingClientRect().bottom }));
  assert.ok(rotatingStage.stageBottom <= rotatingStage.cardBottom + 1, `rotating model stays inside its stand: ${JSON.stringify(rotatingStage)}`);
  assert.equal(await page.locator('#trip-piece-list .trip-model-card').count(), 3);
  assert.deepEqual(await page.locator('#trip-piece-list .trip-model-card').evaluateAll(cards => cards.map(card => card.dataset.artworkId)), ['art-14', 'art-13', 'art-12']);
  await page.locator('#trip-showcase-cabinet summary').click();
  assert.equal(await page.locator('#trip-showcase-cabinet .trip-cabinet-card').count(), 15);
  assert.equal(await page.locator('#trip-showcase-cabinet [data-artwork-id="art-1"] strong').textContent(), '作品 1 · 第2版');
  assert.equal(await page.locator('#trip-showcase-cabinet [data-artwork-id="art-1-earlier"] strong').textContent(), '作品 1 · 第1版');
  await page.locator('#trip-showcase-cabinet').screenshot({ path: 'artifacts/trip-cabinet-15.png' });
  await page.locator('#trip-showcase-cabinet [data-artwork-id="art-1"] .trip-feature').click();
  assert.deepEqual(await page.locator('#trip-piece-list .trip-model-card').evaluateAll(cards => cards.map(card => card.dataset.artworkId)), ['art-13', 'art-12', 'art-1']);
  await page.locator('#trip-showcase-cabinet [data-artwork-id="art-1-earlier"] .trip-feature').click();
  assert.deepEqual(await page.locator('#trip-piece-list .trip-model-card').evaluateAll(cards => cards.map(card => card.dataset.artworkId)), ['art-12', 'art-1', 'art-1-earlier']);
  await page.evaluate(() => window.addEventListener('trip-open-artwork', event => { window.openedArtworkId = event.detail.id; }));
  await page.locator('#trip-showcase-cabinet [data-artwork-id="art-1-earlier"] .small-button').first().click();
  await page.locator('#trip-detail[open]').waitFor();
  await page.locator('#trip-open-object').click();
  assert.equal(await page.evaluate(() => window.openedArtworkId), 'art-1-earlier');
  await page.reload();
  await page.locator('.trip-library-card').filter({ hasText: '十四件作品' }).locator('.trip-open').click();
  await page.waitForFunction(() => document.querySelectorAll('#trip-piece-list .trip-model-card').length === 3);
  assert.deepEqual(await page.locator('#trip-piece-list .trip-model-card').evaluateAll(cards => cards.map(card => card.dataset.artworkId)), ['art-12', 'art-1', 'art-1-earlier']);
  const bounds = await page.locator('.trip-art-layout').evaluate(node => {
    const art = node.querySelector('#trip-collage').getBoundingClientRect(), cards = [...node.querySelectorAll('#trip-piece-list .trip-model-card')].map(card => card.getBoundingClientRect());
    return { artTop: art.top, artBottom: art.bottom, firstTop: cards[0].top, lastBottom: cards[2].bottom, heights: cards.map(card => card.height), modelWidth: node.querySelector('.trip-model-card-stage').getBoundingClientRect().width, cardWidth: cards[0].width };
  });
  assert.ok(Math.abs(bounds.firstTop - bounds.artTop) <= 2 && Math.abs(bounds.lastBottom - bounds.artBottom) <= 2, `three stands align with artwork: ${JSON.stringify(bounds)}`);
  assert.ok(Math.max(...bounds.heights) - Math.min(...bounds.heights) <= 2, `three stands have equal height: ${JSON.stringify(bounds.heights)}`);
  assert.ok(bounds.modelWidth > bounds.cardWidth * .5, `models use the enlarged stands: ${JSON.stringify(bounds)}`);
  await page.goto(root + '/simple.html');
  await page.locator('.trip-library-card').filter({ hasText: '十四件作品' }).locator('.trip-open').click();
  await page.waitForFunction(() => document.querySelectorAll('#trip-piece-list .trip-model-card').length === 3);
  await page.locator('#trip-atlas').screenshot({ path: 'artifacts/trip-showcase-14.png' });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.evaluate(async () => {
    const db = await new Promise(resolve => { const request = indexedDB.open('shiguang-history', 2); request.onsuccess = () => resolve(request.result); });
    const trip = await new Promise(resolve => { const request = db.transaction('trips').objectStore('trips').get('showcase-trip'); request.onsuccess = () => resolve(request.result); });
    trip.painting = { image: trip.photos[0].image, regions: [], textInImage: true };
    await new Promise(resolve => { const tx = db.transaction('trips', 'readwrite'); tx.objectStore('trips').put(trip); tx.oncomplete = resolve; });
    db.close();
  });
  await page.reload();
  await page.locator('.trip-library-card').filter({ hasText: '十四件作品' }).locator('.trip-open').click();
  await page.locator('#trip-painting-wrap').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelectorAll('#trip-piece-list .trip-model-card').length === 3);
  const paintingBounds = await page.locator('.trip-art-layout').evaluate(node => {
    const art = node.querySelector('.trip-painting-stage').getBoundingClientRect(), cards = [...node.querySelectorAll('#trip-piece-list .trip-model-card')].map(card => card.getBoundingClientRect());
    return { artTop: art.top, artBottom: art.bottom, firstTop: cards[0].top, lastBottom: cards[2].bottom };
  });
  assert.ok(Math.abs(paintingBounds.firstTop - paintingBounds.artTop) <= 2 && Math.abs(paintingBounds.lastBottom - paintingBounds.artBottom) <= 2, `three stands align with painting: ${JSON.stringify(paintingBounds)}`);
  await page.waitForTimeout(900);
  const paintingStagesFit = await page.locator('#trip-piece-list .trip-model-card').evaluateAll(cards => cards.every(card => card.querySelector('.trip-model-card-stage').getBoundingClientRect().bottom <= card.getBoundingClientRect().bottom + 1));
  assert.equal(paintingStagesFit, true, 'rotating models stay inside all three stands beside the painting');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#trip-showcase-cabinet summary').click();
  assert.equal(await page.locator('#trip-cabinet-grid .trip-cabinet-card').count(), 15);
  assert.ok((await page.locator('#trip-piece-list .trip-model-card').evaluateAll(cards => cards.map(card => card.getBoundingClientRect().height))).every(height => height >= 80));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
