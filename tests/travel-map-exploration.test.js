import test from 'node:test';
import assert from 'node:assert/strict';
import {getExplorationLandmarks} from '../public/src/travel-map-exploration.js';
import {places} from '../public/src/travel-catalog.js';

test('three accepted Guangzhou stops and an excluded Canton Tower leave four extra exploration landmarks', () => {
  const acceptedStops = [
    {id: 'gz-museum', city: '广州', name: '广东省博物馆', dayIndex: 1},
    {id: 'gz-square', city: '广州', name: '花城广场', dayIndex: 2},
    {id: 'gz-opera', city: '广州', name: '广州大剧院', dayIndex: 3},
  ];
  const result = getExplorationLandmarks('广州', {acceptedStops, excludedPlaces: ['广州塔']});
  assert.deepEqual(result.map(place => place.id), ['gz-library', 'gz-ifc', 'gz-ctf', 'gz-youth-palace']);
  assert.equal(acceptedStops.length + result.length, 7);
});

test('complete East and West Tower aliases exclude only their matching exploration landmarks', () => {
  const result = getExplorationLandmarks('广州', {excludedPlaces: [' 西 塔 ', '广州东塔']});
  assert.equal(result.some(place => place.id === 'gz-ifc'), false);
  assert.equal(result.some(place => place.id === 'gz-ctf'), false);
  assert.equal(result.some(place => place.id === 'gz-tower'), true);
  const singleCharacter = getExplorationLandmarks('广州', {excludedPlaces: ['塔']});
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
  assert.equal(getExplorationLandmarks(' 广州市 ').length, 8);
  for (const city of ['苏州', '杭州', '广州市天河区', '深圳', '', null, undefined]) {
    assert.deepEqual(getExplorationLandmarks(city), []);
  }
});

test('excluded landmark IDs remove matches independently of names and aliases', () => {
  const result = getExplorationLandmarks('广州', {excludedIds: ['gz-tower', 'gz-ifc', 'gz-library']});
  assert.deepEqual(result.map(place => place.id), ['gz-museum', 'gz-square', 'gz-opera', 'gz-ctf', 'gz-youth-palace']);
});

test('exploration records contain map identity and provenance without itinerary estimates or coordinates', () => {
  const result = getExplorationLandmarks('广州');
  assert.equal(new Set(result.map(place => place.id)).size, 8);
  for (const place of result) {
    assert.equal(place.kind, 'exploration');
    assert.equal(place.city, '广州');
    assert.equal(typeof place.name, 'string');
    assert.equal(Array.isArray(place.aliases), true);
    assert.match(place.source, /^https:\/\//);
    assert.equal(Object.keys(place).every(key => ['id', 'name', 'shortName', 'city', 'aliases', 'source', 'kind'].includes(key)), true);
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
