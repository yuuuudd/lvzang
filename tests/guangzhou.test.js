import test from 'node:test';
import assert from 'node:assert/strict';
import {places} from '../public/src/travel-catalog.js';
import {normalizeRequest,planFromCatalog} from '../public/src/travel-domain.js';
import {makeSouvenir} from '../public/src/souvenir-mesh.js';
import {initialState,unlock,writeState,readState,encodeExhibition,decodeExhibition} from '../public/src/travel-state.js';

test('Guangzhou scene plans retained landmarks and respects removal on revision',()=>{
  const first=normalizeRequest({description:'广州半天，预算300元，想去广州塔，喜欢文化建筑'});
  const plan=planFromCatalog(first);assert.equal(plan.status,'ready');assert.ok(plan.stops.every(p=>p.city==='广州'));assert.ok(plan.stops.some(p=>p.id==='gz-tower'));
  const next=planFromCatalog(normalizeRequest({description:'不去广州塔，保留广东省博物馆',previous:first,textRevision:true}));
  assert.ok(!next.stops.some(p=>p.id==='gz-tower'));assert.ok(next.stops.some(p=>p.id==='gz-museum'));assert.equal(next.input.budget,'300元');
});
test('new Guangzhou models have distinct geometry and all-city collections survive saving and sharing',()=>{
  assert.notDeepEqual(makeSouvenir('gz-tower').mesh,makeSouvenir('gz-museum').mesh);
  const state=initialState();for(const p of places)unlock(state,p.id);
  let raw;writeState({setItem:(_,v)=>raw=v},state);assert.equal(readState({getItem:()=>raw}).collection.length,places.length);
  assert.equal(decodeExhibition(encodeExhibition(state)).collection.length,places.length);
});
