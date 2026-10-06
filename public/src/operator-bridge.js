import {openOperatorStore as openKeepsakeStore} from './order-client.js';
import {createCommission,saveCommission,attachSelection,validateCommission,selectedAsset} from './operator-domain.js';
import {accountApi,base64Data} from './account-client.js';
import {imageBlob} from './travel-cover.js';
import {validateProductType,productRulesVersion} from './product-rules.js';
import {glbFromPreview} from './mesh-glb-export.js';

export async function recordOperatorJob(job){
 const id=job.context?.operatorId;if(!id)return;const store=await openKeepsakeStore();try{const c=await store.getMeta('operator-commission:'+id);if(!c)return;const next=structuredClone(c);if(job.context.operatorBriefVersion===c.briefVersion){next.creationJob=job;next.status='making';}else next.lateCreationJob=job;next.log=[...c.log,{at:Date.now(),action:job.kind==='model'?'提交三维任务':'提交参考图任务',detail:'已保存任务编号 '+job.id+'；恢复查询沿用同一任务'}].slice(-200);await saveCommission(store,next);}finally{store.close();}
}
export async function finishOperatorJob(job,error){
 const id=job.context?.operatorId;if(!id)return;const store=await openKeepsakeStore();try{const c=await store.getMeta('operator-commission:'+id);if(!c||c.creationJob?.id!==job.id)return;const next=structuredClone(c);next.creationJob=null;next.lastCreationError=String(error).slice(0,500);if(c.confirmedVersion===c.briefVersion)next.status='make';next.log=[...c.log,{at:Date.now(),action:'任务明确失败',detail:next.lastCreationError+'；编号 '+job.id+' 保留在记录中'}].slice(-200);await saveCommission(store,next);if(job.kind==='model'&&job.recordId){const {getHistory,saveHistory}=await import('./history.js');const r=await getHistory(job.recordId);if(r?.modelTaskId===job.id)await saveHistory({...r,modelTaskId:null,failedModelTaskId:job.id});}}finally{store.close();}
}

export async function loadOperatorCreation(id){
  const store=await openKeepsakeStore();try{const c=await store.getMeta('operator-commission:'+id);if(!c)throw Error('委托未找到');validateCommission(c);validateProductType(c.productType,{required:true});if(c.confirmedVersion!==c.briefVersion)throw Error('先在工作台确认本次需求');const blob=await store.getPhoto(c.photoIds[0]);if(!blob)throw Error('来源照片未找到，请返回工作台补充');const photo=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('照片无法读取'));r.readAsDataURL(blob);});return {productType:c.productType,baseMode:c.baseMode||'none',productRulesVersion,operatorId:c.id,operatorBriefVersion:c.briefVersion,operatorSourcePhotoId:c.photoIds[0],operatorTitle:c.title,title:c.title,story:c.summary.slice(0,300),place:c.place.slice(0,12),date:c.date,style:c.style,photo,modelingAllowed:c.serviceMode==='production'||Boolean(c.userConfirmedAt),recordId:c.creatorRecordBriefVersion===c.briefVersion?c.creatorRecordId:null,pendingJob:c.creationJob?.context?.operatorBriefVersion===c.briefVersion?c.creationJob:null,bounded:c.summary.length>300||c.place.length>12};}finally{store.close();}
}
export async function attachOperatorArtwork(record){
  if(!record.operatorId)return;const store=await openKeepsakeStore();try{
    const c=await store.getMeta('operator-commission:'+record.operatorId);if(!c)return;
    const id='operator-work-'+record.id,assetId='operator-result-'+record.id;let glb=record.glb;
    if(!(glb instanceof Blob)&&glb?.length)glb=new Blob([new Uint8Array(glb)],{type:'model/gltf-binary'});
    if(record.sculpture?.mesh?.length)glb=glbFromPreview(record.sculpture);
    const reference=imageBlob(record.concept||record.image),old=await store.get(id),photoId=record.photo?'operator-photo-'+record.id:record.operatorSourcePhotoId,photos=record.photo?[{id:photoId,blob:imageBlob(record.photo)}]:[];
    const memories=[{id:id+'-memory',keepsakeId:id,authorId:'me',date:record.input?.date||'',placeName:record.input?.place||'',story:record.input?.story||'',photoIds:photoId?[photoId]:[]}];
    const kept={id,schemaVersion:1,title:(record.design?.caption||record.operatorTitle||'委托作品').slice(0,80),city:(record.input?.place||'待确认地点').slice(0,40),kind:record.input?.productType==='magnet'?'magnet':'miniature',productType:record.input?.productType||null,scope:'personal',orderOnly:true,participants:[{id:'me',name:'我'}],modelRef:'generated:'+assetId+':0',generationId:assetId,assetIndex:0,sourcePhotoId:photoId,memoryIds:memories.map(m=>m.id),tripId:'operator-trip-'+c.id,tripTitle:(record.operatorTitle||record.design?.caption||'委托作品').slice(0,80),operatorId:c.id,createdAt:record.createdAt,updatedAt:Date.now(),revision:old?.keepsake.revision||0};
    await store.setMeta('generated-asset:'+assetId+':0',{glb,productType:record.input?.productType||null,baseMode:record.input?.baseMode||'none',productRulesVersion,reference,preview:record.sculpture||null,report:record.sculpture?.report||{checks:[],note:'设计参考图，尚未完成三维'},exportable:record.sculpture?.exportable===true});await store.save({keepsake:kept,memories,photos});
    if(record.operatorBriefVersion!==c.briefVersion){await store.setMeta('operator-late-result:'+c.id,{workId:id,note:'旧需求版本的结果已保留，请在作品库人工选择'});return;}
    const saved=attachSelection(c,{id,revision:kept.revision});saved.creatorRecordId=record.id;saved.creatorRecordBriefVersion=record.operatorBriefVersion;if(glb||saved.creationJob?.kind!=='model')saved.creationJob=null;saved.log.push({at:Date.now(),action:glb?'三维已保存':'参考图已保存',detail:'关联委托制作记录；尚待经营者审核'});await saveCommission(store,saved);
  }finally{store.close();}
}

