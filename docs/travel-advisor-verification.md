# 旅行顾问与地图验证记录

日期：2026-10-07。范围：联网资料、详细攻略、连续对话、按日修改、地图探索与明确增删行程。

## 自动化

- `npm test`：475 项通过，0 失败、0 跳过。
- 浏览器回归通过：`travel.browser.js`、`travel-understanding.browser.js`、`travel-settings.browser.js`、`travel-guide.browser.js`、`travel-identity.browser.js`、`travel-chat.browser.js`、`workspace-recovery.browser.js`、`workspace-scale.browser.js`。
- 地图回归通过：`travel-map.browser.js`、`travel-map-discovery.browser.js`、`travel-map-camera-regression.browser.js`、`travel-map-location-races.browser.js`、`travel-map-initial-view.browser.js`。
- 实际 HTTP 与流式响应回归通过：`travel-itinerary-edit.browser.js`、`travel-day-edit.browser.js`，覆盖增删与刷新、失败回滚、单日覆盖与全程修改的优先级。
- 新顾问默认开启；两份旧对话协议浏览器 fixture 显式关闭顾问，仅验证兼容流程。新顾问的真实服务器接口另有独立覆盖。

## 真实服务联调

使用独立的合成需求调用已配置的 DeepSeek：广州一天三小时、两位成年人、不吃辣、必去正佳、排除广州塔。实际检索并读取正佳广场官方页面，结合餐饮来源，生成“正佳广场 → 八月翠园（天环广场店）”方案及每站玩法、餐饮、交通、预约提醒和雨天备选。得到 6 条来源，其中 1 条为官方正文、5 条为搜索摘要，界面和数据明确区分。

继续追问不吃辣如何点菜：回答给出点菜建议并说明菜单与价格未核实，保留原路线；使用原来源及其读取时间，不伪称刚刚重新核实。公开网页内容作为资料传入，不能改变工具与行程规则。

真实高德页面验证：搜索正佳广场得到天河路 228 号候选，选中只展示详情与路线比较，未自动加入行程；3D 地标显示天环、正佳与太古汇。初始镜头聚焦当日行程，探索资料抵达不会反复缩到全城。1440×900 与自然窄视口均检查输入区域和溢出，测试后恢复视口。

## 验证边界

- 未代替用户申请实际定位权限；定位成功、拒绝、粗定位、竞态与路线查询用模拟坐标验证。
- 小红书等访问受限页面不保证可读取，不绕过登录或验证。
- 未核实实时菜单、票价、营业、预约库存或整趟精确报价；行程时间为估算。
- 不改写用户现有旅行存档。日志和截图保留于被 Git 忽略的 `artifacts/map-advisor/`，配置密钥不进入提交。
