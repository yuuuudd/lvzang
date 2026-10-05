# Single-color Travel Magnet Implementation Plan

**Implementation amendment (2026-09-22):** The user supplied access to a DeepSeek API Key. Implemented a native Node HTTP server with server-side credentials and verified current `deepseek-flash` vision / JSON request shape. Offline mode remains explicit. Static files now live in `public/`; `model.js` combines height-map and STL logic, `artwork.js` draws constrained designs, `preview.js` renders the shared mesh, `app.js` handles UI/media. Four themes include love. Tests are consolidated into `tests/` with Node's built-in runner. Detailed evidence and remaining hardware/API checks are tracked in `docs/implementation-progress.md`; the original checkbox sequence below is historical planning, not a completion claim.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dependency-free browser demo that turns a short travel story into a controlled white bas-relief design and exports the same design as a printable STL.

**Architecture:** Browser ES modules separate story interpretation, height-map construction, STL meshing, preview rendering, and UI wiring. The preview and STL exporter consume the same height map. Node's built-in test runner verifies deterministic story decisions and valid mesh output without adding dependencies.

**Tech Stack:** HTML, CSS, browser Canvas API, ES modules, Node.js built-in `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-22-single-color-travel-magnet-design.md`

**Scope amendment:** The user requested voice input with typing retained, plus camera capture and photo selection, and explicitly chose support for both people and scenery. The updated design proposes a shared crop/contrast/threshold-to-relief pipeline with two layouts. The original text-only plan is no longer the complete scope; the photo intake and generation work below is required.

## Global Constraints

- Typing, rule-based design, and STL export must work without an API key or network request. Voice recognition must be verified separately on the event device; browser availability does not guarantee the recognition service works.
- One landmark, one 60 × 45 mm rectangular product, and three story themes only.
- White single-material preview; default 2 mm base and 1.2 mm relief.
- STL and preview must derive from the same height map.
- No runtime or test dependencies.

## Review Focus

- Empty or whitespace-only stories must produce a usable generic design rather than crash.
- Stories containing overlapping theme words must select one theme deterministically.
- Captions longer than 8 Chinese characters must be rejected before export.
- Empty or malformed height maps must fail with a clear error rather than emit corrupt STL.
- Repeated exports of the same height map must have the same triangle count and dimensions.

---

### Task 1: Story-to-design contract and page shell

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `styles.css`
- Create: `src/design.js`
- Create: `tests/design.test.js`

**Interfaces:**
- Consumes: `{ story: string, date?: string }` from the form.
- Produces: `createDesign(input): { theme, caption, date, landmark, motif }` and `validateCaption(caption)`.

- [ ] **Step 1: Write the failing story tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDesign, validateCaption } from '../src/design.js';

test('a story about mother selects the family motif', () => {
  assert.equal(createDesign({ story: '第一次和妈妈来赤坎' }).motif, 'family');
});

test('an empty story produces the generic travel design', () => {
  assert.deepEqual(createDesign({ story: '   ' }), {
    theme: '旅途留念', caption: '把今天带回家', date: '', landmark: '赤坎骑楼', motif: 'travel'
  });
});

test('captions longer than eight characters are rejected', () => {
  assert.equal(validateCaption('这是超过八个汉字的纪念文案'), '文案最多 8 个汉字');
});
```

- [ ] **Step 2: Run `node --test tests/design.test.js` and verify it fails because `src/design.js` is absent**

- [ ] **Step 3: Implement the smallest deterministic keyword mapper and caption validator**

```js
const THEMES = [
  { motif: 'family', words: ['妈妈', '母亲', '爸爸', '家人'], theme: '亲情同行', caption: '陪家人看世界' },
  { motif: 'friends', words: ['朋友', '同学', '毕业', '闺蜜'], theme: '好友同行', caption: '一起走过赤坎' },
  { motif: 'love', words: ['爱人', '对象', '情侣', '纪念日'], theme: '心动同行', caption: '与你走过赤坎' }
];

export function createDesign({ story = '', date = '' } = {}) {
  const match = THEMES.find(item => item.words.some(word => story.includes(word)));
  return match
    ? { theme: match.theme, caption: match.caption, date, landmark: '赤坎骑楼', motif: match.motif }
    : { theme: '旅途留念', caption: '把今天带回家', date, landmark: '赤坎骑楼', motif: 'travel' };
}

