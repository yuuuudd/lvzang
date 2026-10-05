# GitHub协作与验收

## 推荐方式

一个私有仓库，两位协作者，各自功能分支，Pull Request互相审阅再合并。压缩包只用于第一次交接与离线备份，后续以GitHub为代码来源。

本次只准备交接包，没有创建仓库、邀请队友或上传代码。包中不含.git历史。工作目录许多源码未跟踪，不能把最后一次commit或git archive当成当前完整版本。

## 建立共同起点

由一人创建空私有仓库，在干净的解压目录初始化并审核首批文件，提交当前快照后再添加实际远程地址和推送。不要在原工作目录重建.git、覆盖已有remote或把私有配置一起上传。

~~~powershell
git init -b main
git add .
git diff --cached --stat
git status --short
~~~

确认.env、node_modules、缓存、个人照片、输出和密钥没有进入暂存，再提交“当前交接基线”。远程仓库URL由实际GitHub仓库决定，不在本包虚构。队友clone共同仓库，而不是再次把.zip作为另一条独立Git历史上传。

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
