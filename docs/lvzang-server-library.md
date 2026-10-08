# 旅藏独立服务器作品库

地址：https://lvzang.gzaibuilders.cn 。原站 gzaibuilders.cn 与 /shiguang/ 不替换。

## 部署与存储

- SSH 别名 gzaib-hk，Ubuntu 24.04，Node 24。
- 应用目录 /home/ubuntu/apps/lvzang；systemd 服务 lvzang.service；仅监听 127.0.0.1:4182。
- 独立 Nginx 站点 lvzang-http.conf、lvzang-https.conf；独立证书。
- output/accounts/workspace.json：账号、会话、订单和任务归属。
- output/library/library.sqlite：按账号分区的合集、作品、照片故事、画布和生成记录；WAL 事务提交。
- output/library/blobs/：照片、参考图、GLB，按内容摘要去重，不公开静态路径。
- output/collections/：旅藏生成任务和输出，与拾光目录无关。
- 所有作品请求要求账号会话和同源校验。生产关闭体验身份及公开注册。
- 测试通过后由 bootstrap-account.mjs 创建共享账号，首次凭据存 .first-login.txt（权限 600）。不通过聊天输出密钥。

## 使用与迁移

1. 在原先能看到作品的浏览器打开本机旅藏，必要时刷新静态页面。右上角“⋯”→“导出作品备份”。保留 ZIP。
2. 打开线上旅藏 /portal.html，使用共享账号登录。
3. 右上角“⋯”→“导入作品备份”，选择 ZIP。导入照片、故事、作品文件、封面和布局。已有编号跳过；冲突或缺失素材整批回滚。
4. 队友在自己的浏览器访问相同网址并登录同一账号，刷新后核对合集与模型。
5. 迁移不导入未完成任务队列，不自动重交付费任务；原本机备份和记录保留。

当前支持已有备份格式（ZIP 上限 100 MB，解压上限 200 MB）；单次服务器请求上限 90 MB。较大合集需要后续增加分批迁移，不能假报成功。不要以清空本机记录作为迁移验证。

## 稳定性边界

作品是服务器权威数据；同一账号读写同一库，保存作品有版本冲突检测。队友保存后刷新即可看到，不实现实时协同光标。生成列表只合并、不以旧页面覆盖新任务。403/404 停止自动轮询，刷新查询不会偷偷重新提交生成。

旅藏进程 MemoryHigh=600M、MemoryMax=768M、MemorySwapMax=128M、CPUQuota=100%。服务器现有拾光约占 2.2GB，未修改/重启它；复杂几何生成仍需监控内存，资源不足时扩容服务器，不牺牲原网站运行。

备份时保留整个 output/ 与 .env。运行中的 SQLite 不能只复制主库文件；停掉旅藏服务后复制整个 output/，或使用 SQLite 在线备份工具。不要操作拾光目录。

## 检查

node --test tests/server-library.test.js tests/travel-keepsake-store.test.js tests/travel-keepsake-backup.test.js tests/accounts-api.test.js tests/collection-studio.test.js

node tests/server-library.browser.js

浏览器检查覆盖登录、ZIP 导入、第二独立浏览器会话访问、刷新持久化，无付费调用。服务器验收核对新服务状态、TLS、未登录拒绝访问，以及拾光配置哈希和进程 PID 不变。

2026-10-08 已上线并验收：13 项针对性测试通过；独立浏览器会话备份导入检查通过；公网 HTTPS 双会话读写作品/照片及无登录拒绝检查通过。线上临时验证作品已清理。拾光配置哈希、进程 PID 保持不变，两个站点均 HTTP 200。

用户原浏览器的真实作品尚未迁移：它们不在本次可访问的浏览器资料中，需要从原浏览器导出 ZIP 后导入线上账号。不能将测试数据跨会话可见当作真实作品已迁移。

## 2026-10-08 模型展示与制作反馈修复

线上已有三件乌镇作品的任务和文件均完整。诊断发现列表和进度同步重复传输完整 GLB/网格，单次未压缩读取约 15–21 秒；制作控制器又等待初次同步结束才交回，导致按钮先出现但尚不能工作。列表现用 getAssetInfo 只读取参考图和报告；完整资产按需加载、在页面会话中缓存，较大 JSON 使用 gzip。生成进度初始化在后台进行，不阻塞控制器；云端阶段变化先通知画布，再同步作品。

画布常驻当前项目、实际阶段、阶段完成数、云端返回的百分比；后台一次只标记一个当前执行阶段。合集图使用实际父任务编号，保留合集关联，提交立即反馈并防重复点击。读取模型时先展示参考图，失败明确提示并提供重试。线上作品库不再每次扫描浏览器旧拾光记录并重画整个页面。

验收：16 项针对性测试通过；服务器作品库完整浏览器回归通过（实时阶段、桌面/移动端、模型切换缓存、合集编号不同、合集图同步、失败重试，所有生成使用模拟服务）。公网只读验收三件真实作品全部进入 3D 模式，首轮总加载实测 19.745 秒；截图 artifacts/lvzang-display/after.png。未为验证提交真实付费生成。旧代码备份位于线上 output/deployment-backups/，只重启旅藏，拾光配置哈希和进程不变。

## 2026-10-08 经营者工作台加载超时

