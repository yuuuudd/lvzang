# AMap Integration Implementation Plan

> **For agentic workers:** Use the available collaboration tools to implement these bounded tasks. The user has authorized fixing the map and integrating AMap. Account login and key creation remain with the user; implementation proceeds while awaiting credentials.

**Goal:** Replace assumed screen positions with AMap's real basemap, POI locations and walking/driving routes for the selected travel day.

**Architecture:** A small Node configuration endpoint exposes only the public JS API key. A fixed-host service proxy adds the private security code for AMap's JS SDK service requests. The frontend owns SDK lifecycle and latest-day rendering; shared pure helpers validate coordinates, select POIs without guessing, parse actual route geometry and generate coordinate-based navigation links.

**Tech Stack:** Existing HTML/CSS/ES modules, Node HTTP, AMap JS API 2.0 loaded from its official online endpoint, node:test, installed Playwright/Chrome. No additional packages.

## Global constraints

- Preserve the completed travel understanding feature, existing collections and saved itineraries.
- Do not read or change DeepSeek credentials; agents never read .env.
- AMap credentials are AMAP_JS_API_KEY and AMAP_SECURITY_JS_CODE in the ignored local .env. The private code is never returned to the browser.
- Keep local access at http://localhost:4180/travel.html and do not push GitHub.
- Use official online JS API, with serviceHost configured before script load.
- Only AMap POI lookup results become real-map markers. Catalog screen anchors, unverified catalog coordinates and model coordinates do not substitute for an unsuccessful lookup.
- Duplicate or uncertain POIs need explicit selection; unmatched stops remain visibly unresolved.
- Show provider route geometry and provider distance/time; never label straight lines as traffic routes or overwrite the accepted itinerary with asynchronous lookup results.
- Switching days or trips invalidates stale callbacks and removes old markers/routes; repeated budget-only renders reuse cached lookups.
- Map pan/zoom must not drag the surrounding workspace. Keep provider attribution and controls visible on desktop/mobile.
- When no key is configured, show a clear unconfigured state; retain the old illustration only as an explicitly labelled optional view.
- Live provider verification requires user credentials. Fixture tests must not claim successful real-provider validation.

## Shared contracts

`GET /api/map/config` returns `{provider:'amap',enabled:false,reason}` or `{provider:'amap',enabled:true,key,serviceHost:'/_AMapService'}`. It never returns securityJsCode.

`GET /_AMapService/<allowed-path>` forwards to the fixed official restapi.amap.com host (styles to webapi.amap.com only for the exact styles path), replacing key and jscode with configured values. Allowed paths cover SDK POI search/details, geocoding and walking/driving routing. Reject unsupported methods/paths, bound upstream time/response size, and never expose secrets in error bodies.

Create `public/src/travel-map-data.js` with:

```js
normalizeAmapLocation(value); // [lng,lat] or null; AMap LngLat/array/object/string supported
selectAmapPlace(pois,{name,city,aliases=[]}); // {status:'matched'|'ambiguous'|'missing',place?,candidates:[]}
parseAmapRoute(result); // {path,meters,seconds} or null; SDK result.routes[0].steps[*].path
amapNavigationUrl({position,name,fromPosition,fromName,mode='walk'}); // coordinate-based URI or ''
```

Normalized place objects have `{id,name,address,city,position}`. A unique normalized exact/alias match can be accepted; multiple or fuzzy matches stay candidates for user confirmation. Only finite valid longitude/latitude pairs are accepted. Navigation uses coordinate=gaode and URL-encoded place names.

## Task 1 — Shared location and route data (amap_data)

**Files:** Create `public/src/travel-map-data.js`, `tests/travel-map-data.test.js`.

- [x] Cover valid LngLat/array/string coordinates, invalid/null values, unique vs ambiguous names, wrong-city candidates, same-ID duplicates, route geometry and coordinate navigation.
- [x] Implement the four interfaces above and normalize provider text with bounded string values.
- [x] Verify no unverified point is silently selected and malformed geometry returns null.
- [x] Run `node --test tests/travel-map-data.test.js` and send exact export contracts to the frontend agent.

## Task 2 — Configuration and service proxy (amap_backend)

**Files:** Create `amap-service.js`, `tests/amap-service.test.js`; modify `server.js`, `.env.example`.

- [x] Add optional `amapJsKey` and `amapSecurityJsCode` createApp parameters using local environment defaults; route map requests before static fallback.
- [x] Implement `/api/map/config` with missing/both-present cases and no private-code output.
- [x] Implement a fixed-host allowlisted GET proxy for SDK services, replacing caller-supplied credentials, preserving valid JSONP/content type and bounding time/body size.
- [x] Test disabled configuration, normal JSON/JSONP responses, forced credentials, refused paths/methods, upstream failure and secret redaction using an injected fetch function.
- [x] Add new frontend modules to the explicit static allowlist and add blank credential fields to `.env.example`.
- [x] Run `node --test tests/amap-service.test.js` and existing server tests; do not load .env in tests.

## Task 3 — Real map lifecycle and daily UI (amap_frontend)

**Files:** Create `public/src/travel-map.js`, `tests/travel-map.browser.js`; modify `public/src/travel-workspace.js`, `public/src/travel.js`, `public/travel.html`, `public/travel-workspace.css`; update map-specific old browser expectations when needed.

- [x] Load config and online SDK exactly once; set `_AMapSecurityConfig.serviceHost` before loading with PlaceSearch, Walking, Driving and Scale plugins. Handle load failure/timeout with visible retry.
- [x] Create a visible true map viewport; search current-city POIs, accept only helper-confirmed matches, render markers with titles, and expose candidate/address selection for unresolved places.
- [x] Query walking/driving between consecutive resolved stops, draw actual provider geometry and label distance/time. Do not bridge unresolved stops or draw artificial paths on failure.
- [x] On every daily render, clear old overlays immediately and protect asynchronous updates with a generation counter. Cache confirmed lookups; day selection remains synchronized with route and time.
- [x] Update itinerary navigation links only with resolved coordinates; otherwise label the existing name-search fallback as search.
- [x] Keep workspace drag on the map node header while map interactions pan/zoom the map. Verify attribution and controls within the mobile viewport.
- [x] Test with a mocked SDK and local fixture config: configured map, missing key, POI ambiguity/failure, real geometry parsing, single point, empty day, multi-city/day switch, stale callbacks, retry and interaction isolation.
- [x] Run the new map browser flow plus five existing flows; keep travel understanding behavior unchanged.

## Integrated verification (root)

- [x] Inspect the integrated diff and run npm test plus all six browser flows.
- [x] Restart the owned localhost server; inspect the current page's map status and preserve the real profile/itinerary.
- [x] If user supplies credentials, configure them locally without printing, restart, and verify real AMap POI markers, route and day switching. Otherwise report explicitly that live activation is pending the user's Key/security code.
- [x] Save a user-facing setup guide with official references and a screenshot in outputs; report completed behavior, validation and remaining credential dependency.

## Official references

- Preparation: https://lbs.amap.com/api/javascript-api-v2/prerequisites
- Security service proxy: https://lbs.amap.com/api/javascript-api-v2/guide/abc/jscode
- POI search: https://lbs.amap.com/api/javascript-api-v2/guide/services/autocomplete
- Route planning: https://lbs.amap.com/api/javascript-api-v2/guide/services/navigation
- Walking route geometry example: https://lbs.amap.com/demo/javascript-api-v2/example/walking-route/walk-custom
