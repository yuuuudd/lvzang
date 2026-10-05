# Product Type Reference and Collection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one travel memory produce and collect distinct keychain, flat magnet, sculpted magnet, and figurine works, with product type controlling design and reference images before any optional modeling.

**Architecture:** Add one validated `productType` contract shared by browser and server. Route design, image generation, review, and optional modeling by that value while preserving the existing untyped legacy routes. Save all variants in existing IndexedDB and present them as a collection; give figurines a separate digital-mesh inspection path so magnet shape rules never classify them.

**Tech Stack:** Node.js 24.5+, native browser JavaScript, IndexedDB, node:test, existing Tripo/DeepSeek adapters, manifold-3d, existing WebGL viewer.

**Spec:** `docs/superpowers/specs/2026-09-24-product-type-reference-and-collection-design.md`

## Global Constraints

- Supported IDs are exactly `acrylic_keychain`, `flat_magnet`, `sculpted_magnet`, and `figurine`. Product type and visual style are separate inputs.
- Product selection happens before the per-object design and paid reference-image request; changing type creates another work for the same `tripId`/`memoryId`.
- Flat works stop after a saved, downloadable concept image. Do not label it factory-ready or submit image-to-3D.
- Figurine models may be collected digitally even if print checks fail. Disable STL/3MF export unless figurine-specific checks allow it. Never claim slicing or physical testing happened.
- Preserve untyped history and the current legacy modes. Do not rewrite the travel-painting flow or add a new account, database, order flow, or dependency.
- The working tree contains user changes and untracked app files. Work in place, stage only files touched by each task, and do not discard unrelated work.

## Review Focus

1. Unknown or conflicting `productType`/`sculpture` input must fail before any paid API call. Task 1 pins this with a route test.
2. A story or older brief mentioning a magnet must not turn a selected figurine or keychain into a magnet. Task 2 pins this with prompt tests.
3. A flat work must survive refresh with its image and category while making zero model requests. Task 3 pins this with a browser test.
4. A malformed, open, disconnected, or unstable figurine may remain a digital work only when its GLB can be decoded; print export stays disabled. Task 4 pins this with mesh tests.
5. Legacy untyped records and several variants of one memory must all remain accessible after refresh. Task 5 pins this with a browser test.

---

## File Map

- `public/src/product-types.js`: IDs, labels, flat/3D predicate, input validation; imported by browser and Node.
- `server.js` and `tripo.js`: category-aware design, image prompt, review, and API validation; retain legacy untyped behavior.
- `public/index.html`, `public/src/app.js`, `public/src/trips.js`, `public/style.css`, `public/simple.css`: choose type, show correct stage, retain variants, and display collection.
- `figurine.js`: inspect and normalize a Tripo GLB for a freestanding digital work; no magnet backing or pocket logic.
- `tests/product-types.test.js`, `tests/tripo.test.js`, `tests/server.test.js`, `tests/figurine.test.js`, `tests/trip.browser.js`: one meaningful check at each trust boundary and browser flow.
- `README.md`: explain category behavior and local-collection limits.

### Task 1: Product Type Contract and Server Boundary

**Files:**
- Create: `public/src/product-types.js`
- Create: `tests/product-types.test.js`
- Modify: `server.js` (all `/api/design`, `/api/artwork`, `/api/reference-review`, `/api/model`, `/api/agent` request parsers)
- Test: `tests/server.test.js`

**Interfaces:**
- Produces: `productTypeOf(body): string|null`, `is3DProduct(type): boolean`, `productName(type): string`. A null result is only for existing untyped legacy requests.
- Later tasks pass `productType` unchanged through request, pending job, and saved record.

