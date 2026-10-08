function boundedText(value, limit, truncate = false) {
  if (typeof value !== 'string') return '';
  if (!truncate && value.length > limit * 4) return '';
  const text = value.slice(0, limit * 4).normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/\s+/g, ' ').trim();
  return text.length <= limit ? text : truncate ? text.slice(0, limit) : '';
}

function finiteNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.length > 80) return null;
  const text = value.trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

/** Normalize an AMap LngLat or provider location without coercing missing values to zero. */
export function normalizeAmapLocation(value) {
  try {
    let pair;
    if (typeof value === 'string') {
      if (value.length > 160) return null;
      pair = value.split(',');
    } else if (Array.isArray(value)) {
      pair = value;
    } else if (value && typeof value === 'object') {
      pair = typeof value.getLng === 'function' && typeof value.getLat === 'function'
        ? [value.getLng(), value.getLat()]
        : ['lng' in value ? value.lng : value.longitude, 'lat' in value ? value.lat : value.latitude];
    }
    if (!pair || pair.length !== 2) return null;
    const lng = finiteNumber(pair[0]);
    const lat = finiteNumber(pair[1]);
    if (lng === null || lat === null || Math.abs(lng) > 180 || Math.abs(lat) > 90) return null;
    return [lng, lat];
  } catch {
    return null;
  }
}

const nameKey = value => boundedText(value, 240).toLowerCase().replace(/\s+/g, '');
export const mapDestinationKey = value => boundedText(value, 120).toLowerCase().replace(/\s+/g, '').replace(/(?:特别行政区|壮族自治区|回族自治区|维吾尔自治区|自治区|自治州|地区|省|市)$/, '');
const cityKey = mapDestinationKey;

/** An administrative name match is required before using a provider center. */
export function selectAmapDistrict(districts, destination) {
  const key=cityKey(destination);
  const list=Array.isArray(districts)?districts:[],exact=list.filter(item=>nameKey(item?.name)===nameKey(destination));
  const explicitLevel=/(?:省|市|自治区|特别行政区|自治州|地区)$/.test(boundedText(destination,120));
  const matches=exact.length?exact:explicitLevel?[]:list.filter(item=>key&&cityKey(item?.name)===key);
  if(matches.length!==1)return null;
  const item=matches[0],position=normalizeAmapLocation(item.center);
  if(!position||!['country','province','city','district'].includes(item.level))return null;
  const adcode=boundedText(item.adcode,6);
  return {name:boundedText(item.name,120),level:item.level,adcode:/^\d{6}$/.test(adcode)?adcode:'',position,zoom:{country:4,province:6,city:11,district:13}[item.level]};
}

function normalizePlace(poi) {
  if (!poi || typeof poi !== 'object') return null;
  try {
    const position = normalizeAmapLocation(poi.location);
    const name = boundedText(poi.name, 240);
    if (!position || !name) return null;
    const province=boundedText(poi.pname,120),district=boundedText(poi.adname,120),adcode=boundedText(poi.adcode,6);
    return {
      id: boundedText(poi.id, 160),
      name,
      address: boundedText(poi.address, 1000, true),
      city: boundedText(poi.cityname, 120) || boundedText(poi.cityName, 120) || boundedText(poi.city, 120),
      position,
      ...(province?{province}:{}),...(district?{district}:{}),...(/^\d{6}$/.test(adcode)?{adcode}:{}),
    };
  } catch {
    return null;
  }
}

