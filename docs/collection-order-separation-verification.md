# 自由画布与定制订单分离

2026-10-06。按用户要求，定制资料和制作结果仅属于订单流程，不自动形成个人旅行合集；收藏界面仅保留自由画布。

- 原因：个人画布读取全部keepsakes，包含订单制作使用的本机缓存。
- 修复：统一识别订单专用记录，保存时写入orderOnly标记；个人画布读取前排除。兼容旧operator-source/operator-work/submitted-work/shared-work及operatorId/operator-trip记录。
- 已误入的订单缓存不再显示；原始个人照片/合集、订单文件和订单审核/交付仍保留，不删除用户数据。
- 删除当前收藏页时间轴/地图导航；旧world/timeline与world/map路由规范回world/canvas。旅行探索中的路线地图不受影响。
- 全项目219项单元/API检查通过；collection-order-separation.browser.js确认旧缓存/新标记、个人来源保留、旧路由、手机布局。
- accounts-orders.browser.js订单审核/确认/交付回归通过；travel-gallery.browser.js个人合集、3D、照片故事和备份回归通过。未调用真实生图或建模。

修改为前端与本机存储规则，刷新页面即可使用；无删除、提交、推送或公网发布。
