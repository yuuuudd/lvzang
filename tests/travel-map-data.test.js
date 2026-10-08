import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAmapLocation,
  selectAmapPlace,
  parseAmapRoute,
  amapNavigationUrl,
  selectAmapDistrict,
} from '../public/src/travel-map-data.js';

const poi = (values = {}) => ({
  id: 'B000A7B3D0',
  name: '故宫博物院',
  address: '景山前街4号',
  cityname: '北京市',
  location: '116.397026,39.918058',
  ...values,
});

test('province destinations accept POIs with matching provider province evidence, not unrelated cities',()=>{
 const result=selectAmapPlace([
  poi({id:'tibet',name:'布达拉宫',cityname:'拉萨市',pname:'西藏自治区',adcode:'540102',location:[91.118,29.654]}),
  poi({id:'other',name:'布达拉宫',cityname:'广州市',pname:'广东省',adcode:'440106'}),
 ],{name:'布达拉宫',city:'西藏',region:{name:'西藏自治区',level:'province',adcode:'540000'}});
 assert.equal(result.status,'matched');assert.equal(result.place.city,'拉萨市');assert.equal(result.candidates.length,1);
 const unknown=selectAmapPlace([poi({name:'布达拉宫',cityname:'拉萨市'})],{name:'布达拉宫',city:'西藏',region:{level:'province',adcode:'540000'}});
 assert.equal(unknown.status,'ambiguous','A city name alone cannot prove province membership');
 assert.equal(selectAmapPlace([poi({name:'布达拉宫',cityname:'拉萨市',pname:'西藏自治区',adcode:'540102'})],{name:'布达拉宫',city:'广州'}).status,'missing');
});

test('district lookup only accepts a unique matching name and real provider center',()=>{
 const tibet={name:'西藏自治区',level:'province',adcode:'540000',center:[91.1,29.65]};
 assert.deepEqual(selectAmapDistrict([tibet],'西藏'),{name:tibet.name,level:tibet.level,adcode:tibet.adcode,position:[91.1,29.65],zoom:6});
 assert.equal(selectAmapDistrict([{...tibet,name:'广东省'}],'西藏'),null);
 assert.equal(selectAmapDistrict([tibet,{...tibet,adcode:'999999'}],'西藏'),null);
 assert.equal(selectAmapDistrict([{...tibet,center:[null,29]}],'西藏'),null);
 const province={name:'吉林省',level:'province',adcode:'220000',center:[125.32,43.89]},city={name:'吉林市',level:'city',adcode:'220200',center:[126.55,43.84]};
 assert.equal(selectAmapDistrict([province],'吉林市'),null,'An explicitly requested city cannot become its namesake province');
 assert.equal(selectAmapDistrict([province,city],'吉林市').level,'city');
});

test('a confirmed city or district never expands to its same-named province',()=>{
 const changchun=poi({name:'公园',cityname:'长春市',pname:'吉林省',adcode:'220102'});
 assert.equal(selectAmapPlace([changchun],{name:'公园',city:'吉林市',region:{name:'吉林市',level:'city',adcode:'220200'}}).status,'missing');
 assert.equal(selectAmapPlace([changchun],{name:'公园',city:'吉林市'}).status,'missing');
 const sibling=poi({name:'公园',cityname:'拉萨市',adname:'堆龙德庆区',pname:'西藏自治区',adcode:'540103'});
 assert.equal(selectAmapPlace([sibling],{name:'公园',city:'城关区',region:{name:'城关区',level:'district',adcode:'540102'}}).status,'missing');
});

test('AMap locations accept SDK coordinates, pairs, objects and provider strings', () => {
  const expected = [116.397026, 39.918058];
  for (const value of [
    {getLng: () => 116.397026, getLat: () => 39.918058},
    expected,
    ['116.397026', '39.918058'],
    {lng: 116.397026, lat: 39.918058},
    {longitude: 116.397026, latitude: 39.918058},
    ' 116.397026 , 39.918058 ',
  ]) assert.deepEqual(normalizeAmapLocation(value), expected);
  assert.deepEqual(normalizeAmapLocation('-180,-90'), [-180, -90]);
  assert.deepEqual(normalizeAmapLocation([0, 0]), [0, 0]);
});

