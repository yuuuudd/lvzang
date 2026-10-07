# Public home implementation plan

Goal: Implement the user-approved public homepage, people/landmark templates, test identity picker and personal collection hierarchy.

Architecture: Reuse the existing plain HTML/JS server, account sessions, IndexedDB collection store and 3D preview. Public previews make no paid API requests. Test identity selection is an explicit local-server mode; existing authenticated API permissions remain intact.

Approved design: conversation and exec-dbed1075-bf78-403d-8606-92b913e52fe5.png.

- [x] Add a failing API/browser check for anonymous entry, role selection, templates, saving, persisted work, view switching and mobile layout.
- [x] Add public homepage and template experience, including illustrative product assets and real sample-model rotation.
- [x] Add local test identity sessions and replace stacked account bar with a shared header menu.
- [x] Move collection view switches into the personal page; support timeline, map and asset/collage covers.
- [x] Run the relevant browser flow, existing suite and desktop/mobile visual review; preserve existing uncommitted work.

Review focus: cancel identity selection without losing draft; unsupported/oversized uploads; persistence after reload; operator identity cannot save into user collection; map/timeline route and card identity stay consistent. No deployment or account password UI.
