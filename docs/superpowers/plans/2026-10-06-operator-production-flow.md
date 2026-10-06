# Operator Production Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the operator's digital-delivery workflow with two clear paths: assisted creation from a synced story, or direct physical production from a submitted GLB.

**Architecture:** Extend the existing commission record with one service-mode discriminator and physical-production fields, while preserving old records through defaults in validation. Keep all rendering in the existing operator page and reuse its store, asset selection, model preview, escaping, and concurrency checks; seed two idempotent demo commissions only when the local operator store is empty.

**Tech Stack:** Native ES modules, IndexedDB through the existing keepsake store, Node test runner, Playwright, existing CSS.

**Spec:** `docs/superpowers/specs/2026-10-06-operator-production-flow-design.md`

## Global Constraints

- Default final delivery is a physical souvenir; do not expose GLB downloads, digital delivery packages, or technical reports as user-facing deliverables.
- Preserve the user's story verbatim and label it as synchronized from the user app; production fields must not overwrite it.
- Assisted creation cannot start modeling before user confirmation.
- Submitted-GLB commissions must not show or invoke creative-generation controls.
- Reuse the current store and preview pipeline; add no dependency or parallel persistence layer.
- Demo records must be labeled `演示` and excluded from real counts and costs.

## Review Focus

- Existing records without `serviceMode` must open as assisted-creation records rather than fail validation; Task 1 tests this migration default.
- Reopening an empty store must not duplicate demo commissions; Task 1 tests idempotent seeding.
- A submitted-GLB record must never expose `打开单件创作`; Task 2 browser tests both branches.
- An assisted record without user confirmation must not enter model production; Task 1 tests the domain guard and Task 2 tests the disabled UI route.
- Demo records must remain visibly marked and excluded from overview totals; Task 2 browser tests labels and counts.

---

### Task 1: Commission modes, production states, and demo records

**Files:**
- Modify: `public/src/operator-domain.js`
- Test: `tests/operator.test.js`

**Interfaces:**
- Produces: `serviceModes`, `productionStatusLabels`, `createDemoCommissions(existing = []) -> Commission[]`, `confirmReference(commission) -> Commission`, and backward-compatible `validateCommission(commission) -> Commission`.
- Consumes: existing `createCommission`, `attachSelection`, `saveCommission`, and commission store metadata.

- [ ] **Step 1: Write failing domain tests**

Add tests named `legacy commissions default to assisted creation`, `demo commissions cover both paths without real metrics`, and `assisted creation requires user confirmation before modeling`. Assert the two demo titles are exactly `抖音创作者大会` and `嘉兴夜游纪念摆件`, sources are `demo`, modes are `assisted` and `production`, and repeated seed input yields no duplicate IDs.

- [ ] **Step 2: Run the domain tests and verify failure**

Run: `node --test tests/operator.test.js`

Expected: FAIL because the new mode, seed, and confirmation exports do not exist.

- [ ] **Step 3: Implement the minimal domain extension**

Add `serviceMode: 'assisted' | 'production'`, `storySynced`, `userConfirmedAt`, `productionStatus`, `sizeCm`, `material`, `quantity`, and `productionNote` to commission defaults and validation. Normalize missing fields before validating old records. Add two deterministic demo commissions without adding demo costs, exports, or delivery claims. `confirmReference` must require a selected reference asset and set `userConfirmedAt`; the assisted modeling guard must reject when it is absent.

- [ ] **Step 4: Run the domain tests and verify pass**

Run: `node --test tests/operator.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/src/operator-domain.js tests/operator.test.js
git commit -m "feat: model operator production paths"
```

### Task 2: Branch-specific operator pages and seeded examples

**Files:**
- Modify: `public/src/operator.js`
- Modify: `public/operator.html`
- Test: `tests/operator.browser.js`

