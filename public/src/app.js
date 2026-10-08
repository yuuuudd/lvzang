import {productLabels,productRulesVersion} from './product-rules.js';
import {glbFromPreview} from './mesh-glb-export.js';
import { createDesign, validateInput, mergeTranscript } from './design.js';
import { binaryStl } from './model.js';
import { threeMf } from './three-mf.js';
import { reliefFromImage } from './relief.js';
import { createPreview } from './preview.js';
import { listHistory, getHistory, saveHistory, deleteHistory } from './history.js';
import { validatePrintSettings } from './print-settings.js';
import { download } from './export-file.js';
import {loadOperatorCreation,attachOperatorArtwork,recordOperatorJob,finishOperatorJob} from './operator-bridge.js';

const $=id=>document.getElementById(id);
const production=window.location?.pathname==='/production.html',productionId=production?new URLSearchParams(location.search).get('operator'):null,brand=production?'旅藏':'拾光';
if(production){document.querySelector('main').inert=true;if(!productionId)location.replace('/operator.html');}
let design=createDesign({}),photo=null,artwork=null,model=null,controller=null,photoVersion=0,artVersion=0,currentJob=null,artifactPlace='',loadingPhoto=false,viewMode='white';
let sculpture=null,sourceGlb=null,modelTaskId=null,referenceJob=null,referenceReview=null;
let preview;try{preview=createPreview($('preview'));}catch{preview=null;}
let currentRecord=null,historyLoading=false,activeTripMemory=null,operatorCreationContext=null;
const status=(message,error=false)=>{$('status').textContent=message;$('status').classList.toggle('error',error);$('creation-error').textContent=error?message:'';$('creation-error').hidden=!error;};
const inputs=()=>validateInput({story:$('story').value,place:$('place').value,labelText:'',date:$('date').value,photoType:'auto',productType:$('product-type').value,baseMode:$('product-type').value==='figurine'?$('figurine-base').value:'none'});
function syncRefine(){$('refine').hidden=$('mode').value==='tripo3d'?(!photo||!referenceJob&&!model):!artwork&&!model;}
syncRefine();
const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
function busy(on){
  on=on||historyLoading;
  for(const id of ['generate','revise','mode','preset','story','place','date','upload','camera','remove-photo','revision','style','creation-flow','product-type','figurine-base','voice','sample','resume'])$(id).disabled=on||(['generate','revise'].includes(id)&&loadingPhoto);
  document.querySelectorAll('.history-actions button').forEach(b=>b.disabled=on||loadingPhoto);
  for(const id of ['relief-depth','smoothness','refresh-history','print-colors','print-width','magnet-diameter','magnet-depth','magnet-clearance','apply-print','version-select','build-reference'])$(id).disabled=on;
  $('cancel').hidden=!on;$('generate').firstChild.textContent=on?'正在创作这段记忆…':'生成我的纪念品 ';
  if(operatorCreationContext){$('product-type').disabled=true;$('figurine-base').disabled=true;}
  syncRefine();
}
function display(){
  for(const [id,mode] of [['color-view','color'],['white-view','white'],['art-view','art']])$(id).setAttribute('aria-pressed',String(mode===viewMode));
  $('color-view').textContent=model?.originalColors?'原色三维':'限色配色预览';
  const flat=viewMode==='art'||!preview;$('preview').hidden=flat;$('fallback').hidden=!flat;
  if(artwork&&flat)$('fallback').src=artwork.toDataURL('image/png');
  preview?.setColor(viewMode==='color');
  $('material-label').textContent=viewMode==='color'?(sculpture?(model.originalColors?'原色三维 · 数字回忆录':model.colorMode==='surface'?`最多 ${sculpture.settings.colors} 色 · 源模型限色`:model.colorMode==='missing'||(sculpture.report.source==='glb'&&!model.colorMode)?'旧白模缺少原始配色':`${sculpture.settings.colors} 色 · 部件配色`):'旧版彩色图片 · 非限色打印'):viewMode==='white'?'白色模型 · 几何预览':'概念参考图';
  if(!preview&&viewMode!=='art')$('material-label').textContent='当前浏览器无法显示 3D，展示原设计图';
}
function modelFor(image){
  const c=document.createElement('canvas'),s=320/Math.max(image.width,image.height);c.width=Math.max(3,Math.round(image.width*s));c.height=Math.max(3,Math.round(image.height*s));
  const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,c.width,c.height);
  return reliefFromImage(ctx.getImageData(0,0,c.width,c.height),{depthMm:Number($('relief-depth').value)/10,smoothing:Number($('smoothness').value)});
}
function render(nextModel=modelFor(artwork)){
  $('model-stage').hidden=false;$('model-empty').hidden=true;
  model=nextModel;preview?.setMesh(model.mesh,{...model,texture:artwork});display();
  $('model-size').textContent=`${model.widthMm.toFixed(0)} × ${model.heightMm.toFixed(1)} × ${(model.totalDepthMm||2+model.depthMm).toFixed(1)} mm`;
  $('export').disabled=sculpture?(!sculpture.exportable||$('version-select').value!==String(sculpture.versions.length-1)):false;$('save-image').disabled=false;
  $('export-3mf').disabled=$('export').disabled||!model.faceColors||model.colorMode==='missing';
}
async function decodeImage(url){
  const img=new Image();img.src=url;try{await img.decode();}catch{throw new Error('图片无法解码，请使用 JPG、PNG 或 WebP 图片');}
  if(img.naturalWidth*img.naturalHeight>48_000_000)throw new Error('图片超过 4800 万像素，请缩小后重试');
  const c=document.createElement('canvas'),s=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight));c.width=Math.round(img.naturalWidth*s);c.height=Math.round(img.naturalHeight*s);c.getContext('2d').drawImage(img,0,0,c.width,c.height);return c;
}
async function applyArtwork(url,next,source,input,recordContext){
  referenceJob=null;$('build-reference').hidden=true;
  showBrief(next);
  const version=++artVersion,image=await decodeImage(url);if(version!==artVersion)return;
  const geometry=modelFor(image);sculpture=null;sourceGlb=null;modelTaskId=null;artwork=image;design=next;artifactPlace=input.place;render(geometry);
  $('art-view').disabled=false;
  $('legacy-relief').hidden=false;$('part-exports').replaceChildren();$('agent-summary').textContent='旧版图像浮雕，未生成磁铁槽，也未执行立体模型检查。';$('agent-log').replaceChildren();$('geometry-checks').replaceChildren();$('version-select').replaceChildren();
  $('shape-note').textContent='旧版图像浅浮雕';$('mount-note').textContent='无磁铁安装孔';
  $('source').textContent=source;$('design-title').textContent=design.caption;$('reason').textContent=design.reason;
  currentRecord=null;
  if(recordContext){
    currentRecord={id:crypto.randomUUID(),createdAt:Date.now(),image:artwork.toDataURL('image/png'),design:next,source,input,...recordContext,depth:$('relief-depth').value,smoothing:$('smoothness').value};
    await persistCurrent();
  }
}
const historyStatus=(message,error=false)=>{$('history-status').textContent=message;$('history-status').classList.toggle('error',error);};
const recordContext=()=>({productType:$('product-type').value,baseMode:$('figurine-base').value,productRulesVersion,style:$('style').value,photo:compressed(photo)||null,mode:$('mode').value,presetId:$('preset').value,creationFlow:$('creation-flow').value||'manual',...(activeTripMemory?{tripId:activeTripMemory.tripId,memoryId:activeTripMemory.memoryId}:{}),...(operatorCreationContext?{operatorId:operatorCreationContext.operatorId,operatorBriefVersion:operatorCreationContext.operatorBriefVersion,operatorSourcePhotoId:operatorCreationContext.operatorSourcePhotoId,operatorTitle:operatorCreationContext.operatorTitle}:{})});
async function persistCurrent(){
  if(!currentRecord)return;
  try{await saveHistory(currentRecord);if(currentRecord.operatorId)try{await attachOperatorArtwork(currentRecord);}catch(error){historyStatus('作品已保存，关联订单失败：'+error.message+'。可返回工作台从作品库选择。',true);}await refreshHistory();historyStatus('作品、制作参数与检查记录已保存到当前浏览器。');window.dispatchEvent?.(new Event('trip-artifact-saved'));}
  catch{historyStatus('历史保存失败，可能是浏览器存储不可用或空间不足。当前作品仍可导出，请先保存图片和 STL。',true);}
}
async function refreshHistory(){
  try{
    const records=(await listHistory()).filter(entry=>!entry.hidden&&(!production||entry.operatorId===productionId));$('history-list').replaceChildren();$('history-count').textContent=records.length;
    for(const entry of records){
      const card=document.createElement('article');card.className='history-card';
      const img=document.createElement('img');img.src=entry.image;img.alt=entry.design.caption;img.loading='lazy';
      const title=document.createElement('h3');title.textContent=entry.design.caption;
      const info=document.createElement('p');info.textContent=`${entry.input.place} · ${new Date(entry.createdAt).toLocaleString('zh-CN')} · ${entry.source}`;
      const actions=document.createElement('div');actions.className='history-actions';
      const open=document.createElement('button');open.className='small-button';open.textContent='打开作品';open.addEventListener('click',()=>openHistory(entry.id));
      const remove=document.createElement('button');remove.className='text-button';remove.textContent='删除作品';remove.addEventListener('click',async()=>{
        if(controller||historyLoading||!window.confirm(`删除“${entry.design.caption}”的历史记录？此操作无法撤销。`))return;
        try{await deleteHistory(entry.id);if(currentRecord?.id===entry.id)currentRecord=null;await refreshHistory();}
        catch{historyStatus('删除失败，历史记录仍保留，请重试。',true);}
      });
      actions.append(open,remove);card.append(img,title,info,actions);$('history-list').append(card);
    }
    busy(Boolean(controller));historyStatus(records.length?'选择作品，继续查看或导出。':'还没有生成记录。完成一次 AI 创作或照片直转后，作品会出现在这里。');
  }catch{historyStatus('无法读取历史，请检查浏览器存储权限后点击刷新历史。',true);}
}
async function openHistory(id){
  if(controller||historyLoading||loadingPhoto)return;
  stopSpeech();historyLoading=true;busy(true);
  const oldDepth=$('relief-depth').value,oldSmoothing=$('smoothness').value;
  try{
    const entry=await getHistory(id);if(!entry)throw new Error('这条历史记录已被删除，请刷新历史。');
    if(operatorCreationContext&&(entry.operatorId!==operatorCreationContext.operatorId||entry.operatorBriefVersion!==operatorCreationContext.operatorBriefVersion||entry.input?.productType!==operatorCreationContext.productType||(entry.input?.baseMode||'none')!==(operatorCreationContext.baseMode||'none')))throw Error('这份历史不属于当前订单的产品和需求版本，请返回工作台重新选择来源。');
    currentJob=null;$('resume').hidden=true;
    const restoredPhoto=entry.photo?await decodeImage(entry.photo):null;
    $('relief-depth').value=entry.depth;$('smoothness').value=entry.smoothing;
    if(entry.phase==='reference'){
      referenceJob={design:entry.design,input:entry.input,context:{style:entry.style,photo:entry.photo,mode:entry.mode,presetId:entry.presetId||'none',tripId:entry.tripId,memoryId:entry.memoryId,creationFlow:entry.operatorId?'manual':entry.creationFlow||'manual',...(entry.operatorId?{operatorId:entry.operatorId,operatorBriefVersion:entry.operatorBriefVersion,operatorSourcePhotoId:entry.operatorSourcePhotoId,operatorTitle:entry.operatorTitle}:{})},settings:entry.settings,concept:entry.image,recordId:entry.id,review:entry.review};$('build-reference').hidden=false;
      if(entry.modelTaskId){currentJob={...referenceJob,id:entry.modelTaskId,kind:'model'};$('resume').hidden=false;$('build-reference').hidden=true;}
      sculpture=null;model=null;artwork=await decodeImage(entry.image);sourceGlb=null;modelTaskId=null;design=entry.design;
      $('legacy-relief').hidden=true;
      showBrief(entry.design,entry.image);showReview(entry.review||null,!entry.review?'此记录尚无自动回看结果，请人工核对参考图。':'');restorePrintSettings(entry.settings);
      showBirthCard(entry.design,null,entry.image,entry.input);$('trail-model').textContent=entry.modelTaskId?'三维：已提交，可继续取结果':'三维：本轮尚未生成';
      $('model-stage').hidden=true;$('model-empty').hidden=true;$('export').disabled=true;$('save-image').disabled=true;
      $('export-3mf').disabled=true;
      $('source').textContent='故事参考图 · 尚未完成三维';$('design-title').textContent=design.caption;$('reason').textContent=design.reason;
      $('shape-note').textContent='参考图已保存';$('mount-note').textContent='待生成无孔三维';
      $('agent-log').replaceChildren();$('geometry-checks').replaceChildren();$('part-exports').replaceChildren();$('version-select').replaceChildren();
      $('agent-summary').textContent='此记录仅为参考图，尚无可导出的三维模型。';
    }else if(entry.sculpture){
      sourceGlb=entry.sourceModel||entry.glb||null;modelTaskId=entry.modelTaskId||null;artwork=entry.concept?await decodeImage(entry.concept):null;
      restorePrintSettings(entry.sculpture.settings);applySculpture(entry.sculpture,entry.design,entry.source,entry.input);showReview(entry.review||null);
    }else await applyArtwork(entry.image,entry.design,entry.source,entry.input);
    currentRecord=entry;photoVersion++;photo=restoredPhoto;activeTripMemory=entry.tripId&&entry.memoryId?{tripId:entry.tripId,memoryId:entry.memoryId,title:entry.design.caption}:null;showTripContext();
    if(entry.design.brief){trail('trail-evidence',`依据：${entry.input.story||entry.design.brief.summary}`);trail('trail-choice',`构图：${entry.design.brief.composition}`);}
    if(entry.sculpture)trail('trail-model',entry.sculpture.exportable?'三维：已完成几何检查，待试打':'三维：检查未通过，禁止导出');
    for(const [id,value] of Object.entries({story:entry.input.story||'',place:entry.input.place||'',date:entry.input.date||'',style:entry.style||'enamel',mode:entry.mode||'tripo3d',preset:entry.presetId||'none','creation-flow':entry.creationFlow||'manual',revision:''}))$(id).value=value;
    $('product-type').value=entry.input?.productType||'magnet';$('figurine-base').value=entry.input?.baseMode||'none';syncProduct();
    $('story').dispatchEvent(new Event('input'));$('style').dispatchEvent(new Event('change'));$('relief-depth').dispatchEvent(new Event('input'));
    showPhotoPreview(photo?entry.photo:null);
    $('photo-status').textContent=photo?'已恢复此作品的参考照片。':'此作品没有参考照片。';
    status(entry.sculpture&&!entry.sculpture.exportable?'已打开历史作品，模型检查未通过。请查看制作记录。':'已打开历史作品，可继续调整或导出。',Boolean(entry.sculpture&&!entry.sculpture.exportable));document.querySelector('.result').scrollIntoView({block:'start'});
  }catch(e){$('relief-depth').value=oldDepth;$('smoothness').value=oldSmoothing;status(e.message,true);}
  finally{historyLoading=false;busy(false);}
}
async function recoverModelTask(token){
  if(!/^[A-Za-z0-9_-]{1,100}\.[a-f0-9]{64}$/.test(token))throw new Error('三维任务编号无效');
  const records=await listHistory(),entry=records.find(item=>item.phase==='reference'&&item.modelTaskId===token)||records.find(item=>item.phase==='reference'&&!item.modelTaskId);
  if(!entry)throw new Error('当前浏览器没有找到可恢复的参考图，请在生成时使用的浏览器打开此链接');
  await saveHistory({...entry,modelTaskId:token});await openHistory(entry.id);
  if(currentJob?.id!==token)throw new Error('三维任务恢复未完成，请打开历史参考图重试');
  status('已找回已付费的三维任务，正在继续取结果。');return true;
}
$('refresh-history').addEventListener('click',refreshHistory);
refreshHistory();
function compressed(image){
  if(!image)return undefined;
  const c=document.createElement('canvas'),s=Math.min(1,960/Math.max(image.width,image.height));c.width=Math.round(image.width*s);c.height=Math.round(image.height*s);const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(image,0,0,c.width,c.height);return c.toDataURL('image/jpeg',.85);
}
async function request(url,body,signal){
  const response=await fetch(url,{...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),signal});
  const data=await response.json().catch(()=>null);if(!data)throw new Error(response.status===413?'请求数据过大，请缩小照片后重试':'服务端返回格式异常，请稍后重试');if(!response.ok)throw new Error(data.error||'请求失败，请重试');return data;
}
function trail(id,message){$(id).textContent=message;$(id).classList.add('reached');}
function showReview(review,error=''){
  referenceReview=review;$('reference-review').hidden=!review&&!error;$('review-checks').replaceChildren();
  if(review)for(const check of review.checks){const li=document.createElement('li');li.dataset.state=check.status;li.textContent=`${{ok:'看见',issue:'需修订',uncertain:'待人工核对'}[check.status]} · ${check.item}：${check.observation}`;$('review-checks').append(li);}
  $('review-suggestion').textContent=review?`建议：${review.suggestion}`:error;
  $('apply-review-suggestion').hidden=!review||review.suggestion==='无需修订';
  $('build-reference').textContent=error?'人工核对后，继续生成三维':review?.checks.some(item=>item.status==='issue')?'我已核对，继续生成三维':'参考图满意，生成三维';
  if(review)trail('trail-review',`回看：${review.checks.some(item=>item.status==='issue')?'发现待修订项':review.checks.some(item=>item.status==='uncertain')?'有待人工核对项':'关键要素已对照'}`);
  else if(error)trail('trail-review','回看：自动检查未完成，改由人工核对');
}
$('apply-review-suggestion').addEventListener('click',()=>{if(!referenceReview)return;$('revision').value=referenceReview.suggestion;$('revision').focus();});
function showBirthCard(next,result,reference,input){
  $('birth-card').hidden=!next?.brief||!(reference||artwork);if($('birth-card').hidden)return;
  $('birth-image').src=reference||artwork.toDataURL('image/png');$('birth-title').textContent=next.caption;
  $('birth-story').textContent=`故事依据：${input?.story||next.brief.summary}`;
  $('birth-choice').textContent=`构图：${next.brief.composition}`;
  $('birth-check').textContent=result?(result.exportable?'三维：几何检查完成，尚待切片与实物验证。':'三维：检查未通过，已阻止导出。'):'三维：待生成。';
}
async function submitArtwork(next,input,settings,context,{revise=false,instruction='',staleOldTown=false}={}){
  status('已确定构图，正在提交参考图生成…');
  const previous=revise&&!staleOldTown?(referenceJob?.concept?await decodeImage(referenceJob.concept):artwork):null;
  const task=await request('/api/artwork',{...input,presetId:context.presetId,design:next,style:context.style,image:context.photo,sculpture:context.mode==='tripo3d',colors:settings.colors,settings,...(revise?{instruction,...(previous?{reference:compressed(previous)}:{})}:{})});
  currentJob={id:task.taskId,design:next,input,context,settings};$('resume').hidden=false;
  if(context.operatorId)try{await recordOperatorJob(currentJob);}catch(error){status('任务已提交，订单编号保存失败，请保留页面并继续领取：'+error.message,true);}
  if(controller.signal.aborted)throw new DOMException('Aborted','AbortError');
  await collect(currentJob,controller.signal);
}
const delay=(ms,signal)=>new Promise((resolve,reject)=>{
  if(signal.aborted)return reject(new DOMException('Aborted','AbortError'));
  const cancel=()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));};
  const timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},ms);signal.addEventListener('abort',cancel,{once:true});
});
async function collect(job,signal){
  if(job.kind==='model')return collectModel(job,signal);
  const started=Date.now();
  while(Date.now()-started<300_000){
    const result=await request('/api/artwork/'+encodeURIComponent(job.id),null,signal);
    if(result.status==='success'){
      if(job.context.mode==='tripo3d'){
        job.concept=result.image;const concept=await decodeImage(result.image);
        showBrief(job.design,result.image,Boolean(model));
        showBirthCard(job.design,null,result.image,job.input);
        $('trail-model').textContent='三维：本轮尚未生成';
        let savedReference=true;
        if(!job.recordId){
          job.recordId=crypto.randomUUID();
          try{const record={id:job.recordId,createdAt:Date.now(),phase:'reference',image:result.image,design:job.design,input:job.input,settings:job.settings,source:'故事参考图 · 待建模',...job.context};await saveHistory(record);if(record.operatorId)await attachOperatorArtwork(record);await refreshHistory();window.dispatchEvent?.(new Event('trip-artifact-saved'));}
          catch{savedReference=false;historyStatus('参考图保存失败，当前草稿仍在页面中，请保存图片并稍后重试。',true);}
        }
        if(signal.aborted)throw new DOMException('Aborted','AbortError');
        referenceJob=job;currentJob=null;$('resume').hidden=true;$('build-reference').hidden=false;$('model-empty').hidden=true;
        showReview(null);
        status('参考图已保存，Agent 正在对照照片和这一刻的故事回看生成图…');
        let reviewed=false;
        try{
          const result=await request('/api/reference-review',{image:job.concept,photo:job.context.photo,input:job.input,design:job.design,presetId:job.context.presetId},signal);
          job.review=result.review;showReview(job.review);
          const saved=await getHistory(job.recordId);if(saved){await saveHistory({...saved,review:job.review});await refreshHistory();}
          reviewed=true;status(job.context.creationFlow==='auto'?'参考图与回看已保存，正在继续生成三维…':'参考图和回看已保存。可按建议修改，或自行确认后生成三维。');
        }catch(error){showReview(null,`自动回看未完成：${error.message}。请人工核对照片主体和场景。`);status('参考图已保存；自动回看未完成，请人工核对后决定是否建模。',true);}
        if(reviewed&&job.context.creationFlow==='auto'){
          if(!savedReference)status('参考图未能保存，全自动建模已暂停；请先保存参考图。',true);
          else await buildModel(job,signal);
        }
        return;
      }
      status('整张设计已完成，正在生成异形浮雕…');await frame();await applyArtwork(result.image,job.design,'Tripo · AI 整图',job.input,job.context);
      currentJob=null;$('resume').hidden=true;status('完整画面与浮雕已生成。切换彩色 / 白色，检查后导出试打。');return;
    }
    if(['failed','banned','expired','cancelled','unknown'].includes(result.status)){if(job.context?.operatorId&&result.status!=='unknown')await finishOperatorJob(job,'参考图任务明确'+result.status);currentJob=null;$('resume').hidden=true;throw new Error('Tripo 生图未完成，请检查平台任务状态后重试。已有作品保留。');}
    status(`Tripo 正在${result.status==='queued'?'排队':'绘制整张画面'}${result.progress?` · ${result.progress}%`:''}，请稍候。`);await delay(2500,signal);
  }
  throw new Error('生成仍在进行。可点击“继续取生成结果”，无需再次付费创建任务。');
}
const printFields={colors:'print-colors',widthMm:'print-width',magnetDiameter:'magnet-diameter',magnetDepth:'magnet-depth',clearance:'magnet-clearance'};
async function buildModel(job,signal){
  const settings=readPrintSettings();status('正在提交参考图生成三维…');
  if(job.input.productType&&job.input.productType!==$('product-type').value)throw Error('产品类型已变化，请先生成并确认新参考图');
  const concept=await decodeImage(job.concept),task=await request('/api/model',{image:compressed(concept),settings,productType:job.input.productType,baseMode:job.input.baseMode});
  currentJob={...job,settings,id:task.taskId,kind:'model'};$('resume').hidden=false;$('build-reference').hidden=true;
  if(job.context?.operatorId)try{await recordOperatorJob(currentJob);}catch(error){status('三维任务已提交，订单记录保存失败，请保留页面：'+error.message,true);}
  if(job.recordId)try{const saved=await getHistory(job.recordId);if(saved)await saveHistory({...saved,modelTaskId:task.taskId});}catch{historyStatus('三维任务编号未能保存，请保持页面打开并使用“继续取生成结果”。',true);}
  if(signal.aborted)throw new DOMException('Aborted','AbortError');
  await collectModel(currentJob,signal);
}
$('build-reference').addEventListener('click',async()=>{
  if(!referenceJob||controller||historyLoading)return;
  if(operatorCreationContext&&!operatorCreationContext.modelingAllowed)return status('先返回经营者工作台，把参考方案发送给用户确认；确认后再生成三维。',true);
  controller=new AbortController();busy(true);
  try{await buildModel(referenceJob,controller.signal);}
  catch(e){status(e.name==='AbortError'?'已停止等待，可继续取生成结果。':e.message,true);}
  finally{controller=null;busy(false);}
});
function showBrief(next,concept=null,draft=false){
  const brief=next?.brief;$('story-brief').hidden=!brief;
  $('brief-title').textContent=draft?'本次参考图 · 下方仍为上一件作品':'故事参考图';
  $('concept-preview').hidden=!concept;$('reference-download').hidden=!concept;
  $('reference-check').hidden=!concept;
  if(concept){$('concept-preview').src=concept;$('reference-download').href=concept;}
  else{$('concept-preview').removeAttribute('src');$('reference-download').removeAttribute('href');}
  if(!brief)return;
  $('brief-summary').textContent=brief.summary;$('brief-composition').textContent=brief.composition;$('brief-prompt').textContent=brief.imagePrompt;
  $('brief-elements').replaceChildren();for(const item of brief.keyElements||brief.elements.map(text=>({text,source:'观众故事／照片'}))){const li=document.createElement('li');li.textContent=`${item.text} · ${item.source}`;$('brief-elements').append(li);}
  $('memory-decisions').replaceChildren();
  for(const item of brief.decisions||[]){const line=document.createElement('p');line.textContent=`${{framing:'人物取景',place:'地点依据',lettering:'纪念文字',occlusion:'配件遮挡'}[item.topic]}｜依据：${item.evidence}；处理：${item.action}；待核对：${item.uncertainty}`;$('memory-decisions').append(line);}
}
function restoreBrief(){
  if(model){showBrief(design,sculpture?null:artwork?.toDataURL('image/png'));if(sculpture)$('brief-title').textContent='创作构思';}
  else if(referenceJob)showBrief(referenceJob.design,referenceJob.concept);
  else $('story-brief').hidden=true;
}
function readPrintSettings(){const fields=$('mode').value==='tripo3d'&&$('product-type').value!=='magnet'?['colors','widthMm']:Object.keys(printFields);return validatePrintSettings(Object.fromEntries(fields.map(key=>[key,Number($(printFields[key]).value)])));}
function restorePrintSettings(settings){for(const [key,id] of Object.entries(printFields))$(id).value=settings[key];}
function showChecks(report){
  const names={topology:'封闭实体',connected:'主体连接',color:'源模型颜色','flat-back':'背面形态',overhang:'悬空支撑','mount-overlap':'安装结构重叠','self-intersection':'人物与配件穿插','mesh-cleanup':'网格清理', 'magnet-floor':'磁铁孔底','magnet-wall':'孔周壁厚','min-feature':'已知最小细节',slicing:'切片验证'};
  $('geometry-checks').replaceChildren();
  for(const check of report.checks){const line=document.createElement('div');line.className='geometry-check';line.dataset.state=check.status;line.textContent=`${{pass:'✓',warn:'待确认',fail:'未通过'}[check.status]} ${names[check.name]||check.name}：${check.detail}`;$('geometry-checks').append(line);}
}
function applySculpture(result,next,source,input){
  referenceJob=null;$('build-reference').hidden=true;
  showBrief(next);$('brief-title').textContent='创作构思';$('reference-check').hidden=true;
  restorePrintSettings(result.settings);
  artVersion++;sculpture=result;design=next;artifactPlace=input.place;currentRecord=null;viewMode=result.originalColors||result.colorMode==='surface'&&result.settings.colors>1?'color':'white';
  $('legacy-relief').hidden=true;$('art-view').disabled=!artwork;
  $('shape-note').textContent=input.productType?productLabels[input.productType]+' · 生产模型':result.report.source==='glb'?'自由三维 · 原始体积':'贯通拱廊 · 立体人物';
  $('mount-note').textContent=result.report.magnetHoles?.length?`双盲孔 · Ø${result.report.magnetHoles[0].diameter.toFixed(2)} × ${result.report.magnetHoles[0].depth} mm`:input.productType==='figurine'?'摆件接地与稳定性检查':'原模型背面 · 无磁铁孔';
  $('source').textContent=source;$('design-title').textContent=next.caption;$('reason').textContent=next.reason;
  $('agent-source').textContent=result.agentMode==='ai'?'AI 决策 + 几何工具':'本地规则 · 非 AI';
  $('agent-summary').textContent=result.exportable?'已完成几何检查；切片与实物验证尚未进行。':'检查未能完成交付要求，已停止导出。请查看记录。';
  trail('trail-model',result.exportable?'三维：已完成几何检查，待切片与试打':'三维：几何检查未通过，禁止导出');showBirthCard(next,result,undefined,input);
  $('agent-log').replaceChildren();
  for(const event of result.trace){const li=document.createElement('li');li.textContent=`${{plan:'规划',inspect:'实测检查',simplify:'调用简化工具',strengthen:'调用加粗工具',accept:'接受当前几何',stop:'停止自动交付'}[event.action]}：${event.reason}`;$('agent-log').append(li);}
  $('version-select').replaceChildren();
  result.versions.forEach((version,index)=>{const option=document.createElement('option');option.value=String(index);option.textContent=version.label;$('version-select').append(option);});
  $('version-select').value=String(result.versions.length-1);showChecks(result.report);render(result);
  $('part-exports').replaceChildren();
  $('part-exports').hidden=false;
  if(result.settings.colors>1&&result.exportable)for(const [index,part] of result.parts.entries()){
    const button=document.createElement('button');button.className='small-button';button.textContent=`下载零件 ${index+1} · 色号 ${part.colorIndex+1}`;
    button.addEventListener('click',()=>download(new Blob([binaryStl(part.mesh)],{type:'model/stl'}),`${brand}-零件${index+1}-色号${part.colorIndex+1}.stl`));$('part-exports').append(button);
  }
}
async function saveSculpture(input,context,source){
  const parentId=context.parentId||null;
  currentRecord={id:crypto.randomUUID(),createdAt:Date.now(),parentId,image:$('preview').toDataURL('image/png'),concept:artwork?.toDataURL('image/png')||null,design,source,input,...context,review:referenceReview,sculpture,sourceModel:sourceGlb,glb:glbFromPreview(sculpture),modelTaskId,depth:$('relief-depth').value,smoothing:$('smoothness').value};
  await persistCurrent();
}
async function generateSculpture(input,revise=false){
  controller=new AbortController();busy(true);const context={...recordContext(),parentId:currentRecord?.id},mode=$('mode').value;
  try{
    const settings=readPrintSettings();let next=createDesign(input),scene;
    if(mode==='agent'){
      status('设计助手正在理解故事与照片…');
      const response=await request('/api/design',{...input,image:compressed(photo),...(revise?{current:design}:{})},controller.signal);next=response.design;
    }else scene={people:next.subjectCount,archCount:3,detail:/丰富|装饰/.test(input.story+input.instruction)?'detailed':'simple'};
    status(mode==='agent'?'正在规划立体结构、检查并选择修正方法…':'正在构建拱廊结构，并执行本地几何检查…');
    const result=await request('/api/agent',{input,design:next,settings,scene,mode:mode==='agent'?'agent':'offline'},controller.signal);
    const source=mode==='agent'?'AI 规划 · 参数化立体':'本地结构试制 · 非 AI';
    sourceGlb=null;modelTaskId=null;artwork=null;applySculpture(result,next,source,input);await saveSculpture(input,context,source);
    status(result.exportable?'立体作品已生成。请查看白色效果、背面双孔和制作记录。':'自动检查已停止交付，请查看制作记录。');
    if(revise)$('revision').value='';
  }catch(e){status(e.name==='AbortError'?'已停止等待，已有作品保留。':e.message,e.name!=='AbortError');}
  finally{controller=null;busy(false);}
}
async function collectModel(job,signal){
  const started=Date.now();
  while(Date.now()-started<600_000){
    const result=await request('/api/model/'+encodeURIComponent(job.id),null,signal);
    if(result.status==='success'){
      status('三维模型已生成，正在检查原模型实体…');
      const manufactured=await request('/api/model/'+encodeURIComponent(job.id)+'/inspect',{input:job.input,settings:job.settings,mounts:job.input.productType==='magnet'},signal);
      sourceGlb=manufactured.sourceModel||null;delete manufactured.sourceModel;modelTaskId=job.id;artwork=await decodeImage(job.concept);applySculpture(manufactured,job.design,'Tripo 真三维 · '+(productLabels[job.input.productType]||'原模型'),job.input);
      await saveSculpture(job.input,{...job.context,parentId:job.recordId},'Tripo 真三维 · '+(productLabels[job.input.productType]||'原模型'));currentJob=null;$('resume').hidden=true;
      status(manufactured.exportable?'产品模型已处理。请旋转核对结构，再导出切片试打。':'当前模型需处理；请查看制作记录和背面形状。');return;
    }
    if(['failed','cancelled'].includes(result.status)){if(job.context?.operatorId)await finishOperatorJob(job,'三维任务明确'+result.status);currentJob=null;$('resume').hidden=true;throw new Error('三维生成未成功，已有作品保留。');}
    status(`Tripo 正在生成真实三维 · ${result.progress||0}%`);await delay(2500,signal);
  }
  throw new Error('三维生成仍在进行，可点击继续取生成结果，无需重新提交。');
}
$('version-select').addEventListener('change',()=>{if(!sculpture)return;const version=sculpture.versions[Number($('version-select').value)];if(version){render(version.mesh?version:sculpture);showChecks(version.report);$('part-exports').hidden=$('version-select').value!==String(sculpture.versions.length-1);}});
$('apply-print').addEventListener('click',async()=>{
  if(!sculpture||controller||historyLoading)return status('先生成立体作品，再应用制作规格。',true);
  controller=new AbortController();busy(true);
  const input=currentRecord?.input||inputs(),next=design,context={...(currentRecord||recordContext()),parentId:currentRecord?.id};
  try{
    status('正在按新尺寸重新整理模型并复检…');
    const settings=readPrintSettings(),mounts=sculpture.report.magnetHoles?.length!==0;
    const result=modelTaskId?await request('/api/model/'+encodeURIComponent(modelTaskId)+'/inspect',{input,settings,mounts},controller.signal):await request('/api/agent',{input,settings,scene:sculpture.scene,glb:typeof sourceGlb==='string'?sourceGlb:undefined,mounts,mode:'offline'},controller.signal);
    applySculpture(result,next,'规格调整 · 几何复检',input);
    await saveSculpture(input,{...context},'规格调整 · 几何复检');
    status('规格已应用并另存一个版本。请检查背面和切片结果。');
  }catch(e){status(e.name==='AbortError'?'已停止等待，已有作品保留。':e.message,true);}
  finally{controller=null;busy(false);}
});
async function generate(revise=false){
  stopSpeech();if(loadingPhoto||controller||historyLoading)return;
  if(operatorCreationContext&&currentJob?.id)return status('已有生成任务，请使用“继续取生成结果”领取原任务，避免重复提交。',true);
  if(document.documentElement?.classList.contains('simple-ui')&&!operatorCreationContext)for(const [id,value] of Object.entries({mode:'tripo3d',preset:'none',style:'ceramic','creation-flow':'auto','print-colors':'1','print-width':'60'}))$(id).value=value;
  let input;try{input=inputs();}catch(e){return status(e.message,true);}
  const instruction=$('revision').value.trim();if(revise&&!instruction)return status('写下希望 AI 修改的地方。',true);
  if(revise&&$('mode').value==='tripo3d'&&!referenceJob&&!model)return status('请先生成参考图，再修改作品。',true);
  const staleOldTown=revise&&!/赤坎/u.test(input.story+input.place+instruction)&&/赤坎/u.test(JSON.stringify(referenceJob?.design||design));
  if(input.productType==='figurine'&&$('mode').value!=='tripo3d')return status('摆件使用完整三维创作，请选择故事创作模式。',true);
  const presetId=$('preset').value||'none';
  if($('mode').value==='tripo3d'&&!photo)return status('请先上传这一刻的照片。',true);
  if($('mode').value==='tripo'&&presetId==='none'&&!photo&&!revise)return status('请至少选择主题预设或上传一张照片。',true);
  if(['agent','offline'].includes($('mode').value)&&!input.story&&!photo&&!revise)return status('先讲一段故事，或者选择一张照片。',true);
  if(presetId!=='none'&&!['tripo3d','tripo'].includes($('mode').value))return status('活动主题预设需选择 AI 生图模式。',true);
  if(['agent','offline'].includes($('mode').value))return generateSculpture({...input,instruction:revise?instruction:''},revise);
  if($('mode').value==='local'){
    if(!photo)return status('先上传一张图片，再进行本地浮雕转换。',true);
    if(revise)return status('照片直转模式不进行 AI 重绘，请切换 AI 整图生成。',true);
    historyLoading=true;busy(true);
    try{await applyArtwork(photo.toDataURL(),{...createDesign({...input,hasPhoto:true}),reason:'本地直接转换，保留照片颜色，未经 AI 风格重绘。'},'本地照片直转 · 非 AI',input,recordContext());status('照片已转成彩色预览与白色浮雕。');}catch(e){status(e.message,true);}finally{historyLoading=false;busy(false);}return;
  }
  controller=new AbortController();busy(true);status('DeepSeek 正在提取故事要素、设计动作和构图、扩写生图提示词…');
  try{
    const settings=$('mode').value==='tripo3d'?readPrintSettings():{colors:1};
    const config=await request('/api/config',null,controller.signal);
    if(!config.tripoConfigured)throw new Error('请先在 .env 填写 TRIPO_API_KEY 并重启服务；也可使用本地转换照片。');
    const result=await request('/api/design',{...input,presetId,style:$('style').value,sculpture:$('mode').value==='tripo3d',settings,image:compressed(photo),...(revise?{...(staleOldTown?{}:{current:referenceJob?.design||design}),instruction}:{})},controller.signal);
    const next=result.design;
    showBrief(next,null,Boolean(model));trail('trail-evidence',`依据：${input.story||next.brief?.summary||'这一刻的照片'}`);trail('trail-choice',`构图：${next.brief?.composition||'依据照片自动安排'}`);
    $('trail-review').textContent='回看：等待实际生成图';$('trail-model').textContent='三维：等待模型检查';
    await submitArtwork(next,input,settings,recordContext(),{revise,instruction,staleOldTown});if(revise)$('revision').value='';
  }catch(e){restoreBrief();status(e.name==='AbortError'?'已停止等待。已提交的云端任务可能继续，可稍后取结果。':e.message,e.name!=='AbortError');}
  finally{controller=null;busy(false);}
}
$('generate').addEventListener('click',()=>generate());$('revise').addEventListener('click',()=>generate(true));$('cancel').addEventListener('click',()=>controller?.abort());
$('resume').addEventListener('click',async()=>{if(!currentJob||controller)return;controller=new AbortController();busy(true);try{await collect(currentJob,controller.signal);}catch(e){restoreBrief();status(e.name==='AbortError'?'已停止等待，可稍后继续取结果。':e.message,true);}finally{controller=null;busy(false);}});
$('story').addEventListener('input',()=>{$('counter').textContent=`${Array.from($('story').value).length} / 300`;});
for(const id of ['place','date','style'])$(id).addEventListener('change',()=>status('创作内容已更新，生成时会使用新选择。'));
for(const [id,mode] of [['color-view','color'],['white-view','white'],['art-view','art']])$(id).addEventListener('click',()=>{viewMode=mode;display();});
for(const id of ['relief-depth','smoothness'])$(id).addEventListener('change',async()=>{if(!artwork||sculpture||!model||currentRecord?.phase==='reference')return;try{render();status('浮雕几何已更新，彩色与白色预览共享同一个模型。');if(currentRecord){currentRecord={...currentRecord,depth:$('relief-depth').value,smoothing:$('smoothness').value};await persistCurrent();}}catch(e){status(e.message,true);}});
$('relief-depth').addEventListener('input',()=>$('depth-value').value=(Number($('relief-depth').value)/10).toFixed(1)+' mm');
$('front').addEventListener('click',()=>preview?.view(true));$('angle').addEventListener('click',()=>preview?.view(false));
$('back').addEventListener('click',()=>preview?.view('back'));
$('export').addEventListener('click',async()=>{if(!model||$('export').disabled)return;const name=(artifactPlace||design.caption||'纪念').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_');const result=await download(new Blob([binaryStl(model.mesh)],{type:'model/stl'}),`${brand}-${name}-${sculpture?(sculpture.report.magnetHoles?.length?'双磁铁立体':'无孔立体'):'旧版浮雕'}${model.widthMm.toFixed(0)}mm.stl`);if(result!=='cancelled')status('STL 已保存或已打开分享界面（不含颜色）。请用切片器检查毫米尺寸、悬垂与支撑。');});
$('export-3mf').addEventListener('click',async()=>{
  if(!model||$('export-3mf').disabled)return;
  try{const result=await download(new Blob([threeMf(model,{name:design.caption})],{type:'model/3mf'}),brand+'-限色涂装.3mf');if(result!=='cancelled')status('3MF 已保存或已打开分享界面，含 Bambu 表面涂色。请在 Bambu Studio 以项目打开、核对耗材槽位并切片；尚未验证换色次数与成本。');}
  catch(e){status(e.message,true);}
});
$('save-image').addEventListener('click',()=>{const canvas=viewMode==='art'?artwork:$('preview');canvas?.toBlob(b=>{if(b)download(b,brand+'-当前视图.png');});});
function showPhotoPreview(src){
  if(src)$('photo-thumb').src=src;else $('photo-thumb').removeAttribute('src');
  $('photo-card').hidden=!src;$('photo-prompt').hidden=Boolean(src);$('photo-replace').hidden=!src;
}
async function loadPhoto(file){
  if(!file||controller||historyLoading)return;const version=++photoVersion;loadingPhoto=true;busy(false);$('photo-status').textContent='正在读取照片…';
  let url;
  try{
    if(file.size>20*1024*1024)throw new Error('照片不能超过 20 MB，请压缩后重试。');
    const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer());
    const valid=(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)||(bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71)||(String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP');
    if(!valid)throw new Error('请选择 JPG、PNG 或 WebP；HEIC 照片请先导出成 JPG。');
    url=URL.createObjectURL(file);const image=await decodeImage(url);if(version!==photoVersion)return;photo=image;activeTripMemory=null;showTripContext();
    showPhotoPreview(image.toDataURL('image/jpeg',.75));
    $('photo-status').textContent='照片已就绪';status('照片读取成功，可以生成纪念品。');
  }catch(e){if(version===photoVersion){$('photo-status').textContent=e.message;status(e.message,true);}}
  finally{if(url)URL.revokeObjectURL(url);if(version===photoVersion){loadingPhoto=false;busy(Boolean(controller));}}
}
$('upload').addEventListener('change',e=>{loadPhoto(e.target.files[0]);e.target.value='';});
$('remove-photo').addEventListener('click',()=>{photoVersion++;loadingPhoto=false;photo=null;activeTripMemory=null;showTripContext();showPhotoPreview(null);$('upload').value='';$('photo-status').textContent='照片已移除，已有作品保留。';busy(Boolean(controller));});
for(const event of ['dragover','dragleave','drop'])$('photo-zone').addEventListener(event,e=>{e.preventDefault();$('photo-zone').classList.toggle('drag',event==='dragover');if(event==='drop')loadPhoto(e.dataTransfer.files[0]);});
document.addEventListener('paste',e=>{const item=Array.from(e.clipboardData?.items||[]).find(item=>item.type.startsWith('image/'));if(item){e.preventDefault();loadPhoto(item.getAsFile());}});

let stream,cameraRequest=0;
function stopCamera(){cameraRequest++;stream?.getTracks().forEach(t=>t.stop());stream=null;$('video').srcObject=null;$('capture').disabled=true;}
$('camera').addEventListener('click',async()=>{
  $('camera-dialog').showModal();$('camera-status').textContent='正在请求相机权限…';const request=++cameraRequest;
  try{
    if(!navigator.mediaDevices?.getUserMedia)throw new Error('当前浏览器不支持相机，请上传或粘贴照片。');
    const media=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:1280},height:{ideal:960}},audio:false});
    if(request!==cameraRequest||!$('camera-dialog').open){media.getTracks().forEach(t=>t.stop());return;}
    stream=media;$('video').srcObject=media;await $('video').play();$('capture').disabled=false;$('camera-status').textContent='调整画面后拍下；关闭窗口会关闭相机。';
  }catch(e){$('camera-status').textContent=e.name==='NotAllowedError'?'相机权限未开启，可以关闭窗口并上传照片。':e.name==='NotFoundError'?'未找到相机，请上传照片。':e.message;}
});
$('close-camera').addEventListener('click',()=>$('camera-dialog').close());$('camera-dialog').addEventListener('close',stopCamera);$('camera-dialog').addEventListener('cancel',stopCamera);
$('capture').addEventListener('click',()=>{const v=$('video');if(!v.videoWidth)return;const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;c.getContext('2d').drawImage(v,0,0);c.toBlob(blob=>loadPhoto(blob),'image/jpeg',.9);$('camera-dialog').close();});

