import {zipSync,strToU8} from './fflate.js';
import {validateProductType,validateBaseMode,productRulesVersion} from './product-rules.js';

export const sourceLabels={'self-test':'团队自测',trial:'真实试用',business:'真实业务',demo:'演示',customer:'用户提交'};
export const statusLabels={brief:'待完善',make:'待制作',making:'制作中',review:'待审核',delivery:'待交付',delivered:'已交付'};
export const serviceModes={assisted:'需要协助创作',production:'已有 3D 资产'};
export const productionStatusLabels={conversation:'待沟通',waiting:'等待用户',checking:'待生产确认',quote:'待报价',proofing:'打样中',making:'制作中',delivery:'待交付',delivered:'已交付'};
const idValid=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v);
const text=(v,max,label)=>{if(typeof v!=='string'||v.length>max)throw Error(label+'过长或格式无效');return v;};
const copy=c=>structuredClone(c);
export function validateCommission(c){
  if(!c)throw Error('委托信息无效');
  c.serviceMode??='assisted';c.storySynced??=false;c.userConfirmedAt??=null;c.productionStatus??='conversation';c.sizeCm??=12;c.material??='树脂';c.quantity??=1;c.productionNote??='';
  validateProductType(c?.productType);validateBaseMode(c?.baseMode);
  if(!idValid(c.id)||!sourceLabels[c.source]||!statusLabels[c.status]||!serviceModes[c.serviceMode]||!productionStatusLabels[c.productionStatus]||!['digital3d','image','physical'].includes(c.deliveryType))throw Error('委托信息无效');
  for(const [key,max] of Object.entries({title:80,customer:80,raw:3000,summary:3000,internalNote:2000,owner:40,place:80,date:30,due:30,style:30,feedback:2000,deliveryNote:3000,material:40,productionNote:2000}))text(c[key]??'',max,'委托内容');
  if(typeof c.storySynced!=='boolean'||c.userConfirmedAt!==null&&!Number.isFinite(c.userConfirmedAt)||!Number.isFinite(c.sizeCm)||c.sizeCm<=0||c.sizeCm>1000||!Number.isInteger(c.quantity)||c.quantity<1||c.quantity>100)throw Error('生产信息无效');
  if(!c.title?.trim())throw Error('请填写委托名称');
  if(!Array.isArray(c.photoIds)||c.photoIds.length>9||c.photoIds.some(v=>!idValid(v)))throw Error('来源照片无效');
  if(!Number.isInteger(c.revision)||c.revision<0||!Number.isInteger(c.briefVersion)||c.briefVersion<1||!Number.isInteger(c.assetRevision)||c.assetRevision<0)throw Error('委托版本无效');
  if(c.selection&&(!idValid(c.selection.id)||!Number.isInteger(c.selection.revision)||c.selection.revision<0))throw Error('作品引用无效');
  if(!Array.isArray(c.costs)||c.costs.length>30||c.costs.some(v=>!v||!['actual','estimate','unknown'].includes(v.kind)||typeof v.label!=='string'||v.label.length>80||(v.kind!=='unknown'&&(!Number.isFinite(v.amount)||v.amount<0||v.amount>1000000))))throw Error('费用无效');
  if(!Number.isFinite(c.minutes)||c.minutes<0||c.minutes>100000)throw Error('人工时间无效');
  if(!Array.isArray(c.exports)||c.exports.length>100||!Array.isArray(c.log)||c.log.length>200)throw Error('处理记录无效');
  return c;
}
export function createCommission(body={}){
  const now=Date.now();return validateCommission({id:crypto.randomUUID(),revision:0,source:body.source||'self-test',sourceKey:body.sourceKey||'',title:body.title||'新的文创委托',customer:'',owner:'我',raw:'',summary:'',internalNote:'',place:'',date:'',due:'',style:'clay',photoIds:[],productType:null,baseMode:'none',productRulesVersion,deliveryType:'physical',status:'brief',serviceMode:'assisted',storySynced:false,userConfirmedAt:null,productionStatus:'conversation',sizeCm:12,material:'树脂',quantity:1,productionNote:'',briefVersion:1,confirmedVersion:0,assetRevision:0,selection:null,review:null,costs:[],minutes:0,feedback:'',deliveryNote:'',exports:[],log:[],createdAt:now,updatedAt:now,...body});
}
export function createDemoCommissions(existing=[]){
  const ids=new Set(existing.map(c=>c.id)),at=Date.parse('2026-10-05T12:00:00+08:00'),common={source:'demo',customer:'演示用户',storySynced:true,productType:'figurine',baseMode:'round',deliveryType:'physical',createdAt:at,updatedAt:at};
  return [
    createCommission({...common,id:'demo-assisted-douyin',title:'抖音创作者大会',serviceMode:'assisted',raw:'这次嘉兴之旅，从抖音创作者大会的热烈现场开始。夜晚走进水乡，灯光、河道与现场记忆交织在一起。',summary:'保留大会现场和嘉兴夜游的氛围，制作一件桌面纪念摆件。',productionStatus:'waiting',demoImage:'/assets/chikan-style-sample.png',demoPhotos:['/assets/keepsakes/memory-1.webp','/assets/keepsakes/memory-2.webp','/assets/keepsakes/memory-3.webp']}),
    createCommission({...common,id:'demo-production-jiaxing',title:'嘉兴夜游纪念摆件',serviceMode:'production',raw:'嘉兴南湖夜游的河道、拱桥和两岸建筑很安静，也很浪漫，想把这段夜游记忆做成一个小摆件。',summary:'用户已完成 3D 资产，经营者检查后直接报价、打样和生产。',productionStatus:'checking',demoImage:'/assets/keepsakes/hz.png',submittedFileName:'jiaxing-night-v4.glb'})
  ].filter(c=>!ids.has(c.id));
}
function log(c,action,detail){c.updatedAt=Date.now();c.log=[...c.log,{at:c.updatedAt,action,detail}].slice(-200);return c;}
export function reviseCommission(c,patch){
  const next=copy(c),allowed=['title','customer','owner','raw','summary','internalNote','place','date','due','style','photoIds','deliveryType','productType','baseMode','costs','minutes','feedback','deliveryNote','physicalVerified','physicalEvidence','archived','serviceMode','storySynced','productionStatus','sizeCm','material','quantity','productionNote'];
  for(const key of allowed)if(Object.hasOwn(patch,key))next[key]=patch[key];
  const changed=['raw','summary','photoIds','deliveryType','style','place','date','productType','baseMode'].some(key=>JSON.stringify(next[key])!==JSON.stringify(c[key]));
  if(changed){next.briefVersion++;next.review=null;next.confirmedVersion=0;next.status='brief';next.physicalVerified=false;next.physicalEvidence='';next.productRulesVersion=productRulesVersion;}
  return validateCommission(log(next,changed?'修改需求':'更新记录',changed?'新版本需要确认需求并重新审核':'记录已更新'));
}
export function confirmReference(c){if(!c.selection)throw Error('请先选择参考方案');const next=copy(c);next.userConfirmedAt=Date.now();next.productionStatus='checking';return validateCommission(log(next,'用户确认参考方案','可以开始立体模型与生产准备'));}
export function requireModelingReady(c){if(c.serviceMode==='assisted'&&!c.userConfirmedAt)throw Error('参考方案尚未获得用户确认，不能开始建模');}
export function confirmBrief(c){
  validateProductType(c.productType,{required:true});
  if(!c.photoIds.length&&!c.selection)throw Error('请添加来源照片或选择已有作品');
  if(!c.summary.trim())throw Error('请填写或整理需求摘要');
  const next=copy(c);next.confirmedVersion=c.briefVersion;next.status='make';return log(next,'确认需求','需求版本 '+c.briefVersion);
}
export function attachSelection(c,selection){
  if(!idValid(selection?.id)||!Number.isInteger(selection.revision))throw Error('作品引用无效');
  const next=copy(c);if(JSON.stringify(c.selection)!==JSON.stringify(selection)){next.selection=selection;next.assetRevision++;next.review=null;next.physicalVerified=false;next.physicalEvidence='';}
  next.status=next.confirmedVersion===next.briefVersion?'review':'brief';return log(next,'关联作品',selection.id);
}
export function reviewCommission(c,{accepted,note}){
  if(c.confirmedVersion!==c.briefVersion||!c.selection)throw Error('请先确认需求并选择作品');
  if(!text(note||'',1000,'审核说明').trim())throw Error('请写明审核结论或修改要求');
  if(accepted&&c.deliveryType==='physical'&&(!c.physicalVerified||!c.physicalEvidence?.trim()))throw Error('实体尚需实际切片、打样和供应方确认记录；可改为数字交付');
  const next=copy(c);next.review={accepted:Boolean(accepted),note,briefVersion:c.briefVersion,assetRevision:c.assetRevision,at:Date.now()};next.status=accepted?'delivery':'make';return log(next,accepted?'审核通过':'退回修改',note);
}
export function requireReviewed(c){
  if(!c.review?.accepted||c.review.briefVersion!==c.briefVersion||c.review.assetRevision!==c.assetRevision||c.confirmedVersion!==c.briefVersion)throw Error('当前版本尚未审核通过');
}
export function requireProductAsset(c,asset){
  if(c.deliveryType==='image'||!c.productType)return;
  const r=asset?.report;
  if(r?.productType!==c.productType||c.productType==='figurine'&&(r.baseMode||'none')!==(c.baseMode||'none'))throw Error('作品未按当前产品规格制作，请先执行产品处理与检查');
  const names=['topology','connected',c.productType==='magnet'?'flat-back':'standing-stability'];
  if(!Array.isArray(r.checks)||names.some(name=>!r.checks.some(v=>v.name===name&&v.status==='pass'))||r.checks.some(v=>v.status==='fail'))throw Error('产品制作检查未通过，不能交付这一版模型');
}
export function customerView(c){requireReviewed(c);return {title:c.title,summary:c.summary,deliveryType:c.deliveryType,productType:c.productType,baseMode:c.baseMode||'none',productRulesVersion:c.productRulesVersion||productRulesVersion,version:`${c.briefVersion}.${c.assetRevision}`,description:c.deliveryNote,source:sourceLabels[c.source],limitations:'数字模型不等于实物打印保证；实体制作仍需切片与试打。'};}
export function recordExport(c,name){requireReviewed(c);return log({...copy(c),exports:[...c.exports,{at:Date.now(),name,version:`${c.briefVersion}.${c.assetRevision}`}].slice(-100)},'导出交付包',name);}
export function recordDelivery(c,{method}){requireReviewed(c);if(!c.exports.some(e=>e.version===`${c.briefVersion}.${c.assetRevision}`))throw Error('请先导出当前版本交付包');text(method||'',200,'交付方式');if(!method?.trim())throw Error('请记录实际交付方式');return log({...copy(c),status:'delivered',deliveredAt:Date.now(),deliveryMethod:method},'人工记录交付',method);}
export function costSummary(c){const r={actual:0,estimate:0,unknown:0};for(const cost of c.costs){if(cost.kind==='unknown')r.unknown++;else if(['actual','estimate'].includes(cost.kind))r[cost.kind]+=cost.amount;}r.actual=Math.round(r.actual*100)/100;r.estimate=Math.round(r.estimate*100)/100;return r;}
export async function saveCommission(store,c){validateCommission(c);return store.compareMeta('operator-commission:'+c.id,c,c.revision);}
export async function listCommissions(store){return (await store.dump()).meta.filter(m=>m.id.startsWith('operator-commission:')).map(m=>validateCommission(m.value)).sort((a,b)=>b.updatedAt-a.updatedAt);}
export async function selectedAsset(c,store){
  if(!c.selection)throw Error('尚未选择作品');const bundle=await store.get(c.selection.id);if(!bundle)throw Error('来源作品文件未找到，请恢复备份或重新选择');
  const k=bundle.keepsake;if((k.revision??0)!==c.selection.revision)throw Error('作品已更新，请重新选择并审核当前版本');
  let asset;
  if(k.generationId)asset=await store.getMeta(`generated-asset:${k.generationId}:${k.assetIndex}`);
  else if(k.modelRef!=='pending'&&!k.collectionShell){
    const {glbFromPreview}=await import('./mesh-glb-export.js');let model;
    if(k.modelRef?.startsWith('legacy:'))model=(await import('./souvenir-mesh.js')).makeSouvenir(k.modelRef.slice(7));
    else if(k.kind==='magnet')model=await (await import('./travel-magnet.js')).loadMagnet(k.modelRef);
    else model=(await import('./travel-miniature.js')).makeMiniature(k.modelRef);
    const preview={...model,originalColors:model.colors||model.originalColors};asset={glb:glbFromPreview(preview),preview,report:{checks:[],note:'预制模型，尚需切片与试打'},exportable:true};
    const response=await fetch('/assets/keepsakes/'+k.modelRef+'.png');if(response.ok)asset.reference=await response.blob();
  }
  if(!asset)throw Error('作品文件未找到，请完成制作或恢复备份');return {...asset,bundle};
}
export async function exportCommission(c,store,{includePhotos=false}={}){
  requireReviewed(c);const a=await selectedAsset(c,store),files={};requireProductAsset(c,a);
  if(!(a.reference instanceof Blob)||!a.reference.size)throw Error('交付图像文件未找到');
  const ext=a.reference.type==='image/png'?'png':a.reference.type==='image/webp'?'webp':'jpg';files['artwork.'+ext]=new Uint8Array(await a.reference.arrayBuffer());
  if(c.deliveryType!=='image'){if(!(a.glb instanceof Blob)||!a.glb.size)throw Error('交付模型文件未找到');files['model.glb']=new Uint8Array(await a.glb.arrayBuffer());}
  if(includePhotos)for(let i=0;i<c.photoIds.length;i++){const p=await store.getPhoto(c.photoIds[i]);if(!p)throw Error('所选来源照片缺失');files[`photos/${i+1}.${p.type==='image/png'?'png':p.type==='image/webp'?'webp':'jpg'}`]=new Uint8Array(await p.arrayBuffer());}
  const view=customerView(c);files['说明.txt']=strToU8(`${view.title}\n${view.summary}\n${view.description||''}\n版本：${view.version}\n${view.limitations}\n${a.report?.note||''}\n${(a.report?.checks||[]).map(v=>`${v.name||'检查'}：${v.status} ${v.detail||''}`).join('\n')}`);
  files['manifest.json']=strToU8(JSON.stringify({...view,files:Object.keys(files),report:a.report||null},null,2));
  return new Blob([zipSync(files,{level:0})],{type:'application/zip'});
}