export async function commissionFromWork(store,workId,{sourceKey=''}={}){
  const bundle=await store.get(workId);if(!bundle)throw Error('来源作品未找到');const k=bundle.keepsake;
  const c=createCommission({title:k.title+' · 定制委托',sourceKey:sourceKey||'work:'+workId,raw:bundle.memories.find(m=>m.story)?.story||'',summary:bundle.memories.find(m=>m.story)?.story||'',place:k.city,photoIds:[...new Set(bundle.memories.flatMap(m=>m.photoIds))].slice(0,9)});
  return attachSelection(c,{id:k.id,revision:k.revision||0});
}

// Reuse the source file, then save a separate production asset; no image or model generation.
export async function prepareProductSelection(c,store){
  if(c.deliveryType==='image'||!c.productType)return c;
  const a=await selectedAsset(c,store);
  if(a.report?.productType===c.productType&&(c.productType!=='figurine'||(a.report.baseMode||'none')===(c.baseMode||'none')))return c;
  if(!a.glb?.size)throw Error('请先完成三维模型');
  const result=await accountApi('/api/agent',{input:{productType:c.productType,baseMode:c.baseMode||'none'},settings:{widthMm:a.preview?.widthMm||60},glb:await base64Data(a.glb),mode:'offline'});
  const id='product-work-'+crypto.randomUUID(),generationId=id+'-asset',source=a.bundle.keepsake,memories=a.bundle.memories.map((m,i)=>({...m,id:id+'-memory-'+i,keepsakeId:id}));
  const kept={...source,id,generationId,assetIndex:0,revision:0,productType:c.productType,kind:c.productType==='magnet'?'magnet':'miniature',modelRef:'generated:'+generationId+':0',memoryIds:memories.map(m=>m.id),orderOnly:true,createdAt:Date.now(),updatedAt:Date.now()};
  await store.setMeta('generated-asset:'+generationId+':0',{glb:glbFromPreview(result),sourceGlb:a.glb,reference:a.reference,preview:result,report:result.report,exportable:result.exportable,productType:c.productType,baseMode:c.baseMode||'none',productRulesVersion});
  await store.save({keepsake:kept,memories,photos:[]});
  return attachSelection(c,{id,revision:kept.revision});
}