- [ ] **Step 1: Write a failing contract test.**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { productTypeOf, is3DProduct, productName } from '../public/src/product-types.js';
test('four product types are distinct and unknown types fail', () => {
  assert.equal(productTypeOf({ productType: 'figurine' }), 'figurine');
  assert.equal(productTypeOf({ sculpture: true }), 'sculpted_magnet');
  assert.equal(productTypeOf({}), null);
  assert.equal(is3DProduct('flat_magnet'), false);
  assert.equal(is3DProduct('figurine'), true);
  assert.equal(productName('acrylic_keychain'), '亚克力钥匙扣');
  assert.throws(() => productTypeOf({ productType: 'poster' }), /品类/);
  assert.throws(() => productTypeOf({ productType: 'flat_magnet', sculpture: true }), /品类.*创作方式/);
});
```

- [ ] **Step 2: Run `node --test tests/product-types.test.js`; expect missing-module failure.**
- [ ] **Step 3: Implement the shared contract and validate before external calls.** Use this exact legacy fallback; reject a supplied `sculpture` flag that conflicts with a supplied type. On typed requests, derive image/model routing from the validated type. For untyped requests, keep existing behavior.

```js
export const productTypes = ['acrylic_keychain', 'flat_magnet', 'sculpted_magnet', 'figurine'];
const names = ['亚克力钥匙扣', '平面冰箱贴', '立体冰箱贴', '桌面小手办'];
export const is3DProduct = type => type === 'sculpted_magnet' || type === 'figurine';
export function productTypeOf(body = {}) {
  const type = body.productType ?? (body.sculpture === true ? 'sculpted_magnet' : null);
  if (type !== null && !productTypes.includes(type)) throw new Error('不支持的纪念品品类');
  if (body.productType && body.sculpture !== undefined && body.sculpture !== is3DProduct(type))
    throw new Error('品类与创作方式不一致');
  return type;
}
export function productName(type) { return names[productTypes.indexOf(type)] || '旧版作品'; }
```

- [ ] **Step 4: Add a `tests/server.test.js` case posting `productType:'poster'` and contradictory flat+`sculpture:true` to design/artwork/model; assert HTTP 400 and that the mocked external fetch count remains zero. Run `node --test tests/product-types.test.js tests/server.test.js`; expect pass.**
- [ ] **Step 5: Commit only Task 1 files with `git add -- public/src/product-types.js server.js tests/product-types.test.js tests/server.test.js` then `git commit -m "feat: validate souvenir product types"`.**

### Task 2: Route Planning, Image Prompts, and Review by Type

**Files:**
- Modify: `server.js` (design system message and reference review)
- Modify: `tripo.js` (`artPrompt`)
- Test: `tests/tripo.test.js`
- Test: `tests/server.test.js`

**Interfaces:**
- Consumes: `productTypeOf(body)` and `is3DProduct(type)`.
- Produces: existing validated `design.brief` and `artPrompt(body): string`, now shaped by `body.productType`. Untyped calls keep their current prompts.

- [ ] **Step 1: Write failing prompt tests using one brief and conflicting input text.**

```js
for (const [type, wanted, forbidden] of [
  ['acrylic_keychain', /平面.*挂孔/, /磁贴背板/],
  ['flat_magnet', /平面.*不留挂孔/, /小手办底座/],
  ['sculpted_magnet', /立体冰箱贴.*背面/, /独立站立的手办/],
  ['figurine', /独立站立.*底座/, /制作.*立体冰箱贴/],
]) {
  const prompt = artPrompt({ productType:type, sculpture:is3DProduct(type),
    style:'clay', story:'我想把冰箱贴改成小手办', design });
  assert.match(prompt, wanted);
  assert.doesNotMatch(prompt, forbidden);
}
```

- [ ] **Step 2: Run `node --test tests/tripo.test.js`; expect the new assertions to fail because `artPrompt` still hardcodes magnets.**
- [ ] **Step 3: In `tripo.js` export four fixed `productShapeDirections` matching the spec table. For typed requests, make the direction a required, nontruncated part of `artPrompt`; reserve prompt length for it before shortening optional story detail. Use the existing flat `styles` for the two flat types and `sculptureStyles` for the two 3D types. Keep source-photo facts, location, and revision reference. Retain the existing untyped branches for historical tests.**

```js
export const productShapeDirections = {
  acrylic_keychain:'单件平面亚克力钥匙扣正面图；完整清晰外轮廓，主体上方留挂孔空间；不画立体模型或产品拍摄图。',
  flat_magnet:'单件平面冰箱贴正面图；完整清晰外轮廓，不留挂孔；不画立体底座或产品拍摄图。',
  sculpted_magnet:'单件立体冰箱贴参考图；紧凑厚实体，背面适合贴磁铁，所有主体相连。',
  figurine:'单件独立站立的小手办三分之四视角；完整厚实体，必要时连接稳固底座；不画磁贴平背、挂孔或贴片。',
};
const shape = productShapeDirections[body.productType];
```

- [ ] **Step 4: In `server.js` import `productShapeDirections` and use one typed story-planning system message that retains the existing evidence/JSON contract but replaces fixed magnet language with the validated shape direction. Typed flat and 3D requests both produce a validated `brief`; choose flat style wording for flat types and sculptural style wording for 3D types. Send `productType` into its user content. For `/api/reference-review`, require a type-specific check: keychain outline and hole space; flat magnet outline and no hole; sculpted magnet compact volume/back; figurine complete freestanding body/base. Include the type in review input, never infer it from image content.**

```js
const type = productTypeOf(body);
const systemMessage = type ? typedStorySystem + productShapeDirections[type] : (sculpture ? storySystem : system);
// The reviewer receives the same type that was saved with the reference task.
const reviewDirection = type ? reviewDirections[type] : '核对现有冰箱贴参考图';
```

- [ ] **Step 5: Extend `tests/server.test.js` with mocked DeepSeek responses. Assert the request system message and reference-review message contain the selected figurine or keychain constraints, even when the story says “冰箱贴”; assert old untyped requests still pass. Run `node --test tests/tripo.test.js tests/server.test.js`; expect pass.**
- [ ] **Step 6: Commit only Task 2 files with `git add -- server.js tripo.js tests/tripo.test.js tests/server.test.js` then `git commit -m "feat: route souvenir prompts by product type"`.**

### Task 3: Choice Before Generation and Flat Digital Works

**Files:**
- Modify: `public/index.html` (category selector near style, category label in preview)
- Modify: `public/src/trips.js` (memory detail action carries category selection into creation)
- Modify: `public/src/app.js` (requests, job context, flat-image completion, history restore)
- Modify: `public/style.css` and `public/simple.css` (small category control and flat preview)
- Test: `tests/trip.browser.js` or a focused `tests/product-types.browser.js` following its existing mocked-API pattern

**Interfaces:**
- Consumes: shared `productTypeOf`/`is3DProduct` helpers and typed server requests.
- Produces: every new record has `productType`, `phase:'reference'|'flat'` or a `sculpture`; flat work stores its generated PNG in `image` and no mesh.

- [ ] **Step 1: Add a browser test: choose `flat_magnet` on one memory, click generate, assert `/api/design`, `/api/artwork`, and `/api/reference-review` all receive that type; confirm “收藏数字作品”; assert `/api/model` is never called, history saves `phase:'flat'`, and opening after reload displays the image. Repeat the request assertion for `acrylic_keychain`. Expect failure before UI work.**

```js
const models = [];
await page.route('**/api/model', route => { models.push(route.request().url()); return route.abort(); });
await page.locator('#product-type').selectOption('flat_magnet');
await page.locator('#generate').click();
await page.locator('#collect-flat').click();
await page.waitForFunction(() => document.querySelector('#status').textContent.includes('已收藏'));
assert.equal(models.length, 0);
assert.equal(await page.locator('#product-type').inputValue(), 'flat_magnet');
```

- [ ] **Step 2: Add the four-option `#product-type` selector before `#style` and carry its value in the existing `trip-create-object` event. Keep current `sculpted_magnet` default. Ensure the simple UI also exposes it and does not reset it in `generate()`.**

