import test from 'node:test';
import assert from 'node:assert/strict';

const moduleUrl = new URL('../public/src/travel-map-location.js', import.meta.url);
const locate = async (...args) => (await import(moduleUrl)).locateCurrentPosition(...args);

function fixture({ status = 'complete', result = {}, respond = true, loaded = true, supported = true } = {}) {
  const calls = { plugin: 0, locate: 0, options: null };
  class Geolocation {
    constructor(options) { calls.options = options; }
    isSupported() { return supported; }
    getCurrentPosition(callback) {
      calls.locate += 1;
      if (respond) callback(status, {
        position: { getLng: () => 113.327, getLat: () => 23.131 },
        accuracy: 20, location_type: 'h5', isConverted: true,
        addressComponent: { city: '广州市' }, formattedAddress: '天河路', ...result,
      });
    }
  }
  return { calls, sdk: { plugin(name, callback) {
    assert.equal(name, 'AMap.Geolocation');
    calls.plugin += 1;
    if (loaded) { this.Geolocation = Geolocation; callback(); }
  } } };
}

test('explicit location returns a GCJ-02 origin and uses one-shot high accuracy with no IP fallback', async () => {
  const { sdk, calls } = fixture();
  assert.equal(calls.locate, 0);
  const result = await locate(sdk);
  assert.deepEqual(result.position, [113.327, 23.131]);
  assert.equal(result.id, 'current-location');
  assert.equal(result.name, '我的位置');
  assert.equal(result.coordinateSystem, 'GCJ-02');
  assert.equal(result.accuracy, 20);
  assert.equal(result.city, '广州市');
  assert.equal(result.address, '天河路');
  assert.equal(result.warning, '');
  assert.equal(calls.locate, 1);
  assert.equal(calls.options.convert, true);
  assert.equal(calls.options.noIpLocate, 3);
  assert.equal(calls.options.getCityWhenFail, false);
  assert.equal(calls.options.enableHighAccuracy, true);
  assert.equal(calls.options.maximumAge, 0);
  assert.equal(calls.options.showMarker, false);
  assert.equal(calls.options.panToLocation, false);
});

test('permission refusal has a retryable permission message', async () => {
  const { sdk } = fixture({ status: 'error', result: { info: 'PERMISSION_DENIED' } });
  await assert.rejects(locate(sdk), error => error.code === 'permission-denied' && /权限/.test(error.message) && /重试/.test(error.message));
});

test('provider timeout and silent provider both terminate with retry message', async () => {
  const reported = fixture({ status: 'error', result: { info: 'TIME_OUT' } });
  await assert.rejects(locate(reported.sdk), error => error.code === 'timeout' && /重试/.test(error.message));
  const silent = fixture({ respond: false });
  await assert.rejects(locate(silent.sdk, { timeout: 5 }), error => error.code === 'timeout');
});

test('plugin load also has a finite timeout', async () => {
  const { sdk, calls } = fixture({ loaded: false });
  await assert.rejects(locate(sdk, { pluginTimeout: 5 }), error => error.code === 'plugin-timeout');
  assert.equal(calls.locate, 0);
});

test('missing SDK and unavailable native geolocation report unsupported', async () => {
  await assert.rejects(locate(null), error => error.code === 'unsupported');
  const { sdk, calls } = fixture({ supported: false });
  await assert.rejects(locate(sdk), error => error.code === 'unsupported');
  assert.equal(calls.locate, 0);
});

test('invalid coordinates are never used as a route origin', async () => {
  for (const position of [[181, 23], [113, 91], [NaN, 23], [0, 0], ['113', 23], null]) {
    const { sdk } = fixture({ result: { position } });
    await assert.rejects(locate(sdk), error => error.code === 'invalid-position');
  }
});

test('IP city fallback and unknown source are not presented as current location', async () => {
  for (const location_type of ['ipcity', 'ip', 'city', '', undefined]) {
    const { sdk } = fixture({ result: { location_type } });
    await assert.rejects(locate(sdk), error => error.code === 'approximate-location');
  }
});

test('known unconverted browser coordinates are not sent to AMap routing', async () => {
  const { sdk } = fixture({ result: { isConverted: false } });
  await assert.rejects(locate(sdk), error => error.code === 'coordinate-conversion');
});

test('poor or missing accuracy stays explicit instead of claiming precise location', async () => {
  const coarse = await locate(fixture({ result: { accuracy: 1500 } }).sdk);
  assert.match(coarse.warning, /1500/);
  assert.match(coarse.warning, /估算/);
  const unknown = await locate(fixture({ result: { accuracy: undefined } }).sdk);
  assert.equal(unknown.accuracy, null);
  assert.match(unknown.warning, /精度/);
});

test('the module never includes raw provider data in a failure', async () => {
  const { sdk } = fixture({ status: 'error', result: { info: 'POSITION_UNAVAILABLE', message: 'private raw coordinates 113.327 23.131' } });
  await assert.rejects(locate(sdk), error => error.code === 'location-failed' && !error.message.includes('113.327'));
});

test('a plugin arriving after its timeout cannot start an unexpected location request', async () => {
  let onLoad;
  let requested = 0;
  const sdk = { plugin(_name, callback) { onLoad = callback; } };
  await assert.rejects(locate(sdk, { pluginTimeout: 5 }), error => error.code === 'plugin-timeout');
  sdk.Geolocation = class {
    getCurrentPosition() { requested += 1; }
  };
  onLoad();
  assert.equal(requested, 0);
});

test('an already loaded plugin is reused and a late callback cannot resolve a timed-out request', async () => {
  let onResult;
  let pluginLoads = 0;
  let requested = 0;
  const sdk = {
    plugin() { pluginLoads += 1; },
    Geolocation: class { getCurrentPosition(callback) { requested += 1; onResult = callback; } },
  };
  const request = locate(sdk, { timeout: 5 });
  await assert.rejects(request, error => error.code === 'timeout');
  onResult('complete', { position: [113.327, 23.131], location_type: 'h5', isConverted: true, accuracy: 20 });
  await assert.rejects(request, error => error.code === 'timeout');
  assert.equal(requested, 1);
  assert.equal(pluginLoads, 0);
});
