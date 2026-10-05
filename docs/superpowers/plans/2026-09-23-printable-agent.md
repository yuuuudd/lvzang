# Printable souvenir agent implementation plan

User-approved scope: default white, at most four filament colours, real spatial/openwork geometry, inspection-driven one-step correction, history, two rear magnet pockets.

Architecture: retain the local Node server and existing WebGL triangle viewer. Use Manifold for actual solid booleans and geometry checks. Add a real Tripo mesh route, a bounded DeepSeek decision endpoint, and a deterministic open-arch scene for offline preview/verification. No paid generation is needed to validate local geometry. Agent actions and checks must reflect executed tools.

## Constraints
- White is default; 1–4 discrete part colours. STL remains colourless; coloured parts exported separately.
- Two rear blind pockets. Provisional 6 mm diameter × 2 mm magnet, 0.2 mm diametral clearance, configurable; at least 1.2 mm floor and 1.5 mm surrounding wall. Validate fit before generation/export.
- Unprintable/nonmanifold mesh is reported and cannot be silently exported as approved. No assertions of printability or cost without slicing/physical evidence.
- Use original inputs and snapshots in saved versions. No automatic unbounded paid retries.
- Existing uncommitted workspace is the user's working project; edit in place, preserve unrelated files, do not commit unrelated work.

## Tasks and contracts
1. Geometry: `manufacturing.js` exports `validatePrintSettings(input)`, `buildMagnetModel({glb,settings,scene})`. Returns triangle mesh + parts + measured report + exact pocket dimensions. Offline parametric architectural scene must have actual through-openings. Validate with manifold topology, volume and geometric hole intersection checks. Inputs are bounded.
2. Cloud: `cloud3d.js` exports `startModel(body,options)`, `readModel(id,options)` and `decideRepair(body,options)`. Tripo image-to-model, texture off; only allowlisted bounded HTTPS download; DeepSeek uses constrained actions based on observations. Mock external calls in runnable tests.
3. Server and UI: add locally owned task routes, mesh manufacturing endpoint, bounded agent inspection/repair, white viewer with backside view, colour and magnet controls, versioned local history. Keep old relief flow explicitly labelled and old records readable.
4. Verify: run all Node checks; inspect default white openwork sample, rear pockets, settings, agent evidence and history via browser. Live paid API not required; clearly report what is and is not tested.

## Review focus
Paid submission cancellation/resume; invalid magnets/colour counts; malformed/untrusted GLB; disconnected generated mesh; history with different settings; claims unsupported by actual checks.

## Progress
- Implemented geometry/GLB import, cloud adapter, bounded agent decisions, server routes, white/part-colour preview, rear view, adjustable pockets, and versioned browser history. Legacy relief remains explicitly labelled.
- Independent review completed. Fixed viewport centering, imported-mesh recheck handling, validation before paid requests, failed-job concept preservation, and resumed-job settings restoration.
- Verification: npm test passed 36/36; app/server syntax checks and git diff --check passed (existing CRLF warnings only).
- Live browser verification at localhost:4173: DeepSeek planned two people/three arches/detailed roof; measured 1 mm decorations caused an actual simplify decision; second build measured 1.5 mm minimum designed feature. Both versions persisted; initial version export disabled.
- Browser verified changing to four colours and 8 x 3 mm magnets: four same-coordinate part downloads, actual 8.2 x 3 mm rear pockets, new history entry; page reload restored settings, geometry and checks. White and four-colour previews and rear pockets inspected; no console errors. Page left on the saved white AI work.
- Limits: controlled arch library is not arbitrary landmark reconstruction. Imported GLB topology/connection/pocket checks are implemented; global wall thickness, support, slicing, cost, likeness and physical printing remain unverified. Tripo image-to-3D adapter covered by mocks and synthetic GLB tests, not a live paid generation.
- Prototype limits retained deliberately: local single-user in-memory cloud task ownership, browser-local history, and at most one parametric correction. No extra orchestration framework or cloud persistence added.
