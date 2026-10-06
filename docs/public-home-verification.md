# Public homepage verification · 2026-10-06

Implemented the approved public homepage, people-and-landmark illustration, optional asset/collage covers, guest template experience, local user/operator identity picker and personal collection navigation. Existing studio URLs are /index.html and /simple.html; the root URL is the public homepage. No package dependencies added.

Passed:
- `npm test` (full suite; see tmp/public-home-suite.log).
- `node tests/public-home.browser.js`: guest entry, cover switching, uploads and story preview, real sample mesh rotation, cancel identity without losing the draft, save/reload, timeline/map, model and photo detail, operator entry/exit, guest storage rebinding, resumable submission with source retained, desktop/mobile. No external paid requests.
- `node tests/travel-gallery.browser.js`: original automatic collection flow with controlled provider fixtures, two independent GLB previews, cover toggle, camera restoration, model/photo/cover backup and mobile layout. No external paid requests.
- JavaScript syntax checks and independent review of the identity/storage/upload changes.

Screenshots: artifacts/public-home/home-desktop.png, home-mobile.png, profile-desktop.png, profile-mobile.png, template-mobile.png.

Assets: public/assets/people-garden.png is a built-in ImageGen illustration; its exact prompt and source are recorded in public/assets/people-garden-source.md. Rotatable previews reuse the existing simpler sample meshes. Uploaded photos are saved with stories; static illustration does not claim to be an individualized generated mesh.

The mechanical design check reported one cream-background warning. The palette follows the user-approved mockup, so it was retained. Preserved existing uncommitted work. Concurrent product-rule edits affected an intermediate full-suite run; the final full suite was rerun after those edits settled and passed.
# 收藏页加载修复（2026-10-06）

旧任务归属恢复曾通过账户模块的顶层等待阻塞整个页面。将恢复请求挂起可复现静态顶栏与“正在打开你的旅行收藏…”；现改为后台恢复，保留原记录，失败后仍可在下次进入时重试。相同收藏页内选择用户也会重新载入，避免继续使用游客存储。`tests/public-home.browser.js` 覆盖身份选择后重载及恢复请求等待时个人主页仍在 3 秒内显示。
