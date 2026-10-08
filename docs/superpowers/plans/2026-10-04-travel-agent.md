# 旅藏 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for inline execution. Steps use checkbox syntax.

**Goal:** 在原项目实现游客规划、探索收藏、分享与商家需求管理的比赛体验。

**Architecture:** 原生 ES modules + Node createApp；新增独立 travel.html，不覆盖拾光功能。真实 DeepSeek 编排与明确标记的本地策划模式共用结构化路线。

**Tech Stack:** Node 24、原生 HTML/CSS/WebGL、node:test、Playwright。

**Spec:** docs/superpowers/specs/2026-10-04-travel-agent-design.md

## Global Constraints
- 不自动抓取第三方平台；导入正文或截图；出处不等于读取成功。
- 不自动调用付费图像/三维生成；真实文字调用需要用户主动发起。
- 模拟签到、无实时报价、生产与支付边界在对应操作可见。
- 保留原入口和现有未提交文件。

## Review Focus
- 空信息/不支持目的地：仍有方向推荐且不冒充目标地点。
- 攻略注入与 AI 非法地点：服务端验证，证据指向已有输入。
- 多次修订/刷新/存储失败：前一方案保留、收藏持久化、失败可见。
- 恶意/过大分享：长度和结构验证、无脚本注入、只读导入。
- 需求重复/不同商家视角：本机标注、幂等提交、不伪造付款。

### Task 1: 路线与 Agent 服务
Files: travel-agent.js, public/src/travel-catalog.js, public/src/travel-domain.js, server.js, tests/travel-agent.test.js.
Interfaces: planTravel(body, options), normalizeRequest(body), planFromCatalog(input, analysis), analyzeNotes(notes).
- [x] 写失败测试：空推荐、需求修改、地点去重、来源、非法 AI 返回、输入限制、无 key。
- [x] 运行 node --test tests/travel-agent.test.js，确认失败。
- [x] 实现本地资料、真实多阶段编排、POST API 与静态白名单。
- [x] 测试通过，检查原服务回归。

### Task 2: 收藏、分享与 STL
Files: public/src/travel-state.js, public/src/souvenir-mesh.js, tests/travel-state.test.js.
Interfaces: readState/writeState, unlock, addRequest/addQuote, encodeExhibition/decodeExhibition, makeSouvenir(id), souvenirSTL(id).
- [x] 写失败测试：持久化、非法分享、重复需求、封闭 STL。
- [x] 实现状态、分享版本与无个人资料 payload、模型几何。
- [x] 运行独立测试，保存结果。

### Task 3: 游客与商家界面
Files: public/travel.html, public/travel.css, public/src/travel.js, public/assets/travel-world.webp, public/index.html.
- [x] 固定视觉规范、生成微缩地图资产、实现全部体验阶段及真实 API 入口。
- [x] 复用 3D preview；商家活动/报价持久化；衔接原定制工具。
- [x] 浏览器验证空输入、导入、修订、解锁、刷新、分享和报价，以及移动端。

### Task 4: 交付验证
Files: tests/travel.browser.js, docs/travel-demo.md, README.md.
- [x] 运行 npm test 与端到端浏览器测试，修复失败。
- [x] 检查渲染截图、无 JS 异常、资源加载与当前规格逐项一致。
- [x] 更新演示说明与运行入口，保留未接入外部服务说明。