委托列表原来通过 dump 下载全部照片、模型和生成记录，打开页面及轮询都可能触发。现用 listMeta 按 operator-commission: 前缀读取，再合并共享订单；整库导出仍由备份操作单独执行。服务器接口按账号隔离，浏览器本机库也按编号范围查询。16 项针对性测试、247 项单元测试及启用服务器作品库的完整工作台浏览器流程通过，首屏没有 dump 请求。

线上检查发现生成元数据共 114853404 字节，lvzang.service 内存占用 783659008 字节，基础接口在 10 秒内没有响应；直接 SSH 和跳板 SSH 一度无法完成握手。延长握手等待后成功停止旅藏进程并释放资源，随后备份五个原文件至 output/deployment-backups/operator-list-*/before.tgz，执行 deployment/fix-operator-list.mjs 定向更新并启动旅藏。未修改运行配置与作品数据，原拾光服务仍正常运行。

公网页面验收（scripts/verify-lvzang-operator.mjs）：现有经营者账号最终打开工作台 1797 毫秒，刷新和全部图片加载正常，无页面异常、整库下载或付费生成。修复后 MemoryCurrent 为 62926848 字节，公网基础接口 HTTP 200，响应 0.046 秒。示例预览使用已有轻量照片，兼容旧示例记录，继续禁用旧古镇样图。247 项测试最终全部通过。截图 artifacts/operator-timeout/live-desktop.png；定向补丁对旧发布包试运行、语法检查和重复执行检查均通过。

## 2026-10-08 作品修改版本归组与对比

合集按作品展示，修改版在详情内选择和对比。展示选择保存于原作品记录，不替换或删除模型。新版本保留来源作品、来源版本及修改要求；旧版按同合集来源照片兼容归组。生成完成后显示新结果，AI 修改方案按版本隔离。新生产需求在模型导入成功后才保存，keepsakeId 与 modelRef 指向同一新版本。下载、实体制作使用当前预览版。

完整模型响应按页面排队并缓存。双会话浏览器验证模型响应不会重叠，同一模型只下载一次。版本端到端验证分别通过本机库和服务器库，覆盖生成结果显示、真实模型切换、模型与参考图对比、采用旧版、刷新保留选择、新版生产需求及手机布局。最终全套 249 项测试通过。

公网页面只读验收 scripts/verify-lvzang-versions.mjs 通过：4 条真实模型记录显示为 3 件作品，两个版本能切换到不同模型并同时预览；全部文件保留，没有采用或生成新的线上版本，无付费请求。截图见 artifacts/asset-versions/live-model-compare.png、live-reference-compare.png 与 live-mobile.png。四个原前端文件已备份到 output/deployment-backups/asset-versions-*/before.tgz。此次不迁移作品数据，不重启服务。

## 2026-10-08 订单管理与工作台布局上线

已定向更新工作台及关联流程九个文件，统一订单称呼、唯一新建入口、归档/可恢复删除/恢复，以及本机订单信息栏。发布前后 SHA-256 校验通过；原文件备份位于 output/deployment-backups/operator-management-20261008/before.tgz。仅重启旅藏，拾光进程及 Nginx 配置未变，现有作品与订单数据保留。

15 项针对性单元测试通过。公网 scripts/verify-lvzang-operator-management.mjs 验收通过：经营者登录、7 条现有订单、单一新建入口、删除/归档菜单、已删除列表、刷新和手机布局正常；首屏 6592ms，只调用 listMeta，无整库下载、页面异常或付费生成。线上只读检查，未删除任何真实订单。截图 artifacts/operator-management/live-desktop.png、live-menu.png、live-mobile.png。

补充兼容旧默认标题「新的文创委托」为「新订单」，用户自定义标题保留，新增回归测试通过。追加更新时触发 lvzang.service 每小时启动次数限制，日志确认 start-limit-hit 后仅重置失败计数并启动，未修改服务保护配置。
最终版本公网复验通过：首屏 3494ms，7 条订单，旧默认标题已统一为新订单；删除/归档菜单、唯一新建入口、列表切换、刷新及手机布局正常，无页面异常及付费请求。

## 2026-10-08 实体订单步骤衔接与比赛演示

线上更新 public/src/operator.js、public/operator.css，SHA-256 与本地一致，无需重启。备份 output/deployment-backups/operator-demo-20261008/before.tgz。已有3D订单增加「下一步：打印与验收」，切换第三步不再要求先加载/转换模型；STL 导出成功自动进入验收页，取消导出则留在原页。模型读取失败显示重试入口。

「演示后续流程」打开原生对话框，以当前订单标题、参考图和规格展示模拟导出、打印验收、客户确认、交付完成。演示状态仅在内存中，可重置/退出，不写入订单、消息、真实验收证明或客户确认，不触发生产、物流及生成。手机内容可滚动，底部动作保持可见。

本地 tests/operator-production-demo.browser.js 通过，覆盖预览失败仍可进入第三步、断网完整演示、重置/退出/手机、真实STL导出后进入验收、订单零修改。订单管理浏览器回归及15项相关单元测试通过。线上 scripts/verify-lvzang-operator-demo.mjs 已用现有订单完成第2/3/4步及完成态、重置和手机验收，前后订单完全一致，订单写请求0。截图 artifacts/operator-demo/live-review.png、live-delivered.png、live-mobile.png。截图中的连接失败未在本次服务检查中复现（active，API HTTP 200）；新增可重试提示，未将网络暂态宣称为已根治。