```html
<label for="product-type">纪念品品类</label>
<select id="product-type">
  <option value="sculpted_magnet">立体冰箱贴</option>
  <option value="acrylic_keychain">亚克力钥匙扣</option>
  <option value="flat_magnet">平面冰箱贴</option>
  <option value="figurine">桌面小手办</option>
</select>
```

- [ ] **Step 3: In `app.js` add `productType` to `recordContext()`, `/api/design`, `/api/artwork`, `/api/reference-review` and model jobs. Make `collect()` save a flat image first as a `phase:'reference'` draft, run the type-specific image review, show the image and “收藏数字作品” button, and skip `buildModel()`. Clicking that button updates the saved record to `phase:'flat'`. Keep image download available even if review fails; the user may confirm after manual inspection. Existing 3D reference and model paths remain.**

```js
const productType = $('product-type').value;
const sculpture = is3DProduct(productType);
// After image success:
if (!sculpture) {
  const draft = { id:crypto.randomUUID(), createdAt:Date.now(),
    phase:'reference', productType, image:result.image, design:job.design,
    input:job.input, ...job.context };
  await saveHistory(draft);
  // Reuse the saved-reference review, then let #collect-flat save
  // { ...draft, phase:'flat' }; never submit /api/model for flat types.
  return;
}
```

