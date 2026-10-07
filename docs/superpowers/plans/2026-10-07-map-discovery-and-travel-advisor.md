# 地图探索与持续旅行顾问 Implementation Plan

> **For agentic workers:** root 整合地图与真实页面；独立子任务实现定位、地标和行程编辑，完成后复核联网资料与旅行问答。

**Goal:** 从当前位置到景点计算路线，自选地标密度与分类，明确增删行程，并让 DeepSeek 结合公开资料持续细化用户的旅行。

**Architecture:** 定位和地图探索作为独立视图状态，只有明确加入/移除才更新档案与按天路线。定位用高德坐标，密度/类别与搜索可扩展固定目录。旅行顾问通过有边界的资料工具读取公开网页，保留来源、资料限制、跨轮偏好以及已接受路线。

**Tech Stack:** Node HTTP、原生 JavaScript、AMap JS API、DeepSeek 工具调用、Node test、Playwright。

## Global Constraints

- 定位仅用户点击触发；不持久保存精确坐标，不把 IP 城市位置冒充当前位置。
- 地图浏览/筛选/路程比较不改已保存行程。加入与移除有明确按钮，失败保留原方案。
- 不宣称全城地标已齐全；通过高德搜索补充目录之外地点。
- 公开网页内容是参考资料，不是系统指令；不绕过登录/付费墙，不编造读取成功或实时价格。
- 继续保留本地 `.env`，不推送密钥或用户数据。

## Task 1: 定位与路程

Files: public/src/travel-map-location.js, public/src/travel-map.js, public/src/travel-map-journey.js, public/travel.html, tests/travel-map-location.test.js, tests/travel-map-discovery.browser.js。

- [x] 新增显式“从我的位置出发”；按需加载高德 Geolocation，校验坐标、精度和来源，拒绝城市级降级。
- [x] 起点设为我的位置后，点击地点为终点并查询步行/驾车路线；失败/权限拒绝可重试，迟到结果不覆盖新选择。
- [x] 运行定位单测与浏览器完整路线测试，不使用真实位置作为测试样本。

## Task 2: 地标密度、分类与地图

Files: public/src/travel-map-exploration.js, public/src/travel-map-landmarks.js, public/src/travel-map.js, public/travel-map-explorer.css, public/travel.html。

- [x] signature/detailed/itinerary 密度和 all/landmark/shopping/culture/park 分类；广州池包括天环、正佳、天河城、太古汇等。
- [x] 高德城市内搜索显示真实候选地址；选中只查看/比较，不自动加入。
- [x] 详细模式用紧凑地标保留地理锚点；筛选不反复缩放到全城，保留用户移动后的视角。
- [x] 已复现缺少定位/分类控件的问题，并通过 `node tests/travel-map-discovery.browser.js` 验证修复；浏览、筛选与比较不改保存字节。

## Task 3: 明确增删路线

Files: travel-agent.js, public/src/travel-itinerary-edit.js, public/src/travel.js, public/src/travel-workspace.js, public/src/travel-state.js, related tests。

- [x] onMembershipChange({action,stop,dayIndex}) 返回 Promise<boolean>；后端限制参数并重排选中日期，保留其他条件。
- [x] 行程卡和地图详情均可移除；移除同步必去/排除条件，重新加入可恢复，不自动添加回去。
- [x] 空日、最后一站、时间不足、取消、刷新及搜索地点加入有明确测试。

## Task 4: 联网旅行顾问

Files: travel-research.js, travel-agent.js, public/src/travel-profile.js, public/src/travel.js, public/src/travel-workspace.js, related tests。

- [x] 阅读现有问答/规划接口，补全饮食、兴趣、人群、节奏、大众/小众与必去追问，分轮提问且允许先给草案。
- [x] 查询和读取可访问的公开攻略，返回来源/时间/失败状态；抵御 SSRF、网页提示注入、无限查询和超时。
- [x] 日程细化去哪、怎么玩、停留、交通、餐食区域、注意事项与备选；区分来源事实和建议估算。
- [x] 生成后自由问餐饮或地点问题不重建路线；明确修改继续沿用已确认偏好和其他日期。
- [x] 自动化验证真实流式对话/工具循环，并在浏览器检查聊天滚动和输入区始终可达。

## Task 5: 整合验收

- [x] npm test 与受影响浏览器流程通过；实际页面检查，恢复视口并保存证据。
- [x] 更新使用说明、配置边界、完成记录；本地提交并重启服务。

完成记录见 [旅行顾问与地图验证](../../travel-advisor-verification.md)。
