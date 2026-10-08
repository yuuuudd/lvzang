import {places} from './travel-catalog.js';

// This pool is for map exploration, never for silently extending an accepted trip.
// The map controller must resolve every location through the provider; no coordinates
// or unverified visit times, fees, and opening hours belong in these objects.
export const LANDMARK_DENSITIES = Object.freeze([
  Object.freeze({value: 'signature', label: '招牌精选'}),
  Object.freeze({value: 'detailed', label: '详细探索'}),
  Object.freeze({value: 'itinerary', label: '仅看行程'}),
]);
export const LANDMARK_CATEGORIES = Object.freeze([
  Object.freeze({value: 'all', label: '全部分类'}),
  Object.freeze({value: 'landmark', label: '城市地标'}),
  Object.freeze({value: 'shopping', label: '逛街商圈'}),
  Object.freeze({value: 'culture', label: '文化场馆'}),
  Object.freeze({value: 'park', label: '公园街区'}),
]);
const shoppingSource = 'https://sw.gz.gov.cn/xxgk/tzgg/tz/content/post_8554061.html';
const nightlifeSource = 'https://www.gz.gov.cn/guangzhouinternational/home/citynews/content/post_9157920.html';
const oldCitySource = 'https://wglj.gz.gov.cn/gzdt/wlzc/content/post_8068870.html';
const parkSource = 'https://mzzjj.gz.gov.cn/xxgk/ghjh/content/post_9310900.html';
const cityWalkSource = 'https://wglj.gz.gov.cn/gkmlpt/content/10/10898/post_10898321.html';
const signatureIds = new Set(['gz-museum', 'gz-square', 'gz-tower', 'gz-opera', 'gz-library', 'gz-ifc', 'gz-parc-central', 'gz-grandview', 'gz-teemall', 'gz-taikoo-hui', 'gz-yuexiu-park', 'gz-yongqingfang']);
const landmark = (id, name, category, aliases, source) => ({id, name, city: '广州', category, aliases, source});
const guangzhouLandmarks = [
  ...places.filter(place => ['gz-museum', 'gz-square', 'gz-tower', 'gz-opera'].includes(place.id))
    .map(({id, name, city, aliases, source}) => ({id, name, city, aliases, source, category: ['gz-museum', 'gz-opera'].includes(id) ? 'culture' : 'landmark'})),
  {
    id: 'gz-library', name: '广州图书馆', city: '广州', category: 'culture',
    aliases: ['广州图书馆新馆', '广州图书馆(新馆)'],
    source: 'https://www.gz.gov.cn/zlgz/gzly/wzgz/wtcg/content/post_9589251.html',
  },
  {
    id: 'gz-ifc', name: '广州国际金融中心', shortName: '广州西塔', city: '广州', category: 'landmark',
    aliases: ['广州西塔', '西塔', '广州国际金融中心(西塔)'],
    source: 'https://www.gz.gov.cn/zt/2019zggzgjtznh/tpxw/content/post_3103990.html',
  },
  {
    id: 'gz-ctf', name: '广州周大福金融中心', shortName: '广州东塔', city: '广州', category: 'landmark',
    aliases: ['广州东塔', '东塔', '周大福金融中心', '广州周大福金融中心(东塔)'],
    source: 'https://www.gz.gov.cn/zt/2019zggzgjtznh/tpxw/content/post_3103990.html',
  },
  {
    id: 'gz-youth-palace', name: '广州市第二少年宫', shortName: '第二少年宫', city: '广州', category: 'culture',
    aliases: ['广州第二少年宫', '第二少年宫'],
    source: 'https://www.gz.gov.cn/zlgz/gzly/wzgz/wtcg/content/post_9589251.html',
  },
  landmark('gz-parc-central', '天环广场', 'shopping', ['天环', '广州天环', '天环Parc Central', '天环ParcCentral', 'Parc Central'], shoppingSource),
  landmark('gz-grandview', '正佳广场', 'shopping', ['正佳', '广州正佳广场', 'Grandview Mall'], shoppingSource),
  landmark('gz-teemall', '天河城', 'shopping', ['广州天河城', '天河城广场', '天河城购物中心', 'TEEMALL'], shoppingSource),
  landmark('gz-taikoo-hui', '太古汇', 'shopping', ['广州太古汇', '太古汇广场', 'Taikoo Hui'], shoppingSource),
  landmark('gz-onelink-walk', '万菱汇', 'shopping', ['广州万菱汇', 'OneLink Walk'], shoppingSource),
  landmark('gz-k11', '广州K11购物艺术中心', 'shopping', ['广州K11', 'K11购物艺术中心', 'K11'], nightlifeSource),
  landmark('gz-beijing-road', '北京路步行街', 'shopping', ['北京路', '北京路文化旅游区'], nightlifeSource),
  landmark('gz-yongqingfang', '永庆坊', 'park', ['广州永庆坊', '西关永庆坊', '西关永庆坊旅游区'], oldCitySource),
  landmark('gz-shamian', '沙面岛', 'park', ['沙面', '沙面历史文化街区'], oldCitySource),
  landmark('gz-yuexiu-park', '越秀公园', 'park', ['广州越秀公园'], parkSource),
  landmark('gz-liwan-lake', '荔湾湖公园', 'park', ['荔湾湖'], parkSource),
  landmark('gz-pearl-river-park', '珠江公园', 'park', ['广州珠江公园'], parkSource),
  landmark('gz-tianhe-park', '天河公园', 'park', ['广州天河公园'], parkSource),
  landmark('gz-chen-clan-hall', '陈家祠', 'culture', ['陈氏书院', '广东民间工艺博物馆'], oldCitySource),
  landmark('gz-zhongshan-memorial', '中山纪念堂', 'culture', ['广州中山纪念堂'], 'https://wglj.gz.gov.cn/ztmb/gzhyn/lyxl/content/post_8829858.html'),
  landmark('gz-art-museum', '广州艺术博物院', 'culture', ['广州美术馆', '广州艺术博物院(广州美术馆)', '广州艺术博物院新馆'], cityWalkSource),
  landmark('gz-haixin-bridge', '海心桥', 'landmark', ['广州海心桥'], cityWalkSource),
  landmark('gz-cantonese-opera-museum', '粤剧艺术博物馆', 'culture', ['广州粤剧艺术博物馆'], oldCitySource),
].map(place => ({...place, signature: signatureIds.has(place.id)}));

