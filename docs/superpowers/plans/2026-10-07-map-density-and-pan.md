# Map density and panning implementation plan

**Goal:** Restore the user's working map and show more recognizable, selectable buildings without changing their accepted trip.

**Architecture:** The map keeps accepted stops and a separate optional exploration layer. All coordinates still come from AMap place verification. Map gestures stay inside the map; the workspace has independent pan and zoom controls.

**Tech stack:** Existing JavaScript modules, static Canvas landmark rendering, AMap JS API 2.0, Node 24 and Playwright.

## Constraints

- Preserve the saved Guangzhou three-day plan, budget, companions, exclusions, collection and conversation.
- An excluded Guangzhou Tower must not reappear in the exploration layer.
- Exploration landmarks have no itinerary day, price, duration or fabricated coordinates.
- Do not publish, commit credentials, or push this work.

## Task 1: Restore and prove map movement

- [x] Observe the actual user's map failure and stopped local server.
- [x] Restart Node as a hidden background process independent of the tool session.
- [x] Use real SDK projected POI anchors to assert panning in desktop and 565px views, while the workspace transform stays unchanged.
- [x] Improve `tests/travel-map.browser.js` so its provider fixture implements panning and the test checks movement of geographic projections.
- [x] Add explicit drag/zoom configuration and map zoom controls in `public/src/travel-map.js` and `public/travel.html`.
- [x] Provide a repeatable local background startup script with port-owner checks.

## Task 2: More buildings as an exploration layer

- [x] Add `public/src/travel-map-exploration.js` exporting `getExplorationLandmarks(city, {acceptedStops, excludedPlaces, excludedIds})`; use normalized complete names and aliases for deduplication/exclusions.
- [x] Add unit cases in `tests/travel-map-exploration.test.js` for the user's three accepted buildings plus four eligible explorers, city boundaries, aliases and immutable inputs.
- [x] Extend `public/src/travel-map-landmarks.js` with library, IFC, CTF and youth-palace models and the explicit “探索 · 未入行程” state.
- [x] Forward exclusions through `public/src/travel.js` and `public/src/travel-workspace.js` into the map view only.
- [x] Resolve explorers through existing AMap place lookup; keep daily route calculations restricted to accepted stops.
- [x] Add the exploration visibility control; switching it off clears endpoints that disappear, preserves remaining valid selections, and never saves a new itinerary.
- [x] Add the new module to `server.js` static allowlist.

## Task 3: Verify the user-visible result

- [x] Run unit and browser regressions, including explorer comparisons, map drag and independent canvas controls.
- [x] Run real AMap on desktop, 390px mobile and the user's 565px viewport; inspect compact building labels, controls and dragging in one batched visual round.
- [x] Make one material fix batch if needed, then one confirmation round.
- [x] Run the design detector once; get a fresh finish review that includes the user's rejected prior result.
- [x] Update the map surface brief and local startup documentation after the final corrections.
- [x] Reload the user's existing tab, verify its saved itinerary and seven buildings, and leave the local service running.