test('missing, malformed and coerced coordinates never become valid locations', () => {
  for (const value of [
    null, undefined, '', ' ', '116.397026', '116,39,4', '0x10,39',
    'Infinity,39', 'NaN,39', true, 0, {}, [], [116], [116, 39, 4],
    [null, 39], [116, undefined], [false, 39], ['', 39], [' ', 39],
    [[116], 39], [{valueOf: () => 116}, 39], [NaN, 39], [Infinity, 39],
    [181, 39], [116, -91], {lng: null, lat: 39},
    {getLng: () => 116}, {getLng: () => {throw new Error('bad SDK value');}, getLat: () => 39},
  ]) assert.equal(normalizeAmapLocation(value), null);
});

test('only a unique normalized exact or declared alias match in the current city is accepted', () => {
  const result = selectAmapPlace([
    poi({id: 'nearby', name: '故宫博物院停车场'}),
    poi({name: ' 故宫博物院 '}),
  ], {name: '故宫', city: '北京', aliases: ['故宫博物院']});
  assert.equal(result.status, 'matched');
  assert.deepEqual(result.place, {
    id: 'B000A7B3D0', name: '故宫博物院', address: '景山前街4号',
    city: '北京市', position: [116.397026, 39.918058],
  });
  assert.equal(result.candidates.length, 2);
  const normalized = selectAmapPlace([poi({name: 'ＡＭＡＰ Park'})], {name: 'amap park', city: '北京市'});
  assert.equal(normalized.status, 'matched');
});

test('wrong-city and invalid-location results are excluded even when their names match', () => {
  const result = selectAmapPlace([
    poi({id: 'other-city', cityname: '南京市'}),
    poi({id: 'bad-coordinate', location: [null, 39]}),
    poi({id: 'catalog-anchor', location: undefined, x: 70, y: 25, lat: 39, lng: 116}),
  ], {name: '故宫博物院', city: '北京'});
  assert.deepEqual(result, {status: 'missing', candidates: []});
});

test('unknown cities never silently resolve an otherwise exact name', () => {
  const unknownCity = selectAmapPlace([poi({cityname: ''})], {name: '故宫博物院', city: '北京'});
  assert.equal(unknownCity.status, 'ambiguous');
  assert.equal(unknownCity.candidates.length, 1);
  assert.equal(unknownCity.place, undefined);
  const missingTargetCity = selectAmapPlace([poi()], {name: '故宫博物院'});
  assert.equal(missingTargetCity.status, 'ambiguous');
});

test('distinct exact matches and fuzzy-only results remain explicit candidates', () => {
  const duplicateNames = selectAmapPlace([poi(), poi({id: 'second'})], {name: '故宫博物院', city: '北京'});
  assert.equal(duplicateNames.status, 'ambiguous');
  assert.equal(duplicateNames.candidates.length, 2);
  assert.equal(duplicateNames.place, undefined);
  const fuzzy = selectAmapPlace([poi({name: '故宫博物院停车场'})], {name: '故宫', city: '北京'});
  assert.equal(fuzzy.status, 'ambiguous');
  assert.equal(fuzzy.place, undefined);
});

test('repeated provider IDs deduplicate while missing IDs cannot hide distinct candidates', () => {
  const repeated = selectAmapPlace([poi(), poi()], {name: '故宫博物院', city: '北京'});
  assert.equal(repeated.status, 'matched');
  assert.equal(repeated.candidates.length, 1);
  const missingIds = selectAmapPlace([poi({id: ''}), poi({id: ''})], {name: '故宫博物院', city: '北京'});
  assert.equal(missingIds.status, 'ambiguous');
  assert.equal(missingIds.candidates.length, 2);
});

