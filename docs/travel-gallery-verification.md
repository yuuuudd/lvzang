# 旅行合集层级改造交付 · 2026-10-06

入口：`http://localhost:4181/collection.html#world/canvas`。

已实现：主画布只显示合集封面；进入合集后多模型同屏并分别旋转、复位；单件放大/缩小、自动旋转、下载及返回；返回主画布保留位置和缩放。浏览时仅显示合集信息、照片/故事、导出和折叠进度，创建时才显示制作表单。

模型展示直接读取原始GLB，与打印检查分离。已有三个模型的原文件未重新生成，旧预览缓存已本地修复；水乡夜航的非实体打印问题仍保留在报告中。参考图在预览失败时明确标记，不冒充可旋转模型。模型默认视角根据表面颜色/投影信息选择，用户可继续旋转与复位。单件原照片已与对应来源照片绑定。

合集画沿用拾光原有生成接口。新的一键任务会生成合集画；已有模型合集可单独补画，补画不重试失败模型；仅存照片的合集也可只生成封面，不调用3D建模。封面提交不确定时可填写原任务编号恢复。没有给已有合集自动发起新的付费封面或模型任务。

同一浏览器来源下的旧拾光记录自动复制导入，原记录不删除；原合集画作为入口。缺少原GLB但保留网格的旧作品可恢复为有效GLB。旧展柜与预制城市模型保留。封面、原照片和模型进入完整备份；四件以上旧作品可恢复。新任务开始前先保存旅行照片与故事，即使生成失败也保留合集入口。

验证：
- `npm test`：206项通过、0失败。
- `node tests/travel-gallery.browser.js`：层级导航、返回位置、多模型独立旋转、打印失败仍显示真实GLB、自动合集画、封面/原照片/模型备份、桌面和手机。
- `node tests/shiguang-gallery.browser.js`：旧合集画、四件网格作品导入、有效GLB恢复、备份，以及原拾光记录不变。
- `node scripts/verify-gallery-live.mjs`：实际4181服务中三个已保存GLB均能同屏旋转，水乡夜航显示原模型；详情与手机无页面错误或横向溢出；没有提交付费生成。
- Impeccable机械检测无发现。截图位于 `artifacts/travel-gallery/` 和 `artifacts/travel-gallery-live/`。

服务已在没有进行中任务时重载，仍读取原有服务端密钥。尚未执行真实付费封面生成；新封面流程以外部服务替身验证。单机持久服务、浏览器本机收藏的运行范围不变。源代码未提交或推送。

## 背景资源与最终提示词

使用内置 `image_gen` 生成，随后只转换为WebP；没有把按钮、文字或模型画进背景。

- [主画布背景](../public/assets/travel-canvas-bg.webp)：淡蓝水彩湖岸与留白。
- [展厅背景](../public/assets/travel-gallery-bg.webp)：柔光空展厅，用于承载实际WebGL模型。

主画布最终提示词：

> Create a production-ready BACKGROUND IMAGE ONLY for a Chinese travel memory canvas app. Wide landscape 3:2 composition, high-resolution raster. No text, no lettering, no logos, NO UI, NO cards, NO photos, NO models or pedestals. Airy refined pale sea-salt blue and warm ivory travel watercolor environment. Center and lower 70 percent must remain extremely quiet, low-contrast pale blue paper with nuanced natural watercolor washes and soft diffuse daylight, suitable for placing interactive travel cover cards above it. Upper-left and far-right margins only: a delicate restrained scene of distant Jiangnan mountains, lake shoreline, one very small pavilion and light autumn branches, watercolor blended into paper; not dense foliage, not decorative clipart. Handcrafted elegant album atmosphere, fresh blue-gray (#EAF1F5), warm white (#FFFEF9), faint moss and muted ochre at margins, no yellow-gray cast or neon lime. A few truthful paper fibers visible very gently, not noisy grain. Large intentional negative space. This is a background asset for actual web UI, not a screenshot or product mockup.

展厅最终提示词：

> Generate a high-resolution 3:2 landscape BACKGROUND ASSET for an interactive 3D travel-keepsake exhibition, no UI or text. An EMPTY luminous refined small gallery, pale blue-white walls, tall elegant arched windows in the BACKGROUND only, soft daylight entering from the left, subtle outside garden silhouettes, a warm white lightly veined stone floor, gentle realistic soft cast light patterns. Front-on viewpoint at tabletop/display height with a very subtle perspective, calm clear lower 70 percent floor area reserved for THREE SEPARATE interactive 3D objects to be overlaid. No actual objects, no pedestals, no furniture, no people, no plants in foreground, no posters, no signs, no text or lettering, no decorative clutter. Airy sea-salt blue #EAF1F5, warm ivory #FFFEF9, quiet ink blue-gray shadows. Soft optical background depth but floor remains legible, beautiful natural material, elegant restrained museum atmosphere. Do not create yellow/beige lighting or dark corners. It must be a practical subdued environment image behind WebGL models, not a screenshot or a finished exhibition with objects already placed.
