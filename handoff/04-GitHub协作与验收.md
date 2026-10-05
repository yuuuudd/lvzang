# GitHub协作与验收

## 推荐方式

一个私有仓库，两位协作者，各自功能分支，Pull Request互相审阅再合并。压缩包只用于第一次交接与离线备份，后续以GitHub为代码来源。

已上传私有仓库：https://github.com/yuuuudd/lvzang 。main是当前交接基线，源码、素材和交接文档已经提交；桌面压缩包是不含.git的离线快照。协作者尚需由仓库所有者在Settings → Collaborators中添加，队友获得访问权限后才能克隆私有仓库。

## 建立共同起点

队友获得仓库访问权限后，直接克隆共同仓库：

~~~powershell
git clone https://github.com/yuuuudd/lvzang.git
cd lvzang
npm ci
Copy-Item -LiteralPath .env.example -Destination .env
npm start
~~~

编辑自己的.env配置密钥。默认入口：http://localhost:4180/travel.html。每个人在自己的电脑保留配置与浏览器作品；GitHub同步代码，不自动同步本机收藏或照片。

已有原工作目录已添加origin，保留当前codex/travel-magnet-demo分支及原历史。后续在各自功能分支提出PR到main，不需要重新初始化或上传zip。其他队友一律从共同仓库clone。

## 日常节奏

A示例分支：codex/visitor-exhibition；B示例分支：codex/agent-merchant。实际一个小功能一个分支，不在main直接堆积未验证修改。

开始前同步main；在Issue写清目标、负责人、验收条件。完成后提交PR，描述问题、结果、验证方式和未完成边界。另一人审阅和实际打开页面检查，再合并。合并后双方同步main。

共享文件修改先协调。接口变更附请求/响应示例；依赖变更同时提交package.json和package-lock.json。不要用压缩包覆盖队友正在修改的目录。

## 配置与合并检查

.env各自本机保存；共享变量名与空白.env.example，不在Issue/PR或聊天截图展示密钥。包中.gitignore明确允许.env.example被跟踪。

每次合并至少运行npm test。对话流程变化加跑travel-chat.browser.js；画布变化加跑workspace.browser.js；存储或取消变化加跑workspace-recovery.browser.js；收藏/商家变化加跑travel.browser.js。浏览器检查需Chrome，使用测试响应，不产生外部模型调用。

真实API检查与--allow-live脚本会发送数据并可能收费，只在双方知道测试内容和费用的情况下单独执行；不要放进默认CI。

先按团队约定执行PR审阅；是否能强制分支保护以仓库套餐与设置为准，不把付费权限当协作前提。

## 官方参考

- 邀请协作者：https://docs.github.com/zh/account-and-profile/setting-up-and-managing-your-personal-account-on-github/managing-user-account-settings/inviting-collaborators-to-a-personal-repository
- 分支与PR协作：https://docs.github.com/en/pull-requests/reference/pull-requests
- 创建PR：https://docs.github.com/en/pull-requests/how-tos/create-pull-requests