- [ ] **Step 4: Restore `productType` and flat `phase` in `openHistory()`. A flat draft offers “收藏数字作品”; a confirmed flat work shows its category and image. Neither has STL/3MF buttons. If `saveHistory()` fails, leave the current image visible and keep its download link. Preserve current retry/resume task IDs so a paid image is not submitted twice.**
- [ ] **Step 5: Run the focused browser test, `node --test tests/product-types.test.js tests/tripo.test.js tests/server.test.js`, then `npm test`. Expect flat works to persist and old browser flows to remain green. Commit Task 3 UI and browser-test files only.**

### Task 4: Freestanding Figurine Digital Model and Print Gate

**Files:**
- Create: `figurine.js`
- Create: `tests/figurine.test.js`
- Modify: `server.js` (`/api/agent` chooses figurine inspection for explicit figurine type)
- Modify: `public/src/app.js` (figurine job result and print status)
- Test: `tests/server.test.js`

**Interfaces:**
- Consumes: `buildFigurineModel({glb,settings})` where `glb` is the downloaded bounded GLB and `settings.widthMm` comes from existing validation.
- Produces: `{mesh,originalColors,widthMm,heightMm,totalDepthMm,parts:[],report,exportable,versions,trace}` matching the current viewer/history fields. `report.checks` has `topology`, `connected`, `overhang`, `base-support` and `slicing`. It never reports a magnet hole or flat back.

- [ ] **Step 1: Write `tests/figurine.test.js` with a closed cube GLB, an open cube GLB, two disconnected cubes, and an edge-only bottom-contact model using the existing synthetic-GLB fixture pattern in `tests/manufacturing.test.js`. Assert a closed, broad-base model renders and is potentially exportable; all other decodable models return a viewable mesh with `exportable:false` and the corresponding failed check. A malformed GLB rejects before any model is saved.**

```js
const good = await buildFigurineModel({ glb:await cubeGlb(), settings:{widthMm:60} });
assert.ok(good.mesh.length > 0);
assert.equal(good.report.magnetHoles.length, 0);
assert.equal(good.report.checks.find(c => c.name === 'topology').status, 'pass');
const open = await buildFigurineModel({ glb:await cubeGlb({open:true}), settings:{widthMm:60} });
assert.equal(open.exportable, false);
assert.equal(open.report.checks.find(c => c.name === 'topology').status, 'fail');
```

- [ ] **Step 2: Run `node --test tests/figurine.test.js`; expect missing-module failure.**
- [ ] **Step 3: Implement `buildFigurineModel` using existing `readGlbMeshes()`. Expand indexed triangles into the viewer's triangle soup plus parallel vertex RGB bytes; preserve every decodable triangle for digital viewing. Normalize uniformly to configured width, center X/Z, put the lowest Y at zero, and keep the source proportions. Attempt a manifold import/merge for closed-volume and component checks; a failure changes report status rather than deleting the digital mesh.**

```js
const scale = settings.widthMm / (maxX - minX);
const outX = (x - (minX + maxX) / 2) * scale;
const outY = (y - minY) * scale;
const outZ = (z - minZ) * scale;
// originalColors has one RGB byte per expanded vertex and mesh.length entries.
```

