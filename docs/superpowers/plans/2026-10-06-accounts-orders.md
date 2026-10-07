# Unified Accounts and Orders Implementation Plan

> Use superpowers:executing-plans inline. User authorized immediate execution after design.

Goal: one login entry, server-enforced roles and persistent customer-to-operator order flow across independent browsers.
Spec: ../specs/2026-10-06-accounts-orders-design.md
Architecture: native Node crypto and atomic local JSON/files; reuse browser creator and operator domain. Production server opts into accounts, existing isolated legacy tests retain old scope.

1. Add `account-workspace.js` for accounts/sessions/owned orders/assets; tests cover registration roles, owner access, persisted updates and stale revisions.
2. Integrate `/api/auth/*` and `/api/orders/*`, page gates and ownership checks into server.js; expose public login only, reuse existing model worker for previews.
3. Add `portal.html`, `orders.html`, shared account client/bar; account-scoped local storage preserves first-owner legacy records.
4. Bridge selected local work/creation results to server orders; default operator queue shows received requests, manual local entry remains secondary.
5. Verify independent customer/operator contexts through submit/review/result/confirmation/delivery, access denial, restart and original regressions. Read-only final review, no paid image/model calls for testing.

Review focus: no self-granted operator role; no customer reads of another user's order/file or internal notes; async results bind order ID/version; stale writes fail; user refresh/new browser receives server data.
