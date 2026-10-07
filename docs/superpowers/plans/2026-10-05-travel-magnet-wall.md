# 旅藏地图冰箱贴墙 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 本计划不授权自动创建或派发子代理。

**Goal:** 依据第一性原则与对抗性审查，做好“地图贴墙/收藏柜→3D作品详情→翻页回忆→实体定制需求”的本机产品；本轮不等待队友，不建设多人服务。

**Architecture:** 复用原生HTML/CSS/ES modules、WebGL预览、浮雕生成和Node静态服务，在现有旅藏页面增加独立收藏模块。新收藏与照片使用独立IndexedDB，旧旅行、展柜数据与分享协议保留；不换框架，不新建社交平台。

**Tech Stack:** Node.js >=24.5、浏览器IndexedDB/WebGL/Canvas、现有Playwright与node:test；首轮不增加npm依赖。

**Spec:** `../specs/2026-10-05-travel-magnet-wall-design.md`；实施前同时阅读规格和四张参考图。

## Global Constraints

- 本轮仅本机产品；真实邀请、跨设备网页分享、商家远程收单均在范围外。
- 默认收藏入口是地图墙，收藏柜同级切换；探索旅行与原照片创作入口仍可访问。
- 3D纪念品是视觉主角；故事只在回忆弹窗展开，定制表单只在定制弹窗展开。
- 冰箱贴高度50/70/90 mm，默认70 mm；旧摆件宽度规格保持原规则。
- 彩色与米白仅为预览选项；报价由供应方确认，不自动收费、生产、发货或真实AI生成。
- 模型、正面/背面预览及导出共用几何；首轮平背粘贴磁铁，不默认做孔或称已打印认证。
- 数据、照片、文字写入失败不得显示已保存；不覆写旧localStorage；示例明确标注且不自动写入。
- 单独完成用户这一块及必要存储/静态资源；不改Agent行为，不依赖队友接口，不主动开启子代理。

## Review Focus

- 同城不同旅行：按作品UUID独立保存；地图聚合不丢记录。
- 旧记录损坏或新库升级失败：不重置/覆盖旧数据，编辑保留并提示恢复。
- 图片过大、损坏或容量不足：失败不新增半件作品，不丢旧照片。
- 弹窗、后退与多次切换：恢复位置/焦点，释放WebGL，不出现后台动画累积。
- 模型示意与实物：高度/宽度不混用；不存在磁铁孔、刻字几何或报价时不声称已完成。

## 第一性原则与对抗性审查

| 必须成立的价值 | 反对者会怎样质疑 | 决策与验收 |
| --- | --- | --- |
| 收藏属于我 | 城市模型人人一样，为什么要保存？ | 独立旅行作品ID、日期、照片和作者故事；同城两次旅行不覆盖，打开能看到不同经历 |
| 作品本身值得看 | 只是漂亮图片贴在一块厚板上 | 彩稿与深度图独立；正侧背真实网格；关闭纹理后仍认得广州塔与骑楼 |
| 入口容易进入 | 我只有一件收藏，大片空地图浪费空间 | 0件用创作入口；1件作品优先；2件及以上地图墙；柜子随时可切换 |
| 收藏越多仍能用 | 同城贴满，地图互相遮挡 | 城市聚合计数与展开列表；用30件含重复城市数据验证，每件都能打开 |
| 回忆不会丢 | 浏览器清理后全部没了 | 首轮做含照片完整ZIP备份与恢复，显著说明本机保存；JSON元数据导出不算完整备份 |
| 看完想做实物 | 模型好看，但实际多大？背面如何？ | 高度/厚度及平背可见；冰箱情境有比例；预览与STL包围盒一致 |
| 定制不是假完成 | 刻字没进模型，提交也没人收到 | 刻字按需求标注，状态为本机草稿；可导出需求单，不显示已发送或生产 |
| 多人记忆有意义 | 用头像装饰就叫社交？ | 真正按作者组织照片故事；本轮只验证共同记忆阅读，不以假邀请证明传播 |

发布前按上表逐项找失败证据。外观通过但任何核心验收失败，不能声称本轮完成。

## 文件边界与顺序

| 顺序 | 交付内容 | 独立验收 |
| --- | --- | --- |
| 1 | 一枚广州冰箱贴与真实3D预览（Task2先做广州） | 米白无纹理状态仍有可识别的立体结构 |
| 2 | 收藏协议与新库（Task1），接好广州创建/保存 | 同城两次旅行可分别保存 |
| 3 | 地图墙、收藏柜、详情（Task3），再扩展杭州/苏州素材 | 0/1/多件入口合理，每件可打开 |
| 4 | 翻页回忆与编辑（Task4） | 照片故事刷新可恢复 |
| 5 | 定制、本机需求、分享及完整备份（Task5—6） | 规格可导出，ZIP可在干净浏览器恢复 |
| 6 | 对抗性回归与用户试用（Task7） | 核心闭环、手机操作和失败恢复通过 |