let recognition=null,speechBase='',speechFinal=[];
function speechReset(){recognition=null;$('story').readOnly=false;$('voice').textContent='● 说说你的故事';$('voice').classList.remove('recording');}
function stopSpeech(){const previous=recognition;speechReset();previous?.abort();}
$('voice').addEventListener('click',()=>{
  if(recognition){recognition.stop();return;}
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Recognition){$('speech-status').textContent='当前浏览器不支持语音转写，请直接打字，或使用支持语音的 Chrome / Edge。';return;}
  const r=new Recognition();recognition=r;r.lang='zh-CN';r.continuous=true;r.interimResults=true;speechBase=$('story').value;speechFinal=[];
  $('story').readOnly=true;$('voice').textContent='■ 结束讲述';$('voice').classList.add('recording');$('speech-status').textContent='正在听… 转写可能使用浏览器的在线语音服务。';
  r.onresult=e=>{if(recognition!==r)return;const interim=[];speechFinal=[];for(let i=0;i<e.results.length;i++){if(e.results[i].isFinal)speechFinal.push(e.results[i][0].transcript);else interim.push(e.results[i][0].transcript);}const result=mergeTranscript(speechBase,speechFinal);$('story').value=Array.from(result).slice(0,300).join('');$('story').dispatchEvent(new Event('input'));$('speech-status').textContent=interim.join('')||'继续说，或点击结束讲述。';if(Array.from(result).length>=300){$('speech-status').textContent='已达到 300 字，已停止录音。';r.stop();}};
  r.onerror=e=>{if(recognition!==r)return;$('speech-status').textContent=e.error==='not-allowed'?'麦克风权限未开启，请直接打字。':e.error==='no-speech'?'没有听到声音，可以重新讲述或打字。':'语音转写不可用，请检查网络，或直接打字。';};
  r.onend=()=>{if(recognition===r)speechReset();};try{r.start();}catch{r.onend();$('speech-status').textContent='无法启动语音，请直接打字。';}
});
window.addEventListener('pagehide',()=>{stopCamera();recognition?.abort();controller?.abort();});
$('mode').addEventListener('change',()=>{syncRefine();status({agent:'AI 根据故事选择拱廊参数，并根据实测结果决定是否简化或加粗。当前结构库为拱廊，不复原任意地标。',tripo3d:'DeepSeek 先展开故事要素、动作和构图，再生成参考图和真实三维；消耗生图与建模额度。',offline:'本地拱廊模板与规则检查，不消耗 AI 额度。',local:'旧版照片浮雕，不包含双磁铁孔。',tripo:'旧版 AI 图片浮雕，不包含双磁铁孔。'}[$('mode').value]);});
async function sample(){
  if(controller||historyLoading)return;historyLoading=true;busy(true);
  try{
    const input=validateInput({story:'双人拱廊结构试样'});
    const result=await request('/api/agent',{input,settings:readPrintSettings(),scene:{people:2,archCount:3,detail:'detailed'},mode:'offline'});
    sourceGlb=null;modelTaskId=null;artwork=null;
    applySculpture(result,{...createDesign(input),caption:'拱廊与同行',reason:'本地结构试样：贯通拱门、圆润简化人物与背面双磁铁盲孔。用真实几何检查演示一次细小装饰简化；不是 AI 生成，也不是地标精确复原。'},'立体结构试样 · 非 AI',input);
    status('已加载立体结构试样。可查看背面双孔、版本对照，或输入故事开始设计。');
  }catch(e){status(e.message,true);}finally{historyLoading=false;busy(false);}
}
$('sample').addEventListener('click',sample);
function showTripContext(){
  $('trip-create-context').hidden=!activeTripMemory;
  if(activeTripMemory)$('trip-create-label').textContent=operatorCreationContext?`正在为订单“${activeTripMemory.title}”创作。参考图与三维结果保存后会关联回经营者工作台。`:`正在为“${activeTripMemory.title||'这段记忆'}”创作立体纪念物。参考图和三维作品会回到旅行合集。`;
}
window.addEventListener('trip-create-object',async event=>{
  if(controller||historyLoading||loadingPhoto)return status('请等待当前创作完成后再切换记忆点。',true);
  try{
    const item=event.detail,image=await decodeImage(item.photo);
    activeTripMemory={tripId:item.tripId,memoryId:item.memoryId,title:item.title};showTripContext();
    if(item.productType){$('product-type').value=item.productType;$('figurine-base').value=item.baseMode||'none';if(operatorCreationContext){$('product-type').disabled=true;$('figurine-base').disabled=true;}syncProduct();}
    photoVersion++;photo=image;artwork=null;model=null;sculpture=null;sourceGlb=null;modelTaskId=null;currentRecord=null;referenceJob=null;currentJob=null;
    $('story-brief').hidden=true;$('model-stage').hidden=true;$('model-empty').hidden=false;$('model-empty').textContent='这段记忆已带入，请先生成参考图。';
    $('build-reference').hidden=true;$('resume').hidden=true;$('export').disabled=true;$('export-3mf').disabled=true;
    for(const [id,value] of Object.entries({story:item.story||'',place:item.place||'',date:item.date||'',preset:'none',mode:'tripo3d','creation-flow':document.documentElement.classList.contains('simple-ui')?'auto':'manual',revision:''}))$(id).value=value;
    $('story').dispatchEvent(new Event('input'));
    showPhotoPreview(item.photo);$('photo-status').textContent='已使用此记忆点的来源照片。';
    syncRefine();status(item.bounded?'创作页带入了300字内摘要及12字内地点名；完整需求保留在订单里，请核对创作内容。':item.story?'照片和这一刻的故事已带入。确认内容后生成参考图，再决定是否生成三维。':'照片已带入。可补充这一刻的故事，再生成参考图。');$('single-create').scrollIntoView({block:'start'});if(item.recordId)await openHistory(item.recordId);if(item.pendingJob){currentJob=item.pendingJob;$('resume').hidden=false;if(currentJob.kind==='model')$('build-reference').hidden=true;status('已恢复本订单任务编号，请点击“继续取生成结果”；不会重新提交生成。');}
  }catch(error){status(error.message,true);}
});
window.addEventListener('trip-open-artwork',event=>openHistory(event.detail.id));
$('return-trip').addEventListener('click',()=>window.dispatchEvent?.(new Event('trip-return')));
$('leave-trip').addEventListener('click',()=>{activeTripMemory=null;showTripContext();status('已退出旅行记忆点，接下来的创作将作为独立作品保存。');});
$('export').disabled=true;$('save-image').disabled=true;
fetch('/api/config').then(r=>r.json()).then(c=>{$('api-status').textContent=`DeepSeek ${c.configured?'已配置':'未配置'} · Tripo ${c.tripoConfigured?'已配置 · '+c.tripoModel:'未配置：请填写 .env 的 TRIPO_API_KEY'}`;}).catch(()=>$('api-status').textContent='无法读取接口状态，请刷新页面。');
if(window.location?.search){const params=new URLSearchParams(window.location.search),token=params.get('resumeModel');if(token){params.delete('resumeModel');window.history.replaceState(null,'',window.location.pathname+(params.size?'?'+params:'')+window.location.hash);recoverModelTask(token).then(()=>$('resume').click()).catch(error=>status(error.message,true));}}
if(window.location?.search){const operatorId=new URLSearchParams(window.location.search).get('operator');if(operatorId){loadOperatorCreation(operatorId).then(item=>{if(item.productionOrder){location.replace('/operator.html#commission/'+encodeURIComponent(operatorId)+'/make');return;}operatorCreationContext=item;if(production)document.querySelector('main').inert=false;window.dispatchEvent(new CustomEvent('trip-create-object',{detail:item}));$('style').value=item.style||'clay';$('creation-flow').value='manual';const link=document.createElement('a');link.className='secondary';link.href='/operator.html#commission/'+encodeURIComponent(operatorId)+'/make';link.textContent='返回订单工作台';$('single-create').prepend(link);$('return-trip').onclick=()=>{location.href=link.href;};$('leave-trip').hidden=true;}).catch(error=>{status(error.message,true);if(production){document.querySelector('main').inert=false;$('single-create').inert=true;}});}}

function syncProduct(){
  const figurine=$('product-type').value==='figurine';$('figurine-base-field').hidden=!figurine;$('magnet-settings').hidden=figurine;
  $('product-rule-note').textContent=figurine?'摆件保留完整立体造型，检查接地和重心；实体仍需切片与试打。':'冰箱贴保留正面立体造型，生成平背和磁铁安装结构。';
}
for(const id of ['product-type','figurine-base'])$(id).addEventListener('change',()=>{
  syncProduct();referenceJob=null;$('build-reference').hidden=true;$('export').disabled=true;$('export-3mf').disabled=true;
  status('产品规格已变化，请生成并确认新的参考图。原作品仍保留在历史中。');
});syncProduct();
