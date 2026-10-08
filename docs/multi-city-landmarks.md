# 多目的地立体地标（2026-10-08）

地图沿用现有高德底图、真实 POI 定位和可点击的风格化微缩建筑。广州以外现有39种专属造型，本轮重点补充珠三角；它们用于识别建筑，不是测绘或照片级复原。

| 目的地 | 新增专属造型 |
| --- | --- |
| 杭州 | 雷峰塔、保俶塔、三潭印月、灵隐寺 |
| 苏州 | 虎丘塔、苏州博物馆、北寺塔、东方之门 |
| 深圳 | 平安金融中心、京基100、地王大厦、深圳市民中心、中国华润大厦（春笋）、深圳湾文化广场 |
| 中山 | 孙中山故居纪念馆、孙中山纪念堂、中山詹园、幻彩摩天轮 |
| 佛山 | 佛山祖庙、南风古灶、清晖园 |
| 珠海 | 珠海大剧院（日月贝）、圆明新园、爱情邮局旁灯塔 |
| 北京 | 天坛祈年殿、故宫、鸟巢 |
| 上海 | 东方明珠、上海中心、外滩海关大楼、中华艺术宫 |
| 成都 | 天府熊猫塔、安顺廊桥、望江楼、文殊院 |
| 西藏 | 布达拉宫、大昭寺、罗布林卡、扎什伦布寺 |

广州原有 26 个探索地点和 8 种专属建筑继续保留。以上是精选目录，不代表全国所有地标；目录外仍可通过高德搜索地点，尚未建模的地点使用普通 POI 图钉。目的地不需要有 3D 模型才能使用地图。

广州目录中的商场、老街、园林与文化场馆按类别显示低矮地面造型，例如商场楼体、骑楼街区、亭树水庭；未知地点不套用虚构建筑。海心桥使用桥形。底图与地点真实经纬度始终来自高德。

## 使用行为

- 修改旅行目的地后，地图通过高德查询该地区的范围与中心；有精选目录时显示对应探索地点，不必先生成行程。已接受的旧攻略单独保留，新目的地的地图预览不会把探索地点自动加入旧攻略，也不会改写正在进行的问答。
- 东莞等没有专属模型的城市直接显示“高德地图”，可拖动、缩放和搜索；空地图的“返回目的地”恢复高德核实的城市中心。搜索和 AI 行程中的普通地点使用可点击图钉，继续支持起终点选择与路线比较。
- 高德底图正常加载后，即使暂时没有行程或精选地标，也可以拖动、缩放和搜索地点；小提示不拦截操作。真正地图加载失败仍显示错误和重试入口。
- “招牌地标”显示精选子集；“详细地标”显示该地完整精选目录；“仅行程”隐藏探索地点。分类、排除条件和已加入地点去重仍然生效。
- 建筑随每一级地图缩放连续调整显示大小，包括滚轮产生的小数级缩放：近景完整造型、街区视角小造型、城市或区域远景小点。远景不再把固定大小建筑铺满全屏，也不再画跨屏避让连线；悬停或聚焦仍可查看名称并选择端点。
- 拖动只平移地点和底图，保留建筑相对真实POI的像素偏移；纯平移不重新避让屏幕边缘，避免建筑滑动或重新散开。缩放、旋转、倾斜、视口变化、地点集合变化及明确返回当前地点时才重新计算布局。
- “西藏”与“西藏自治区”包含拉萨、日喀则的目录；单选“拉萨”只显示拉萨地标。地区名称不意味着把域内所有城市的建筑加入行程。
- 点击建筑查看并选取路程端点；加入、移出行程必须使用对应明确操作。点选和比较不改写已保存方案。
- AI 生成或高德搜索返回的地点可以按所属地区、名称与别名识别专属造型，不要求使用预设地点 ID。
- 目录只提供名称、别名、所属城市、分类和来源页面。坐标仍由高德返回；未匹配或存在歧义时继续确认，不用猜测坐标绘制地标。

## 实现和验证入口

