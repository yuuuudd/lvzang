import {mkdir,readFile,writeFile,rename,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {paintingMemories} from './trip-painting.js';
import {RAW_PREVIEW_VERSION} from './model-preview.js';
import {validateBaseMode,validateProductType} from './public/src/product-rules.js';

const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{16,80}$/.test(id);
const titles=['分析旅行照片','识别照片主体','提取旅行元素','整理旅行故事','生成纪念品设计','生成 3D 模型','检查打印结构','准备合集导出'];
const terminal=new Set(['failed','cancelled','banned','expired']);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const interrupted=()=>Object.assign(new Error('任务已停止'),{interrupted:true});
export function validateCollectionInput(body){
  if(!body||!validId(body.requestId))throw Error('任务编号无效');
  const input={};
  for(const [name,max] of [['name',60],['place',40],['story',1000],['date',30]]){const v=body[name]??'';if(typeof v!=='string'||v.length>max)throw Error('旅行信息过长或格式无效');input[name]=v.trim();}
  input.name||='我的旅行合集';
  if(input.date&&(!/^\d{4}-\d{2}-\d{2}$/.test(input.date)||!Number.isFinite(Date.parse(input.date))||new Date(input.date).toISOString().slice(0,10)!==input.date))throw Error('旅行日期无效');
  if(!['enamel','clay','paper','ceramic','wood'].includes(body.style??'clay'))throw Error('作品风格无效');
  if(!['personal','city'].includes(body.memoryMode??'personal'))throw Error('主体选择无效');
  const productType=validateProductType(body.productType),baseMode=validateBaseMode(body.baseMode??(productType==='figurine'?'round':'none'));
  if(productType==='magnet'&&baseMode!=='none'||productType==='figurine'&&baseMode!=='round')throw Error('合集模型的产品结构无效');
  if(!Array.isArray(body.photos)||body.photos.length<1||body.photos.length>9)throw Error('请选择1到9张照片');
  input.photos=body.photos.map((p,i)=>{if(p?.id!==`p${i+1}`||typeof p.image!=='string'||p.image.length>2_800_000)throw Error('照片内容或编号无效');const m=p.image.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);if(!m)throw Error('照片格式无效');const b=Buffer.from(m[2],'base64');if(b.toString('base64')!==m[2]||!(m[1]==='png'?b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):m[1]==='jpeg'?b[0]===255&&b[1]===216&&b[2]===255:b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP'))throw Error('照片内容与格式不符');return {id:p.id,image:p.image};});
  if(body.cover){const c=body.cover;if(typeof c.guide!=='string'||c.guide.length>2_800_000||!/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(c.guide))throw Error('合集导图无效');const match=c.guide.match(/^data:image\/(jpeg|png);base64,(.+)$/),bytes=Buffer.from(match[2],'base64');if(bytes.toString('base64')!==match[2]||!(match[1]==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes[0]===255&&bytes[1]===216&&bytes[2]===255))throw Error('合集导图内容与格式不符');const memories=paintingMemories(c.memories);if(memories.length!==input.photos.length)throw Error('封面来源照片数量不符');input.cover={guide:c.guide,memories};}
  return {...input,requestId:body.requestId,style:body.style??'clay',memoryMode:body.memoryMode??'personal',...(productType?{productType,baseMode}:{})};
}

// ponytail: one local process owns this folder; distributed workers need a database lease.
export async function createCollectionJobs({dir,services,pollMs=2500}){
  await mkdir(dir,{recursive:true});
  const jobs=new Map(),running=new Map(),damaged=new Set();let closing=false,queue=Promise.resolve();
  const folder=id=>{if(!validId(id))throw Error('任务编号无效');return join(dir,id);};
  const writes=new Map(),previewWrites=new Map(),previewRepairs=new Map();
  function persist(j){j.updatedAt=Date.now();const data=JSON.stringify(j);const previous=writes.get(j.id)||Promise.resolve();const next=previous.catch(()=>{}).then(async()=>{await mkdir(folder(j.id),{recursive:true});await writeFile(join(folder(j.id),'state.tmp'),data);await rename(join(folder(j.id),'state.tmp'),join(folder(j.id),'state.json'));});writes.set(j.id,next);return next;}
  const publicJob=j=>({id:j.id,name:j.input.name,place:j.input.place,date:j.input.date,status:j.status,error:j.error||'',story:j.curation?.story||j.input.story,counts:j.counts,photoStories:(j.curation?.points||[]).map(p=>({photoId:p.photoId,title:p.title,story:p.storyDraft})),steps:j.steps.filter(s=>s.status!=='skipped'),mode:j.kind||'collection',items:j.items.map(({photoId,title,status,error,uncertain,artworkTaskId,modelTaskId,progress,design})=>({photoId,title,status,error,uncertain,artworkTaskId,modelTaskId,progress,story:design?.brief?.summary})),assets:j.items.flatMap((item,index)=>item.saved&&(item.inspected||services.preview)?[{index,photoId:item.photoId,title:item.design?.caption||item.title,story:item.design?.brief?.summary||item.story,reference:`/api/collection-jobs/${j.id}/assets/${index}.jpg`,model:`/api/collection-jobs/${j.id}/assets/${index}.glb`,preview:item.preview||services.preview?`/api/collection-jobs/${j.id}/assets/${index}.json`:null,previewVersion:item.previewVersion||null,printReport:item.printReport,exportable:item.exportable===true}]:[]),createdAt:j.createdAt,updatedAt:j.updatedAt,cover:j.cover?.saved?`/api/collection-jobs/${j.id}/cover`:null,coverStatus:j.cover?.status||'pending',coverError:j.cover?.error||'',coverTaskId:j.cover?.artworkTaskId,coverUncertain:j.cover?.uncertain});
  async function savePreview(j,index,preview){
    const key=`${j.id}/${index}`,previous=previewWrites.get(key)||Promise.resolve();
    const next=previous.catch(()=>{}).then(async()=>{
      const path=join(folder(j.id),`${index}.json`);await writeFile(path+'.tmp',JSON.stringify(preview));await rename(path+'.tmp',path);
      j.items[index].preview=true;j.items[index].previewVersion=preview.previewVersion;await persist(j);
    });
    previewWrites.set(key,next);return next;
  }
  function requireJob(id){folder(id);const j=jobs.get(id);if(!j)throw Error('找不到生成任务');return j;}
  function checkpoint(j,item){if(closing||j.status==='cancelled')throw interrupted();if(item?.cancelled)throw Object.assign(Error('已停止这一件作品'),{itemInterrupted:true});}
  async function step(j,index,status,detail){if(status==='running')for(let i=0;i<j.steps.length;i++)if(i!==index&&j.steps[i].status==='running')j.steps[i]={...j.steps[i],status:'pending',detail:j.steps[i].title+' · 等待后续作品完成'};j.steps[index]={title:titles[index],status,detail};await persist(j);}
  async function poll(j,item,type){const reader=type==='artwork'?services.readArtwork:services.readModel;const field=type==='artwork'?'artworkTaskId':'modelTaskId';let misses=0;for(let count=0;count<1440;count++){
    checkpoint(j,item);let result;
    try{result=await reader(item[field]);misses=0;}catch(error){if(++misses>=3)throw error;await wait(pollMs);continue;}
    checkpoint(j,item);item.progress={stage:type,status:result.status,percent:Number.isFinite(result.progress)?Math.max(0,Math.min(100,result.progress)):null};await persist(j);
    if(result.status==='success')return result;
    if(terminal.has(result.status)){item[field]=null;await persist(j);throw Error('云端任务失败，可重试这一件作品');}
    if(!['queued','running','pending','processing'].includes(result.status))throw Error('云端任务返回未知状态，请稍后继续查询');
    await wait(pollMs);
  }throw Error('云端任务仍未完成，请继续查询已有任务');}
  async function submit(j,item,type,operation){const field=type==='artwork'?'artworkTaskId':'modelTaskId';if(item[field])return;if(item.uncertain===type)throw Error('提交结果未确认，请在 Tripo 核对任务编号后恢复，避免重复付费');checkpoint(j,item);item.uncertain=type;await persist(j);try{item[field]=await operation();item.uncertain=null;await persist(j);}catch(e){if(/密钥无效|额度不足|积分不足|未创建|HTTP (?:400|401|402|403|404|422|429)\b|请求频繁|图片.*无效|格式.*无效/.test(e.message)){item.uncertain=null;await persist(j);}throw e;}checkpoint(j,item);}
  async function run(j){
    try{
      checkpoint(j);j.status='running';j.error='';await persist(j);
      if(!j.curation&&!j.coverOnly&&j.kind!=='cover-only'){await step(j,0,'running',`正在分析 ${j.input.photos.length} 张照片`);const c=await services.curate(j.input);checkpoint(j);if(!c||typeof c.story!=='string'||c.story.length>1000||!Array.isArray(c.points)||c.points.length!==j.input.photos.length||new Set(c.points.map(p=>p.photoId)).size!==c.points.length||c.points.some(p=>!j.input.photos.some(x=>x.id===p.photoId)||typeof p.title!=='string'||!p.title.trim()||p.title.length>40||typeof p.storyDraft!=='string'||p.storyDraft.length>1000||typeof p.evidence!=='string'||p.evidence.length>300))throw Error('照片分析结果不完整，请重试');
        const selected=(c.selectedPhotoIds||c.points.slice(0,3).map(p=>p.photoId));if(!Array.isArray(selected)||selected.length<1||selected.length>3||new Set(selected).size!==selected.length||selected.some(id=>!c.points.some(p=>p.photoId===id)))throw Error('代表照片选择无效');
        j.curation=c;j.counts.photos=j.input.photos.length;j.counts.subjects=c.points.length;
        j.items=selected.map(id=>{const p=c.points.find(p=>p.photoId===id);return {photoId:id,title:p.title,story:p.storyDraft,status:'pending'};});
        for(let i=0;i<4;i++)await step(j,i,'completed',[`已分析 ${j.counts.photos} 张旅行照片`,`已识别 ${j.counts.subjects} 个照片主体`,`已选出 ${j.items.length} 个代表性记忆`,`已整理旅行故事`][i]);
      }
      for(let index=0;index<j.items.length;index++){
        checkpoint(j);const item=j.items[index];if(j.coverOnly||item.status==='completed'||item.cancelled||j.retryIndex!=null&&index!==j.retryIndex)continue;item.error='';item.status='running';await persist(j);
        try{
          const photo=j.input.photos.find(p=>p.id===item.photoId);
          if(!item.design){await step(j,4,'running',`正在设计「${item.title}」`);item.design=await services.design(j.input,item,photo.image);j.counts.elements=j.items.reduce((n,p)=>n+(p.design?.brief?.elements?.length||0),0);await persist(j);}
          if(!item.reference){await step(j,4,'running',`正在生成「${item.title}」参考图`);await submit(j,item,'artwork',()=>services.startArtwork(j.input,item,photo.image));const {image}=await poll(j,item,'artwork');item.reference=await services.prepareImage(image);await persist(j);}
          if(!item.saved){await step(j,5,'running',`正在生成 3D 模型：已保存 ${j.items.filter(x=>x.saved).length} / ${j.items.length} 件`);await submit(j,item,'model',()=>services.startModel(item.reference));const {glb}=await poll(j,item,'model');checkpoint(j);await writeFile(join(folder(j.id),`${index}.glb`),glb);await writeFile(join(folder(j.id),`${index}.jpg`),Buffer.from(item.reference.split(',')[1],'base64'));item.saved=true;await persist(j);}
          if(!item.inspected){
            await step(j,6,'running',`正在检查「${item.title}」的打印结构`);
            const glb=await readFile(join(folder(j.id),`${index}.glb`));let preview;
            try{const result=await services.inspect(glb,j.input);checkpoint(j);item.printReport=result.report;item.exportable=result.exportable===true;preview=result.preview;if(result.glb)await writeFile(join(folder(j.id),`${index}.glb`),result.glb);}
            catch(e){if(e.interrupted)throw e;item.printReport={checks:[{name:'import',status:'warn',detail:e.message}],note:'模型保留，可下载 GLB；打印结构需要人工检查'};item.exportable=false;}
            if(!preview&&services.preview)try{preview=await services.preview(glb);checkpoint(j);}catch(e){if(e.interrupted)throw e;item.printReport.checks.push({name:'preview',status:'warn',detail:e.message});}
            if(preview)await savePreview(j,index,preview);
            item.inspected=true;await persist(j);
          }
          item.status='completed';await persist(j);
        }catch(error){if(error.interrupted)throw error;if(error.itemInterrupted)continue;item.status='failed';item.error=error.message;await persist(j);}
      }
      checkpoint(j);if(j.input.cover&&services.startCover&&!j.cover?.saved){j.cover??={};const c=j.cover;try{c.status='running';c.error='';await step(j,7,'running','正在生成旅行合集图');await submit(j,c,'artwork',()=>services.startCover(j.input));const result=await poll(j,c,'artwork');const image=await services.prepareImage(result.image);checkpoint(j);await writeFile(join(folder(j.id),'cover.jpg'),Buffer.from(image.split(',')[1],'base64'));c.saved=true;c.status='completed';await persist(j);}catch(error){if(error.interrupted)throw error;c.status='failed';c.error=error.message;await persist(j);}}
      checkpoint(j);const done=j.items.filter(x=>x.status==='completed').length;const all=done===j.items.length;
      if(j.kind!=='cover-only')for(const i of [4,5,6])await step(j,i,all?'completed':'failed',`${['已生成纪念品设计','已生成 3D 模型','已检查打印结构'][i-4]}：${done} / ${j.items.length} 件${i===6?'，查看各件实测报告':''}`);
      await step(j,7,j.cover?.status==='failed'?'failed':done||j.cover?.saved?'completed':'pending',j.cover?.status==='failed'?'模型已保存，合集图未完成':done?`${done} 件作品已保存，可导出合集`:'合集图已保存');delete j.retryIndex;j.status=j.coverOnly?j.statusBeforeCover:all?'completed':done?'partial':'failed';delete j.coverOnly;delete j.statusBeforeCover;await persist(j);
    }catch(error){if(error.interrupted)return;j.status='failed';j.error=error.message;const s=j.steps.find(s=>s.status==='running');if(s){s.status='failed';s.detail=error.message;}await persist(j);}
  }
  function launch(j){if(closing||running.has(j.id))return;const task=queue.then(()=>run(j)).catch(error=>{j.status='failed';j.error='任务保存失败，请检查磁盘空间后重试';console.error('collection job storage failure',error.code||error.name);}).finally(()=>running.delete(j.id));queue=task;running.set(j.id,task);}
  for(const entry of await readdir(dir,{withFileTypes:true})){if(!entry.isDirectory()||!validId(entry.name))continue;try{const j=JSON.parse(await readFile(join(folder(entry.name),'state.json'),'utf8'));if(j.id!==entry.name||!j.input||!Array.isArray(j.items)||!Array.isArray(j.steps))throw Error('任务存储内容无效');jobs.set(j.id,j);}catch(error){damaged.add(entry.name);console.warn('collection job recovery skipped',entry.name,error.code||error.name);}}
  for(const j of jobs.values())if(['queued','running'].includes(j.status))launch(j);
  return {
    async create(body){if(closing)throw Error('服务正在重启，请稍后重试');const input=validateCollectionInput(body),hash=createHash('sha256').update(JSON.stringify(input)).digest('hex');if(damaged.has(input.requestId))throw Error('任务记录需要从备份恢复，请先核对原有云端任务，不能直接重新提交');const old=jobs.get(input.requestId);if(old){if(old.hash!==hash)throw Error('重复任务编号与内容冲突');await writes.get(old.id);return publicJob(old);}if([...jobs.values()].filter(j=>['queued','running'].includes(j.status)).length>=4)throw Error('生成任务已满，请稍后再试');const j={id:input.requestId,input,hash,status:'queued',items:[],counts:{photos:0,subjects:0,elements:0},steps:titles.map(title=>({title,status:'pending',detail:'等待执行'})),createdAt:Date.now()};jobs.set(j.id,j);try{await persist(j);}catch(e){jobs.delete(j.id);throw e;}launch(j);return publicJob(j);},
    async createCoverOnly(body){if(!services.startCover)throw Error('合集画服务尚未配置');const input=validateCollectionInput(body);if(!input.cover)throw Error('请提供合集导图');const old=jobs.get(input.requestId);if(old){if(old.kind!=='cover-only')throw Error('这份合集已有模型任务，请使用原任务的封面入口');return old.cover?.saved?publicJob(old):this.createCover(old.id,input.cover);}if(damaged.has(input.requestId))throw Error('封面任务记录需要恢复');if([...jobs.values()].filter(j=>['queued','running'].includes(j.status)).length>=4)throw Error('任务已满，请稍后重试');const j={id:input.requestId,input,hash:createHash('sha256').update(JSON.stringify(input)).digest('hex'),kind:'cover-only',coverOnly:true,statusBeforeCover:'completed',status:'queued',items:[],counts:{photos:input.photos.length,subjects:0,elements:0},steps:titles.map((title,i)=>({title:i===0?'读取来源照片':title,status:i===0?'completed':i===7?'pending':'skipped',detail:i===0?'来源照片已保存':'等待执行'})),createdAt:Date.now()};jobs.set(j.id,j);try{await persist(j);}catch(error){jobs.delete(j.id);throw error;}launch(j);return publicJob(j);},
    async get(id){return publicJob(requireJob(id));},
    async cancel(id,onlyIndex){const j=requireJob(id);if(onlyIndex!==undefined){if(!Number.isInteger(onlyIndex)||!j.items[onlyIndex])throw Error('作品编号无效');const item=j.items[onlyIndex];if(item.status==='completed')return publicJob(j);item.cancelled=true;item.status='cancelled';await persist(j);return publicJob(j);}if(['completed','partial','failed'].includes(j.status))return publicJob(j);j.status='cancelled';await persist(j);return publicJob(j);},
    async retry(id,resolve,onlyIndex){const j=requireJob(id);if(running.has(id)){if(['queued','running'].includes(j.status))return publicJob(j);await running.get(id);}if(onlyIndex!==undefined&&(!Number.isInteger(onlyIndex)||!j.items[onlyIndex]))throw Error('重试作品编号无效');if(resolve){const item=j.items[resolve.index];if(!item||!['artwork','model'].includes(resolve.stage)||item.uncertain!==resolve.stage||typeof resolve.taskId!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(resolve.taskId))throw Error('恢复任务编号无效');item[resolve.stage==='artwork'?'artworkTaskId':'modelTaskId']=resolve.taskId;item.uncertain=null;onlyIndex=resolve.index;}for(let i=0;i<j.items.length;i++)if(onlyIndex===undefined||i===onlyIndex)delete j.items[i].cancelled;j.retryIndex=onlyIndex;j.status='queued';await persist(j);launch(j);return publicJob(j);},
    async createCover(id,body){const j=requireJob(id);if(!services.startCover)throw Error('合集画服务尚未配置');if(j.cover?.saved)return publicJob(j);if(running.has(id)&&!['queued','running'].includes(j.status))await running.get(id);if(body?.resolveTaskId){if(j.cover?.uncertain!=='artwork'||typeof body.resolveTaskId!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(body.resolveTaskId))throw Error('封面任务编号无效');j.cover.artworkTaskId=body.resolveTaskId;j.cover.uncertain=null;}else if(!body?.retry){const input=validateCollectionInput({...j.input,name:body.name??j.input.name,requestId:j.id,cover:body});j.input.cover=input.cover;j.input.name=input.name;}else if(!j.input.cover)throw Error('封面素材尚未保存');await persist(j);if(!running.has(id)){j.coverOnly=true;j.statusBeforeCover=j.status;j.status='queued';await persist(j);launch(j);}return publicJob(j);},
    async cover(id){const j=requireJob(id);if(!j.cover?.saved)throw Error('合集图尚未生成');return readFile(join(folder(id),'cover.jpg'));},
    async asset(id,name){
      requireJob(id);if(!/^[0-2]\.(glb|jpg|json)$/.test(name))throw Error('资产路径无效');const j=requireJob(id),index=Number(name[0]);if(!j.items[index]?.saved)throw Error('资产尚未生成');
      if(name.endsWith('.json')&&services.preview&&j.items[index].previewVersion!==RAW_PREVIEW_VERSION){
        const key=`${id}/${index}`;
        if(!previewRepairs.has(key))previewRepairs.set(key,(async()=>{const glb=await readFile(join(folder(id),`${index}.glb`));await savePreview(j,index,await services.preview(glb));})().finally(()=>previewRepairs.delete(key)));
        await previewRepairs.get(key);
      }
      return readFile(join(folder(id),name));
    },
    async exportFiles(id){const j=requireJob(id),files={'collection.json':Buffer.from(JSON.stringify(publicJob(j),null,2))};if(j.cover?.saved)files['cover.jpg']=await readFile(join(folder(id),'cover.jpg'));for(let i=0;i<j.input.photos.length;i++){const p=j.input.photos[i],m=p.image.match(/^data:image\/(\w+);base64,(.+)$/);files[`photos/${i+1}.${m[1]}`]=Buffer.from(m[2],'base64');}for(let i=0;i<j.items.length;i++)if(j.items[i].saved){for(const ext of ['glb','jpg',...(j.items[i].preview?['json']:[])])files[`assets/${i}.${ext}`]=await readFile(join(folder(id),`${i}.${ext}`));}return files;},
    async close(){closing=true;await Promise.all(running.values());await Promise.all(previewRepairs.values());await Promise.all(previewWrites.values());await Promise.all(writes.values());}
  };
}