test('provider text is bounded and malformed POIs do not enter candidates', () => {
  const result = selectAmapPlace([
    null, {}, poi({name: 'a'.repeat(241)}), poi({name: 7}),
    poi({id: 'x'.repeat(500), address: 'a'.repeat(3000)}),
  ], {name: '故宫博物院', city: '北京'});
  assert.equal(result.status, 'matched');
  assert.ok(result.place.id.length <= 160);
  assert.ok(result.place.address.length <= 1000);
  assert.equal(selectAmapPlace(null, {name: '故宫', city: '北京'}).status, 'missing');
  assert.equal(selectAmapPlace([], null).status, 'missing');
});

test('routes preserve provider geometry and remove only adjacent repeated endpoints', () => {
  const result = {routes: [{distance: '1300', time: 1080, steps: [
    {path: [[116.397, 39.918], {getLng: () => 116.398, getLat: () => 39.919}]},
    {path: ['116.398,39.919', [116.399, 39.920], [116.397, 39.918]]},
  ]}]};
  assert.deepEqual(parseAmapRoute(result), {
    path: [[116.397, 39.918], [116.398, 39.919], [116.399, 39.920], [116.397, 39.918]],
    meters: 1300, seconds: 1080,
  });
});

test('routes without complete valid geometry or provider metrics stay unresolved', () => {
  const route = {distance: 100, time: 90, steps: [{path: [[116, 39], [116.001, 39.001]]}]};
  for (const value of [
    null, {}, {routes: []}, {routes: [null]},
    {routes: [{...route, steps: []}]},
    {routes: [{...route, steps: [{path: []}]}]},
    {routes: [{...route, steps: [{path: [[116, 39], [null, 39]]}]}]},
    {routes: [{...route, steps: [{path: [[116, 39], [116, 39]]}]}]},
    {routes: [{...route, steps: [route.steps[0], {}]}]},
    {routes: [{...route, distance: null}]}, {routes: [{...route, time: ''}]},
    {routes: [{...route, distance: -1}]}, {routes: [{...route, time: Infinity}]},
    {routes: [{...route, distance: true}]},
  ]) assert.equal(parseAmapRoute(value), null);
});

test('coordinate route navigation encodes both names and uses the provider coordinate system', () => {
  const url = new URL(amapNavigationUrl({
    position: '116.397026,39.918058', name: '故宫 & 博物院',
    fromPosition: [116.391, 39.907], fromName: '天安门广场', mode: 'walk',
  }));
  assert.equal(url.origin, 'https://uri.amap.com');
  assert.equal(url.pathname, '/navigation');
  assert.equal(url.searchParams.get('from'), '116.391,39.907,天安门广场');
  assert.equal(url.searchParams.get('to'), '116.397026,39.918058,故宫 & 博物院');
  assert.equal(url.searchParams.get('mode'), 'walk');
  assert.equal(url.searchParams.get('coordinate'), 'gaode');
  assert.equal(url.searchParams.get('src'), 'lvzang');
  assert.equal(url.searchParams.get('callnative'), '0');
  assert.equal(url.searchParams.size, 6);
  assert.match(url.href, /%E6%95%85%E5%AE%AB/);
  assert.equal(new URL(amapNavigationUrl({position: [116, 39], fromPosition: [117, 40], mode: 'car'})).searchParams.get('mode'), 'car');
});

test('a single resolved point opens a marker without requiring current location', () => {
  const url = new URL(amapNavigationUrl({position: [116.397026, 39.918058], name: '故宫博物院'}));
  assert.equal(url.origin, 'https://uri.amap.com');
  assert.equal(url.pathname, '/marker');
  assert.equal(url.searchParams.get('position'), '116.397026,39.918058');
  assert.equal(url.searchParams.get('name'), '故宫博物院');
  assert.equal(url.searchParams.get('coordinate'), 'gaode');
  assert.equal(url.searchParams.get('from'), null);
  assert.equal(url.searchParams.get('mode'), null);
});

test('invalid coordinates and unsupported travel modes never produce navigation links', () => {
  for (const value of [
    undefined, null, {}, {position: [null, 39]},
    {position: [116, 39], fromPosition: [null, 40]},
    {position: [116, 39], mode: 'bus'},
  ]) assert.equal(amapNavigationUrl(value), '');
});
