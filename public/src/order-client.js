import {accountInfo,accountApi,imageData,base64Data} from './account-client.js';
import {openKeepsakeStore} from './travel-keepsake-store.js';
import {selectedAsset,attachSelection} from './operator-domain.js';

export async function openOperatorStore(){
 const base=await openKeepsakeStore();if(!accountInfo.enabled||accountInfo.user?.activeRole!=='operator')return base;
 let orders=[];const blobs=new Map(),remoteAssets=new Map();
 async function readOrders(){orders=(await accountApi('/api/orders')).orders;return orders;}
 async function readOrder(id){const order=await accountApi('/api/orders/'+encodeURIComponent(id));const i=orders.findIndex(o=>o.id===id);if(i>=0)orders[i]=order;else orders.push(order);return order;}
 async function blob(f){if(!f)return null;if(!blobs.has(f.id)){const r=await fetch(f.url);if(!r.ok)throw Error('订单素材暂时无法读取，请重新登录或刷新');blobs.set(f.id,await r.blob());}return blobs.get(f.id);}
 async function asset(order){if(!order.result)return null;const r=order.result;if(!remoteAssets.has(r.id)){remoteAssets.set(r.id,{glb:await blob(r.files.find(f=>f.kind==='model')),reference:await blob(r.files.find(f=>f.kind==='reference')),preview:null,report:r.report,exportable:false});}return remoteAssets.get(r.id);}
 const remote=id=>orders.find(o=>o.commission?.id===id||o.commission?.selection?.id===id);
 await readOrders();return {...base,
  async get(id){const order=remote(id);if(order?.result?.work.id===id){const c=order.commission,k={id,schemaVersion:1,title:order.result.work.title,city:(c.place||'待确认地点').slice(0,40),kind:'miniature',scope:'personal',participants:[{id:'me',name:'我'}],modelRef:'generated:shared-order-'+order.id+':0',generationId:'shared-order-'+order.id,assetIndex:0,memoryIds:[],sourcePhotoId:order.photos[0]?.id,revision:order.result.work.revision,createdAt:order.result.createdAt,updatedAt:order.updatedAt};return {keepsake:k,memories:[]};}return base.get(id);},
  async getPhoto(id){const f=orders.flatMap(o=>o.photos).find(f=>f.id===id);return f?blob(f):base.getPhoto(id);},
  async getMeta(id){if(id.startsWith('operator-commission:')){const cid=id.slice('operator-commission:'.length),o=orders.find(o=>o.id===cid);if(o)return (await readOrder(cid)).commission;}if(id.startsWith('generated-asset:shared-order-')){const oid=id.slice('generated-asset:shared-order-'.length).replace(/:0$/,'');const o=orders.find(o=>o.id===oid);if(o)return asset(o);}return base.getMeta(id);},
  async compareMeta(id,c,revision){if(!c.serverOrderId)return base.compareMeta(id,c,revision);const latest=await readOrder(c.serverOrderId);if(latest.revision!==revision)throw Error('订单已更新，请保留当前输入并刷新后处理');let next=structuredClone(c);
   if(c.selection&&(latest.result?.work.id!==c.selection.id||latest.result?.work.revision!==c.selection.revision)){
    const a=await selectedAsset(c,base);if(!a.reference)throw Error('选定作品缺少参考图');const result=await accountApi('/api/orders/'+c.serverOrderId+'/result',{revision,reference:{image:await imageData(a.reference)},model:a.glb?.size?{base64:await base64Data(a.glb)}:undefined,work:{id:c.selection.id,revision:c.selection.revision,title:a.bundle.keepsake.title},report:a.report});next.revision=result.revision;next.selection=result.commission.selection;next.assetRevision=result.commission.assetRevision;
   }
   const saved=await accountApi('/api/orders/'+c.serverOrderId+'/commission',{commission:next});await readOrder(c.serverOrderId);return saved;
  },
  async dump(){const data=await base.dump();await readOrders();const entries=orders.map(o=>({id:'operator-commission:'+o.id,value:o.commission}));return {...data,meta:[...data.meta.filter(m=>!entries.some(n=>n.id===m.id)),...entries]};},
  async useSubmittedWork(id){const o=await readOrder(id),reference=o.inputs.find(f=>f.kind==='reference'),model=o.inputs.find(f=>f.kind==='model');if(!reference)throw Error('用户未提交作品参考图');const workId='submitted-work-'+id,gen='submitted-input-'+id,photos=await Promise.all(o.photos.map(async f=>({id:f.id,blob:await blob(f)}))),old=await base.get(workId),memories=photos.map(p=>({id:'input-memory-'+p.id,keepsakeId:workId,authorId:'me',date:o.commission.date||'',placeName:o.commission.place||'',story:o.raw.slice(0,1000),photoIds:[p.id]}));const kept={id:workId,schemaVersion:1,title:o.title.slice(0,80),city:(o.commission.place||'待确认地点').slice(0,40),kind:'miniature',scope:'personal',participants:[{id:'me',name:'我'}],modelRef:'generated:'+gen+':0',generationId:gen,assetIndex:0,memoryIds:memories.map(m=>m.id),sourcePhotoId:photos[0]?.id,revision:old?.keepsake.revision||0,createdAt:Date.now(),updatedAt:Date.now()};await base.setMeta('generated-asset:'+gen+':0',{glb:await blob(model),reference:await blob(reference),preview:null,report:{checks:[],note:'用户提交的已有作品；实体打印结构尚需人工核对'},exportable:false});await base.save({keepsake:kept,memories,photos});return attachSelection(o.commission,{id:workId,revision:kept.revision});},
  async listRemoteOrders(){return readOrders();},
  async remoteAction(id,body){const result=await accountApi('/api/orders/'+id,body);await readOrders();return result;}
 };
}