**Interfaces:**
- Consumes: Task 1's `serviceModes`, `productionStatusLabels`, `createDemoCommissions`, and `confirmReference`.
- Produces: overview filters and totals, assisted-creation detail, submitted-GLB production detail, and physical-delivery progression on the current hash routes.

- [ ] **Step 1: Write failing browser assertions for the overview**

Start with an empty store and assert the page shows `经营者工作台`, both demo titles, `需要协助创作`, `已有 3D 资产`, and real totals of zero. Reload and assert each demo title appears once.

- [ ] **Step 2: Write failing browser assertions for both detail paths**

Open the assisted demo and assert `用户的故事`, `已从用户端同步`, `发送给用户确认`, and `尚未确认，不会开始建模` are present. Open the production demo and assert `用户提交的 3D 资产`, `生产检查`, and `发送报价与打样方案` are present, while `打开单件创作`, `导出交付包`, and `数字交付` are absent.

- [ ] **Step 3: Run the browser test and verify failure**

Run: `node tests/operator.browser.js`

Expected: FAIL on the new overview or detail text.

- [ ] **Step 4: Implement the overview and path-specific rendering**

On startup, seed the deterministic demo records only when there are no commissions. Replace the current source selector with mode filters and summary counts excluding `source === 'demo'`. Render five assisted steps (`故事与素材`, `方案沟通`, `资产确认`, `生产`, `交付`) and five production steps (`故事与资产`, `生产确认`, `报价与打样`, `制作`, `实体交付`). Reuse `drawWork` for selected assets; keep the existing creation link only in the assisted branch after explicit user confirmation.

- [ ] **Step 5: Remove user-facing digital delivery actions from the main flow**

Replace customer preview/ZIP export controls with physical production fields, quote confirmation, progress state, and manual entity-delivery recording. Keep existing export helpers untouched for backward compatibility, but do not render or call them from the redesigned main path.

- [ ] **Step 6: Run browser and domain tests**

Run: `node --test tests/operator.test.js tests/operator-agent.test.js`

Expected: PASS.

Run: `node tests/operator.browser.js`

Expected: PASS with no page errors or paid-generation calls.

- [ ] **Step 7: Commit**

```bash
git add public/src/operator.js public/operator.html tests/operator.browser.js
git commit -m "feat: redesign operator workspace for physical production"
```

### Task 3: Match the approved desktop effect and protect responsive behavior

**Files:**
- Modify: `public/operator.css`
- Test: `tests/operator.browser.js`
- Test: `tests/operator-adversarial.browser.js`

**Interfaces:**
- Consumes: Task 2's semantic class names and rendered branch layouts.
- Produces: the approved warm-white, pale-blue, navy, and clay-orange desktop layouts with usable mobile stacking.

- [ ] **Step 1: Add visual and responsive assertions**

Assert the desktop overview has a two-column commission grid, the assisted detail has story/reference/conversation regions, the production detail has asset/check regions, keyboard focus remains visible, and a 390 px viewport has no horizontal overflow.

- [ ] **Step 2: Run the browser tests and verify failure**

Run: `node tests/operator.browser.js`

Expected: FAIL on new region or layout assertions.

- [ ] **Step 3: Implement the minimum CSS needed by the approved mockups**

Reuse existing variables. Add styles only for overview summary cards, mode chips, commission cards, branch step rails, three-column assisted detail, two-column production detail, conversation bubbles, check rows, and production timeline. Collapse all grids to one column under the existing mobile breakpoint and preserve `prefers-reduced-motion` behavior.

- [ ] **Step 4: Run focused regression tests**

Run: `node tests/operator.browser.js`

Expected: PASS and produce updated desktop/mobile screenshots.

Run: `node tests/operator-adversarial.browser.js`

Expected: PASS for per-tab ownership, stale-version handling, and no accidental paid calls.

- [ ] **Step 5: Run the complete test suite**

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add public/operator.css tests/operator.browser.js tests/operator-adversarial.browser.js
git commit -m "style: align operator workspace with approved mockups"
```
