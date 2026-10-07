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
const cityKey = value => boundedText(value, 120).toLowerCase().replace(/\s+/g, '').replace(/市$/, '');

function normalizePlace(poi) {
  if (!poi || typeof poi !== 'object') return null;
  try {
    const position = normalizeAmapLocation(poi.location);
    const name = boundedText(poi.name, 240);
    if (!position || !name) return null;
    return {
      id: boundedText(poi.id, 160),
      name,
      address: boundedText(poi.address, 1000, true),
      city: boundedText(poi.cityname, 120) || boundedText(poi.cityName, 120) || boundedText(poi.city, 120),
      position,
    };
  } catch {
    return null;
  }
}

/** Only a unique exact/alias name with a confirmed current city is selected automatically. */
export function selectAmapPlace(pois, query = {}) {
  const {name, city, aliases = []} = query || {};
  const expectedCity = cityKey(city);
  const expectedNames = new Set([name, ...(Array.isArray(aliases) ? aliases : [])].map(nameKey).filter(Boolean));
  const ids = new Set();
  const candidates = [];
  for (const poi of Array.isArray(pois) ? pois : []) {
    const place = normalizePlace(poi);
    if (!place) continue;
    const candidateCity = cityKey(place.city);
    if (expectedCity && candidateCity && candidateCity !== expectedCity) continue;
    if (place.id && ids.has(place.id)) continue;
    if (place.id) ids.add(place.id);
    candidates.push(place);
  }
  if (!candidates.length) return {status: 'missing', candidates};
  const exact = candidates.filter(place => expectedNames.has(nameKey(place.name)));
  if (exact.length === 1 && expectedCity && cityKey(exact[0].city) === expectedCity) {
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
