import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeExhibition, decodeExhibition, unlock, addRequest, addQuote, readState, writeState } from '../public/src/travel-state.js';
import { makeSouvenir, souvenirSTL } from '../public/src/souvenir-mesh.js';

test('collecting is idempotent and updates survive storage roundtrip',()=>{
  const state={collection:[],requests:[]};
  unlock(state,'sz-pingjiang','旅行');unlock(state,'sz-pingjiang','旅行');
  assert.equal(state.collection.length,1);
  const store=new Map(),storage={getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)};
  writeState(storage,state);assert.equal(readState(storage).collection.length,1);
  assert.throws(()=>writeState({setItem(){throw new Error('quota');}},state),/保存/);
});
test('sharing contains only approved collection fields, rejects malformed and oversized links',()=>{
  const payload=encodeExhibition({title:'江南记忆',collection:[{id:'sz-pingjiang',story:'喜欢小桥',date:'2026-10-04'}],requests:[{phone:'private'}]});
  const decoded=decodeExhibition(payload);
  assert.equal(decoded.title,'江南记忆');assert.equal(decoded.collection[0].id,'sz-pingjiang');
  assert.equal(decoded.requests,undefined);
  assert.throws(()=>decodeExhibition('not-valid'));
  assert.throws(()=>decodeExhibition('x'.repeat(30001)));
  assert.throws(()=>encodeExhibition({title:'x',collection:[{id:'unknown'}]}));
});
test('print requests deduplicate by design and specs, stay unquoted until merchant action',()=>{
  const state={requests:[]};
  const a=addRequest(state,{souvenirId:'sz-pingjiang',width:60,material:'白色 PLA',text:'毕业旅行'});
  const b=addRequest(state,{souvenirId:'sz-pingjiang',width:60,material:'白色 PLA',text:'毕业旅行'});
  assert.equal(a.id,b.id);assert.equal(state.requests.length,1);assert.equal(a.status,'待询价');
});
test('all predefined models are actual closed triangle meshes and export binary STL',()=>{
  for(const id of ['sz-pingjiang','sz-garden','sz-museum','sz-shantang','hz-westlake','hz-hefang','hz-museum','hz-longjing']){
    const {mesh,colors}=makeSouvenir(id);assert.equal(mesh.length%9,0);assert.equal(colors.length,mesh.length);
    const edges=new Map();
    for(let i=0;i<mesh.length;i+=9){const vs=[0,3,6].map(j=>Array.from(mesh.slice(i+j,i+j+3)).join(','));for(let j=0;j<3;j++){const edge=[vs[j],vs[(j+1)%3]].sort().join('|');edges.set(edge,(edges.get(edge)||0)+1);}}
    assert.ok([...edges.values()].every(n=>n===2),'every component must be closed');
    const bytes=souvenirSTL(id,60);assert.equal(bytes.byteLength,84+mesh.length/9*50);
  }
});
test('STL rejects invalid dimensions rather than exporting collapsed geometry',()=>{
  for(const width of [0,39,121,NaN,Infinity])assert.throws(()=>souvenirSTL('sz-pingjiang',width),/40|尺寸/);
});
test('malformed stored entries are rejected before rendering and duplicate quotes do not inflate totals',()=>{
  const malformed={version:1,notes:[{title:'损坏',content:null}]};
  assert.throws(()=>readState({getItem:()=>JSON.stringify(malformed)}),/记录|格式/);
  for(const bad of [{version:1,notes:[{title:'恶意出处',content:'文字',url:'javascript:alert(1)'}]},{version:1,plan:{stops:[],assumptions:[],warnings:[],trace:[],input:{destination:'苏州'},analysis:{findings:[null],places:[]}}}])assert.throws(()=>readState({getItem:()=>JSON.stringify(bad)}),/记录/);
  const state={requests:[]};const req=addRequest(state,{souvenirId:'sz-pingjiang',width:60,material:'白色 PLA'});
  const q={supplier:'试点供应商',price:88,days:5,note:'含运费'};
  addQuote(state,req.id,q);addQuote(state,req.id,q);assert.equal(req.quotes.length,1);assert.equal(req.status,'已录入报价');
  assert.throws(()=>addQuote(state,req.id,{...q,price:0}));
});
