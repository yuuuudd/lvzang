// Curated planning references, not live operating hours or guaranteed bookings.
const point=(id,city,name,aliases,tags,minutes,story,task,souvenir,coords,source)=>({id,city,name,aliases,tags,minutes,story,task,souvenir,coords,source,availability:'营业时间、预约与费用请出发前确认'});
export const places=[
  point('gz-museum','广州','广东省博物馆',['粤博','广东博物馆'],['文化','建筑','室内'],75,'在宝盒式建筑里，认识广东的历史、艺术与自然。','寻找一件喜欢的展品，留下它与你的故事。','岭南宝盒',[23.117,113.322],'https://www.gdmuseum.org.cn/'),
  point('gz-square','广州','花城广场',['珠江新城','城市客厅'],['风景','建筑','拍照'],40,'沿城市中轴漫游，在花园和天际线之间感受广州。','选择一个角度，记录珠江新城的天际线。','花城天际线',[23.12,113.319],'https://www.gz.gov.cn/zlgz/gzly/wzgz/ycbj/content/post_10387324.html'),
  point('gz-tower','广州','广州塔',['小蛮腰'],['建筑','拍照','风景'],45,'在珠江南岸看小蛮腰。本路线安排外观打卡，登塔需另购票并确认时间。','在江边找一个喜欢的角度，把广州塔留进记忆。','小蛮腰',[23.106,113.325],'https://wglj.gz.gov.cn/ztmb/gzhyn/ajjq/4a/content/post_8928935.html'),
  point('gz-opera','广州','广州大剧院',['大剧院'],['文化','建筑','拍照'],35,'两块石头般的建筑临江相望，外观漫游与演出观赏需要分别安排。','观察建筑的几何线条，记录自己看到的形状。','珠江双石',[23.115,113.317],'https://www.gz.gov.cn/zlgz/whgz/content/post_8067980.html'),
  point('sz-pingjiang','苏州','平江路',['平江历史街区'],['建筑','美食','拍照'],50,'沿河的小巷、桥与白墙，构成苏州的水城记忆。','找一座喜欢的小桥，记录它与水面的倒影。','小桥人家',[31.316,120.633],'https://www.suzhou.gov.cn/'),
  point('sz-garden','苏州','拙政园',['苏州园林'],['园林','建筑','文化'],70,'在亭、窗与水之间，观察园林如何借景。','挑一扇花窗，说说窗里框住了什么。','园林花窗',[31.325,120.63],'https://www.suzhou.gov.cn/'),
  point('sz-museum','苏州','苏州博物馆',['苏博'],['文化','建筑','室内'],60,'从建筑和展陈中认识江南，参观需关注预约要求。','记录一处你喜欢的建筑线条或展陈细节。','江南屋檐',[31.324,120.627],'https://www.szmuseum.com/'),
  point('sz-shantang','苏州','山塘街',['七里山塘'],['手作','美食','拍照'],55,'沿街观察老字号和地方手作，体验项目需现场确认。','找到一种地方工艺，记下名称和吸引你的细节。','山塘灯笼',[31.323,120.601],'https://www.suzhou.gov.cn/'),
  point('hz-westlake','杭州','西湖',['断桥','西湖风景区'],['风景','拍照','建筑'],60,'湖面、堤岸与远山，让旅行节奏慢下来。','选一处湖景，记录这一刻的光线。','湖畔小亭',[30.258,120.148],'https://www.hangzhou.gov.cn/'),
  point('hz-hefang','杭州','河坊街',['清河坊'],['手作','美食','文化'],50,'在街巷里寻找杭州的地方味道与手工体验。','记录一种手作或点心，以及它的地方特色。','街巷小铺',[30.233,120.17],'https://www.hangzhou.gov.cn/'),
  point('hz-museum','杭州','浙江省博物馆孤山馆区',['孤山馆区'],['文化','室内','建筑'],55,'从孤山的建筑与文化空间认识西湖；展览开放情况待确认。','选择一处文化细节，写下一句自己的理解。','孤山屋檐',[30.251,120.138],'https://www.zhejiangmuseum.com/'),
  point('hz-longjing','杭州','龙井村',['龙井茶'],['风景','手作','文化'],70,'茶园、村落与制茶故事，适合愿意留出交通时间的行程。','了解一道制茶工序，记录茶香带来的感受。','茶山记忆',[30.22,120.1],'https://www.hangzhou.gov.cn/')
];
export const themes=[
  {id:'guangzhou',city:'广州',title:'珠江两岸，收藏花城',subtitle:'城市地标 · 博物馆 · 3D纪念',description:'广州半天，预算300元，喜欢文化建筑和拍照，想去广东省博物馆和花城广场和广州塔',tags:['文化','建筑','拍照']},
  {id:'gardens',city:'苏州',title:'走进江南的留白',subtitle:'园林 · 白墙 · 小桥',description:'苏州半天，喜欢园林和建筑',tags:['园林','建筑']},
  {id:'craft',city:'杭州',title:'把手作带进旅程',subtitle:'街巷 · 茶香 · 地方手作',description:'杭州一天，喜欢手作和文化',tags:['手作','文化']},
  {id:'slow',city:'苏州',title:'慢一点，看看水城',subtitle:'轻松漫游 · 河畔 · 地方味道',description:'苏州半天，少走路，喜欢美食和拍照',tags:['美食','拍照']}
];
export const byId=id=>places.find(p=>p.id===id);
