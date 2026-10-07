// ponytail: browser-local collection loaded at once; add cursor pagination if large libraries become slow.
import {accountInfo,storageKey} from './account-client.js';
let migration;
async function rawRecords(dbName,store,method,value){
  const db=await new Promise((resolve,reject)=>{
    const request=indexedDB.open(dbName,2);
    request.onupgradeneeded=()=>{
      for(const name of ['artworks','trips'])if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name,{keyPath:'id'});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
    request.onblocked=()=>reject(new Error('请关闭其他拾光页面后重试'));
  });
  try{return await new Promise((resolve,reject)=>{
    const transaction=db.transaction(store,method==='getAll'||method==='get'?'readonly':'readwrite');
    const request=transaction.objectStore(store)[method](value);
    transaction.oncomplete=()=>resolve(request.result);
    transaction.onabort=()=>reject(transaction.error||new Error('历史记录保存未完成'));
    transaction.onerror=()=>reject(transaction.error);
  });}finally{db.close();}
}
async function records(store,method,value){
 const name=storageKey('shiguang-history');
 if(accountInfo.user?.workspaceOwner&&!localStorage.getItem(name+':migrated')){const migrate=async()=>{if(localStorage.getItem(name+':migrated'))return;for(const bucket of ['artworks','trips'])for(const item of await rawRecords('shiguang-history',bucket,'getAll'))if(!await rawRecords(name,bucket,'get',item.id))await rawRecords(name,bucket,'put',item);localStorage.setItem(name+':migrated','1');};migration??=navigator.locks?navigator.locks.request('shiguang-import:'+name,migrate):migrate();await migration;}
 return rawRecords(name,store,method,value);
}
export const listHistory=async()=>(await records('artworks','getAll')).sort((a,b)=>b.createdAt-a.createdAt);
export const getHistory=id=>records('artworks','get',id);
export const saveHistory=record=>records('artworks','put',record);
export const deleteHistory=id=>records('artworks','delete',id);
export const listTrips=async()=>(await records('trips','getAll')).sort((a,b)=>b.createdAt-a.createdAt);
export const getTrip=id=>records('trips','get',id);
export const saveTrip=trip=>records('trips','put',trip);
export const deleteTrip=id=>records('trips','delete',id);
