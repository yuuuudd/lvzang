import { validateInput } from './design.js';
import { validatePrintSettings } from './print-settings.js';

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const disconnected=error=>/无法连接|Failed to fetch|fetch failed|查询超时|下载失败|生成超时|请求超时/i.test(error.message);
async function retrySafe(api,path,body){
  for(let attempt=0;;attempt++){
    try{return await api(path,body);}
    catch(error){
      if(attempt===2||!disconnected(error))throw error;
      await pause(1000*(attempt+1));
    }
  }
}
async function resultOf(path,api,limit){
  for(let attempt=0;attempt<limit;attempt++){
    const result=await retrySafe(api,path);
    if(result.status==='success')return result;
    if(['failed','cancelled','banned','expired'].includes(result.status)){const error=new Error('云端任务失败');error.taskFailed=true;throw error;}
    await pause(2500);
  }
  throw new Error('任务仍在生成；再次点击批量按钮可继续领取，不会重复提交');
}

export async function runTripBatch(trip,style,{api,listHistory,saveHistory,prepareModelImage=image=>image,onProgress=()=>{}}){
  const photos=trip.photos||[],memories=trip.memories||[],regions=trip.painting?.regions||[];
  if(!trip.painting?.image||trip.painting.stale||photos.length<2||photos.length>9)throw new Error('请先完成合集画和点击区域定位');
  const points=photos.map(photo=>({photo,items:memories.filter(point=>point.photoId===photo.id)}));
  if(points.some(({items})=>items.length!==1||!regions.some(region=>region.memoryId===items[0].id&&region.visible)))throw new Error('每张照片需要一个已定位的记忆点');
  const records=await listHistory(),settings=validatePrintSettings(),failures=[];
  let completed=0,skipped=0,failed=0;
  const progress=message=>onProgress({message,completed,skipped,failed,total:points.length});
  async function modelFrom(record,point){
    try{
      if(!record.modelTaskId){
        if(record.submissionUncertain==='model'||disconnected({message:record.error||''})&&record.review)throw new Error('三维任务提交结果未确认，请先在 Tripo 任务列表核对，避免重复付费');
        progress(`正在提交“${point.title||point.photoId}”的 3D 建模…`);
        const image=await prepareModelImage(record.image);
        let taskId;
        try{({taskId}=await api('/api/model',{image,settings:record.settings}));}
        catch(error){if(disconnected(error)){record={...record,submissionUncertain:'model'};await saveHistory(record);throw new Error('三维任务提交结果未确认，请先在 Tripo 任务列表核对，避免重复付费');}throw error;}
        record={...record,modelTaskId:taskId,submissionUncertain:null,error:''};await saveHistory(record);
      }
      const result=await resultOf('/api/model/'+encodeURIComponent(record.modelTaskId),api,240);
      const sculpture=await retrySafe(api,'/api/agent',{input:record.input,design:record.design,settings:record.settings,glb:result.glb,mounts:false,mode:'offline'});
      record={...record,phase:'model',concept:record.image,sculpture,glb:result.glb,source:'批量生成 · 真三维',modelTaskId:null,error:'',hidden:false,createdAt:Date.now()};
      await saveHistory(record);completed++;progress(`“${point.title||point.photoId}”的 3D 已保存。`);
    }catch(error){
      if(error.taskFailed)record.modelTaskId=null;
      record.error=error.message;failed++;failures.push(error.message);
      try{await saveHistory(record);}catch{progress(`“${point.title||point.photoId}”未完成，浏览器保存失败；请检查存储空间。`);return;}
      progress(`“${point.title||point.photoId}”未完成：${error.message}`);
    }
  }
  let next=0;
  async function worker(){
  for(let index;(index=next++)<points.length;){
    const {photo,items}=points[index];
    const point=items[0];
    if(records.some(record=>record.tripId===trip.id&&record.memoryId===point.id&&record.sculpture)){skipped++;continue;}
    let record=records.find(item=>item.tripId===trip.id&&item.memoryId===point.id&&(item.phase==='reference'||item.phase==='batch-pending'));
    try{
      if(!record){
        const input=validateInput({story:point.story||'',place:trip.place||'',date:trip.date||'',photoType:'auto'});
        progress(`正在设计“${point.title||point.photoId}”的参考图…`);
        const {design}=await retrySafe(api,'/api/design',{...input,presetId:'none',style,sculpture:true,settings,image:photo.image});
        record={id:crypto.randomUUID(),createdAt:Date.now(),phase:'batch-pending',hidden:true,image:photo.image,photo:photo.image,design,input,settings,style,mode:'tripo3d',presetId:'none',creationFlow:'auto',tripId:trip.id,memoryId:point.id,source:'批量制作中'};
        await saveHistory(record);
      }
      if(record.phase==='batch-pending'){
        if(!record.artworkTaskId){
          if(record.submissionUncertain==='artwork'||disconnected({message:record.error||''}))throw new Error('参考图提交结果未确认，请先在 Tripo 任务列表核对，避免重复付费');
          let taskId;
          try{({taskId}=await api('/api/artwork',{...record.input,presetId:'none',design:record.design,style:record.style,image:record.photo,sculpture:true,colors:record.settings.colors,settings:record.settings}));}
          catch(error){if(disconnected(error)){record={...record,submissionUncertain:'artwork'};await saveHistory(record);throw new Error('参考图提交结果未确认，请先在 Tripo 任务列表核对，避免重复付费');}throw error;}
          record={...record,artworkTaskId:taskId,submissionUncertain:null,error:''};await saveHistory(record);
        }
        progress(`正在生成“${point.title||point.photoId}”的参考图…`);
        const {image}=await resultOf('/api/artwork/'+encodeURIComponent(record.artworkTaskId),api,120);
        record={...record,phase:'reference',hidden:false,image,artworkTaskId:null,source:'批量参考图 · 待建模',error:''};await saveHistory(record);
      }
      if(!record.review){
        const {review}=await retrySafe(api,'/api/reference-review',{image:record.image,photo:record.photo,input:record.input,design:record.design,presetId:record.presetId||'none'});
        record={...record,review};await saveHistory(record);
      }
      await modelFrom(record,point);
    }catch(error){
      if(record){
        if(error.taskFailed)record.artworkTaskId=null;
        record.error=error.message;
        try{await saveHistory(record);}catch{progress(`“${point.title||point.photoId}”未完成，浏览器保存失败；请检查存储空间。`);}
      }
      failed++;failures.push(error.message);progress(`“${point.title||point.photoId}”未完成：${error.message}`);
    }
  }
  }
  await Promise.all([worker(),worker()]);
  progress('批量任务已结束。');
  return {completed,skipped,failed,total:points.length,failures};
}
