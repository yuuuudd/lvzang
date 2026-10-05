import test from 'node:test';
import assert from 'node:assert/strict';

test('version 1 artwork survives trip store upgrade and trip writes stay separate',async()=>{
  const old=globalThis.indexedDB;
  const stores=new Map([['artworks',new Map([['old',{id:'old',createdAt:1,image:'old image'}]])]]);
  let version=1;
  globalThis.indexedDB={open(_name,nextVersion){
    const request={};
    queueMicrotask(()=>{
      request.result={objectStoreNames:{contains:name=>stores.has(name)},createObjectStore(name){stores.set(name,new Map());},transaction(name){
        const tx={objectStore(){return Object.fromEntries(['get','getAll','put','delete'].map(method=>[method,value=>{
          const query={};queueMicrotask(()=>{
            const store=stores.get(name);
            query.result=method==='get'?store.get(value):method==='getAll'?[...store.values()]:undefined;
            if(method==='put')store.set(value.id,value);
            if(method==='delete')store.delete(value);
            tx.oncomplete?.();
          });return query;
        }]));}};return tx;
      },close(){}};
      if(version<nextVersion){version=nextVersion;request.onupgradeneeded?.();}
      request.onsuccess?.();
    });return request;
  }};
  try{
    const history=await import('../public/src/history.js');
    assert.equal((await history.listHistory())[0].id,'old');
    await history.saveTrip({id:'trip',createdAt:2,title:'旅行'});
    assert.equal((await history.getTrip('trip')).title,'旅行');
    assert.equal((await history.listHistory()).length,1);
    assert.equal(version,2);
  }finally{globalThis.indexedDB=old;}
});
