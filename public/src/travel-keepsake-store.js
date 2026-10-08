import {byId} from './travel-catalog.js';
export const DB_NAME='lvzang-keepsakes';
export function isOrderOnlyKeepsake(k){return Boolean(k?.orderOnly||k?.operatorId||k?.serverOrderId||/^(operator-source-|operator-work-|submitted-work-|shared-work-)/.test(k?.id||'')||(k?.tripId||'').startsWith('operator-trip-'));}
export function previewPieceVersion(piece,id){
 const selected=piece.versions?.find(v=>v.id===id);if(!selected)return piece;
 return {...piece,...selected,id:piece.id,label:piece.label,assetId:selected.id,versionTitle:selected.label,versions:piece.versions,versionNumber:piece.versions.indexOf(selected)+1,displayVersionId:piece.displayVersionId};
}
export function groupPieceVersions(objects){
 const byId=new Map(objects.map(o=>[o.id,o])),families=new Map();
 const key=(o,seen=new Set())=>{if(seen.has(o.id))return 'id:'+o.id;seen.add(o.id);if(o.versionOf&&byId.has(o.versionOf))return key(byId.get(o.versionOf),seen);return o.generationId&&o.sourcePhotoId?'photo:'+o.sourcePhotoId:'id:'+o.id;};
 // ponytail: legacy edits have no parent ID; group their shared source photo within this collection.
 for(const o of objects){const id=key(o);if(!families.has(id))families.set(id,[]);families.get(id).push(o);}
 return [...families.values()].map(versions=>{versions.sort((a,b)=>(a.createdAt||0)-(b.createdAt||0)||a.id.localeCompare(b.id));const first=versions[0],selected=versions.find(v=>v.id===first.displayVersionId)||versions.at(-1);return previewPieceVersion({...first,versions,displayVersionId:selected.id},selected.id);});
}
import {accountInfo,storageKey} from './account-client.js';
let legacyMigration;
const names=['keepsakes','memories','photos','requests','meta'];
const str=(v,max=300)=>typeof v==='string'&&Array.from(v).length<=max;
export function validateBundle(bundle){
  const {keepsake:k,memories=[],photos=[]}=bundle||{};
  if(!k||!str(k.id,100)||!k.id||k.schemaVersion!==1||!str(k.title,80)||!k.title.trim()||!str(k.city,40)||!['magnet','miniature'].includes(k.kind)||!['personal','shared'].includes(k.scope)||!str(k.modelRef,100))throw new Error('作品信息无效');
  if(!Array.isArray(k.participants)||!k.participants.length||k.participants.length>12||k.participants.some(p=>!str(p.id,100)||!p.id||!str(p.name,40)||!p.name.trim())||new Set(k.participants.map(p=>p.id)).size!==k.participants.length)throw new Error('参与者信息无效');
  if(!Array.isArray(memories)||memories.length>12||!Array.isArray(k.memoryIds)||k.memoryIds.length!==memories.length||new Set(k.memoryIds).size!==k.memoryIds.length)throw new Error('回忆数量无效');
  for(const m of memories){if(!m||!str(m.id,100)||!m.id||m.keepsakeId!==k.id||!k.memoryIds.includes(m.id)||!str(m.story,1000)||!str(m.date,30)||!str(m.placeName,80)||!Array.isArray(m.photoIds)||m.photoIds.length>4||new Set(m.photoIds).size!==m.photoIds.length||m.photoIds.some(id=>!str(id,100)||!id))throw new Error('回忆信息无效');if(!k.participants.some(p=>p.id===m.authorId))throw new Error('回忆作者不属于这件作品');}
  if(memories.some(m=>memories.filter(n=>n.id===m.id).length!==1))throw new Error('回忆ID重复');
  if(!Array.isArray(photos)||photos.some(p=>!p||!str(p.id,100)||!(p.blob instanceof Blob)||p.blob.size>10*1024*1024||!['image/jpeg','image/png','image/webp'].includes(p.blob.type)))throw new Error('照片格式或大小无效');
  return bundle;
}
export function validateRequest(r){
  if(!r||!str(r.keepsakeId,100)||!r.keepsakeId||!str(r.modelRef,100)||!r.modelRef)throw new Error('请选择作品');
  if(!['height','width'].includes(r.sizeAxis)||!Number.isFinite(r.sizeMm)||(r.source==='agent'?(r.sizeMm<2||r.sizeMm>500):(r.sizeAxis==='height'?![50,70,90].includes(r.sizeMm):r.sizeMm<40||r.sizeMm>160)))throw new Error('定制尺寸无效');
  if(!Number.isInteger(r.quantity)||r.quantity<1||r.quantity>20)throw new Error('数量需要在1到20之间');
  if(!str(r.text??'',20))throw new Error('刻字最多20个字符');
  if(!(r.source==='agent'?['color','ivory','custom']:['color','ivory']).includes(r.colorMode))throw new Error('颜色无效');
  if(r.source==='agent'){
    if(!r.size||!['width','height','depth'].every(key=>Number.isFinite(r.size[key])&&r.size[key]>=2&&r.size[key]<=500))throw new Error('实体制作需要确认宽高厚');
    if(!['pla','resin','other'].includes(r.material))throw new Error('定制材料无效');
    if(!Array.isArray(r.structure)||!r.structure.length||r.structure.length>8||r.structure.some(item=>!str(item,80)||!item.trim()))throw new Error('定制结构无效');
    if(!['print','submit'].includes(r.purpose))throw new Error('制作用途无效');
  }
  return r;
}
export function readLegacyKeepsakes(state){return (state?.collection||[]).flatMap(c=>{const p=byId(c.id);if(!p)return [];return [{id:'legacy-'+c.id,schemaVersion:1,title:c.trip||p.souvenir,city:p.city,kind:'miniature',scope:'personal',participants:[{id:'me',name:'我'}],modelRef:'legacy:'+c.id,placeIds:[c.id],memoryIds:c.story?['legacy-memory-'+c.id]:[],dateStart:c.date,dateEnd:c.date,origin:'legacy',legacyId:c.id,legacyStory:c.story,createdAt:0,updatedAt:0}];});}
export async function openKeepsakeStore({legacy=false,local=false}={}){
  if(!legacy&&!local&&accountInfo.serverLibrary&&accountInfo.user)return (await import('./server-keepsake-store.js')).openServerKeepsakeStore();
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(legacy?DB_NAME:storageKey(DB_NAME),1);r.onupgradeneeded=()=>{for(const name of names)if(!r.result.objectStoreNames.contains(name))r.result.createObjectStore(name,{keyPath:'id'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('请关闭其他旅藏页面后重试'));});
  db.onversionchange=()=>db.close();
  function tx(stores,mode,run){return new Promise((resolve,reject)=>{let result;const t=db.transaction(stores,mode);t.oncomplete=()=>resolve(result);t.onerror=()=>reject(t.localError||t.error||new Error('本机保存失败'));t.onabort=()=>reject(t.localError||t.error||new Error('本机保存失败，原记录已保留'));try{result=run(t);}catch(e){t.abort();reject(e);}});}
  const all=(name,range)=>new Promise((resolve,reject)=>{const t=db.transaction(name),r=t.objectStore(name).getAll(range);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const one=(name,id)=>new Promise((resolve,reject)=>{const r=db.transaction(name).objectStore(name).get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const store={
    list:async()=> (await all('keepsakes')).sort((a,b)=>b.updatedAt-a.updatedAt),
    async get(id){const k=await one('keepsakes',id);if(!k)return null;const memories=await Promise.all(k.memoryIds.map(mid=>one('memories',mid)));if(memories.some(m=>!m))throw new Error('回忆记录不完整，请恢复备份');return {keepsake:k,memories};},
    getPhoto:async id=>(await one('photos',id))?.blob||null,
    getPhotoMemory:id=>one('photos',id),
    async savePhotoMemory(id,body,{onlyIfEmpty=false}={}){if(!str(body.story??'',1000)||!str(body.title??'',80)||(body.story?.length||0)>1000||(body.title?.length||0)>80)throw new Error('照片故事格式无效');await tx('photos','readwrite',t=>{const s=t.objectStore('photos'),r=s.get(id);r.onsuccess=()=>{if(!r.result){t.localError=new Error('照片尚未保存');t.abort();return;}if(onlyIfEmpty&&(r.result.manualStory||r.result.story))return;s.put({...r.result,...body,...(onlyIfEmpty&&r.result.title?{title:r.result.title}:{}),id,blob:r.result.blob});};});},
    async save(bundle){if(isOrderOnlyKeepsake(bundle?.keepsake))bundle.keepsake.orderOnly=true;validateBundle(bundle);const {keepsake:k,memories,photos=[]}=bundle;const present=new Set(photos.map(p=>p.id));for(const m of memories)for(const id of m.photoIds)if(!present.has(id)&&!await one('photos',id))throw new Error('照片尚未保存');let revision;await tx(['keepsakes','memories','photos'],'readwrite',t=>{const s=t.objectStore('keepsakes'),r=s.get(k.id);r.onsuccess=()=>{const old=r.result;if(old&&(old.revision??0)!==(k.revision??0)){t.localError=new Error('作品已在其他页面更新，请保留当前文字，刷新后再保存。');t.abort();return;}revision=(old?.revision??0)+1;s.put({...k,revision});for(const id of old?.memoryIds||[])if(!k.memoryIds.includes(id))t.objectStore('memories').delete(id);for(const m of memories)t.objectStore('memories').put(m);for(const p of photos){const ps=t.objectStore('photos'),pr=ps.get(p.id);pr.onsuccess=()=>{if(!pr.result)ps.put(p);};}};});k.revision=revision;},
    async deleteKeepsake(id){const old=await this.get(id);if(!old)return;const remaining=(await all('memories')).filter(m=>m.keepsakeId!==id),used=new Set(remaining.flatMap(m=>m.photoIds));await tx(['keepsakes','memories','photos'],'readwrite',t=>{t.objectStore('keepsakes').delete(id);for(const m of old.memories){t.objectStore('memories').delete(m.id);for(const pid of m.photoIds)if(!used.has(pid))t.objectStore('photos').delete(pid);}});},
    async saveRequest(body){validateRequest(body);if(!await one('keepsakes',body.keepsakeId))throw new Error('作品尚未保存，先保存这件纪念品');const fingerprint=JSON.stringify([body.keepsakeId,body.modelRef,body.modelVersion,body.sizeAxis,body.sizeMm,body.colorMode,body.quantity,body.text,body.material,body.size,body.structure,body.purpose]);let saved;await tx('requests','readwrite',t=>{const s=t.objectStore('requests'),r=s.getAll();r.onsuccess=()=>{saved=r.result.find(q=>q.fingerprint===fingerprint);if(!saved){saved={...body,id:crypto.randomUUID(),fingerprint,status:'local-draft',createdAt:Date.now()};s.put(saved);}};});return saved;},
    listRequests:()=>all('requests'),
    getMeta:async id=>(await one('meta',id))?.value??null,
    listMeta:prefix=>all('meta',IDBKeyRange.bound(prefix,prefix+'\uffff')),
    setMeta:(id,value)=>tx('meta','readwrite',t=>t.objectStore('meta').put({id,value})),
    async compareMeta(id,value,revision){let saved;await tx('meta','readwrite',t=>{const s=t.objectStore('meta'),r=s.get(id);r.onsuccess=()=>{if((r.result?.value?.revision||0)!==revision){t.localError=new Error('记录已在其他页面更新，请保留当前输入，刷新后再保存');t.abort();return;}saved={...value,revision:revision+1};s.put({id,value:saved});};});return saved;},
    async dump(){return Object.fromEntries(await Promise.all(names.map(async name=>[name,await all(name)])));},
    async restore(data){const existing=new Set((await this.list()).map(k=>k.id)),keepsakes=data.keepsakes.filter(k=>!existing.has(k.id)),ids=new Set(keepsakes.map(k=>k.id)),memories=data.memories.filter(m=>ids.has(m.keepsakeId)),pids=new Set(memories.flatMap(m=>m.photoIds)),existingPhotos=new Map((await all('photos')).map(p=>[p.id,p]));for(const p of data.photos.filter(p=>pids.has(p.id)&&existingPhotos.has(p.id))){const old=existingPhotos.get(p.id).blob,a=new Uint8Array(await old.arrayBuffer()),b=new Uint8Array(await p.blob.arrayBuffer());if(old.type!==p.blob.type||a.length!==b.length||a.some((n,i)=>n!==b[i]))throw new Error('照片编号冲突，原记录已保留');}for(const k of keepsakes)validateBundle({keepsake:k,memories:memories.filter(m=>m.keepsakeId===k.id),photos:data.photos.filter(p=>pids.has(p.id))});await tx(names,'readwrite',t=>{for(const k of keepsakes)t.objectStore('keepsakes').add(k);for(const m of memories)t.objectStore('memories').add(m);for(const p of data.photos.filter(p=>pids.has(p.id)&&!existingPhotos.has(p.id)))t.objectStore('photos').add(p);for(const r of data.requests.filter(r=>ids.has(r.keepsakeId))){validateRequest(r);t.objectStore('requests').add(r);}for(const entry of data.meta||[]){const s=t.objectStore('meta'),r=s.get(entry.id);r.onsuccess=()=>{if(!r.result)s.add(entry);};}});return {imported:keepsakes.length,skipped:data.keepsakes.length-keepsakes.length};},
    close:()=>db.close()
  };if(!legacy&&accountInfo.user?.workspaceOwner&&!await store.getMeta('account-legacy-imported')){const migrate=async()=>{if(await store.getMeta('account-legacy-imported'))return;const old=await openKeepsakeStore({legacy:true});try{await store.restore(await old.dump());await store.setMeta('account-legacy-imported',true);}finally{old.close();}};legacyMigration??=navigator.locks?navigator.locks.request('lvzang-import:'+storageKey(DB_NAME),migrate):migrate();await legacyMigration;}return store;
}
