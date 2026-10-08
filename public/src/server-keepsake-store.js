import {accountApi} from './account-client.js';
import {encodeLibrary,decodeLibrary} from './library-wire.js';

export function openServerKeepsakeStore(){
  const summaries=new Map(),photos=new Map();
  const call=async(method,...args)=>{const value=decodeLibrary((await accountApi('/api/library',{method,args:await encodeLibrary(args)})).value);if(['save','savePhotoMemory','restore','deleteKeepsake'].includes(method))photos.clear();if(method==='restore')summaries.clear();if(method==='setMeta')summaries.delete(args[0]);return value;};
  // ponytail: cache per opened store; refresh to read teammates' changes.
  const cached=(cache,method,id)=>{if(!cache.has(id))cache.set(id,call(method,id).catch(error=>{cache.delete(id);throw error;}));return cache.get(id);};
  const store={close(){},remote:true};
  for(const method of ['list','get','getPhoto','getPhotoMemory','savePhotoMemory','deleteKeepsake','saveRequest','listRequests','getMeta','listMeta','setMeta','compareMeta','dump','restore'])store[method]=(...args)=>call(method,...args);
  store.save=async bundle=>{bundle.keepsake.revision=await call('save',bundle);};
  const assets=new Map();
  // ponytail: one full model response per page; use binary asset downloads for higher throughput.
  let modelReads=Promise.resolve();
  store.getAssetInfo=id=>cached(summaries,'getAssetInfo',id);
  store.getPhotoMemory=id=>cached(photos,'getPhotoMemory',id);
  store.getMeta=id=>{if(!id.startsWith('generated-asset:'))return call('getMeta',id);if(!assets.has(id)){const reading=modelReads.then(()=>call('getMeta',id));modelReads=reading.then(()=>{},()=>{});assets.set(id,reading.then(value=>{if(!value)assets.delete(id);return value;}).catch(error=>{assets.delete(id);throw error;}));}return assets.get(id);};
  store.setMeta=async(id,value)=>{await call('setMeta',id,value);assets.delete(id);};
  return store;
}
