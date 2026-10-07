# 自动旅行合集 Implementation Plan

**Goal:** 将拾光照片、故事、参考图和 Tripo 模型流程接入旅藏，提供后台持久任务及真实进度。

**Architecture:** 复用现有设计、Tripo 和本地制造检查函数。新增单机任务执行器，原子写入 output/collections，后台执行不依赖页面轮询；浏览器保存任务编号并将完成作品导入已有收藏库。

**Tech Stack:** Node.js、文件存储、原生浏览器、IndexedDB、现有 Sharp/WebGL。

**Spec:** 本聊天中用户批准的照片→故事→参考图→3D→合集→导出方案。

## Constraints and rulings
- 保留现有工作区未提交内容；在已有 codex/travel-magnet-demo 分支原地增量修改。
- 使用现有 TRIPO_API_KEY，密钥不进入任务文件、前端或日志。
- 首次打开页面不调用付费 API；点击生成才执行。测试用服务替身。
- 单件失败保留其他结果；不自动重提结果不明的付费请求。
- 单机持久存储；无持久卷的 serverless 环境禁用自动生成并说明原因。
- 模型生成完成与打印检查分开；检查未通过仍保留 GLB。

## Tasks
- [x] 1. 编写并运行失败测试：后台运行、幂等提交、续跑、取消、单件失败、输入校验。
- [x] 2. 实现 collection-jobs.js：持久状态、阶段、任务 ID、资产保存、受控重试。
- [x] 3. server.js 接入任务 API、资产读取，复用设计和 Tripo 服务。
- [x] 4. 旅藏创作入口加入一键生成、任务进度、恢复、模型预览和下载；导入收藏并保持备份可用。
- [x] 5. 运行全套测试，浏览器核对桌面与手机、刷新续跑和错误恢复；记录限制。

验证结果见 `docs/collection-generation-verification.md`。保留现有工作区改动，没有提交或推送。

## Review focus
网络中断造成付费提交结果不明；服务器重启；同任务重复提交；保存失败；取消后在途请求回写。