export function validateCaption(caption) {
  if (!caption.trim()) return '请输入纪念文案';
  return Array.from(caption.trim()).length > 8 ? '文案最多 8 个汉字' : '';
}
```

- [ ] **Step 4: Run `node --test tests/design.test.js` and verify all story tests pass**

- [ ] **Step 5: Add the semantic form, result card, and responsive visual shell**

- [ ] **Step 6: Commit with `git commit -m "feat: add travel story design flow"`**

### Task 2: Shared height map and printable mesh

**Files:**
- Create: `src/model.js`
- Create: `tests/model.test.js`

**Interfaces:**
- Consumes: `ImageData`-like `{ width, height, data }` and physical model options.
- Produces: `heightMapFromImageData(imageData, options)` and `buildBinaryStl(heightMap, options): ArrayBuffer`.

- [ ] **Step 1: Write failing tests for a literal 2 × 2 height map**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBinaryStl, heightMapFromImageData } from '../src/model.js';

test('opaque pixels become relief and transparent pixels remain at base height', () => {
  const map = heightMapFromImageData({ width: 2, height: 1, data: Uint8ClampedArray.from([
    255, 255, 255, 255, 0, 0, 0, 0
  ]) }, { baseHeight: 2, reliefHeight: 1.2 });
  assert.deepEqual(map.heights, [3.2, 2]);
});

test('a 2 by 2 map exports a non-empty binary STL with its triangle count in the header', () => {
  const result = buildBinaryStl({ width: 2, height: 2, heights: [2, 2, 2, 3.2] }, { widthMm: 60, heightMm: 45 });
  const view = new DataView(result);
  assert.equal(result.byteLength, 84 + view.getUint32(80, true) * 50);
  assert.ok(view.getUint32(80, true) > 0);
});

test('an empty height map is rejected', () => {
  assert.throws(() => buildBinaryStl({ width: 0, height: 0, heights: [] }, {}), /高度图/);
});
```

- [ ] **Step 2: Run `node --test tests/model.test.js` and verify it fails because `src/model.js` is absent**

- [ ] **Step 3: Implement alpha-to-height conversion and a closed height-field mesh with top, bottom, and four walls**

- [ ] **Step 4: Encode each triangle as the 50-byte binary STL record and write the triangle count at byte 80**

- [ ] **Step 5: Run `node --test tests/model.test.js` and the full `npm test`; verify both pass**

- [ ] **Step 6: Commit with `git commit -m "feat: export relief designs as STL"`**

### Task 3: Actual-design preview and export flow

**Media intake requirements added by the user:**
- Keep a visible editable story field alongside a prominent start/stop voice button. Enforce 300 characters without silently truncating.
- Feature-detect speech recognition. Retain confirmed text during interim recognition, retries, cancellation, and errors; do not replace the story with an empty recognition result.
- Include camera preview/capture/retake and a separate ordinary photo-picker. Both routes share the same image preview, replace, and remove controls.
- Request camera/microphone only after user action; release camera tracks and stop recognition when the user closes the capture flow or leaves the page.
- Validate successful image decoding, JPEG/PNG/WebP format, a 10 MB file ceiling, and a 24-megapixel ceiling; downsample to a maximum 1600-pixel long edge before further processing.
- Keep capture and photo selection functional independently of photo-to-relief generation. Do not label a photo as part of the STL unless it actually contributes to the shared model data.
- Test microphone denial, unsupported recognition, empty recognition results, camera denial, image replacement/removal, corrupt image files, and the complete typing-only fallback. Actual voice/camera testing requires the event device and its user's permission.
- Document localhost development and HTTPS for remote-device camera access. Do not claim the media flow is offline merely because the text-only flow is.
- Include user-selected portrait/scenery layouts with crop, contrast, threshold and an original/simplified preview. Convert the simplified image into an explicit foreground mask before height generation; feeding opaque photo alpha directly into `heightMapFromImageData` would generate a flat block.
- Portrait layout gives the subject the central image region and uses a small landmark border. Scenery replaces the default landmark in the main image region. Both keep a separate caption/date region.
- Add a literal synthetic image fixture with a dark foreground square on a bright background. Assert foreground and background produce different heights, that changing the square position moves the raised geometry, and that two entirely different photos cannot yield the same geometry merely because both are opaque.
- Verify both a portrait and a scenery photo change the shared preview/export geometry, and removing a photo restores the default landmark without losing story text. Do not call local thresholding AI background removal or actual depth reconstruction.

**Files:**
- Create: `src/artwork.js`
- Create: `src/preview.js`
- Create: `src/app.js`
- Modify: `index.html`
- Modify: `styles.css`

**Interfaces:**
- Consumes: the `Design` object from `createDesign`.
- Produces: `drawArtwork(canvas, design): ImageData`, `renderPreview(canvas, heightMap)`, and browser download of `赤坎-<caption>.stl`.

- [ ] **Step 1: Add a small browser self-check that calls `drawArtwork` with all four motifs and fails visibly if any canvas is blank**

- [ ] **Step 2: Verify the self-check fails because `drawArtwork` is absent**

- [ ] **Step 3: Draw the fixed arcade landmark, motif, caption, and date with thick strokes suitable for a 0.4 mm nozzle**

- [ ] **Step 4: Convert the canvas to a shared height map and render a white shaded preview from that data**

- [ ] **Step 5: Wire form generation, caption edits, theme buttons, validation, and STL download**

- [ ] **Step 6: Open the app at desktop and narrow mobile widths; verify input → preview → changed caption → STL download**

- [ ] **Step 7: Commit with `git commit -m "feat: complete printable magnet demo"`**

### Task 4: Demo handoff

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: completed static app.
- Produces: exact local run, demonstration, and Bambu Studio import instructions.

- [ ] **Step 1: Document `npm start`, the 90-second demo script, and the initial A1 slicing assumptions**

- [ ] **Step 2: Run `npm test`, launch the local server, and repeat the complete demo once from a clean refresh**

- [ ] **Step 3: Import the exported STL into Bambu Studio and record whether dimensions are 60 × 45 mm**

- [ ] **Step 4: Commit with `git commit -m "docs: add hackathon demo guide"`**
