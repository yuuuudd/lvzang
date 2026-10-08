import {DatabaseSync} from 'node:sqlite';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {validateBundle,validateRequest,isOrderOnlyKeepsake} from './public/src/travel-keepsake-store.js';

const buckets=['keepsakes','memories','photos','requests','meta'];
const validId=id=>typeof id==='string'&&id.length>0&&id.length<=240&&!/[\x00-\x1f]/.test(id);
const requireId=id=>{if(!validId(id))throw Error('记录编号无效');return id;};
const validateCollectionInfo=value=>{if(typeof value?.name!=='string'||!value.name.trim()||value.name.length>60)throw Error('合集名称需要1到60字');};
const conflict=()=>{const e=Error('作品已在其他设备更新，请刷新后再保存');e.status=409;throw e;};

export async function createServerLibrary(dir){
  await mkdir(join(dir,'blobs'),{recursive:true});
  const db=new DatabaseSync(join(dir,'library.sqlite'));
  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS records(owner TEXT NOT NULL,bucket TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(owner,bucket,id))');
  const find=db.prepare('SELECT value FROM records WHERE owner=? AND bucket=? AND id=?'),list=db.prepare('SELECT value FROM records WHERE owner=? AND bucket=?'),put=db.prepare('INSERT INTO records VALUES(?,?,?,?) ON CONFLICT(owner,bucket,id) DO UPDATE SET value=excluded.value'),del=db.prepare('DELETE FROM records WHERE owner=? AND bucket=? AND id=?');
  const assetInfo=db.prepare("SELECT json_extract(value,'$.value.reference') AS reference, json_extract(value,'$.value.report') AS report, json_extract(value,'$.value.exportable') AS exportable, json_extract(value,'$.value.glb.$libraryFile') AS model, json_extract(value,'$.value.preview.previewVersion') AS version FROM records WHERE owner=? AND bucket='meta' AND id=?");
  const metaList=db.prepare("SELECT value FROM records WHERE owner=? AND bucket='meta' AND substr(id,1,?)=?");
  // ponytail: one process serializes library transactions; use a shared DB for multiple workers.
  let queue=Promise.resolve();
  async function pack(value){
    if(value instanceof Blob){const bytes=Buffer.from(await value.arrayBuffer());if(bytes.length>40000000)throw Error('单个文件超过40MB');const hash=createHash('sha256').update(bytes).digest('hex');try{await writeFile(join(dir,'blobs',hash),bytes,{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}return {$libraryFile:hash,type:value.type};}
    if(ArrayBuffer.isView(value))return Array.from(value);
    if(Array.isArray(value))return value.every(v=>v===null||typeof v!=='object')?value:Promise.all(value.map(pack));
    if(value&&typeof value==='object'){if(Object.hasOwn(value,'$libraryFile')||Object.hasOwn(value,'$libraryBlob'))throw Error('文件引用无效');return Object.fromEntries(await Promise.all(Object.entries(value).map(async([k,v])=>[k,await pack(v)])));}
    return value;
  }
  async function unpack(value){
    if(Array.isArray(value))return value.every(v=>v===null||typeof v!=='object')?value:Promise.all(value.map(unpack));
    if(value&&typeof value==='object'){
      if(value.$libraryFile){if(!/^[a-f0-9]{64}$/.test(value.$libraryFile))throw Error('文件引用损坏');return new Blob([await readFile(join(dir,'blobs',value.$libraryFile))],{type:value.type});}
      return Object.fromEntries(await Promise.all(Object.entries(value).map(async([k,v])=>[k,await unpack(v)])));
    }return value;
  }
  function methods(owner){
    const raw=(bucket,id)=>{const r=find.get(owner,bucket,requireId(id));return r?JSON.parse(r.value):null;};
    const one=async(bucket,id)=>unpack(raw(bucket,id));
    const all=async bucket=>Promise.all(list.all(owner,bucket).map(r=>unpack(JSON.parse(r.value))));
    const save=async(bucket,id,value)=>put.run(owner,bucket,requireId(id),JSON.stringify(await pack(value)));
    const store={
      list:async()=> (await all('keepsakes')).sort((a,b)=>b.updatedAt-a.updatedAt),
      async get(id){const keepsake=await one('keepsakes',id);if(!keepsake)return null;const memories=await Promise.all(keepsake.memoryIds.map(mid=>one('memories',mid)));if(memories.some(m=>!m))throw Error('回忆记录不完整');return {keepsake,memories};},
      getPhoto:async id=>(await one('photos',id))?.blob||null,
      getPhotoMemory:id=>one('photos',id),
      async savePhotoMemory(id,body,{onlyIfEmpty=false}={}){const p=await one('photos',id);if(!p)throw Error('照片尚未保存');if(!body||typeof(body.story??'')!=='string'||(body.story?.length||0)>1000||typeof(body.title??'')!=='string'||(body.title?.length||0)>80)throw Error('照片故事格式无效');if(onlyIfEmpty&&(p.manualStory||p.story))return;await save('photos',id,{...p,story:body.story??p.story,title:onlyIfEmpty&&p.title?p.title:body.title??p.title,manualStory:onlyIfEmpty?p.manualStory:body.manualStory===true});},
      async save(bundle){
        validateBundle(bundle);const {keepsake:k,memories,photos=[]}=bundle;requireId(k.id);
        const old=raw('keepsakes',k.id);if(old&&(old.revision||0)!==(k.revision||0))conflict();
        const pids=new Set(photos.map(p=>p.id));for(const m of memories){requireId(m.id);const previous=raw('memories',m.id);if(previous&&previous.keepsakeId!==k.id)throw Error('回忆编号冲突');for(const pid of m.photoIds)if(!pids.has(pid)&&!raw('photos',pid))throw Error('照片尚未保存');}
        for(const p of photos){const previous=raw('photos',p.id);if(previous){const incoming=await pack(p.blob);if(previous.blob?.$libraryFile!==incoming.$libraryFile||previous.blob?.type!==incoming.type)throw Error('照片编号冲突，原记录已保留');}else await save('photos',p.id,p);}
        const revision=(old?.revision||0)+1;await save('keepsakes',k.id,{...k,revision,...(isOrderOnlyKeepsake(k)?{orderOnly:true}:{})});
        for(const mid of old?.memoryIds||[])if(!k.memoryIds.includes(mid))del.run(owner,'memories',mid);
        for(const m of memories)await save('memories',m.id,m);return revision;
      },
      async deleteKeepsake(id){const k=raw('keepsakes',id);if(!k)return;del.run(owner,'keepsakes',id);for(const mid of k.memoryIds)del.run(owner,'memories',mid);const used=new Set((await all('memories')).flatMap(m=>m.photoIds));for(const p of list.all(owner,'photos').map(r=>JSON.parse(r.value)))if(!used.has(p.id))del.run(owner,'photos',p.id);},
      async saveRequest(body){validateRequest(body);if(!raw('keepsakes',body.keepsakeId))throw Error('作品尚未保存');const fingerprint=JSON.stringify([body.keepsakeId,body.modelRef,body.modelVersion,body.sizeAxis,body.sizeMm,body.colorMode,body.quantity,body.text,body.material,body.size,body.structure,body.purpose]),old=(await all('requests')).find(r=>r.fingerprint===fingerprint);if(old)return old;const saved={...body,id:randomUUID(),fingerprint,status:'local-draft',createdAt:Date.now()};await save('requests',saved.id,saved);return saved;},
      listRequests:()=>all('requests'),
      getMeta:async id=>(await one('meta',id))?.value??null,
      listMeta:async prefix=>Promise.all(metaList.all(owner,requireId(prefix).length,prefix).map(r=>unpack(JSON.parse(r.value)))),
      async getAssetInfo(id){if(!id.startsWith('generated-asset:'))throw Error('资产编号无效');const a=assetInfo.get(owner,requireId(id));if(!a)return null;return {reference:await unpack(a.reference?JSON.parse(a.reference):null),report:a.report?JSON.parse(a.report):null,exportable:a.exportable===1,hasModel:Boolean(a.model),previewVersion:a.version};},
      async setMeta(id,value){if(id.startsWith('collection-info:'))validateCollectionInfo(value);if(id==='generation-jobs'){if(!Array.isArray(value)||value.length>1000||value.some(v=>!validId(v)))throw Error('任务列表无效');value=[...new Set([...(raw('meta',id)?.value||[]),...value])];}await save('meta',id,{id,value});},
      async compareMeta(id,value,revision){if((raw('meta',id)?.value?.revision||0)!==revision)conflict();if(!Number.isSafeInteger(revision)||revision<0||!value||typeof value!=='object')throw Error('版本格式无效');const saved={...value,revision:revision+1};await save('meta',id,{id,value:saved});return saved;},
      dump:async()=>Object.fromEntries(await Promise.all(buckets.map(async b=>[b,await all(b)]))),
      async restore(data){
        if(!data||buckets.some(b=>!Array.isArray(data[b]))||data.keepsakes.length>100)throw Error('备份格式或作品数量无效');let imported=0;
        for(const k of data.keepsakes){if(raw('keepsakes',k.id))continue;const memories=data.memories.filter(m=>m.keepsakeId===k.id),pids=new Set(memories.flatMap(m=>m.photoIds));await store.save({keepsake:k,memories,photos:data.photos.filter(p=>pids.has(p.id))});imported++;}
        for(const r of data.requests){validateRequest(r);if(!raw('keepsakes',r.keepsakeId))throw Error('备份需求缺少作品');if(!raw('requests',r.id))await save('requests',r.id,r);}
        // Imported files are historical works, never permission to resume a paid task.
        for(const m of data.meta){if(!/^generated-asset:|^collection-cover:|^collection-info:|^world-layout-v1$/.test(m.id))continue;if(m.id.startsWith('collection-info:'))validateCollectionInfo(m.value);if(!raw('meta',m.id))await save('meta',m.id,m);}
        return {imported,skipped:data.keepsakes.length-imported};
      }
    };return store;
  }
  return {call(owner,method,args){const run=queue.then(async()=>{requireId(owner);const store=methods(owner);if(!Object.hasOwn(store,method)||!Array.isArray(args)||args.length>4)throw Error('作品操作无效');db.exec('BEGIN IMMEDIATE');try{const result=await store[method](...args);db.exec('COMMIT');return result??null;}catch(e){db.exec('ROLLBACK');throw e;}});queue=run.catch(()=>{});return run;},async close(){await queue;db.close();}};
}
