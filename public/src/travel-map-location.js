const messages = {
  'permission-denied': '定位权限未开启，请在浏览器中允许此页面使用位置后重试。',
  timeout: '定位超时，请检查设备定位服务和网络后重试。',
  unsupported: '当前浏览器无法提供设备定位，请使用支持定位的浏览器，在 HTTPS 或本机页面中重试。',
  'plugin-timeout': '定位服务加载超时，请检查网络后重试。',
  'invalid-position': '定位服务没有返回有效位置，请重试或手动选择起点。',
  'approximate-location': '暂时只能获取大致区域，无法作为当前位置计算路程。请开启设备定位后重试，或手动选择起点。',
  'coordinate-conversion': '当前位置未能转换为地图坐标，请重试或手动选择起点。',
  'location-failed': '暂时无法获取当前位置，请检查设备定位服务后重试，或手动选择起点。',
};

function locationError(code) {
  return Object.assign(new Error(messages[code] || messages['location-failed']), { code });
}

function providerError(result) {
  const info = `${result?.info || ''} ${result?.name || ''} ${result?.message || ''}`;
  if (/PERMISSION[_ ]?DENIED|User denied|permission denied|SecurityError/i.test(info) || result?.code === 1) return locationError('permission-denied');
  if (/TIME[_ ]?OUT|timed out/i.test(info) || result?.code === 3) return locationError('timeout');
  if (/NOT_SUPPORTED|not supported|is not supported/i.test(info)) return locationError('unsupported');
  return locationError('location-failed');
}

function milliseconds(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function positionOf(position) {
  const lng = Array.isArray(position) ? position[0] : typeof position?.getLng === 'function' ? position.getLng() : position?.lng;
  const lat = Array.isArray(position) ? position[1] : typeof position?.getLat === 'function' ? position.getLat() : position?.lat;
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90 || (lng === 0 && lat === 0)) throw locationError('invalid-position');
  return [lng, lat];
}

function placeFromResult(result, accuracyWarningThreshold) {
  const locationType = String(result?.location_type || '').toLowerCase();
  // The SDK also offers IP/city fallbacks; neither represents an observed device position.
  if (!['h5', 'sdk'].includes(locationType)) throw locationError('approximate-location');
  if (locationType === 'h5' && (result.isConverted === false || result.isConverted === 0)) throw locationError('coordinate-conversion');
  const position = positionOf(result.position);
  const accuracy = Number.isFinite(result.accuracy) && result.accuracy > 0 ? result.accuracy : null;
  const city = result.addressComponent?.city;
  const cityName = (Array.isArray(city) ? city[0] : city) || result.addressComponent?.province;
  const warning = accuracy === null
    ? '定位服务未提供精度，路程仅供估算；请核对地图上的起点。'
    : accuracy > accuracyWarningThreshold
      ? `当前位置精度约 ${Math.ceil(accuracy)} 米，路程仅供估算；可重新定位或手动选择起点。`
      : '';
  return {
    id: 'current-location', name: '我的位置', position, accuracy,
    city: typeof cityName === 'string' ? cityName : '',
    address: typeof result.formattedAddress === 'string' ? result.formattedAddress : '',
    locationType, coordinateSystem: 'GCJ-02', warning,
  };
}

/**
 * Called only after the user requests location. Uses a one-shot AMap conversion;
 * no browser-coordinate fallback, watch, persistence, or map movement occurs here.
 * The caller owns cancellation / stale-request handling and displaying `warning`.
 */
export function locateCurrentPosition(sdk, options = {}) {
  const timeout = milliseconds(options.timeout, 12000);
  const pluginTimeout = milliseconds(options.pluginTimeout, 8000);
  const accuracyWarningThreshold = milliseconds(options.accuracyWarningThreshold, 200);
  const maximumAge = Number.isFinite(options.maximumAge) && options.maximumAge >= 0 ? options.maximumAge : 0;

  return new Promise((resolve, reject) => {
    let settled = false;
    let started = false;
    let timer;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(result);
    };
    const start = () => {
      if (settled || started) return;
      started = true;
      clearTimeout(timer);
      if (typeof sdk?.Geolocation !== 'function') return finish(locationError('unsupported'));
      try {
        const geolocation = new sdk.Geolocation({
          enableHighAccuracy: true, GeoLocationFirst: true,
          timeout, maximumAge, convert: true,
          noIpLocate: 3, noGeoLocation: 0, getCityWhenFail: false,
          needAddress: true, extensions: 'base',
          showButton: false, showMarker: false, showCircle: false,
          panToLocation: false, zoomToAccuracy: false,
        });
        if (typeof geolocation.getCurrentPosition !== 'function' || (typeof geolocation.isSupported === 'function' && !geolocation.isSupported())) return finish(locationError('unsupported'));
        timer = setTimeout(() => finish(locationError('timeout')), timeout);
        geolocation.getCurrentPosition((status, result) => {
          if (settled) return;
          if (status !== 'complete') return finish(providerError(result));
          try { finish(null, placeFromResult(result, accuracyWarningThreshold)); }
          catch (error) { finish(error?.code in messages ? error : locationError('invalid-position')); }
        });
      } catch (error) { finish(providerError(error)); }
    };
    if (typeof sdk?.Geolocation === 'function') return start();
    if (typeof sdk?.plugin !== 'function') return finish(locationError('unsupported'));
    timer = setTimeout(() => finish(locationError('plugin-timeout')), pluginTimeout);
    try { sdk.plugin('AMap.Geolocation', start); }
    catch (error) { finish(providerError(error)); }
  });
}