新增 `travel-collection.js`、`travel-magnet.js`、`travel-collection.css` 与 `travel-keepsake-store.js`；在 `travel.js` 做模块接入，`server.js` 仅登记资源。现有 `travel-state.js` 不改格式，`souvenir-mesh.js` 保持旧摆件实现。没有独立价值的模块不继续拆分，不新增框架或状态管理依赖。

### Task 1：收藏协议与本机存储

**Files:** Create `public/src/travel-keepsake-store.js`; Test `tests/travel-keepsake-store.test.js`, `tests/travel-keepsake-store.browser.js`.

**Interfaces:**
- `openKeepsakeStore(): Promise<Store>`；Store提供 `list(): Promise<Keepsake[]>`、`get(id): Promise<{keepsake,memories}|null>`、`save({keepsake,memories,photos}): Promise<void>`、`deleteKeepsake(id): Promise<void>`、`getPhoto(id): Promise<Blob|null>`、`saveRequest(request): Promise<Request>`、`listRequests(): Promise<Request[]>`。delete同时移除所属回忆与无其他引用照片，已有需求保留规格快照并标注原作品已删除。
- `readLegacyKeepsakes(state): Keepsake[]` 提供只读旧摆件映射；`importLegacyKeepsake(state,placeId): Promise<Keepsake>`复制一次并标记来源，不写旧state。
- 数据形状与限制严格引用Spec；UI用UUID索引，modelRef与placeIds不是作品主键。

- [ ] 先补协议纯函数测试：同城两件独立UUID、合法尺寸、20字刻字、错误参与者引用与非法数量；运行 `node --test tests/travel-keepsake-store.test.js`，确认尚未实现的断言失败。
- [ ] 实现协议校验、独立新库、事务保存；对象/记忆/照片同事务完成；本机Request先按完整规格和作品去重。
- [ ] 用真实浏览器IndexedDB验证保存与刷新、Blob恢复、写入失败回滚、旧损坏数据不覆写、旧作品只复制一次；运行 `node tests/travel-keepsake-store.browser.js`。
- [ ] 提供一份广州共同回忆、杭州个人回忆、苏州共同回忆的统一演示数据，标注origin=demo；UI从同一数据源渲染。新作品删除在确认后事务执行，照片无其他引用时才移除。
- [ ] 测试通过后仅提交本任务文件，提交信息 `feat: add local keepsake storage`。

### Task 2：先做好一枚真实3D冰箱贴，再扩展三城

**Files:** Create `public/src/travel-magnet.js`, `public/assets/magnets/`（三组成对透明正视彩稿与深度图）；Modify `public/src/preview.js`, `public/src/relief.js`, `server.js`；Test `tests/travel-magnet.test.js`, `tests/travel-magnet.browser.js`.

**Interfaces:**
- `loadMagnet(modelRef,{heightMm=70,colorMode='color'}={}): Promise<{mesh,uv,texture,widthMm,heightMm,totalDepthMm}>`；只接收项目登记的三种modelRef。
- 复用 `reliefFromImage`、`binaryStl`、`createPreview`；`reliefFromImage(image,options)`新增可选 `options.heightMap`（与image等尺寸的Float32Array，范围0..1），提供时覆盖灰度推深度，缺省保持原行为。为预览增加 `setView('front'|'side'|'back')` 和 `setZoom(value)`，保留旧view接口。
- `renderMagnetThumbnail(modelRef): Promise<Blob>` 输出来自该几何的PNG缓存，供地图、柜子与分享卡使用；未知模型显示加载错误及回退，不换其他模型。

- [ ] 先测有限三角形、平背、缩放后真实高度70mm、单色不改变几何；运行 `node --test tests/travel-magnet.test.js`。
- [ ] 先单独制作广州彩稿与深度图：连续底板、水面、建筑、塔身有明确不同几何高度；彩色变化不改变网格。制作70mm样件，米白关闭纹理仍需识别塔与骑楼；这一门槛未过先修模型，不做更多页面。通过后再扩展杭州、苏州。缩略图不能截图效果图中的带光影模型。
- [ ] 给WebGL增加命名视角与缩放按钮；destroy移除监听器、取消动画及观察器；隐藏页面/减少动态效果时停止自转。不把彩色STL称为彩色生产文件。
- [ ] 浏览器验证转动改变画面、背面平整、视角按钮和触控可用、WebGL失败有静态回退；STL包围盒与所选高度一致。
- [ ] 核对三枚效果及白名单，确认模块/素材返回正确MIME；测试高度图非法值/尺寸不符及旧无heightMap行为兼容；提交 `feat: add travel relief magnets`。

