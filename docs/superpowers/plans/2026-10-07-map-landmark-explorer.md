# 3D Landmark Map Explorer Implementation Plan

> **For agentic workers:** Use the available collaboration tools for bounded file ownership, then root integration and live verification. The user requested the earlier 3D landmark character on the real AMap map, and confirmed selecting an origin before a destination.

**Goal:** Make verified scenic buildings prominent and clickable on a 3D map, with an independent origin/destination journey estimate.

**Architecture:** Keep AMap's real basemap, POI coordinates and Walking/Driving geometry. Display miniature building models as custom markers at verified POIs. An immutable selection reducer drives a compact journey inspector; selected journeys never rewrite the accepted itinerary.

**Tech Stack:** Existing JavaScript ES modules, local geometry/canvas rendering, AMap JS API 2.0, node:test and Playwright. No new packages.

## Global constraints

- Inherit the current light travel workspace, typography, yellow-green actions and preserved 3D landmark identity. This is a map component extension.
- Do not read, print or change provider credentials. Use the already configured local server for root live verification only.
- Preserve saved profiles, chat, itineraries, collections, daily selection and existing navigation.
- Marker positions and journey geometry come only from AMap. Miniature architecture expresses landmarks and is not a measured building model.
- Show all accepted trip landmarks, distinguish today's stops, and use only today's stops for the automatic daily route.
- First building click selects origin; another selects destination. Same origin click retains origin. Later building clicks change destination until the user changes origin or clears.
- Origin/destination comparison does not add, remove or reorder itinerary stops.
- Clearing, day/trip switching, map failure and illustration switching invalidate stale journey results.
- Keep uncertain locations unresolved, explicit address confirmation, visible failure/retry, route request caching, map attribution and workspace interaction isolation.
- View controls, building buttons and journey actions have keyboard focus, readable labels and mobile targets.
- No GitHub push or production deployment.

## Interfaces and ownership

`public/src/travel-map-selection.js` (amap_data):

```js
emptyJourneySelection(); // {originId:null,destinationId:null,focusId:null,revision:0}
selectJourneyStop(state,id); // first origin, then destination; immutable
setJourneyOrigin(state,id); // clear destination; origin and focus become id
setJourneyDestination(state,id); // requires a different origin
swapJourneySelection(state); // swap only a complete pair
clearJourneySelection(state); // empty pair, revision increases
reconcileJourneySelection(state,ids); // clear if either endpoint disappears
```

`public/src/travel-map-landmarks.js` (amap_frontend):

```js
createLandmarkMarker(stop,{index=0,dayIndex=null,isToday=true}={}); // HTMLButtonElement, data-stop, aria-label
setLandmarkState(element,{origin=false,destination=false,focused=false}={}); // classes + accessible state
```

The visual module renders recognizable miniature 3D building geometry on a canvas, uses the existing catalog/mesh where useful, and has a readable generic place fallback. It does not call services or own selection events. No continuously running render loop.

`createTravelMap().render(plan,{landmarkStops=plan.stops}={})` (root) receives current-day stops plus full-trip context. `renderMap(plan,collection,landmarkStops)` (root) forwards this context from `renderRoute` and preserves it when switching views. Existing callers may omit context.

Root owns `travel-map.js`, `travel-workspace.js`, `travel.js`, `server.js`, `public/travel.html`, integration tests, docs and live verification. Frontend owns only the new landmark visual module and dedicated `public/travel-map-explorer.css`. Data agent owns only the selection module and its unit test.

## Task 1 — Selection behavior

- [x] Add tests for first/second/same/new destination clicks, explicit origin replacement, swapping, invalid IDs, disappearing endpoints and immutable input. A complete comparison has distinct IDs.
- [x] Implement the interfaces above with bounded nonempty string IDs and monotonic revision changes only on actual selection changes.
- [x] Run `node --test tests/travel-map-selection.test.js` and send exact contracts to root.

Example acceptance:

```js
const start = selectJourneyStop(emptyJourneySelection(),'gz-museum');
const pair = selectJourneyStop(start,'gz-square');
assert.equal(pair.originId,'gz-museum');
assert.equal(pair.destinationId,'gz-square');
assert.equal(start.destinationId,null);
```

## Task 2 — Landmark visuals

- [x] Create crisp, lighted miniature building geometry for Guangzhou museum, square, tower and opera. Preserve distinctive silhouettes; give other catalog places compatible building miniatures and unknown places a neutral place symbol.
- [x] Return accessible landmark buttons with text labels, day/stop context and obvious selected endpoint states. Keep map panning independent from canvas and buttons.
- [x] Add dedicated responsive CSS for enlarged 3D map viewport, controls and inspector. Marker label states remain legible against provider tiles; user map controls remain visible.
- [x] Avoid unbounded animation/WebGL contexts; static previews retain meaning when motion is reduced or rendering is unavailable.
- [x] Run syntax checks on the new module and send root the exact DOM/CSS contracts.

## Task 3 — AMap integration and comparison

- [x] Use documented AMap 3D map options with selectable 3D/overhead view, rotation/reset/fit controls, and appropriate close-up zoom for real building blocks.
- [x] Locate full-trip landmarks through the existing city-limited POI flow. Today's route and navigation continue using current-day adjacency; markers expose full-trip context.
- [x] Add a focused-place inspector and origin/destination controls. Use the reducer; add a token for pair queries independent of day generation.
- [x] Reuse route requests/geometry cache for selected comparisons. Draw a distinct selected route and show provider distance/time or a specific retry state. Clear obsolete overlays/results immediately.
- [x] Add new modules/styles to the server static allowlist and preserve the current security proxy configuration.
- [x] Test confirmed/unresolved/same endpoint, changing endpoints during an in-flight query, mode switch, swap/clear, day/trip change, full-trip context, unchanged saved plan bytes, mobile actions and keyboard selection.

## Task 4 — Integrated verification and finish

- [x] Run `npm test` and six browser flows; use mocked services for regressions.
- [x] Root verifies the actual SDK 3D view, POI anchoring and selected Walking/Driving comparison with the configured local service.
- [x] Inspect desktop, mobile and actual user viewport as one batch; fix material issues in one batch and confirm at most once.
- [x] Run the Impeccable detector once on changed UI targets. Obtain a fresh finish review and record the component extension in a scoped surface brief without replacing global DESIGN.md.
- [x] Save updated instructions and a screenshot in outputs, leave the final local page open and report actual verification and limits.

## Direction contract

THESIS: recognizable landmark miniatures turn verified map locations into destinations the traveler can choose.
OWN-WORLD: the incumbent light workspace and yellow-green actions; miniature architecture, quiet labels, a concise journey inspector.
STORY: identify a building, choose an origin and destination, compare a real journey, keep the accepted itinerary.
FIRST VIEWPORT: the largest existing map node gains a 3D city field, prominent buildings and compact view controls; route comparison sits directly beneath it.
FORM: local extension in an established Operate surface; no concept tournament or new visual identity.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Verification record — 2026-10-07

295/295 unit tests and six browser flows passed. Actual SDK route queries passed on desktop, mobile and the user's 565px view. The first inspection found overlapping markers and an origin zoom that hid possible destinations; the bounded fix added deterministic presentation offsets with leaders to unchanged POIs, preserved the initial view and corrected station numbering. The final captures and detector report are local review evidence. Fresh review's only material finding was the stale DESIGN map paragraph; the bounded documentation correction was scored resolved, disposition ship, with the verdict recorded in the scoped surface brief.
