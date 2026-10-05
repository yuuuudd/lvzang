# Travel Workspace Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement task by task.

**Goal:** 按用户批准的图 1，实现左侧持续对话、右侧可缩放方案画布与可见的实时修订。

**Architecture:** 保留原生 Web/Node。NDJSON POST 流传递真实 Agent 阶段与校验后的条件；对话、方案卡片、城市地图共享同一份状态，已有收藏/商家功能继续使用。

**Tech Stack:** Native ES modules, Node, WebGL, Phosphor SVG assets, Playwright.

**Spec:** DESIGN.md，批准效果图 artifacts/design/travel-workspace-2026-10-04/A-chat-and-canvas.png。

## Global Constraints
- 不用假计时器模拟模型活动；本地模式明确标记。
- 地图为城市导览示意，地点位置来自坐标；真实导航另行打开。
- 保留收藏、分享、STL、商家和旧创作入口；失败保留上一方案。
- 已有配置可默认选 AI，但不自动提交任何付费请求。

## Review Focus
- 连续追加需求时保留城市、兴趣与必去地点，删除约束必须生效。
- 流中断、上游失败、取消时保留上一方案，临时卡片不能冒充已保存。
- 未知城市不能复用苏州图片冒充；地图与路线使用同一城市。
- 拖动节点/画布不能吞掉按钮点击，键盘及移动布局可操作。
- 预算为用户上限，不能虚构已核实的总消费或报价。

### Task 1: 实时修订协议
- [ ] 增加预算、开始时间、必去/排除与真实阶段事件测试并确认失败。
- [ ] 更新需求归一化、Agent 输出校验和 NDJSON 路由。
- [ ] 验证阶段顺序、错误保留与现有 API 回归。

### Task 2: 图 1 工作台
- [ ] 生成两城市导览素材，加入图标和字体，记录已批准方向。
- [ ] 替换探索页，保留其余功能；实现对话、节点、修改对比、阶段状态。
- [ ] 实现真实画布缩放、平移、节点拖动与地理投影路线。
- [ ] 更新浏览器流程以验证修订、进度、画布、收藏与商家。

### Task 3: 交付
- [ ] 批量检查桌面/移动渲染和真实 AI 修订。
- [ ] 独立审查并修复实质问题，运行项目回归。
- [ ] 更新演示说明并打开实际页面。
