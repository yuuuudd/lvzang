import test from 'node:test';
import assert from 'node:assert/strict';
import {supplementTravelResearch} from '../travel-advisor.js';

const source=(id,excerpt,accessStatus='fetched')=>({id,url:`https://www.suzhou.gov.cn/${id}`,title:'苏州地点介绍',excerpt,accessStatus,fetchedAt:'2026-10-08T00:00:00.000Z'});
const target={city:'苏州',query:'苏州 东方之门',names:['东方之门','东方之门大厦'],referenceUrl:'https://www.suzhou.gov.cn/gate'};

test('a known reference must actually be read and mention the place before it supplies evidence',async()=>{
  const previous={sources:[source('web-garden','拙政园')]},before=JSON.stringify(previous),reads=[];
  const result=await supplementTravelResearch(previous,[target],{toolImplementations:{
    fetchTravelPage:async(args,options)=>{reads.push(args);assert.ok(options.signal);return {sources:[source('web-gate','苏州东方之门大厦')]};},
    searchTravelWeb:async()=>assert.fail('A successful relevant official read needs no duplicate search'),
  }});
  assert.deepEqual(reads,[{url:target.referenceUrl}]);assert.equal(result.toolCalls,1);
  assert.equal(result.sources.find(item=>item.id==='web-gate').accessStatus,'fetched');
  assert.ok(result.sources.some(item=>item.id==='web-garden'));assert.equal(JSON.stringify(previous),before);
});

test('a stale or unrelated reference does not count as evidence and a precise search still runs',async()=>{
  for(const page of [{sources:[],error:'页面不可用'},{sources:[source('web-unrelated','只有拙政园的介绍')]}]){
    const queries=[];
    const result=await supplementTravelResearch({sources:[]},[target],{toolImplementations:{
      fetchTravelPage:async()=>page,
      searchTravelWeb:async(args)=>{queries.push(args);return {sources:[source('web-gate','苏州东方之门','search-snippet')]};},
    }});
    assert.deepEqual(queries,[{city:'苏州',query:'苏州 东方之门'}]);
    assert.equal(result.sources.find(item=>item.id==='web-gate').accessStatus,'search-snippet');
    assert.equal(result.toolCalls,2);
  }
});

test('shared official evidence can cover the next place without rereading or searching it',async()=>{
  const calls=[];
  const result=await supplementTravelResearch({sources:[]},[target,{...target,query:'苏州 拙政园',names:['拙政园']}],{toolImplementations:{
    fetchTravelPage:async(args)=>{calls.push(args);return {sources:[source('web-city','东方之门与拙政园')]};},
    searchTravelWeb:async()=>assert.fail('Both names are covered by the actual page'),
  }});
  assert.equal(calls.length,1);assert.equal(result.toolCalls,1);
});

test('supplementation is bounded to four distinct place queries and preserves the old ledger',async()=>{
  const queries=Array.from({length:7},(_,i)=>({city:'苏州',query:`苏州 地点${i}`,names:[`地点${i}`]})),calls=[];
  const result=await supplementTravelResearch({sources:[source('web-old','原资料')]},[queries[0],...queries],{toolImplementations:{
    searchTravelWeb:async(args)=>{calls.push(args);return {sources:[]};},
  }});
  assert.equal(calls.length,4);assert.equal(new Set(calls.map(item=>item.query)).size,4);assert.ok(result.sources.some(item=>item.id==='web-old'));
});

test('cancelling an in-flight supplemental read aborts without starting another search',async()=>{
  const controller=new AbortController();
  await assert.rejects(supplementTravelResearch({sources:[]},[target],{signal:controller.signal,toolImplementations:{
    fetchTravelPage:async()=>{queueMicrotask(()=>controller.abort());return new Promise(()=>{});},
    searchTravelWeb:async()=>assert.fail('Cancellation must stop subsequent work'),
  }}),error=>error.name==='AbortError');
});
