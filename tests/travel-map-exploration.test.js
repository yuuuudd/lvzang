import test from 'node:test';
import assert from 'node:assert/strict';
import * as exploration from '../public/src/travel-map-exploration.js';
import {places} from '../public/src/travel-catalog.js';
const {getExplorationLandmarks} = exploration;

test('signature exploration includes Tianhuan and Grandview shopping landmarks without requiring a trip', () => {
  const result = getExplorationLandmarks('广州');
  assert.ok(result.length >= 10 && result.length <= 14);
  for (const name of ['天环广场', '正佳广场', '天河城', '太古汇']) {
    assert.ok(result.some(place => place.name === name), `${name} is missing`);
  }
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

test('Guangzhou city suffix and spacing normalize while other cities have no curated exploration pool', () => {
  assert.equal(getExplorationLandmarks(' 广州市 ').length, 12);
  for (const city of ['苏州', '杭州', '广州市天河区', '深圳', '', null, undefined]) {
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
