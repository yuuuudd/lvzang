# Operator Workspace Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. The user explicitly authorized execution immediately after the design document; execute inline without another approval handoff.

**Goal:** Complete a browser-local digital commission from personal work/source material through creation, review, scoped delivery and feedback.

**Architecture:** Store each commission in the existing keepsake meta store with optimistic revision checks. Reuse the current single-piece creator and its history, then attach saved results to the commission; never introduce a second paid generation engine. Export only selected assets through fflate.

**Tech Stack:** Existing native HTML/CSS/ES modules, Node, IndexedDB, fflate, current DeepSeek API adapter patterns.

**Spec:** ../specs/2026-10-06-operator-workspace-design.md

## Global Constraints

- Keep existing working directory and user changes; no commit/push/deployment.
- Default sources are team self-tests; no fabricated paid orders, costs or print validation.
- Same-browser workspace, no remote-account claims.
- Opening/previewing a page must not submit a paid generation.
- Digital review and physical print validation remain separate.
- Unknown cost stays unknown; customer packages exclude internal notes and other commissions.

## Review Focus

- Late creator results must not overwrite newer brief or another commission.
- Stale browser saves must fail without losing current edits.
- Asset deletion/download failure must block complete export status.
- Sample/local-source requests must not create duplicates or fake real-business counts.
- Customer preview and ZIP must not reveal internal notes/costs or other photos.

### Task 1: Commission domain and scoped export

Files: create public/src/operator-domain.js, tests/operator.test.js; modify travel-keepsake-store.js for atomic meta revision save.

Interfaces: createCommission(body), reviseCommission(c,patch), confirmBrief(c), reviewCommission(c,{accepted,note}), exportCommission(c,store,{includePhotos}), saveCommission(store,c), listCommissions(store). Reviewer binding uses briefVersion and assetRevision.

- [x] Write and run failing lifecycle/export tests.
- [x] Implement bounded validation, version invalidation, optimistic save and asset selection.
- [x] Verify targeted tests.

### Task 2: Agent summaries and server entry

Files: create operator-agent.js, tests/operator-agent.test.js; modify server.js whitelist and POST /api/operator-summary.

Interface: summarizeOperator(body,{key,model,fetchImpl}) returns {summary,missing,next,source} for brief/review/delivery, validating bounded inputs and model output.

- [x] Fail tests for summaries and invalid response.
- [x] Implement real model invocation, no silent fallback, same-origin endpoint.
- [x] Verify API checks.

### Task 3: Workspace and creator bridge

Files: create operator.html, operator.css, operator.js, operator-bridge.js; modify app.js, travel-gallery.js, travel.html/travel.js navigation.

Interfaces: operator query carries only commission ID; creator initializes from saved source and manually triggered generation, saves operatorId/briefVersion on its record; attachOperatorArtwork(record) imports only that saved result. Workspace reuses previews and existing libraries.

- [x] Write initial browser smoke/lifecycle test and observe failure.
- [x] Implement forms, steps, selected asset previews, review, scoped ZIP, records and legacy request conversion.
- [x] Verify same commission creation round trip, no automatic calls, responsive layout and errors.

### Task 4: Backup and final verification

Files: operator-domain.js/operator.js backup functions; tests/operator.browser.js; docs/operator-verification.md.

Interfaces: operator backup contains validated commission records plus existing portable keepsake backup; restore validates references and rejects conflicting IDs.

- [x] Verify backup restore and privacy with meaningful checks.
- [x] Run whole unit suite, affected existing browser flows, new browser flow and detector.
- [x] Review final changes; fix important findings once and record results.
- [x] Open working result and report implemented scope/limitations.