- `public/src/travel-map-exploration.js`：地标目录、地区范围、密度和名称去重，官方来源随条目记录。
- `public/src/travel-landmark-geometry.js`：新增纯几何造型。
- `public/src/travel-map-landmarks.js`：按地点身份匹配模型并渲染静态 Canvas。
- `public/src/travel-itinerary-edit.js`：使用已验证的地区目录判断手动加入的地点，允许拉萨地标加入西藏行程。
- `tests/travel-map-cities.browser.js`：隔离模拟 SDK 验证换城、坐标锚定、密度、随机 AI ID、搜索去重及点选不改行程。
- `tests/travel-map-generic-destination.browser.js`：使用没有精选目录的东莞验证输入换城、空地图拖动与返回、普通图钉、问答隔离、生成行程的当地 POI 定位及保存恢复。
- `tests/travel-map-pan-anchors.browser.js`：真实指针拖动，验证近景和街区视角建筑相对POI不滑动、经纬度和旅行存档不变。
- `tests/travel-map-zoom-presentation.browser.js`：区域小点锚定、街区缩小、近景模型恢复及原生点选。
- `tests/travel-lingnan-landmarks.browser.js`：佛山、珠海专属模型、当地高德查询、原生点选和随机AI地点ID／别名定位。
- `tests/travel-zhongshan-landmarks.test.js`：中山四处建筑的城市范围、严格别名、官方来源、高德名称匹配与去重；坐标仅作为隔离测试快照。
- `tests/travel-landmark-models.browser.js`：实际 Canvas 造型渲染与接触表。
- `tests/travel-itinerary-edit.test.js`：地区地点加入、移除、保存恢复、异地和冒名拒绝。

本轮645项单元测试通过，52个可信模型预览非空，39个跨城市专属造型互异。东莞普通地图、地图拖动、缩放、相邻建筑点击及岭南地点流程通过；真实高德验证广州缩放、中山四处及佛山珠海六处POI。旧 `travel-map.browser.js` 仍引用分栏改造前已移除的 `#zoom-value`，不能用这项旧断言认证当前分栏；交互改用上述对应的新浏览器回归验证。

以下为首轮多城市验证历史：596项单元测试、多目的地等五个浏览器流程及27个模型渲染检查通过。

23 个新增地标均通过真实高德 POI 匹配：首轮 22 个通过，上海中心移除观光厅这个独立地点的过泛别名后单独复查通过。记录为本地 `artifacts/map-destination/landmarks-live-result.json` 与 `landmarks-live-recheck.json`。北京和上海行政级别使用高德实际返回的 province，不伪造普通地级市编码。

另在隔离浏览器会话中使用真实 SDK 显示杭州与西藏地图，检查专属模型和图面位置，证据为 `artifacts/map-destination/landmark-map-live.json`、`hangzhou-landmarks-live.png`、`tibet-landmarks-live.png`。用户原已接受的广州行程和西藏目的地输入保持不变，示范核验没有替换用户方案。

中山新增四处地点参考市政府的[故居介绍](https://www.zs.gov.cn/wglj/zdlyxxgkzl/gwgk/content/post_2524398.html)、[纪念堂建筑介绍](https://www.zs.gov.cn/zjzs/zsgs/content/post_219530.html)、[詹园介绍](https://www.zs.gov.cn/zjzs/lygg/zssj/content/post_2399546.html)和[摩天轮所在街区介绍](https://www.zs.gov.cn/zjzs/lygg/zssj/content/post_2399653.html)。四处均通过真实高德 POI 名称及中山市编码 `442000` 匹配；“缤纷幻彩摩天轮”作为精确的服务商别名保留。纪念堂到摩天轮的真实步行查询为约 1.46 公里、20 分钟，点选未改写旧方案或问答；核验快照为 `artifacts/map-advisor/zhongshan-poi-live.json`、`zhongshan-map-live.json` 与 `zhongshan-map-route-live.png`。

佛山造型参考官方[祖庙介绍](https://www.gdfao.gov.cn/zwgk/zdly/fss/content/post_1333504.html)、[南风古灶龙窑介绍](https://www.gz.gov.cn/zlgz/whgz/content/post_10120557.html)与[清晖园建筑介绍](https://www.gdwsw.gov.cn/wsbl/content/post_31398.html)；珠海参考官方[日月贝介绍](https://www.gdfao.gov.cn/zwgk/zdly/zhs/content/post_1333210.html)、[圆明新园介绍](https://sxszfzgzb.shanxi.gov.cn/ywdt/wqxw/202604/t20260415_10104563.shtml)及建设单位[爱情邮局和海滨泳场灯塔介绍](https://5bur.cscec.com/oa/whjs/202305/3670431.html)。六处均已匹配真实高德当地POI；精确查询名为“佛山市祖庙博物馆”“珠海日月贝”“海滨泳场灯塔”，保留用户常用称呼，灯塔与旁边爱情邮局不混作同一地点。脱敏核验文件为 `artifacts/map-advisor/佛山-poi-live.json` 与 `珠海-poi-live.json`。
