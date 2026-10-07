# Travel Understanding Implementation Plan

> **For agentic workers:** Use the available collaboration tools to implement the bounded tasks below and review the integrated result. The user has authorized implementation, so execution proceeds in this session.

**Goal:** Remember travelers' conditions across turns and reloads, ask targeted questions, and produce separate daily itineraries without silently dropping mandatory stops.

**Architecture:** A shared pure travel-profile module merges explicit user changes and marks missing/tentative facts. Existing dialogue orchestration extracts a patch in its first call, then either answers, asks follow-up questions, or plans. A daily scheduler and optional plan.days preserve the existing flattened stops interface.

**Tech Stack:** Existing HTML/CSS/ES modules, Node.js 24.5+, DeepSeek JSON output, node:test and installed Chrome/Playwright. No new dependencies.

## Global Constraints

- Keep secrets in the ignored local .env; never read or distribute credentials during agent delegation.
- Keep local access at http://localhost:4180/travel.html.
- Preserve ordinary Q&A, old version 1 records, collection, sharing and merchant behavior.
- A field omitted in a patch retains its old value; explicit clearing removes it.
- User facts outrank model assumptions. Imported notes, initial Guangzhou demo and assistant text do not confirm user conditions.
- Support 1–7 travel days; daily time is separate from day count.
- Budget includes amount, CNY currency, per-person/group/unknown scope, trip/day/unknown period and explicit included categories.
- Never claim verified traffic, opening hours, prices or accessibility without supporting data.
- No extra model call just to extract the profile: Q&A/follow-up 1, initial catalog planning 4, initial other-city planning 2. A budget/companions/start-time-only update can reuse the verified route after the first dialogue call.
- Save only final accepted results. Failure or cancellation keeps the last plan and profile.
- Do not push to GitHub during this task.

## Shared contract

`profile` has version 1, revision, fields and followUps. Each field is `{value,status}` where status is confirmed/tentative/missing. Fields are destination, dayCount, dailyHours, startTime, companions, budget, interests, pace, requiredPlaces and excludedPlaces. Companions contains count, description, adults, children and seniors; absent counts remain null. Budget contains amount, currency, scope, period and includes; ambiguous components stay unknown.

The first dialogue response may add `profilePatch` and `followUp`; existing `intent/reply/destination/constraints` remains supported. A successful follow-up returns `{kind:'clarify',status:'needs-info',assistantReply,profile,followUps,mode,trace}` with no new stops/input and preserves the old plan. Normal answers do not emit constraints. A final plan returns profile and `days:[{dayIndex,title,startTime,hours,stops,totalMinutes,freeMinutes}]`, plus flattened stops with dayIndex.

## Task 1 Profile and daily scheduling

**Files:** Create public/src/travel-profile.js, public/src/travel-schedule.js, tests/travel-profile.test.js.

**Interfaces:**

```js
emptyTravelProfile();
normalizeTravelProfile(value);
updateTravelProfile(previous, {text, patch, destination, hours}); // {profile, changed, changes}
travelProfileInput(profile, baseInput); // legacy-compatible input, hours means daily time
travelFollowUps(profile, {allowDefaults}); // at most two {field, question}
travelProfileSummary(profile); // [{label,value,status}]
buildDailyPlan(plan, profile); // enriched plan; throw for infeasible mandatory constraints
```

- [x] Write profile tests including this exact multi-turn scenario:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyTravelProfile,updateTravelProfile} from '../public/src/travel-profile.js';
test('only the changed budget is replaced',()=>{
  const first=updateTravelProfile(emptyTravelProfile(),{text:'广州三天，我们三个人，每人全程1000元，必去粤博，不去广州塔',patch:{destination:'广州',dayCount:3,companions:{count:3},budget:{amount:1000,scope:'per-person',period:'trip'},requiredPlaces:['粤博'],excludedPlaces:['广州塔']}}).profile;
  const next=updateTravelProfile(first,{text:'预算改为每人全程800元',patch:{budget:{amount:800,scope:'per-person',period:'trip'}}}).profile;
  assert.equal(next.fields.dayCount.value,3);
  assert.equal(next.fields.companions.value.count,3);
  assert.equal(next.fields.budget.value.amount,800);
  assert.deepEqual(next.fields.requiredPlaces.value,['粤博']);
});
```

- [x] Implement whitelist/type/range validation, explicit text parsing, pending-question short answers, city-specific place clearing, budget ambiguity and no-change revision behavior.
- [x] Implement balanced day allocation, reset each day's transit/start clock, preserve every required stop or return a specific infeasibility, and disclose spare/unscheduled time in sparse catalogs.
- [x] Run `node --test tests/travel-profile.test.js`; all assertions must pass without external API calls.

## Task 2 Agent workflow

**Files:** Modify travel-agent.js; create tests/travel-understanding.test.js. Root updates server.js static resource allowlist.

- [x] Extend the first dialogue prompt and conversationContext with profile and day groups. Do not let ordinary duration questions alter travel duration.
- [x] Reconcile explicit text with model proposals using Task 1 exports. Handle pending-question answers and a user request to draft with assumptions.
- [x] Return clarify before planning when destination/day count or supplied budget scope needs clarification. Include only changed profile previews and commit the final profile in result.
- [x] Pass the profile to catalog and unknown-city route planning. Separate day count and daily time; validate required/excluded places and feasibility before declaring ready. Reuse verified stops/day assignments after budget/companions/start-time-only updates, avoiding unnecessary route-generation calls.
- [x] Keep the legacy request path and tests valid; other-city suggestions retain null coordinates/blank sources and cannot unlock catalog souvenirs.
- [x] Run `node --test tests/travel-chat.test.js tests/travel-agent.test.js tests/travel-understanding.test.js`.

## Task 3 Persistence and daily UI

**Files:** Modify public/src/travel-state.js, public/src/travel.js, public/src/travel-workspace.js, public/travel.html, public/travel-workspace.css; create tests/travel-understanding.browser.js and extend focused state tests.

- [x] Add validated optional profile/day groups with old-record compatibility. Persist bounded chat in a separate lvzang.chat.v1 key so ordinary Q&A leaves the plan record unchanged.
- [x] Send independent profile every turn. Handle answer/clarify before ready validation; accepted follow-up can save profile without replacing plan.
- [x] Restore profile/history after reload; new-trip action resets planning conditions and chat while keeping collection/merchant data.
- [x] Render a visible requirements summary and accessible daily selectors; select a day to update map, route and time, and keep mobile controls within page width.
- [x] Keep streaming changes provisional and roll back plan/profile/chat on failure/cancel.
- [x] Run the four existing browser workflows plus the new one using local fixture responses. No .live.js scripts.

## Integrated verification

- [x] `npm test` passes legacy and new acceptance tests.
- [x] Verify Guangzhou three days, group/individual budget, mandatory/excluded aliases, a budget-only change, a normal museum question, short follow-up answers, and reload recovery.
- [x] Verify an impossible one-hour mandatory itinerary asks for adjustment and retains the old plan.
- [x] Verify Beijing/other-city plans group days and do not reuse Guangzhou artwork or catalog model IDs.
- [x] Restart the owned local server and refresh the current page only after tests pass; verify a short real DeepSeek follow-up and route without exposing the key.
- [x] Inspect the diff and git status; report behavior, tests and real-data limits.
