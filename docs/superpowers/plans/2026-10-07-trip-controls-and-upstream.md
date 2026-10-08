# 可编辑旅行条件与全仓更新 Implementation Plan

> **For agentic workers:** 使用独立子任务实现与复核；root 完成仓库合并和系统验收。

**Goal:** 用户直接修改旅行天数、每日小时和强度；建筑浏览不表示加入行程；完整合并队友最新系统更新并在本机运行。

**Architecture:** 沿用旅行需求档案、流式策划和地图独立视图状态。表单明确提交条件后重排，普通地图选择只改变比较状态。完整合并 origin/codex/travel-magnet-demo，并结合双方意图处理旅行入口、状态及服务器冲突。

**Tech Stack:** 原生 JavaScript、Node HTTP、Playwright、AMap JS API。

## Global Constraints

- 本机 .env 保留且不提交；不上传或推送本地分支。
- 保留聊天、收藏和已保存方案；用户明确提交新条件时才修订旅行条件。
- 地图点击不新增站点、不修改旅行日序号，不确认用户未表达的需求。

## Task 1: 直接编辑旅行条件

Files: public/travel.html, public/travel-workspace.css, public/src/travel.js, public/src/travel-profile.js, public/src/travel-schedule.js, travel-agent.js, tests/travel-settings.browser.js。

- [x] 在旅行需求区提供明确的天数、每日可用小时、强度表单与“应用并调整行程”操作。值来自 profile，未填写时显示待补充。
- [x] 提交走已有可取消、失败回退的 runPlan 流程；只传本次修改的明确条件。保留旧预算、同行人与必去/排除条件。
- [x] 减少天数或改变强度时允许重分配原地点，不能因旧 dayIndex 超界失败。单天不显示多天切换。
- [x] 浏览器回归覆盖三天→一天→多天、每天时长、强度、刷新、失败保留及地图选择不会改档案。

## Task 2: 建筑浏览与行程分离

Files: public/src/travel-map-journey.js, public/src/travel-map-landmarks.js, public/src/travel-map.js, public/src/travel-workspace.js, public/travel-map-explorer.css, tests/travel-map.browser.js。

- [x] 地标与详情明确标注“已在行程”或“未加入行程”；起终点只是路程比较。
- [x] 普通建筑点击不移动或修改已接受路线的选择、日期和存储；加入需用户明确提出。
- [x] 浏览器回归检查两种建筑点击、起终点、切换交通与清空后旅行存储字节相同。

## Task 3: 全仓同步与运行验收

- [x] git fetch origin；确认更新分支 origin/codex/travel-magnet-demo（2216588），主分支没有更新。
- [x] 创建本地检查点，保留原有旅行 Agent、高德和画布修复。
- [x] 提交本轮功能，git merge origin/codex/travel-magnet-demo；逐处整合服务器路由、旅行状态、收藏/运营入口和说明。
- [x] 运行 npm test；运行旅行编辑、地图、工作台以及新首页、收藏、账号订单、运营的浏览器流程。
- [x] 重启 localhost:4180，核对旧数据和新导航，在真实浏览器验证并保存截图。
