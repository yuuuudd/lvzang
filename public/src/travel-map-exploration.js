import {places} from './travel-catalog.js';

// This pool is for map exploration, never for silently extending an accepted trip.
// The map controller must resolve every location through the provider; no coordinates
// or unverified visit times, fees, and opening hours belong in these objects.
const guangzhouLandmarks = [
  ...places.filter(place => ['gz-museum', 'gz-square', 'gz-tower', 'gz-opera'].includes(place.id))
    .map(({id, name, city, aliases, source}) => ({id, name, city, aliases, source})),
  {
    id: 'gz-library', name: '广州图书馆', city: '广州',
    aliases: ['广州图书馆新馆', '广州图书馆(新馆)'],
    source: 'https://www.gz.gov.cn/zlgz/gzly/wzgz/wtcg/content/post_9589251.html',
  },
  {
    id: 'gz-ifc', name: '广州国际金融中心', shortName: '广州西塔', city: '广州',
    aliases: ['广州西塔', '西塔', '广州国际金融中心(西塔)'],
    source: 'https://www.gz.gov.cn/zt/2019zggzgjtznh/tpxw/content/post_3103990.html',
  },
  {
    id: 'gz-ctf', name: '广州周大福金融中心', shortName: '广州东塔', city: '广州',
    aliases: ['广州东塔', '东塔', '周大福金融中心', '广州周大福金融中心(东塔)'],
    source: 'https://www.gz.gov.cn/zt/2019zggzgjtznh/tpxw/content/post_3103990.html',
  },
  {
    id: 'gz-youth-palace', name: '广州市第二少年宫', shortName: '第二少年宫', city: '广州',
    aliases: ['广州第二少年宫', '第二少年宫'],
    source: 'https://www.gz.gov.cn/zlgz/gzly/wzgz/wtcg/content/post_9589251.html',
  },
];

const nameKey = value => typeof value === 'string' ? value.normalize('NFKC').replace(/\s+/g, '').toLowerCase() : '';
const cityKey = value => nameKey(value).replace(/市$/, '');
const identities = place => [place?.id, place?.name, place?.shortName, ...(Array.isArray(place?.aliases) ? place.aliases : [])].map(nameKey).filter(Boolean);

/** Return map-only landmarks outside the accepted trip and explicit exclusions. */
export function getExplorationLandmarks(city, {acceptedStops = [], excludedPlaces = [], excludedIds = []} = {}) {
  if (cityKey(city) !== '广州') return [];
  const acceptedNames = new Set(acceptedStops
    .filter(stop => !stop.city || cityKey(stop.city) === '广州')
    .flatMap(identities));
  const rejectedIds = new Set(excludedIds);
  const rejectedNames = new Set(excludedPlaces.map(nameKey).filter(Boolean));
  return guangzhouLandmarks
    .filter(place => !rejectedIds.has(place.id) && !identities(place).some(key => acceptedNames.has(key) || rejectedNames.has(key)))
    .map(place => ({...place, aliases: [...place.aliases], kind: 'exploration'}));
}