### Task 3：地图入口、收藏柜与详情页

**Files:** Create `public/src/travel-collection.js`, `public/travel-collection.css`, `public/assets/china-collection-map.svg`；Modify `public/travel.html`, `public/src/travel.js`, `server.js`；Test `tests/travel-collection.browser.js`.

**Interfaces:**
- `initCollection({root,store,legacyState,onNotice}): {show(view='map'),destroy()}`；从Task1读取作品，Task2读取模型，不在渲染函数中新增收藏。
- URL状态：`#collection/map`、`#collection/cabinet`、`#collection/item/<UUID>`；原 `#exhibition=` 优先交旧分享处理。相同页面上的探索旅行仍保留原入口。
- 回忆/定制弹窗使用详情状态后缀 `/memories`、`/customize`；未知UUID显示不存在并允许返回。

- [ ] 浏览器先测地图/柜子切换、个人/共同筛选、同城两件聚合、打开详情与后退，确认新入口尚不存在时失败。
- [ ] 增加地图墙收藏入口，独立于原路线地图；0件显示添加，1件突出作品，至少2件突出地图墙。用完整、可分发轮廓SVG，记录来源与归一化三城锚点；人工检查城市位置和离岛表达。
- [ ] 缩放按钮、拖动和触控操控地图；同城数量点击展开列表，未定位城市进入列表；不把地图可拖动称为地点导航。
- [ ] 地图与柜子用几何缩略图；详情只启动一个WebGL实例。摆件仍调用旧模型；两视图看到同一数据且保留最近视图、筛选和缩放。
- [ ] 新作品入口支持选城市/模型、标题、日期、个人/共同、参与者；照片故事在下一任务中补。空状态有明确入口；主动打开演示不污染正式数据。
- [ ] 桌面与手机验证没有页面横向溢出，后退与刷新恢复详情，原探索路线正常；提交 `feat: add magnet wall and keepsake detail`。

### Task 4：翻页回忆与照片编辑

**Files:** Modify `public/src/travel-collection.js`, `public/travel-collection.css`；Test `tests/travel-memories.browser.js`.

**Interfaces:** 使用Task1的save/get/getPhoto；回忆顺序按memoryIds，作者指向participants。桌面原生dialog，手机同一组件全屏；与定制弹窗互斥。

- [ ] 先测三页翻页边界、同件作品添加照片和故事、刷新恢复、个人/共同作者显示；无照片页仍可阅读。
- [ ] 实现一本一件、一页一段的照片册；只在打开后加载照片，空页提供添加入口，第一页/最后一页禁用对应箭头。
- [ ] 接入选择照片、压缩、日期、地点、作者、故事编辑；采用Spec限制，遇到损坏或超限图片不保存半条记录。ObjectURL离开时释放。
- [ ] 对未保存编辑在关闭/切换时确认继续或放弃；Esc和浏览器后退关闭后恢复详情焦点，不嵌套额外dialog。
- [ ] 邀请按钮首轮明确“多人协作待接入”，不伪造链接或远程成功。只读旧分享页不能编辑。
- [ ] 测容量不足、图片错误、弹窗多次开关及移动端操作；运行 `node tests/travel-memories.browser.js`；提交 `feat: add paged travel memories`。

### Task 5：实体定制弹窗与本机需求

**Files:** Modify `public/src/travel-collection.js`, `public/travel-collection.css`, `public/travel.html`；Test `tests/travel-customize.browser.js`.

**Interfaces:** 提交Task1 Request，由listRequests显示收藏模块内“我的定制需求”列表；不建设商家功能，旧需求仍用原工作台。请求状态local-draft显示为“已保存到本机 · 待询价”。提供JSON需求单导出，包含实际模型版本及规格。

- [ ] 先测70mm默认高度、50/90mm切换、摆件宽度标识、数量1..20、刻字20字符、重复提交不重复建单。
- [ ] 实现单独定制弹窗；尺寸/颜色变化驱动Task2真实预览；情境用同一模型截图合成到冰箱/桌面背景，标记效果示意，不冒充试打照片。
- [ ] 刻字只作为需求时注明“刻字效果待确认”；首轮平背展示不包含已安装磁铁，不新增假磁铁孔。
- [ ] 保存作品ID、modelRef与版本、尺寸轴/数值、颜色、数量与刻字；UI显示已保存本机及未发送供应方，按钮提交期间禁用，失败可重试。
- [ ] 在收藏模块新增独立本机需求列表，展示完整规格和导出入口；无供应方报价不展示价格，不声称已收单。可从需求返回原作品。
- [ ] 运行 `node tests/travel-customize.browser.js`，验证关闭弹窗保留作品与回忆；提交 `feat: add magnet customization requests`。