// Selected landmarks with verified names and city membership, not an exhaustive
// nationwide directory. `source` documents identity only; live POI coordinates and
// visit conditions must still come from the provider/research flow.
const curated = (id, city, name, category, aliases, source, region) => ({
  id, city, name, category, aliases, source, modelKey: id, signature: true,
  ...(region ? {region} : {}),
});
const suzhouLandmarkSource = 'https://www.suzhou.gov.cn/gzdmksz/hdjs/202312/52f0a745f9694a8aa053474b5eba1baa.shtml';
const tibetLandmarkSource = 'https://wlt.xizang.gov.cn/xwzx_69/tzgg/202111/t20211111_269582.html';
const detailedOnlyIds = new Set(['hz-baochu-pagoda', 'sz-north-temple-pagoda', 'sh-customs-house', 'cd-wangjiang-tower', 'xz-tashilhunpo']);
const otherDestinationLandmarks = [
  curated('zhongshan-sun-residence', '中山', '孙中山故居纪念馆', 'culture', ['孙中山故居', '翠亨孙中山故居'],
    'https://www.zs.gov.cn/wglj/zdlyxxgkzl/gwgk/content/post_2524398.html'),
  curated('zhongshan-memorial-hall', '中山', '孙中山纪念堂', 'culture', ['中山纪念堂', '石岐孙中山纪念堂'],
    'https://www.zs.gov.cn/zjzs/zsgs/content/post_219530.html'),
  curated('zhongshan-zhan-garden', '中山', '中山詹园', 'park', ['詹园', '中山大宅门'],
    'https://www.zs.gov.cn/zjzs/lygg/zssj/content/post_2399546.html'),
  curated('zhongshan-skywheel', '中山', '幻彩摩天轮', 'landmark', ['缤纷幻彩摩天轮', '中山幻彩摩天轮', '兴中广场幻彩摩天轮'],
    'https://www.zs.gov.cn/zjzs/lygg/zssj/content/post_2399653.html'),
  curated('shenzhen-pingan-finance', '深圳', '平安金融中心', 'landmark', ['深圳平安金融中心', '平安国际金融中心', '平安金融中心大厦'],
    'https://wtl.sz.gov.cn/lyfw/lyxw/content/post_11009514.html'),
  curated('shenzhen-kk100', '深圳', '京基100', 'landmark', ['京基100大厦', '京基一百大厦', '京基一百', 'KK100'],
    'https://www.sz.gov.cn/szzt2010/yhyshj/zdyq/lhq/content/post_12428213.html'),
  curated('shenzhen-diwang', '深圳', '地王大厦', 'landmark', ['深圳地王大厦', '信兴广场', '信兴广场深圳地王商业大厦'],
    'https://www.sz.gov.cn/szstorykr/202302/content/post_10425807.html'),
  curated('shenzhen-civic-center', '深圳', '深圳市民中心', 'landmark', ['市民中心', '深圳市市民中心'],
    'https://www.sz.gov.cn/szzsj/gkmlpt/content/8/8702/post_8702140.html'),
  curated('shenzhen-china-resources-tower', '深圳', '中国华润大厦', 'landmark', ['春笋', '中国华润大厦(春笋)', '深圳湾春笋', '华润春笋大厦'],
    'https://www.sz.gov.cn/cn/xxgk/zfxxgj/gqdt/content/post_11544779.html'),
  curated('shenzhen-bay-culture', '深圳', '深圳湾文化广场', 'culture', ['深圳湾文化广场项目', 'Shenzhen Bay Culture Square'],
    'https://www.sz.gov.cn/ztfw/gysy/wyk_183958/content/mpost_12063229.html'),
  {...curated('foshan-ancestral-temple', '佛山', '佛山市祖庙博物馆', 'culture', ['佛山祖庙', '祖庙', '佛山祖庙博物馆', '祖庙博物馆'],
    'https://www.gdfao.gov.cn/zwgk/zdly/fss/content/post_1333504.html'), shortName: '佛山祖庙'},
  curated('foshan-nanfeng-kiln', '佛山', '南风古灶', 'culture', ['佛山南风古灶', '南风古灶旅游区', '南风古灶景区'],
    'https://www.gdfao.gov.cn/zwgk/zdly/fss/content/post_1333505.html'),
  curated('foshan-qinghui-garden', '佛山', '清晖园', 'park', ['清晖园博物馆', '佛山清晖园', '顺德清晖园'],
    'https://www.gdwsw.gov.cn/wsbl/content/post_31398.html'),
  {...curated('zhuhai-grand-theatre', '珠海', '珠海日月贝', 'culture', ['珠海大剧院', '日月贝', '珠海大剧院日月贝'],
    'https://www.gdfao.gov.cn/zwgk/zdly/zhs/content/post_1333210.html'), shortName: '珠海大剧院'},
  curated('zhuhai-new-yuanming-palace', '珠海', '圆明新园', 'park', ['珠海圆明新园', '圆明新园景区'],
    'https://sxszfzgzb.shanxi.gov.cn/ywdt/wqxw/202604/t20260415_10104563.shtml'),
  {...curated('zhuhai-love-post-lighthouse', '珠海', '海滨泳场灯塔', 'landmark', ['爱情邮局灯塔', '爱情邮局(灯塔)', '海滨泳场-灯塔', '珠海海滨泳场灯塔'],
    'https://5bur.cscec.com/oa/whjs/202305/3670431.html'), shortName: '爱情邮局灯塔'},
  curated('hz-leifeng-tower', '杭州', '雷峰塔', 'landmark', ['杭州雷峰塔', '雷峰夕照', '雷峰塔景区雷峰塔'],
    'https://wgly.hangzhou.gov.cn/art/2022/12/1/art_1229696389_58943150.html'),
  curated('hz-baochu-pagoda', '杭州', '保俶塔', 'landmark', ['杭州保俶塔', '宝石山保俶塔', '杭州西湖风景名胜区-保俶塔'],
    'https://www.hzzx.gov.cn/hzzx/content/2010-10/26/content_5138064.htm'),
  curated('hz-three-pools', '杭州', '三潭印月', 'park', ['西湖三潭印月', '小瀛洲', '小瀛洲(三潭印月)', '杭州西湖风景名胜区-三潭印月'],
    'https://westlake.hangzhou.gov.cn/art/2022/4/8/art_1639433_59036844.html'),
  curated('hz-lingyin-temple', '杭州', '灵隐寺', 'culture', ['杭州灵隐寺', '云林禅寺'],
    'https://www.lingyinsi.org/'),
  curated('sz-tiger-hill', '苏州', '虎丘塔', 'landmark', ['云岩寺塔', '虎丘云岩寺塔', '虎丘山风景名胜区-虎丘塔'],
    'https://www.suzhou.gov.cn/szwgjyhsj/yhsjjbgk/202110/560fc6c80c7746b98704ecd6fc24e5f0.shtml'),
  curated('sz-museum', '苏州', '苏州博物馆(本馆)', 'culture', ['苏州博物馆', '苏博', '苏州博物馆本馆'],
    'https://www.suzhou.gov.cn/szsrmzf/mszx/202609/2d1a50ec4496485d9f5c332de585dfdc.shtml'),
  curated('sz-north-temple-pagoda', '苏州', '北寺塔', 'landmark', ['苏州北寺塔', '报恩寺塔'],
    'https://ylj.suzhou.gov.cn/szsylj/ylml/201903/906f0b5d153f46aba15c1bbe698dd045.shtml'),
  curated('sz-gate-east', '苏州', '东方之门', 'landmark', ['苏州东方之门', '东方之门大厦'], suzhouLandmarkSource),
  curated('bj-temple-heaven', '北京', '天坛祈年殿', 'culture', ['祈年殿', '天坛公园-祈年殿', '天坛-祈年殿'],
    'https://gygl.beijing.gov.cn/whgy/whgy_wsgc/201912/t20191206_885633.html'),
  curated('bj-palace-museum', '北京', '故宫博物院', 'culture', ['故宫', '北京故宫', '北京故宫博物院'],
    'https://www.dpm.org.cn/singles_detail/252829.html'),
  curated('bj-birds-nest', '北京', '国家体育场(鸟巢)', 'landmark', ['鸟巢', '国家体育场', '北京鸟巢', '国家体育场·鸟巢'],
    'https://www.beijing.gov.cn/renwen/rwzyd/qxdw/shaozhcqychy/gjtyc/202309/t20230921_3263702.html'),
  curated('sh-oriental-pearl', '上海', '东方明珠广播电视塔', 'landmark', ['东方明珠', '东方明珠塔', '上海东方明珠'],
    'https://english.shanghai.gov.cn/en-ScenicSpots/20231205/19a5f5184eca45728fd57a4d4c8efc61.html'),
  curated('sh-shanghai-tower', '上海', '上海中心大厦', 'landmark', ['上海中心'],
    'https://www.shanghai.gov.cn/nw4411/20260210/757750e6b47b4f1fb9b728b87615a118.html'),
  curated('sh-customs-house', '上海', '上海海关大楼', 'landmark', ['海关大楼(中山东一路)', '外滩海关大楼', '江海关大楼'],
    'https://www.shanghai.gov.cn/nw4411/20250929/222f09ea1ab4462592c433197d1d5330.html'),
  curated('sh-china-art-museum', '上海', '中华艺术宫', 'culture', ['上海美术馆', '中华艺术宫(上海美术馆)', '上海美术馆(中华艺术宫)'],
    'https://whlyj.sh.gov.cn/yshd/20260915/26c3d72ecd5f48fe85cd39f021f71f4f.html'),
  // The provider's parenthetical name is only an identity alias, not live opening-status evidence.
  curated('cd-panda-tower', '成都', '天府熊猫塔', 'landmark', ['成都天府熊猫塔', '四川广播电视塔', '锦绣天府塔', '339天府熊猫塔', '天府熊猫塔(暂停开放)'],
    'https://www.mct.gov.cn/wlbphone/wlbydd/xxfb/qglb/sc/202301/t20230130_938815.html'),
  curated('cd-anshun-bridge', '成都', '安顺廊桥', 'landmark', ['成都安顺廊桥', '安顺桥'],
    'https://www.cdmedi.com/contents/36/471.html'),
  curated('cd-wangjiang-tower', '成都', '望江楼(崇丽阁)', 'landmark', ['望江楼', '崇丽阁', '望江楼崇丽阁', '望江楼公园-崇丽阁'],
    'https://nz.china-embassy.gov.cn/chn/ztbd/xbdkf/xbgk/200309/t20030922_927212.htm'),
  curated('cd-wenshu-monastery', '成都', '文殊院', 'culture', ['成都文殊院'],
    'https://www.sc.gov.cn/10462/zfwjts/2023/4/10/215704f5030646e085164a70244f6153/files/b49f773f9f2b44799a0c6862eabf53c2.pdf'),
  curated('xz-potala-palace', '拉萨', '布达拉宫', 'culture', ['拉萨布达拉宫'], tibetLandmarkSource, '西藏'),
  curated('xz-jokhang-temple', '拉萨', '大昭寺', 'culture', ['拉萨大昭寺'], tibetLandmarkSource, '西藏'),
  curated('xz-norbulingka', '拉萨', '罗布林卡', 'park', ['拉萨罗布林卡'], tibetLandmarkSource, '西藏'),
  curated('xz-tashilhunpo', '日喀则', '扎什伦布寺', 'culture', ['扎什伦布寺景区', '日喀则扎什伦布寺', '札什伦布寺'], tibetLandmarkSource, '西藏'),
].map(place => ({...place, signature: !detailedOnlyIds.has(place.id)}));
const explorationLandmarks = [...guangzhouLandmarks, ...otherDestinationLandmarks];