/** Prefer a unique full name; aliases are fallback names, still requiring a confirmed area. */
export function selectAmapPlace(pois, query = {}) {
  const {name, city, aliases = [], region = null} = query || {};
  const expectedCity = cityKey(city);
  const expectedName = nameKey(name);
  const aliasNames = new Set((Array.isArray(aliases) ? aliases : []).map(nameKey).filter(Boolean));
  const ids = new Set();
  const candidates = [];
  const matchArea=place=>{
    const city=cityKey(place.city),province=cityKey(place.province),district=cityKey(place.district);
    if(region?.level==='province'){
      if(province&&province!==expectedCity)return false;
      if(region.adcode&&place.adcode&&place.adcode.slice(0,2)!==region.adcode.slice(0,2))return false;
      if(province===expectedCity||city===expectedCity)return true;
      if(region.adcode&&place.adcode)return place.adcode.slice(0,2)===region.adcode.slice(0,2);
      return null;
    }
    if(region?.level==='city'){
      if(region.adcode&&place.adcode&&place.adcode.slice(0,4)!==region.adcode.slice(0,4))return false;
      if(city)return city===expectedCity;
      return region.adcode&&place.adcode?true:null;
    }
    if(region?.level==='district'){
      if(region.adcode&&place.adcode&&place.adcode!==region.adcode)return false;
      if(district)return district===expectedCity;
      return region.adcode&&place.adcode?true:null;
    }
    if(city&&city===expectedCity)return true;
    return expectedCity&&city?false:null;
  };
  for (const poi of Array.isArray(pois) ? pois : []) {
    const place = normalizePlace(poi);
    if (!place) continue;
    if (matchArea(place)===false) continue;
    if (place.id && ids.has(place.id)) continue;
    if (place.id) ids.add(place.id);
    candidates.push(place);
  }
  if (!candidates.length) return {status: 'missing', candidates};
  const canonical = candidates.filter(place => expectedName && nameKey(place.name) === expectedName);
  // Distinct full-name matches remain ambiguous, including coincident points.
  // Do not resolve them via a unique alias or strip qualifiers such as branches.
  const exact = canonical.length ? canonical : candidates.filter(place => aliasNames.has(nameKey(place.name)));
  if (exact.length === 1 && expectedCity && matchArea(exact[0])===true) {
    return {status: 'matched', place: exact[0], candidates};
  }
  return {status: 'ambiguous', candidates};
}

/** Read actual first-route SDK step geometry, distance in meters and time in seconds. */
export function parseAmapRoute(result) {
  const route = Array.isArray(result?.routes) ? result.routes[0] : null;
  if (!route || !Array.isArray(route.steps) || !route.steps.length) return null;
  const meters = finiteNumber(route.distance);
  const seconds = finiteNumber(route.time);
  if (meters === null || seconds === null || meters < 0 || seconds < 0) return null;
  const path = [];
  for (const step of route.steps) {
    if (!Array.isArray(step?.path) || !step.path.length) return null;
    for (const value of step.path) {
      const position = normalizeAmapLocation(value);
      if (!position) return null;
      const previous = path[path.length - 1];
      if (!previous || previous[0] !== position[0] || previous[1] !== position[1]) path.push(position);
    }
  }
  return path.length >= 2 ? {path, meters, seconds} : null;
}

/** Open a coordinate route, or a single provider marker without requesting geolocation. */
export function amapNavigationUrl(options = {}) {
  const {position, name, fromPosition, fromName, mode = 'walk'} = options || {};
  const destination = normalizeAmapLocation(position);
  if (!destination || !['walk', 'car'].includes(mode)) return '';
  const destinationName = boundedText(name, 240, true);
  const url = new URL(fromPosition == null ? 'https://uri.amap.com/marker' : 'https://uri.amap.com/navigation');
  if (fromPosition == null) {
    url.searchParams.set('position', destination.join(','));
    if (destinationName) url.searchParams.set('name', destinationName);
  } else {
    const origin = normalizeAmapLocation(fromPosition);
    if (!origin) return '';
    const originName = boundedText(fromName, 240, true);
    url.searchParams.set('from', `${origin.join(',')}${originName ? `,${originName}` : ''}`);
    url.searchParams.set('to', `${destination.join(',')}${destinationName ? `,${destinationName}` : ''}`);
    url.searchParams.set('mode', mode);
  }
  url.searchParams.set('src', 'lvzang');
  url.searchParams.set('coordinate', 'gaode');
  url.searchParams.set('callnative', '0');
  return url.href;
}