### Task 6：分享卡、完整备份与新旧兼容

**Files:** Modify `public/src/travel-collection.js`, `public/src/travel-keepsake-store.js`；Create `public/src/travel-keepsake-backup.js`；Test `tests/travel-collection-share.browser.js`, `tests/travel-keepsake-backup.test.js`.

**Interfaces:** `exportKeepsakeCard(keepsake,{includeMemory=false}={}): Promise<Blob>` 输出PNG；默认只含模型缩略图、城市、标题与日期。用户明确勾选后才附照片/故事。

`exportKeepsakeBackup(store): Promise<Blob>` 输出ZIP（manifest.json、作品/回忆/需求、photos目录），使用已有fflate；`importKeepsakeBackup(blob,store): Promise<{imported,skipped}>`校验并单次事务导入。最多100件作品、ZIP最多100MB、解压总量最多200MB、单图片使用Spec上限；冲突ID默认跳过并列出数量，不覆盖旧库。原图案是应用版本资产，不打包个人密钥或旧旅行服务配置。

- [ ] 先测默认卡片不包含照片/故事，主动选择可附回忆；旧exhibition链接仍可独立打开且不写入新库。
- [ ] 用Canvas合成真实模型缩略图与文字；支持时用原生文件分享，否则下载。复制文案不附带不能访问的本机照片链接。
- [ ] 分享卡保存失败和用户取消原生分享不显示分享成功；导出与打开只读旧链接不触发收费生成。
- [ ] 完整备份在无记录的新浏览器导入后，作品、照片、故事与需求均可恢复；损坏manifest、缺照片、超限包或保存失败均回滚，不清空旧收藏。备份照片为已保存的压缩版本，在导出说明中注明。
- [ ] 运行 `node --test tests/travel-keepsake-backup.test.js` 与 `node tests/travel-collection-share.browser.js`；浏览器真实导入导出包含在后续完整链路中；提交 `feat: add keepsake sharing and backups`。

### Task 7：对抗性审查、整体验收与第一轮试用

**Files:** Create `tests/travel-magnet-flow.browser.js`, `docs/travel-magnet-verification.md`；根据结果只修相关模块。

- [ ] 跑完整链路：创建广州共同收藏→地图打开→旋转→添加三段记忆→刷新→翻页→70mm单色询价→本机需求列表→导出分享卡→完整ZIP备份→干净浏览器导入恢复；另测杭州个人收藏及同城第二次旅行。
- [ ] 测1440×900、390×844、360×800；测试焦点、Esc/后退、减少动态效果、缺WebGL、无照片、存储失败、坏记录和未知作品；检查pageerror及404。增加30件收藏含同城重复数据，确认每件可打开且地图聚合可用。
- [ ] 运行 `npm test`，以及现有 `node tests/travel-chat.browser.js`、`node tests/workspace.browser.js`、`node tests/workspace-recovery.browser.js`、`node tests/travel.browser.js`。旧测试如需适配新入口，保留原行为断言；不删除旧STL/存储恢复断言。
- [ ] 运行本计划新增browser脚本；逐张比较参考图，记录桌面、手机截图与实际限制。测试使用注入响应，不调用付费API。
- [ ] 找3组结伴旅行者和至少2位个人旅行者，观察能否自行找到作品、添加记忆、导出备份并进入定制需求。记录具体行为与失败，不诱导好评。一次人工切片与试打是“可打印”声明的前提；供应方报价与打样单独跟进，不阻塞本机软件验收。
- [ ] 更新验收记录与三分钟演示：先地图→打开模型→翻页→规格询价。提交 `test: verify travel magnet collection flow`。

## 本轮范围外

账号、实时多人编辑、邀请权限、跨设备网页分享、商家后端、支付、物流、Agent叙事改写与全国自动生成模型不进入本轮任务。共同回忆只是作品作者与故事组织，不建立社交关系链。今后单独规划，不预留大量空接口。

## 计划验收与实施方式

本计划只新增设计、执行文档及参考图，不包含代码实现。执行顺序按上方阶段表：先用Task2的广州样件证明3D质量，再进入Task1/3/4/5/6/7；杭州、苏州在地图阶段补齐。实施时逐任务检查、提交，不自动部署或创建新仓库。用户确认计划后采用当前会话直接执行；如果工作区存在未提交内容，先检查并保留，不用重置清理。