- [ ] **Step 4: Inspect bottom support from downward-facing triangles within 0.5 mm of Y=0. A support area below 1% of the model's X/Z footprint is a failed `base-support` check; larger area is a provisional pass with a human-review note. Calculate downward-facing area above that base for an `overhang` warning/fail, using the same conservative face-angle approach as `manufacturing.js` but with Y as the vertical axis. Set `exportable` only when topology, connectedness, base support, and overhang have no failures; always keep `slicing` as a warning and `printabilityVerified:false`.**

```js
const exportable = ['topology','connected','base-support','overhang']
  .every(name => checks.find(check => check.name === name)?.status !== 'fail');
const report = { source:'glb', checks, magnetHoles:[], printabilityVerified:false };
```

- [ ] **Step 5: Route explicit `figurine` through this builder in `/api/agent` without `runDesignAgent`'s magnet repair path; wrap the result in one initial version/inspection trace. On browser completion save it even when `exportable:false`, show the rotating model and failed checks, and disable STL/3MF until exportable. Keep `sculpted_magnet` on `buildMagnetModel`.**
- [ ] **Step 6: Run `node --test tests/figurine.test.js tests/server.test.js tests/manufacturing.test.js` and `npm test`. Assert no figurine report includes `flat-back` or magnet checks. Commit Task 4 files only.**

### Task 5: Multi-Variant Cyber Souvenir Collection

**Files:**
- Modify: `public/index.html` (rename/show collection section and variant list)
- Modify: `public/src/app.js` (collection cards and history open)
- Modify: `public/src/trips.js` (all variants per memory)
- Modify: `public/style.css` and `public/simple.css` (image/model cards on desktop/mobile)
- Modify: `README.md`
- Test: `tests/trip.browser.js` or the focused category browser test from Task 3

**Interfaces:** Consumes existing `listHistory()` records with optional `productType`, `tripId`, `memoryId` and `phase`; produces a navigable view without changing the IndexedDB schema or deleting any saved work.

- [ ] **Step 1: Seed browser IndexedDB with two typed variants for one memory plus one untyped older record. Write a failing browser assertion that the same memory exposes both variants after reload, each opens its own reference/model, and the legacy card still opens.**

```js
const cards = page.locator('#trip-variants [data-product-type]');
assert.deepEqual(await cards.evaluateAll(nodes => nodes.map(n => n.dataset.productType)),
  ['acrylic_keychain','figurine']);
await cards.first().click();
assert.equal(await page.locator('#product-type').inputValue(), 'acrylic_keychain');
```

- [ ] **Step 2: Replace `renderDetail()`'s single `latestModel||records[0]` presentation with a variant list built from all nonhidden records for that memory. Keep one selected work for the large preview; flat work uses its PNG, 3D work uses its mesh. In the travel overview, a single thumbnail per memory may remain, but it must open the full variant list instead of hiding alternatives.**
- [ ] **Step 3: Present the existing history as “赛博文创收藏”: group records by trip/independent work and memory, show category, concept/3D stage, creation time, and open/download actions. Untyped records display “旧版作品”. Keep deletion scoped to the selected record and retain the existing confirmation. Add a one-line browser-local storage warning.**

```js
const groupKey = record => record.tripId
  ? record.tripId + ':' + record.memoryId
  : 'independent:' + record.id;
// Sort groups and records by createdAt; do not collapse variants by memoryId.
```

- [ ] **Step 4: Update `README.md` with four categories, selection before reference generation, image-only flat works, separate figurine print checks, and browser-local collection limits. Run the multi-variant browser test, the existing `tests/trip.browser.js` where available, and `npm test`; expect old and new records to open. Commit Task 5 files only.**

## Final Verification

- [ ] Run `npm test` and the affected mocked browser flow(s). Open both `/` and `/simple.html` at desktop and mobile widths to confirm the selector and collection remain usable; no live paid request is needed.
- [ ] Compare the same photo/story across all four categories by inspecting the actual mocked design and `artPrompt` payloads. Check a flat work never calls `/api/model`, a sculpted magnet still reaches its current export, and a figurine never uses magnet checks.
- [ ] Run `git diff --check` and inspect the staged diff for unrelated user changes. Report untested live API/image quality, slicing, and physical print outcomes without claiming factory readiness.
