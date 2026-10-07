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

const nameKey = value => typeof value === 'string' ? value.normalize('NFKC').replace(/\s+/g, '').toLowerCase() : '';
const cityKey = value => nameKey(value).replace(/市$/, '');
const identities = place => [place?.id, place?.name, place?.shortName, ...(Array.isArray(place?.aliases) ? place.aliases : [])].map(nameKey).filter(Boolean);
const cloneLandmark = place => place ? {...place, aliases: [...place.aliases], kind: 'exploration'} : null;

/** Trusted lookup across the complete curated pool, independent of map filters. */
export function getExplorationLandmark(city, idOrName) {
  if (cityKey(city) !== '广州' || !nameKey(idOrName)) return null;
  const key = nameKey(idOrName);
  return cloneLandmark(guangzhouLandmarks.find(place => identities(place).includes(key)));
}

export function getLandmarkById(id) {
  return cloneLandmark(guangzhouLandmarks.find(place => place.id === id));
}

/** Return map-only landmarks outside the accepted trip and explicit exclusions. */
export function getExplorationLandmarks(city, {acceptedStops = [], excludedPlaces = [], excludedIds = [], density = 'signature', category = 'all'} = {}) {
  if (cityKey(city) !== '广州' || density === 'itinerary') return [];
  const selectedCategory = LANDMARK_CATEGORIES.some(option => option.value === category) ? category : 'all';
  const acceptedNames = new Set(acceptedStops
    .filter(stop => !stop.city || cityKey(stop.city) === '广州')
    .flatMap(identities));
  const rejectedIds = new Set(excludedIds);
  const rejectedNames = new Set(excludedPlaces.map(nameKey).filter(Boolean));
  return guangzhouLandmarks
    .filter(place => (density === 'detailed' || place.signature) && (selectedCategory === 'all' || place.category === selectedCategory))
    .filter(place => !rejectedIds.has(place.id) && !identities(place).some(key => acceptedNames.has(key) || rejectedNames.has(key)))
    .map(cloneLandmark);
}