const nameKey = value => typeof value === 'string' ? value.normalize('NFKC').replace(/\s+/g, '').toLowerCase() : '';
const cityKey = value => {
  const key = nameKey(value).replace(/市$/, '');
  return key === '西藏自治区' ? '西藏' : key;
};
const inDestination = (place, city) => {
  const key = cityKey(city);
  return Boolean(key) && (cityKey(place.city) === key || (place.region && cityKey(place.region) === key));
};
const identities = place => [place?.id, place?.name, place?.shortName, ...(Array.isArray(place?.aliases) ? place.aliases : [])].map(nameKey).filter(Boolean);
const cloneLandmark = place => place ? {...place, aliases: [...place.aliases], kind: 'exploration'} : null;

/** Trusted lookup across the complete curated pool, independent of map filters. */
export function getExplorationLandmark(city, idOrName) {
  if (!nameKey(idOrName)) return null;
  const key = nameKey(idOrName);
  return cloneLandmark(explorationLandmarks.find(place => inDestination(place, city) && identities(place).includes(key)));
}

export function getLandmarkById(id) {
  return cloneLandmark(explorationLandmarks.find(place => place.id === id));
}

/** Return map-only landmarks outside the accepted trip and explicit exclusions. */
export function getExplorationLandmarks(city, {acceptedStops = [], excludedPlaces = [], excludedIds = [], density = 'signature', category = 'all'} = {}) {
  if (density === 'itinerary') return [];
  const selectedCategory = LANDMARK_CATEGORIES.some(option => option.value === category) ? category : 'all';
  const accepted = acceptedStops.map(stop => ({city: stop.city, names: new Set(identities(stop))}));
  const rejectedIds = new Set(excludedIds);
  const rejectedNames = new Set(excludedPlaces.map(nameKey).filter(Boolean));
  return explorationLandmarks
    .filter(place => inDestination(place, city))
    // A province keeps its distant cities in detailed mode. Choosing that city
    // directly makes its own verified landmark available in signature mode.
    .filter(place => (density === 'detailed' || place.signature || (place.region && cityKey(place.city) === cityKey(city)))
      && (selectedCategory === 'all' || place.category === selectedCategory))
    .filter(place => !rejectedIds.has(place.id) && !identities(place).some(key => rejectedNames.has(key)
      || accepted.some(stop => (!stop.city || inDestination(place, stop.city)) && stop.names.has(key))))
    .map(cloneLandmark);
}
