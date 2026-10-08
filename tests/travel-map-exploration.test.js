import test from 'node:test';
import assert from 'node:assert/strict';
import * as exploration from '../public/src/travel-map-exploration.js';
import {places} from '../public/src/travel-catalog.js';
import {selectAmapPlace} from '../public/src/travel-map-data.js';
const {getExplorationLandmarks} = exploration;

test('signature exploration includes Tianhuan and Grandview shopping landmarks without requiring a trip', () => {
  const result = getExplorationLandmarks('广州');
  assert.ok(result.length >= 10 && result.length <= 14);
  for (const name of ['天环广场', '正佳广场', '天河城', '太古汇']) {
    assert.ok(result.some(place => place.name === name), `${name} is missing`);
  }
});

test('Shenzhen has six sourced exploration buildings without requiring an accepted itinerary', () => {
  const ids=['shenzhen-pingan-finance','shenzhen-kk100','shenzhen-diwang','shenzhen-civic-center','shenzhen-china-resources-tower','shenzhen-bay-culture'];
  const result=getExplorationLandmarks('深圳',{density:'detailed'});
  assert.deepEqual(result.map(place=>place.id),ids);
  assert.ok(getExplorationLandmarks('深圳').length>=5);
  for(const place of result){
    assert.equal(place.city,'深圳');assert.equal(place.modelKey,place.id);assert.equal(place.kind,'exploration');
    assert.match(place.source,/^https:\/\//);assert.ok(place.aliases.length>0);
    assert.ok(['landmark','culture'].includes(place.category));
    for(const key of ['coords','position','dayIndex','minutes','cost','availability'])assert.equal(Object.hasOwn(place,key),false);
  }
});

test('Shenzhen aliases match only their named building and keep accepted places out of exploration', () => {
  const aliases=[['平安国际金融中心','shenzhen-pingan-finance'],['京基一百大厦','shenzhen-kk100'],['信兴广场','shenzhen-diwang'],['市民中心','shenzhen-civic-center'],['中国华润大厦（春笋）','shenzhen-china-resources-tower'],['Shenzhen Bay Culture Square','shenzhen-bay-culture']];
  for(const [name,id] of aliases){
    assert.equal(exploration.getExplorationLandmark(' 深圳市 ',name)?.id,id);
    const acceptedStops=[{id:'ai-generated-id',city:'深圳',name}],before=JSON.stringify(acceptedStops);
    assert.equal(getExplorationLandmarks('深圳',{acceptedStops}).some(place=>place.id===id),false);
    assert.equal(JSON.stringify(acceptedStops),before);
    assert.equal(exploration.getExplorationLandmark('苏州',name),null);
  }
  for(const name of ['平安金融中心南塔','KK MALL','华润金融大厦','市民中心广场','深圳湾体育中心','春茧','广场'])assert.equal(exploration.getExplorationLandmark('深圳',name),null,name);
  assert.deepEqual(getExplorationLandmarks('深圳',{category:'culture'}).map(place=>place.id),['shenzhen-bay-culture']);
  assert.deepEqual(getExplorationLandmarks('深圳',{density:'itinerary'}),[]);
  const excluded=getExplorationLandmarks('深圳',{excludedPlaces:['春笋'],excludedIds:['shenzhen-pingan-finance']});
  assert.equal(excluded.length,4);assert.equal(excluded.some(place=>['shenzhen-china-resources-tower','shenzhen-pingan-finance'].includes(place.id)),false);
});

test('detailed exploration expands the pool and filters independently by landmark category', () => {
  const detailed = getExplorationLandmarks('广州', {density: 'detailed'});
  assert.ok(detailed.length >= 20 && detailed.length <= 30);
  assert.ok(detailed.length > getExplorationLandmarks('广州').length);
  for (const category of ['landmark', 'shopping', 'culture', 'park']) {
    const selected = getExplorationLandmarks('广州', {density: 'detailed', category});
    assert.ok(selected.length >= 3, `${category} needs useful choices`);
    assert.ok(selected.every(place => place.category === category));
    assert.ok(selected.every(place => detailed.some(candidate => candidate.id === place.id)));
  }
  assert.deepEqual(getExplorationLandmarks('广州', {density: 'itinerary'}), []);
});

test('shopping filters respect accepted custom names, aliases and explicit exclusions', () => {
  const result = getExplorationLandmarks('广州', {
    density: 'detailed', category: 'shopping',
    acceptedStops: [{id: 'suggested-grandview', name: '正佳', city: '广州'}],
    excludedPlaces: [' 天 环 ', '广州太古汇'], excludedIds: ['gz-teemall'],
  });
  assert.equal(result.some(place => ['天环广场', '正佳广场', '天河城', '太古汇'].includes(place.name)), false);
  assert.ok(result.some(place => place.name === '万菱汇'));
});

test('trusted lookup finds landmarks outside signature density and returns isolated map-only records', () => {
  const found = exploration.getExplorationLandmark('广州市', '广州艺术博物院');
  assert.equal(found?.id, 'gz-art-museum');
  assert.deepEqual(exploration.getLandmarkById(found.id), found);
  assert.equal(exploration.getExplorationLandmark('深圳', '天环'), null);
  assert.equal(exploration.getLandmarkById('untrusted-client-place'), null);
  found.aliases.push('mutated');
  assert.equal(exploration.getLandmarkById(found.id).aliases.includes('mutated'), false);
});

test('accepted Guangzhou stops stay separate from the expanded signature exploration pool', () => {
  const acceptedStops = [
    {id: 'gz-museum', city: '广州', name: '广东省博物馆', dayIndex: 1},
    {id: 'gz-square', city: '广州', name: '花城广场', dayIndex: 2},
    {id: 'gz-opera', city: '广州', name: '广州大剧院', dayIndex: 3},
  ];
  const result = getExplorationLandmarks('广州', {acceptedStops, excludedPlaces: ['广州塔']});
  assert.deepEqual(result.map(place => place.id), ['gz-library', 'gz-ifc', 'gz-parc-central', 'gz-grandview', 'gz-teemall', 'gz-taikoo-hui', 'gz-yongqingfang', 'gz-yuexiu-park']);
  assert.equal(acceptedStops.length + result.length, 11);
});

test('complete East and West Tower aliases exclude only their matching exploration landmarks', () => {
  const result = getExplorationLandmarks('广州', {density: 'detailed', excludedPlaces: [' 西 塔 ', '广州东塔']});
  assert.equal(result.some(place => place.id === 'gz-ifc'), false);
  assert.equal(result.some(place => place.id === 'gz-ctf'), false);
  assert.equal(result.some(place => place.id === 'gz-tower'), true);
  const singleCharacter = getExplorationLandmarks('广州', {density: 'detailed', excludedPlaces: ['塔']});
  assert.deepEqual(singleCharacter.filter(place => ['gz-tower', 'gz-ifc', 'gz-ctf'].includes(place.id)).map(place => place.id), ['gz-tower', 'gz-ifc', 'gz-ctf']);
});

test('accepted custom stop names and full aliases do not reappear as exploration landmarks', () => {
  const result = getExplorationLandmarks('广州', {acceptedStops: [
    {id: 'suggested-1', city: '广州市', name: '广州图书馆（新馆）'},
    {id: 'suggested-2', city: '广州', name: '粤博'},
    {id: 'suggested-3', city: '广州', name: '花城西侧', aliases: ['广州西塔']},
  ]});
  assert.equal(result.some(place => place.id === 'gz-library'), false);
  assert.equal(result.some(place => place.id === 'gz-museum'), false);
  assert.equal(result.some(place => place.id === 'gz-ifc'), false);
  assert.equal(result.some(place => place.id === 'gz-square'), true);
});

test('Guangzhou city suffix and spacing normalize while unsupported destinations have no invented pool', () => {
  assert.equal(getExplorationLandmarks(' 广州市 ').length, 12);
  for (const city of ['广州市天河区', '宁波', '', null, undefined]) {
    assert.deepEqual(getExplorationLandmarks(city), []);
  }
});

test('excluded landmark IDs remove matches independently of names and aliases', () => {
  const result = getExplorationLandmarks('广州', {excludedIds: ['gz-tower', 'gz-ifc', 'gz-library']});
  assert.ok(result.every(place => !['gz-tower', 'gz-ifc', 'gz-library'].includes(place.id)));
  assert.ok(result.some(place => place.id === 'gz-grandview'));
});

test('exploration records contain map identity and provenance without itinerary estimates or coordinates', () => {
  const result = getExplorationLandmarks('广州', {density: 'detailed'});
  assert.equal(new Set(result.map(place => place.id)).size, 26);
  for (const place of result) {
    assert.equal(place.kind, 'exploration');
    assert.equal(place.city, '广州');
    assert.equal(typeof place.name, 'string');
    assert.equal(Array.isArray(place.aliases), true);
    assert.match(place.source, /^https:\/\//);
    assert.equal(Object.keys(place).every(key => ['id', 'name', 'shortName', 'city', 'aliases', 'source', 'kind', 'category', 'signature'].includes(key)), true);
    for (const key of ['coords', 'position', 'dayIndex', 'minutes', 'cost', 'availability']) assert.equal(Object.hasOwn(place, key), false);
  }
});

test('map exploration never changes caller input or planning catalog and returns independent records', () => {
  const acceptedStops = Object.freeze([Object.freeze({id: 'custom', city: '广州', name: '花城广场', aliases: Object.freeze(['城市客厅'])})]);
  const excludedPlaces = Object.freeze(['小蛮腰']);
  const excludedIds = Object.freeze(['gz-opera']);
  const options = Object.freeze({acceptedStops, excludedPlaces, excludedIds});
  const before = JSON.stringify(options), catalogBefore = JSON.stringify(places);
  const result = getExplorationLandmarks('广州', options);
  assert.equal(JSON.stringify(options), before);
  assert.equal(JSON.stringify(places), catalogBefore);
  result[0].name = 'changed by map view';
  result[0].aliases.push('changed alias');
  const again = getExplorationLandmarks('广州', options);
  assert.equal(again[0].name, '广东省博物馆');
  assert.equal(again[0].aliases.includes('changed alias'), false);
  assert.equal(JSON.stringify(places), catalogBefore);
});

test('a landmark accepted in another city does not erase a Guangzhou exploration match', () => {
  const result = getExplorationLandmarks('广州', {acceptedStops: [{id: 'foreign', city: '苏州', name: '广州图书馆'}]});
  assert.equal(result.some(place => place.id === 'gz-library'), true);
});

const destinationIds = {
  杭州: ['hz-leifeng-tower', 'hz-baochu-pagoda', 'hz-three-pools', 'hz-lingyin-temple'],
  苏州: ['sz-tiger-hill', 'sz-museum', 'sz-north-temple-pagoda', 'sz-gate-east'],
  北京: ['bj-temple-heaven', 'bj-palace-museum', 'bj-birds-nest'],
  上海: ['sh-oriental-pearl', 'sh-shanghai-tower', 'sh-customs-house', 'sh-china-art-museum'],
  成都: ['cd-panda-tower', 'cd-anshun-bridge', 'cd-wangjiang-tower', 'cd-wenshu-monastery'],
  西藏: ['xz-potala-palace', 'xz-jokhang-temple', 'xz-norbulingka', 'xz-tashilhunpo'],
};

test('six additional destinations expose verified identities and specific model keys with meaningful density selection', () => {
  const detailedOnly = new Set(['hz-baochu-pagoda', 'sz-north-temple-pagoda', 'sh-customs-house', 'cd-wangjiang-tower', 'xz-tashilhunpo']);
  const all = Object.entries(destinationIds).flatMap(([city, ids]) => {
    const found = getExplorationLandmarks(city, {density: 'detailed'});
    assert.deepEqual(found.map(place => place.id), ids, city);
    assert.deepEqual(getExplorationLandmarks(city).map(place => place.id), ids.filter(id => !detailedOnly.has(id)));
    assert.deepEqual(getExplorationLandmarks(city, {density: 'itinerary'}), []);
    for (const place of found) {
      assert.equal(place.modelKey, place.id);
      assert.equal(place.signature, !detailedOnly.has(place.id));
      assert.equal(place.kind, 'exploration');
      assert.match(place.source, /^https:\/\//);
      assert.deepEqual(exploration.getLandmarkById(place.id), place);
      assert.deepEqual(exploration.getExplorationLandmark(city, place.name), place);
      for (const key of ['coords', 'position', 'dayIndex', 'minutes', 'cost', 'availability']) assert.equal(Object.hasOwn(place, key), false);
    }
    return found;
  });
  assert.equal(new Set(all.map(place => place.id)).size, 23);
});

test('city suffixes and Tibet regional membership remain separate from unrelated cities', () => {
  for (const city of ['杭州', '苏州', '北京', '上海', '成都']) {
    assert.deepEqual(getExplorationLandmarks(` ${city}市 `), getExplorationLandmarks(city));
  }
  assert.deepEqual(getExplorationLandmarks('西藏自治区'), getExplorationLandmarks('西藏'));
  assert.deepEqual(getExplorationLandmarks('拉萨市').map(place => place.id), destinationIds.西藏.slice(0, 3));
  assert.deepEqual(getExplorationLandmarks('日喀则市').map(place => place.id), ['xz-tashilhunpo']);
  assert.equal(exploration.getExplorationLandmark('西藏自治区', 'xz-tashilhunpo')?.city, '日喀则');
  assert.equal(exploration.getExplorationLandmark('拉萨', 'xz-tashilhunpo'), null);
  assert.equal(exploration.getExplorationLandmark('杭州', 'xz-potala-palace'), null);
  assert.equal(exploration.getExplorationLandmark('西藏', 'hz-leifeng-tower'), null);
});

test('new landmark aliases are exact and preserve museum branch and temple identity', () => {
  const cases = [
    ['杭州', ' 杭州雷峰塔 ', 'hz-leifeng-tower'], ['苏州', '云岩寺塔', 'sz-tiger-hill'],
    ['苏州', '苏州博物馆（本馆）', 'sz-museum'], ['北京', '鸟巢', 'bj-birds-nest'],
    ['上海', '东方明珠广播电视塔', 'sh-oriental-pearl'], ['成都', '崇丽阁', 'cd-wangjiang-tower'],
    ['西藏', '扎什伦布寺景区', 'xz-tashilhunpo'],
  ];
  for (const [city, alias, id] of cases) assert.equal(exploration.getExplorationLandmark(city, alias)?.id, id);
  for (const name of ['苏州博物馆西馆', '博物馆', '塔']) assert.equal(exploration.getExplorationLandmark('苏州', name), null);
  assert.equal(exploration.getExplorationLandmark('杭州', '灵隐飞来峰'), null);
});

test('new pools retain category filtering, accepted aliases and explicit exclusions without touching plans', () => {
  const acceptedStops = Object.freeze([Object.freeze({id: 'custom-museum', city: '苏州市', name: '苏博'})]);
  const options = Object.freeze({density: 'detailed', acceptedStops, excludedPlaces: Object.freeze(['云岩寺塔']), excludedIds: Object.freeze(['sz-gate-east'])});
  const before = JSON.stringify(options);
  assert.deepEqual(getExplorationLandmarks('苏州', options).map(place => place.id), ['sz-north-temple-pagoda']);
  assert.equal(JSON.stringify(options), before);
  const cultural = getExplorationLandmarks('上海', {category: 'culture'});
  assert.ok(cultural.length > 0);
  assert.ok(cultural.every(place => place.category === 'culture'));
  const tibet = getExplorationLandmarks('西藏', {density: 'detailed', acceptedStops: [{id: 'accepted-potala', city: '拉萨', name: '布达拉宫'}]});
  assert.equal(tibet.some(place => place.id === 'xz-potala-palace'), false);
  assert.equal(tibet.some(place => place.id === 'xz-tashilhunpo'), true);
  const foreign = getExplorationLandmarks('西藏', {acceptedStops: [{id: 'wrong-city', city: '杭州', name: '布达拉宫'}]});
  assert.equal(foreign.some(place => place.id === 'xz-potala-palace'), true);
  const found = exploration.getExplorationLandmark('西藏', '大昭寺');
  found.aliases.push('caller-mutation');
  found.modelKey = 'untrusted';
  assert.equal(exploration.getExplorationLandmark('拉萨市', '大昭寺').aliases.includes('caller-mutation'), false);
  assert.equal(exploration.getExplorationLandmark('拉萨市', '大昭寺').modelKey, 'xz-jokhang-temple');
});

test('verified provider names resolve specific buildings without widening to ambiguous complexes', () => {
  const cases = [
    ['杭州', '雷峰塔景区雷峰塔', 'hz-leifeng-tower'],
    ['杭州', '杭州西湖风景名胜区-保俶塔', 'hz-baochu-pagoda'],
    ['杭州', '杭州西湖风景名胜区-三潭印月', 'hz-three-pools'],
    ['成都', '望江楼公园-崇丽阁', 'cd-wangjiang-tower'],
    ['成都', '天府熊猫塔(暂停开放)', 'cd-panda-tower'],
    ['上海', '海关大楼(中山东一路)', 'sh-customs-house'],
  ];
  for (const [city, name, id] of cases) {
    const place = exploration.getExplorationLandmark(city, name);
    assert.equal(place?.id, id);
    assert.equal(Object.hasOwn(place, 'availability'), false);
    const result = getExplorationLandmarks(city, {density: 'detailed', acceptedStops: [{id: 'provider-custom', city, name}]});
    assert.equal(result.some(candidate => candidate.id === id), false);
  }
  assert.equal(exploration.getExplorationLandmark('杭州', '雷峰塔景区'), null);
  assert.equal(exploration.getExplorationLandmark('上海', '海关大楼'), null);
  assert.equal(exploration.getExplorationLandmark('上海', '海关大楼(张杨路)'), null);
  assert.equal(exploration.getLandmarkById('cd-panda-tower').name, '天府熊猫塔');
});

test('provider alias matching picks the tower and Bund customs house among real same-area alternatives', () => {
  // Public SDK query snapshots, 2026-10-08. Coordinates are fixture evidence only.
  const tower = selectAmapPlace([
    {name: '雷峰塔景区', cityname: '杭州市', location: [120.148849, 30.230934]},
    {name: '雷峰塔景区雷峰塔', cityname: '杭州市', location: [120.149715, 30.231612]},
    {name: '雷峰塔景区-雷峰夕照', cityname: '杭州市', location: [120.148835, 30.231725]},
  ], exploration.getLandmarkById('hz-leifeng-tower'));
  assert.equal(tower.status, 'matched');
  assert.equal(tower.place.name, '雷峰塔景区雷峰塔');
  const customs = selectAmapPlace([
    {name: '海关大楼(中山东一路)', cityname: '上海市', location: [121.489936, 31.236591]},
    {name: '海关大楼', cityname: '上海市', location: [121.498644, 31.238036]},
    {name: '海关大楼', cityname: '上海市', location: [121.570475, 31.363275]},
    {name: '外滩海关大楼(公交站)', cityname: '上海市', location: [121.490163, 31.237247]},
  ], exploration.getLandmarkById('sh-customs-house'));
  assert.equal(customs.status, 'matched');
  assert.equal(customs.place.name, '海关大楼(中山东一路)');
  const shanghaiTower = selectAmapPlace([
    {name:'上海中心大厦',cityname:'上海市',location:[121.505366,31.23351]},
    {name:'上海之巅观光厅',cityname:'上海市',location:[121.505317,31.233487]},
  ], exploration.getLandmarkById('sh-shanghai-tower'));
  assert.equal(shanghaiTower.status,'matched');
  assert.equal(shanghaiTower.place.name,'上海中心大厦','An interior attraction is not a provider alias for the entire building');
});
