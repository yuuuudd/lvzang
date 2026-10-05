import { listTrips, getTrip, saveTrip, listHistory, saveHistory } from './history.js';
import { defaultPiece, drawCollage, drawPaintingGuide, pickPiece, pickPaintingRegion, COLLAGE_WIDTH, COLLAGE_HEIGHT } from './collage.js';
import { runTripBatch } from './trip-batch.js';
import { createPreview } from './preview.js';
import { download } from './export-file.js';

const $=id=>document.getElementById(id);
let trip={id:crypto.randomUUID(),createdAt:Date.now(),name:'',place:'',date:'',story:'',photos:[],coverId:null,memories:[]};
let saved=false,placing=null,selected=null,working=false,editing=false,drawRevision=0,batchRunning=false,developerBatch3D=false;
let collageImages=new Map(),collagePixels=new Map();
let paintingEditing=false,paintingMasks=new Map();
const say=(message,error=false)=>{$('trip-status').textContent=message;$('trip-status').classList.toggle('error',error);};
const photoError=message=>{say(message,true);$('trip-photo-count').textContent=message;$('trip-photo-count').classList.add('error');};
const field=(id,value)=>{$(id).value=value||'';};
const photoFor=id=>trip.photos.find(photo=>photo.id===id);
const selectedPoint=()=>trip.memories.find(point=>point.id===selected);
const markPaintingStale=()=>{if(trip.painting?.image)trip.painting.stale=true;if(trip.painting?.pendingTaskId)trip.painting.pendingStale=true;};
async function exportTripImage(){
  const image=trip.painting?.image||($('trip-collage-wrap').hidden?null:$('trip-collage').toDataURL('image/png'));
  if(!image)return say('请先生成合集画。',true);
  try{
    const [,type,data]=/^data:(image\/(?:jpeg|png));base64,(.+)$/.exec(image)||[];
    if(!data)throw new Error('合集画格式无效');
    const blob=new Blob([Uint8Array.from(atob(data),character=>character.charCodeAt(0))],{type});
    const name=(trip.name||'旅行回忆').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_');
    const result=await download(blob,`拾光-${name}-合集照.${type==='image/png'?'png':'jpg'}`);
    if(result!=='cancelled')say(result==='shared'?'已打开手机分享界面，可保存到相册或文件。':'合集照已开始下载。');
  }catch(error){say(`保存合集照失败：${error.message}`,true);}
}
for(const id of ['trip-painting-tools','trip-collage-tools']){
  const button=document.createElement('button');button.type='button';button.className='small-button';button.textContent='↓ 保存合集照';button.addEventListener('click',exportTripImage);document.querySelector(`.${id}`).append(button);
}
const paintingSources=()=>trip.photos.map(photo=>{
  const matches=trip.memories.filter(memory=>memory.photoId===photo.id);
  if(matches.length!==1||!matches[0].piece?.cutout)throw new Error('每张照片需要恰好一个已提取的记忆元素，请先检查记忆点');
  const point=matches[0];return {id:point.id,photoId:photo.id,title:point.title||`照片 ${photo.id.slice(1)}`,evidence:point.evidence||'',target:point.piece.prompt||point.title||'旅行元素',kind:point.piece.targetKind||'scene'};
});
const detail=$('trip-detail');
let detailPreview=null,detailRevision=0;
let showcaseRecords=[],showcasePreviews=[],showcaseTripId=null,showcaseRevision=0,pieceRevision=0;
const showcaseMotion=()=>showcasePreviews.forEach(preview=>preview.setAutoRotate(!detail.open&&!matchMedia('(prefers-reduced-motion: reduce)').matches));
function clearShowcase(){pieceRevision++;showcasePreviews.forEach(preview=>preview.destroy());showcasePreviews=[];}
function syncShowcaseSize(){
  const list=$('trip-piece-list'),sidebar=document.querySelector('.trip-art-sidebar');
  const filled=list.children.length===3&&[...list.children].every(card=>card.classList.contains('trip-model-card'));
  const stacked=matchMedia(document.documentElement.classList.contains('simple-ui')?'(max-width:900px)':'(max-width:730px)').matches;
  const art=!$('trip-painting-wrap').hidden?document.querySelector('.trip-painting-stage'):!$('trip-collage-wrap').hidden?$('trip-collage'):null;
  const height=filled&&!stacked&&art?.getBoundingClientRect().height;
  sidebar.classList.toggle('showcase-filled',Boolean(height));
  if(height)sidebar.style.setProperty('--showcase-height',`${height}px`);else sidebar.style.removeProperty('--showcase-height');
}
const showcaseSizer=new ResizeObserver(syncShowcaseSize);
showcaseSizer.observe($('trip-collage'));showcaseSizer.observe(document.querySelector('.trip-painting-stage'));
window.addEventListener('resize',syncShowcaseSize);
async function refreshShowcase(force=false){
  if(!trip.collageVersion||!trip.photos.length){showcaseRevision++;showcaseTripId=null;showcaseRecords=[];clearShowcase();return;}
  if(!force&&showcaseTripId===trip.id)return;
  const revision=++showcaseRevision;showcaseTripId=trip.id;
  try{
    const records=await listHistory();if(revision!==showcaseRevision)return;
    showcaseRecords=records.filter(record=>!record.hidden&&record.tripId===trip.id&&record.sculpture?.mesh?.length>=9);
    renderPieceList();
  }catch{if(revision===showcaseRevision){showcaseRecords=[];renderPieceList();}}
}
const closeDetail=()=>{detailRevision++;detailPreview?.setAutoRotate(false);if(detail.open)detail.close();};
detail.addEventListener('close',()=>{detailRevision++;detailPreview?.setAutoRotate(false);showcaseMotion();});
function openRecut(point){
  const source=point&&photoFor(point.photoId);if(!source)return say('请先选择来源照片。',true);
  selected=point.id;$('trip-recut-image').src=source.image;$('trip-recut-dialog').showModal();
}
function loadCutout(point){
  const existing=collageImages.get(point.id);if(existing?.src===point.piece.cutout)return Promise.resolve(existing);
  return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=point.piece.cutout;});
}
async function renderCollage(){
  const revision=++drawRevision,points=trip.memories.filter(point=>point.piece?.cutout&&photoFor(point.photoId));
  const next=new Map(),pixels=new Map();
  for(const point of points){
    try{
      const image=await loadCutout(point);if(revision!==drawRevision)return;
      next.set(point.id,image);
      const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
      const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);
      pixels.set(point.id,context.getImageData(0,0,canvas.width,canvas.height));
    }catch{say('有一块剪图片暂时无法显示，请重新抠取。',true);}
  }
  collageImages=next;collagePixels=pixels;
  drawCollage($('trip-collage'),trip,collageImages);
  renderPieceList();
}
function renderPieceList(){
  clearShowcase();const revision=pieceRevision,list=$('trip-piece-list'),cabinet=$('trip-cabinet-grid');list.replaceChildren();cabinet.replaceChildren();
  const points=trip.memories.filter(item=>photoFor(item.photoId)),pointMap=new Map(points.map(point=>[point.id,point]));
  const items=showcaseRecords.filter(record=>pointMap.has(record.memoryId)).map(record=>({id:record.id,point:pointMap.get(record.memoryId),record}));
  const modeled=new Set(items.map(item=>item.point.id));
  for(const point of points)if(!modeled.has(point.id))items.push({id:point.id,point,record:null});
  const featured=(trip.featuredShowcaseIds||[]).map(id=>items.find(item=>item.id===id)).filter(Boolean).slice(0,3);
  for(const item of items)if(featured.length<3&&!featured.includes(item))featured.push(item);
  $('trip-showcase-cabinet').hidden=!trip.collageVersion||!items.length;
  $('trip-showcase-cabinet').querySelector('summary').textContent=`查看完整展示柜（${items.length} 件）`;
  const versions=new Map(),remaining=new Map(),labels=new Map();
  for(const {point,record} of items)if(record)versions.set(point.id,(versions.get(point.id)||0)+1);
  for(const item of items){
    const {point,record}=item,title=point.title||`照片 ${point.photoId.slice(1)}`;
    const version=remaining.get(point.id)??versions.get(point.id),label=record&&versions.get(point.id)>1?`${title} · 第${version}版`:title;
    if(record)remaining.set(point.id,version-1);labels.set(item.id,label);
    const card=document.createElement('article'),image=document.createElement('img'),name=document.createElement('strong'),actions=document.createElement('div'),open=document.createElement('button'),feature=document.createElement('button');
    card.className='trip-cabinet-card';card.dataset.artworkId=record?.id||'';
    card.classList.toggle('missing',Boolean(trip.painting?.image&&!trip.painting.regions?.some(region=>region.memoryId===point.id&&region.visible)));
    image.src=record?.image||photoFor(point.photoId).image;image.alt=`${title}的${record?'作品预览':'来源照片'}`;
    name.textContent=`${card.classList.contains('missing')?'未找到 · ':''}${label}`;open.type='button';open.className='small-button';open.textContent=record?'查看作品':'查看记忆';
    open.onclick=()=>{selected=point.id;renderDetail(record?.id);};
    feature.type='button';feature.className='small-button trip-feature';feature.textContent=featured.includes(item)?'已精选':'设为精选';feature.disabled=featured.includes(item);
    feature.onclick=()=>{trip.featuredShowcaseIds=[...featured.map(entry=>entry.id).filter(id=>id!==item.id).slice(-2),item.id];renderPieceList();autosave();};
    actions.append(open,feature);card.append(image,name,actions);cabinet.append(card);
  }
  for(const {point,record} of featured){
    const region=trip.painting?.regions?.find(item=>item.memoryId===point.id),missing=trip.painting?.image&&!region?.visible;
    const title=labels.get(record?.id||point.id);
    const button=document.createElement('button');button.type='button';button.className=record?'trip-model-open':'small-button';button.classList.toggle('missing',Boolean(missing));button.textContent=`${missing?'未找到 · ':''}${title}`;button.setAttribute('aria-label',`打开片段：${title}`);
    button.onclick=()=>{selected=point.id;if(trip.painting?.image){if(paintingEditing){$('trip-painting-target').value=point.id;showPaintingScale();}else renderDetail(record?.id);}else if(editing&&point.piece)showPieceTools();else renderDetail(record?.id);};
    if(!record){list.append(button);continue;}
    const card=document.createElement('div'),stage=document.createElement('div'),canvas=document.createElement('canvas'),fallback=document.createElement('img');
    card.className='trip-model-card';card.dataset.artworkId=record.id;stage.className='trip-model-card-stage';canvas.tabIndex=0;canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`${title}的旋转三维模型，可拖动或用方向键旋转`);fallback.alt=`${title}的静态预览`;fallback.hidden=true;
    stage.append(canvas,fallback);card.append(stage,button);list.append(card);
    requestAnimationFrame(()=>{
      if(revision!==pieceRevision)return;
      let preview;
      try{
        preview=createPreview(canvas,.00045);if(!preview)throw new Error('WebGL unavailable');
        preview.setMesh(record.sculpture.mesh,record.sculpture);
        preview.setColor(Boolean(record.sculpture.originalColors?.length||record.sculpture.faceColors?.length||record.sculpture.parts?.length));
        preview.view();showcasePreviews.push(preview);showcaseMotion();
      }catch{preview?.destroy();fallback.src=record.image||photoFor(point.photoId)?.image||'';fallback.hidden=false;}
    });
  }
  syncShowcaseSize();
}
async function paintingGuide(){
  const points=trip.memories.filter(point=>point.piece?.cutout&&photoFor(point.photoId)),images=new Map();
  for(const point of points)images.set(point.id,await loadCutout(point));
  const canvas=document.createElement('canvas');canvas.width=1536;canvas.height=1024;drawPaintingGuide(canvas,trip,images);
  return canvas.toDataURL('image/jpeg',.86);
}
async function compressedPainting(source){
  const image=new Image();image.src=source;await image.decode();
  const canvas=document.createElement('canvas');canvas.width=1536;canvas.height=1024;canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
  return canvas.toDataURL('image/jpeg',.88);
}
async function paintingRequest(path,body){
  const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'旅行画请求失败');return result;
}
function showPaintingScale(){const region=trip.painting?.regions?.find(item=>item.memoryId===$('trip-painting-target').value);$('trip-painting-scale').value=Math.round((region?.scale||1)*100);}
const onLettering=(position)=>position.x<.55&&position.y<.33||(trip.place||trip.date)&&position.x<.32&&position.y>.78;
function renderPainting(){
  const painting=trip.painting;if(!painting?.image)return;
  $('trip-restore-painting').hidden=!painting.previous?.image;
  $('trip-painting-image').src=painting.image;
  const missing=trip.memories.filter(point=>photoFor(point.photoId)&&!painting.regions?.some(region=>region.memoryId===point.id&&region.visible)).length;
  const uncertain=(painting.regions||[]).filter(region=>region.visible&&region.needsReview).length;
  $('trip-retry-map').hidden=painting.stale||!missing&&!uncertain;
  $('trip-painting-warning').textContent=[!painting.textInImage?'旧画的文字原由页面后加，现已移除；重新生成可将标题、地点和日期画进图片。':'',painting.stale?'素材已修改，需重新生成新画。':'',missing?`自动复核后仍有 ${missing} 个元素未找到；请检查新画是否包含它们。`:uncertain?`${uncertain} 处轮廓不确定；可重新定位。`:''].filter(Boolean).join(' ');
  const target=$('trip-painting-target'),previous=target.value;target.replaceChildren();for(const point of trip.memories.filter(item=>photoFor(item.photoId))){const option=document.createElement('option');option.value=point.id;option.textContent=point.title||point.photoId;target.append(option);}target.value=trip.memories.some(item=>item.id===previous)?previous:target.options[0]?.value||'';showPaintingScale();
  paintingMasks=new Map();for(const region of painting.regions||[])if(region.mask){const image=new Image();image.onload=()=>{const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);paintingMasks.set(region.memoryId,context.getImageData(0,0,canvas.width,canvas.height));};image.src=region.mask;}
  renderPieceList();
}
function paintingPosition(event){const rect=$('trip-painting-hit').getBoundingClientRect();return {x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))};}
function pickedPainting(event){if(trip.painting?.stale)return null;const {x,y}=paintingPosition(event);if(onLettering({x,y}))return null;return pickPaintingRegion(trip.painting?.regions||[],x,y,(region,u,v)=>{const data=paintingMasks.get(region.memoryId);if(!data)return 0;const px=Math.min(data.width-1,Math.floor(u*data.width)),py=Math.min(data.height-1,Math.floor(v*data.height));return data.data[(py*data.width+px)*4];});}
function showPieceTools(){const point=selectedPoint();$('trip-piece-tools').hidden=!editing||!point?.piece;if(point?.piece)$('trip-piece-scale').value=Math.round(point.piece.scale*100);}
function canvasPosition(event){const rect=$('trip-collage').getBoundingClientRect();return {x:(event.clientX-rect.left)*COLLAGE_WIDTH/rect.width,y:(event.clientY-rect.top)*COLLAGE_HEIGHT/rect.height};}
function picked(event){const {x,y}=canvasPosition(event);return pickPiece(trip.memories,collageImages,x,y,(point,image,u,v)=>{const data=collagePixels.get(point.id);if(!data)return 0;const px=Math.min(data.width-1,Math.floor(u*data.width)),py=Math.min(data.height-1,Math.floor(v*data.height));return data.data[(py*data.width+px)*4+3];});}
function readFields(){trip.name=$('trip-name').value.trim();trip.place=$('trip-place').value.trim();trip.date=$('trip-date').value;trip.story=$('trip-story').value.trim();}
function paintFields(){field('trip-name',trip.name);field('trip-place',trip.place);field('trip-date',trip.date);field('trip-story',trip.story);}
async function persist(){
  readFields();
  if(!trip.name){trip.name='我的旅行';$('trip-name').value=trip.name;}
  if(trip.photos.length>9)throw new Error('最多保存 9 张照片');
  await saveTrip(trip);saved=true;await refreshTrips();say('旅行合集已保存到当前浏览器。');
}
async function autosave(){if(!saved&&!trip.photos.length)return true;try{await persist();return true;}catch(error){say(`保存失败：${error.message}。当前草稿仍保留在页面中，请重试。`,true);return false;}}
function shrinkPhoto(image){
  const canvas=document.createElement('canvas'),scale=Math.min(1,960/Math.max(image.naturalWidth,image.naturalHeight));
  canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);
  const context=canvas.getContext('2d');context.fillStyle='white';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
  return canvas.toDataURL('image/jpeg',.82);
}
async function prepareModelImage(source){const image=new Image();image.src=source;await image.decode();return shrinkPhoto(image);}
async function readPhoto(file,id){
  if(file.size>20*1024*1024)throw new Error('单张照片不能超过 20 MB');
  const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer());
  const valid=(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)||(bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71)||(String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP');
  if(!valid)throw new Error('请使用 JPG、PNG 或 WebP 照片；HEIC 请先转换为 JPG');
  const url=URL.createObjectURL(file);
  try{
    const image=new Image();image.src=url;await image.decode();
    if(image.naturalWidth*image.naturalHeight>48_000_000)throw new Error('照片像素过大，请缩小后重试');
    return {id,image:shrinkPhoto(image)};
  }finally{URL.revokeObjectURL(url);}
}
async function tornPhoto(data){
  const image=new Image();image.src=data;await image.decode();
  const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
  const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,pad=Math.max(4,Math.round(Math.min(w,h)*.025));
  ctx.beginPath();
  for(let i=0;i<=12;i++)ctx.lineTo(pad+(w-2*pad)*i/12,pad+(i%3-1)*pad*.45);
  for(let i=1;i<=9;i++)ctx.lineTo(w-pad+(i%3-1)*pad*.45,pad+(h-2*pad)*i/9);
  for(let i=11;i>=0;i--)ctx.lineTo(pad+(w-2*pad)*i/12,h-pad+(i%3-1)*pad*.45);
  for(let i=8;i>0;i--)ctx.lineTo(pad+(i%3-1)*pad*.45,pad+(h-2*pad)*i/9);
  ctx.closePath();ctx.clip();ctx.drawImage(image,0,0);
  return canvas.toDataURL('image/webp',.85);
}
async function removePhoto(id){
  if(working)return;
  markPaintingStale();
  const remaining=trip.photos.filter(photo=>photo.id!==id);
  const ids=new Map(remaining.map((photo,index)=>[photo.id,`p${index+1}`]));
  const affected=trip.memories.filter(point=>point.photoId===id);
  trip.photos=remaining.map(photo=>({...photo,id:ids.get(photo.id)}));
  trip.coverId=ids.get(trip.coverId)||trip.photos[0]?.id||null;
  for(const point of trip.memories){
    if(point.photoId===id){point.id=crypto.randomUUID();point.photoId='';point.evidence='';point.x=null;point.y=null;}
    else point.photoId=ids.get(point.photoId)||'';
  }
  placing=null;selected=null;renderEditors();renderGallery();renderDetail();
  if(await autosave())say(affected.length?`照片已移除；${affected.length} 个记忆点的故事已保留，请重新选择来源照片并标位置。原作品仍在生成历史中。`:'照片已移除，可以继续添加新照片。');
}
function renderEditors(){
  const area=$('trip-point-editors');
  const panel=$('trip-point-panel');panel.hidden=trip.memories.length===0;
  $('trip-point-toggle').textContent=`${panel.open?'收起':'展开'}全部记忆点（${trip.memories.length}）`;
  area.replaceChildren();
  trip.memories.forEach((point,index)=>{
    const card=document.createElement('article');card.className='trip-point-editor';card.dataset.memoryId=point.id;
    const heading=document.createElement('h3');heading.textContent=`记忆点 ${index+1}${point.title?` · ${point.title}`:''}`;
    const title=document.createElement('input');title.className='trip-point-title';title.maxLength=40;title.value=point.title;title.setAttribute('aria-label',`记忆点 ${index+1} 标题`);
    const photo=document.createElement('select');photo.className='trip-point-photo';photo.setAttribute('aria-label',`记忆点 ${index+1} 来源照片`);
    const choose=document.createElement('option');choose.value='';choose.textContent='请选择来源照片';photo.append(choose);
    for(const source of trip.photos){const option=document.createElement('option');option.value=source.id;option.textContent=`照片 ${source.id.slice(1)}`;photo.append(option);}photo.value=point.photoId;
    const evidence=document.createElement('input');evidence.className='trip-point-evidence';evidence.maxLength=180;evidence.value=point.evidence||'';evidence.placeholder='这张照片里能看到什么？';evidence.setAttribute('aria-label',`记忆点 ${index+1} 可见依据`);
    const story=document.createElement('textarea');story.className='trip-point-story';story.maxLength=300;story.rows=2;story.value=point.story||'';story.placeholder='补充你真正记得的事；没有也可以留空。';story.setAttribute('aria-label',`记忆点 ${index+1} 故事`);
    const locate=document.createElement('button');locate.type='button';locate.className='small-button trip-position';locate.textContent=trip.collageVersion?'重新选择抠图目标':point.x==null?'在来源照片上标位置':'重新标记位置';
    const remove=document.createElement('button');remove.type='button';remove.className='text-button';remove.textContent='删除此点';
    const note=document.createElement('p');note.className='hint';note.textContent=!point.photoId?'原照片已移除，请重新选择来源照片。':trip.collageVersion?point.piece?.kind==='paper'?'撕纸照片片段 · 可单独重试':point.piece?.cutout?'已生成剪图片':'等待抠图或需要重试':point.x==null?'尚未标记位置':`已标记在照片 ${point.photoId.slice(1)}`;
    title.addEventListener('change',()=>{point.title=title.value.trim();heading.textContent=`记忆点 ${index+1}${point.title?` · ${point.title}`:''}`;autosave();renderGallery();if(selected===point.id)renderDetail();});
    evidence.addEventListener('change',()=>{point.evidence=evidence.value.trim();autosave();if(selected===point.id)renderDetail();});
    story.addEventListener('change',()=>{point.story=story.value.trim();autosave();if(selected===point.id)renderDetail();});
    photo.addEventListener('change',()=>{markPaintingStale();point.photoId=photo.value;point.x=null;point.y=null;if(point.piece)point.piece.cutout=null;placing=null;renderEditors();renderGallery();if(selected===point.id)renderDetail();autosave();});
    locate.addEventListener('click',()=>{if(!point.photoId)return say('请先为这个记忆点选择来源照片。',true);if(trip.collageVersion)return openRecut(point);placing=point.id;say(`请点击合集中的照片 ${point.photoId.slice(1)}，确定“${point.title||'这个记忆'}”的位置。`);$('trip-gallery').querySelector(`[data-photo-id="${point.photoId}"]`)?.scrollIntoView({block:'center'});});
    remove.addEventListener('click',()=>{markPaintingStale();trip.memories=trip.memories.filter(item=>item.id!==point.id);if(selected===point.id)selected=null;placing=null;renderEditors();renderGallery();renderDetail();autosave();});
    const actions=document.createElement('div');actions.className='trip-editor-actions';actions.append(locate,remove,note);
    const fields=document.createElement('div');fields.className='trip-point-fields';fields.append(title,photo,evidence,story,actions);
    card.append(heading,fields);area.append(card);
  });
}
$('trip-point-panel').addEventListener('toggle',event=>{$('trip-point-toggle').textContent=`${event.currentTarget.open?'收起':'展开'}全部记忆点（${trip.memories.length}）`;});
function renderGallery(){
  const gallery=$('trip-gallery');gallery.replaceChildren();$('trip-atlas').hidden=trip.photos.length===0;
  refreshShowcase();
  const previews=$('trip-upload-preview');previews.replaceChildren();
  for(const source of trip.photos){
    const card=document.createElement('div');card.className='trip-upload-thumb';card.dataset.photoId=source.id;
    const img=document.createElement('img');img.src=source.image;img.alt=`已添加的照片 ${source.id.slice(1)}`;
    const label=document.createElement('span');label.textContent=`照片 ${source.id.slice(1)}`;
    const remove=document.createElement('button');remove.type='button';remove.className='trip-photo-remove';remove.textContent='×';remove.setAttribute('aria-label',`删除照片 ${source.id.slice(1)}`);remove.addEventListener('click',()=>removePhoto(source.id));
    card.append(img,label,remove);previews.append(card);
  }
  $('trip-photo-count').classList.remove('error');$('trip-photo-count').textContent=`已添加 ${trip.photos.length} 张`;
  $('trip-atlas-title').textContent='旅行记忆合集';
  $('trip-atlas-meta').textContent=`${trip.photos.length} 张照片 · ${trip.memories.length} 个记忆点`;
  const collage=Boolean(trip.collageVersion),painting=Boolean(trip.painting?.image);gallery.hidden=collage;$('trip-collage-wrap').hidden=!collage||painting;$('trip-painting-wrap').hidden=!painting;$('trip-painting-actions').hidden=!collage||working&&!painting;$('trip-generate-painting').textContent=trip.painting?.pendingTaskId?'继续取生成结果':painting?'重新生成新画':'重试生成新画';document.querySelector('.trip-atlas-heading>span').textContent=painting?'点击画中的元素，打开那一刻':collage?'元素导图预览 · 正在生成完整新画':'点击照片中的记忆点';$('trip-convert-legacy').hidden=collage||trip.photos.length<2;
  if(!collage){$('trip-showcase-cabinet').hidden=true;$('trip-piece-list').replaceChildren();$('trip-cabinet-grid').replaceChildren();syncShowcaseSize();}
  $('trip-batch-dev').hidden=!developerBatch3D||!painting||trip.painting.stale||trip.photos.length<2||trip.photos.some(photo=>{const points=trip.memories.filter(point=>point.photoId===photo.id);return points.length!==1||!trip.painting.regions?.some(region=>region.memoryId===points[0].id&&region.visible);});
  if(collage){
    const cover=$('trip-cover-select');cover.replaceChildren();for(const source of trip.photos){const option=document.createElement('option');option.value=source.id;option.textContent=`照片 ${source.id.slice(1)}`;cover.append(option);}cover.value=trip.coverId||trip.photos[0]?.id;
    paintingCover.replaceChildren();for(const source of trip.photos){const option=document.createElement('option');option.value=source.id;option.textContent=`照片 ${source.id.slice(1)}`;paintingCover.append(option);}paintingCover.value=trip.coverId||trip.photos[0]?.id;
    if(painting)renderPainting();else renderCollage();
  }
  for(const source of [...trip.photos].sort((a,b)=>(b.id===trip.coverId)-(a.id===trip.coverId))){
    const card=document.createElement('div');card.className='trip-photo';card.dataset.photoId=source.id;card.classList.toggle('cover',source.id===trip.coverId);
    const img=document.createElement('img');img.src=source.image;img.alt=`旅行照片 ${source.id.slice(1)}`;
    const cover=document.createElement('button');cover.type='button';cover.className='trip-cover';cover.textContent=source.id===trip.coverId?'封面照片':'设为封面';
    cover.addEventListener('click',async event=>{event.stopPropagation();trip.coverId=source.id;renderGallery();say('正在保存新封面…');await autosave();});
    const caption=document.createElement('span');caption.className='trip-photo-caption';caption.textContent=`照片 ${source.id.slice(1)}`;
    card.append(img,cover,caption);
    for(const [index,point] of trip.memories.entries())if(point.photoId===source.id&&point.x!=null){
      const marker=document.createElement('button');marker.type='button';marker.className='trip-hotspot';marker.style.left=`${point.x*100}%`;marker.style.top=`${point.y*100}%`;marker.textContent=String(index+1);marker.title=point.title;marker.setAttribute('aria-label',`打开记忆点：${point.title}`);
      marker.addEventListener('click',event=>{event.stopPropagation();selected=point.id;renderDetail();});card.append(marker);
    }
    card.addEventListener('click',event=>{
      const point=trip.memories.find(item=>item.id===placing);if(!point||point.photoId!==source.id)return;
      const rect=img.getBoundingClientRect();if(!rect.width||!rect.height)return;
      point.x=Math.max(.03,Math.min(.97,(event.clientX-rect.left)/rect.width));point.y=Math.max(.03,Math.min(.97,(event.clientY-rect.top)/rect.height));
      placing=null;renderEditors();renderGallery();autosave();say(`“${point.title||'记忆点'}”的位置已标记。`);
    });gallery.append(card);
  }
}
async function renderDetail(recordId){
  const point=selectedPoint(),source=point&&photoFor(point.photoId);
  if(!source){closeDetail();return;}
  const revision=++detailRevision;
  detailPreview?.setAutoRotate(false);
  if(!detail.open)detail.showModal();
  showcasePreviews.forEach(preview=>preview.setAutoRotate(false));
  detail.dataset.hasModel='false';detail.dataset.hasRecord='false';$('trip-model-panel').hidden=true;
  $('trip-detail-image').src=source.image;$('trip-detail-title').textContent=point.title||'未命名记忆';
  $('trip-detail-card-title').textContent=point.title||'未命名记忆';
  $('trip-detail-index').textContent=`${String(trip.memories.indexOf(point)+1).padStart(2,'0')} / ${String(trip.memories.length).padStart(2,'0')}`;
  $('trip-detail-story').textContent=point.story||'这张照片还没有你的故事。可以在上方补充当时发生的事。';
  $('trip-detail-evidence').textContent=`照片依据：${point.evidence||'由你选择的来源照片'}`;
  $('trip-object-status').textContent='正在读取此记忆点的作品…';$('trip-open-object').hidden=true;
  try{
    const records=(await listHistory()).filter(record=>!record.hidden&&record.tripId===trip.id&&record.memoryId===point.id);
    if(revision!==detailRevision||selected!==point.id||!detail.open)return;
    const latestModel=records.find(record=>record.sculpture?.mesh?.length>=9&&(!recordId||record.id===recordId)),latest=recordId?records.find(record=>record.id===recordId):latestModel||records[0],hasModel=Boolean(latestModel);
    detail.dataset.hasModel=String(hasModel);detail.dataset.hasRecord=String(Boolean(latest));$('trip-model-panel').hidden=!hasModel;
    $('trip-object-status').textContent=hasModel?latest.sculpture.exportable?'立体作品已生成，可旋转查看、打开制作记录与导出。':'立体模型已生成，但几何检查未通过；请打开制作记录。':latest?.phase==='reference'?'故事参考图已生成，待你确认后生成三维。':latest?.sculpture?'立体记录中没有可展示的模型，请打开制作记录。':latest?'已有旧版作品，尚无立体模型。':'尚未制作立体纪念物。';
    $('trip-make-object').firstChild.textContent=hasModel?'再做一件 ':latest?'重新制作 ':'做成立体纪念物 ';
    $('trip-open-object').hidden=!latest;
    if(latest){$('trip-open-object').firstChild.textContent=hasModel?latest.sculpture.exportable?'打开作品与导出 ':'查看作品与检查记录 ':latest.phase==='reference'?'继续生成三维 ':latest.sculpture?'查看制作记录 ':'打开作品 ';
      $('trip-open-object').onclick=()=>{closeDetail();window.dispatchEvent(new CustomEvent('trip-open-artwork',{detail:{id:latest.id}}));};}
    if(!hasModel)return;
    $('trip-model-badge').textContent=latest.sculpture.exportable?'立体纪念物 · 已生成':'立体纪念物 · 待修正';
    $('trip-model-panel').dataset.static='false';$('trip-model-fallback').hidden=true;
    await new Promise(resolve=>requestAnimationFrame(resolve));
    if(revision!==detailRevision||!detail.open)return;
    try{
      detailPreview ||= createPreview($('trip-model-canvas'));
      if(!detailPreview)throw new Error('WebGL unavailable');
      detailPreview.setMesh(latest.sculpture.mesh,latest.sculpture);
      detailPreview.setColor(Boolean(latest.sculpture.originalColors?.length||latest.sculpture.faceColors?.length||latest.sculpture.parts?.length));
      detailPreview.view();
      detail.querySelectorAll('[data-trip-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.tripView==='angle')));
      const motion=!matchMedia('(prefers-reduced-motion: reduce)').matches;
      detailPreview.setAutoRotate(motion);$('trip-model-motion').textContent=motion?'自动慢转中 · 拖动时暂停':'可拖动旋转';
    }catch{
      detailPreview?.setAutoRotate(false);$('trip-model-panel').dataset.static='true';$('trip-model-fallback').src=latest.image||source.image;$('trip-model-fallback').hidden=false;$('trip-model-motion').textContent='当前浏览器仅支持静态预览';
    }
  }catch{if(revision===detailRevision){$('trip-object-status').textContent='暂时无法读取此记忆点的作品，请检查浏览器存储。';$('trip-open-object').hidden=true;}}
}
async function refreshTrips(){
  try{
    const trips=await listTrips(),list=$('trip-list');list.replaceChildren();
    if(!trips.length){list.textContent='还没有保存的旅行合集。';return;}
    for(const item of trips){
      const card=document.createElement('article');card.className='trip-library-card';
      const usable=Array.isArray(item.photos)&&Array.isArray(item.memories);
      const img=document.createElement('img');img.src=item.photos?.find?.(photo=>photo.id===item.coverId)?.image||item.photos?.[0]?.image||'';img.alt=`${item.name||'旅行'}的封面`;
      const info=document.createElement('div');const title=document.createElement('h4');title.textContent=item.name||'未命名旅行';const meta=document.createElement('p');meta.textContent=usable?[item.place,item.date,`${item.photos.length} 张照片`,`${item.memories.length} 个记忆点`].filter(Boolean).join(' · '):'记录格式异常，请保留浏览器数据';info.append(title,meta);
      const open=document.createElement('button');open.type='button';open.className='small-button trip-open';open.textContent='打开合集';open.disabled=!usable;open.addEventListener('click',async()=>{if(batchRunning)return say('批量制作正在运行，请等待完成后切换合集。',true);try{const loaded=await getTrip(item.id);if(!loaded)throw new Error('合集不存在');trip=loaded;saved=true;selected=null;placing=null;editing=false;paintingEditing=false;$('trip-painting-editor').hidden=true;$('trip-painting-edit').textContent='手动修正（可选）';closeDetail();paintFields();renderEditors();renderGallery();showPieceTools();say('合集已打开，点击画中元素可查看照片与故事。');$('trip-atlas').scrollIntoView({block:'start'});}catch(error){say(error.message,true);}});
      card.append(img,info,open);list.append(card);
    }
  }catch{$('trip-list').textContent='旅行合集读取失败，请检查浏览器存储权限。';say('旅行合集读取失败，请检查浏览器存储权限。',true);}
}

$('trip-photos').addEventListener('change',async event=>{
  const files=[...event.target.files];event.target.value='';if(!files.length)return;
  if(trip.photos.length+files.length>9)return photoError(`最多添加 9 张；当前已有 ${trip.photos.length} 张。`);
  working=true;$('trip-curate').disabled=true;say('正在读取并压缩照片…');
  try{const photos=await Promise.all(files.map((file,index)=>readPhoto(file,`p${trip.photos.length+index+1}`)));markPaintingStale();trip.photos.push(...photos);trip.coverId??='p1';renderGallery();if(await autosave())say(trip.photos.length<2?'已导入 1 张照片；请再添加至少 1 张，才能提取旅行记忆点。':`已导入 ${trip.photos.length} 张照片。可以让 Agent 提议，也可以手动添加记忆点。`);}
  catch(error){photoError(`${error.message}；原草稿仍保留。`);}finally{working=false;$('trip-curate').disabled=false;}
});
$('trip-curate').addEventListener('click',async()=>{
  if(working)return;readFields();if(trip.photos.length<2)return say(`已导入 ${trip.photos.length} 张照片；请再添加至少 ${2-trip.photos.length} 张后提取记忆点。`,true);
  if(!trip.name){trip.name='我的旅行';$('trip-name').value=trip.name;}
  let autoPainting=false;
  working=true;$('trip-curate').disabled=true;say('正在保存旅行草稿…');
  try{
    await persist();
    say('Agent 正在逐张照片选择片段…');
    const response=await fetch('/api/trip-curation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:trip.name,place:trip.place,date:trip.date,story:trip.story,photos:trip.photos})});
    const result=await response.json();if(!response.ok)throw new Error(result.error||'策展失败');
    markPaintingStale();
    const ordered=[trip.coverId,...trip.photos.map(photo=>photo.id).filter(id=>id!==trip.coverId)];
    for(const suggestion of result.points){
      let point=trip.memories.find(item=>item.photoId===suggestion.photoId);
      if(!point){point={id:crypto.randomUUID(),photoId:suggestion.photoId,title:suggestion.title,evidence:suggestion.evidence,story:suggestion.storyDraft,x:null,y:null};trip.memories.push(point);}
      point.piece??={...defaultPiece(ordered.indexOf(point.photoId),trip.photos.length,point.photoId===trip.coverId)};
      if(point.piece.prompt!==suggestion.cutoutPrompt||point.piece.targetKind!==suggestion.cutoutKind||JSON.stringify(point.piece.point||null)!==JSON.stringify(suggestion.cutoutPoint||null))point.piece.cutout=null;
      point.piece.prompt=suggestion.cutoutPrompt;point.piece.targetKind=suggestion.cutoutKind;point.piece.point=suggestion.cutoutPoint||null;
    }
    trip.collageVersion=1;renderEditors();renderGallery();if(!await autosave())return;
    let fallbacks=0;
    for(const [index,suggestion] of result.points.entries()){
      const point=trip.memories.find(item=>item.photoId===suggestion.photoId);if(point.piece.cutout)continue;
      say(`正在本机剪出第 ${index+1} / ${result.points.length} 张照片的片段…首次使用会下载分割模型，可能需要几分钟。`);
      try{
        const source=photoFor(point.photoId);
        const cut=await fetch('/api/trip-cutout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:source.image,prompt:point.piece.prompt,kind:point.piece.targetKind,point:point.piece.point})});
        const result=await cut.json();if(!cut.ok)throw new Error(result.error||'抠图失败');
        point.piece.cutout=result.cutout;point.piece.kind=result.kind;
        if(result.warning){point.piece.error=result.warning;fallbacks++;}else delete point.piece.error;
      }catch(error){point.piece.cutout=await tornPhoto(photoFor(point.photoId).image);point.piece.kind='paper';point.piece.error=error.message;fallbacks++;}
      renderEditors();renderGallery();if(!await autosave())return;
    }
    autoPainting=true;
    say(`每张照片的元素已提取，接下来自动生成合集画并定位记忆点。${fallbacks?`其中 ${fallbacks} 块暂用照片片段作参考。`:''}`);
  }catch(error){say(`${error.message}；照片与当前草稿仍保留。`,true);}finally{working=false;$('trip-curate').disabled=false;if(autoPainting)await generatePainting();}
});
$('trip-add-memory').addEventListener('click',async()=>{
  if(!trip.photos.length)return say('请先导入照片。',true);
  const point={id:crypto.randomUUID(),photoId:trip.photos[0].id,title:'新的记忆',evidence:'',story:'',x:null,y:null};
  if(trip.collageVersion)point.piece={...defaultPiece(trip.memories.length%9,trip.photos.length),cutout:await tornPhoto(trip.photos[0].image),kind:'paper',prompt:'新的记忆'};
  markPaintingStale();trip.memories.push(point);renderEditors();renderGallery();if(await autosave())say(trip.collageVersion?'已添加一块撕纸照片片段；可以改故事或重新选择抠图目标。':'已添加记忆点，请填写标题与故事，并在来源照片上标位置。');
});
$('trip-save').addEventListener('click',async()=>{try{await persist();}catch(error){say(`保存失败：${error.message}。当前草稿仍保留在页面中。`,true);}});
$('trip-new').addEventListener('click',()=>{if(batchRunning)return say('批量制作正在运行，请等待完成后新建合集。',true);trip={id:crypto.randomUUID(),createdAt:Date.now(),name:'',place:'',date:'',story:'',photos:[],coverId:null,memories:[]};saved=false;selected=null;placing=null;editing=false;paintingEditing=false;$('trip-painting-editor').hidden=true;$('trip-painting-edit').textContent='手动修正（可选）';closeDetail();paintFields();renderEditors();renderGallery();showPieceTools();say('已打开新的旅行草稿，请选择照片。');});
for(const id of ['trip-name','trip-place','trip-date','trip-story'])$(id).addEventListener('change',()=>{if($(id).value.trim()!==trip[{'trip-name':'name','trip-place':'place','trip-date':'date','trip-story':'story'}[id]])markPaintingStale();readFields();renderGallery();autosave();});
$('trip-make-object').addEventListener('click',async()=>{const point=selectedPoint(),source=point&&photoFor(point.photoId);if(!source)return;try{await persist();closeDetail();window.dispatchEvent(new CustomEvent('trip-create-object',{detail:{tripId:trip.id,memoryId:point.id,title:point.title,photo:source.image,story:point.story,place:trip.place,date:trip.date}}));}catch(error){say(`保存失败：${error.message}。当前草稿仍保留在页面中。`,true);}});
$('trip-detail-close').addEventListener('click',closeDetail);
detail.querySelectorAll('[data-trip-view]').forEach(button=>button.addEventListener('click',()=>{
  if(!detailPreview||$('trip-model-panel').dataset.static==='true')return;
  detailPreview.setAutoRotate(false);$('trip-model-motion').textContent='手动查看中';
  detailPreview.view(button.dataset.tripView==='back'?'back':button.dataset.tripView==='front');
  detail.querySelectorAll('[data-trip-view]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
}));
$('trip-recut-close').addEventListener('click',()=>$('trip-recut-dialog').close());
$('trip-convert-legacy').addEventListener('click',()=>$('trip-curate').click());
$('trip-cover-select').addEventListener('change',async event=>{
  markPaintingStale();
  const old=trip.memories.find(point=>point.photoId===trip.coverId)?.piece,next=trip.memories.find(point=>point.photoId===event.target.value)?.piece;
  if(old&&next){for(const key of ['x','y','baseSize','z'])[old[key],next[key]]=[next[key],old[key]];}
  trip.coverId=event.target.value;renderGallery();await autosave();
});
$('trip-edit-collage').addEventListener('click',()=>{editing=!editing;$('trip-edit-collage').textContent=editing?'完成调整':'调整拼贴';showPieceTools();say(editing?'点击片段并拖动位置，使用滑块调整大小。':'拼贴调整已完成。');});
let dragging=null;
$('trip-collage').addEventListener('pointerdown',event=>{
  const point=picked(event);if(!point)return;selected=point.id;
  if(!editing){renderDetail();return;}
  const pos=canvasPosition(event);dragging={id:point.id,dx:point.piece.x-pos.x/COLLAGE_WIDTH,dy:point.piece.y-pos.y/COLLAGE_HEIGHT};
  $('trip-collage').setPointerCapture(event.pointerId);showPieceTools();
});
$('trip-collage').addEventListener('pointermove',event=>{
  if(!dragging)return;const point=trip.memories.find(item=>item.id===dragging.id),pos=canvasPosition(event);
  point.piece.x=Math.max(.04,Math.min(.96,pos.x/COLLAGE_WIDTH+dragging.dx));point.piece.y=Math.max(.04,Math.min(.96,pos.y/COLLAGE_HEIGHT+dragging.dy));
  drawCollage($('trip-collage'),trip,collageImages);
});
$('trip-collage').addEventListener('pointerup',()=>{if(!dragging)return;dragging=null;autosave();});
$('trip-piece-scale').addEventListener('input',event=>{const point=selectedPoint();if(!point?.piece)return;point.piece.scale=Number(event.target.value)/100;drawCollage($('trip-collage'),trip,collageImages);});
$('trip-piece-scale').addEventListener('change',autosave);
$('trip-recut').addEventListener('click',()=>openRecut(selectedPoint()));
$('trip-recut-image').addEventListener('click',async event=>{
  const point=selectedPoint(),source=point&&photoFor(point.photoId);if(!source||working)return;
  const rect=event.target.getBoundingClientRect(),position={x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))};
  $('trip-recut-dialog').close();working=true;say('正在重新抠取这张照片的片段…');
  try{
    const response=await fetch('/api/trip-cutout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:source.image,prompt:point.piece.prompt||point.title,kind:'subject',point:position})});
    const result=await response.json();if(!response.ok)throw new Error(result.error||'抠图失败');
    markPaintingStale();point.piece.cutout=result.cutout;point.piece.kind=result.kind;point.piece.targetKind=result.kind==='subject'?'subject':'scene';point.piece.point=position;
    if(result.warning)point.piece.error=result.warning;else delete point.piece.error;
    renderEditors();renderGallery();if(await autosave())say(result.warning||'已重新抠取并保存这块片段。',!!result.warning);
  }catch(error){say(`${error.message}；原片段仍保留，可再次点击重试。`,true);}finally{working=false;}
});
const paintingCoverLabel=document.createElement('label'),paintingCover=document.createElement('select');paintingCover.id='trip-painting-cover';paintingCoverLabel.textContent='封面照片 ';paintingCoverLabel.append(paintingCover);$('trip-painting-actions').append(paintingCoverLabel);
paintingCover.addEventListener('change',async()=>{if(paintingCover.value===trip.coverId)return;markPaintingStale();trip.coverId=paintingCover.value;renderGallery();if(await autosave())say('封面已更换；现有新画仍保留，重新生成后才会反映新主视觉。');});
const restorePainting=document.createElement('button');restorePainting.id='trip-restore-painting';restorePainting.type='button';restorePainting.className='small-button';restorePainting.textContent='恢复上一张新画';restorePainting.hidden=true;document.querySelector('.trip-painting-tools').append(restorePainting);
restorePainting.addEventListener('click',async()=>{if(!trip.painting?.previous?.image)return;trip.painting={...trip.painting.previous,previous:null,pendingTaskId:null};renderGallery();if(await autosave())say('已恢复上一张新画及其点击区域。');});
async function locatePainting(image,guide,memories){
  const found=new Map();let lastError;
  for(let attempt=0;attempt<2;attempt++){
    say(attempt?'正在自动复核未确定的点击区域…':'新画已生成，正在自动定位每个记忆元素…');
    try{
      const {regions}=await paintingRequest('/api/trip-painting-map',{image,guide,memories});
      for(const region of regions){const old=found.get(region.memoryId);if(!old||!old.visible&&region.visible||old.needsReview&&region.visible&&!region.needsReview)found.set(region.memoryId,region);}
      if(memories.every(memory=>found.get(memory.id)?.visible&&!found.get(memory.id)?.needsReview))break;
    }catch(error){lastError=error;}
  }
  if(!found.size)throw lastError||new Error('自动定位未返回结果');
  trip.painting.regions=memories.map(memory=>({...found.get(memory.id)||{memoryId:memory.id,visible:false},scale:1}));renderGallery();if(!await autosave())return;
  const missing=trip.painting.regions.filter(region=>!region.visible).length,uncertain=trip.painting.regions.filter(region=>region.visible&&region.needsReview).length;
  say(missing?`新画已保存并自动复核；${missing} 个元素在画中仍未找到，请检查画面是否包含它们。`:uncertain?`新画已生成，点击区域已自动定位；${uncertain} 处轮廓仍不确定。`:'新画已生成，点击区域已自动校准；点击画中元素查看原照片与故事。');
}
async function generatePainting(){
  if(working)return;
  working=true;$('trip-curate').disabled=true;$('trip-generate-painting').disabled=true;
  let memories,guide;
  try{
    if(trip.painting?.pendingTaskId){memories=trip.painting.pendingMemories;guide=trip.painting.pendingGuide;if(!memories||!guide)throw new Error('待完成任务缺少导图，请保留任务编号并检查服务');}
    else{memories=paintingSources();guide=await paintingGuide();}
    await persist();
    let taskId=trip.painting?.pendingTaskId;
    if(!taskId){
      say('正在提交一次 Image 生图任务…');
      ({taskId}=await paintingRequest('/api/trip-painting',{guide,memories,coverId:trip.coverId,name:trip.name,place:trip.place,date:trip.date,story:trip.story}));
      trip.painting={...trip.painting,pendingTaskId:taskId,pendingMemories:memories,pendingGuide:guide,pendingStale:false};renderGallery();await autosave();
    }
    let result;
    for(let i=0;i<150;i++){
      const response=await fetch('/api/trip-painting/'+encodeURIComponent(taskId));result=await response.json();if(!response.ok)throw new Error(result.error||'查询生成结果失败');
      if(result.status==='success')break;
      if(['failed','cancelled'].includes(result.status)){trip.painting.pendingTaskId=null;trip.painting.pendingGuide=null;trip.painting.pendingMemories=null;await autosave();throw new Error('Image 生图失败，可点击重新生成');}
      say(`Image 正在整体重绘旅行画${result.progress?` · ${Math.round(result.progress)}%`:''}…`);
      await new Promise(resolve=>setTimeout(resolve,2000));
    }
    if(result?.status!=='success'||!result.image)throw new Error('生图等待超时；可点击“继续取生成结果”，不会再次提交');
    const image=await compressedPainting(result.image),previous=trip.painting?.image?{image:trip.painting.image,taskId:trip.painting.taskId,regions:trip.painting.regions||[],stale:trip.painting.stale,textInImage:trip.painting.textInImage}:trip.painting?.previous||null,stale=Boolean(trip.painting?.pendingStale);
    trip.painting={image,taskId,pendingTaskId:null,regions:[],stale,previous,textInImage:true};renderGallery();if(!await autosave())return;
    if(stale){say('生图期间素材已更改；新画已保存但点击区域暂停，请按当前素材重新生成。',true);return;}
    try{await locatePainting(image,guide,memories);}
    catch(error){say(`${error.message}；新画已保存，自动定位未完成，可用“重新定位”单独重试，不会重新生图。`,true);}
  }catch(error){say(`${error.message}；原旅行画和草稿仍保留。`,true);}finally{working=false;$('trip-curate').disabled=false;$('trip-generate-painting').disabled=false;renderGallery();}
}
$('trip-generate-painting').addEventListener('click',generatePainting);
$('trip-retry-map').addEventListener('click',async()=>{
  if(working||!trip.painting?.image||trip.painting.stale)return;
  working=true;$('trip-retry-map').disabled=true;
  try{await locatePainting(trip.painting.image,await paintingGuide(),paintingSources());}
  catch(error){say(`${error.message}；新画仍保留，可稍后重新定位。`,true);}
  finally{working=false;$('trip-retry-map').disabled=false;}
});
async function batchRequest(path,body){
  const response=await fetch(path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'批量制作请求失败');return result;
}
$('trip-batch-assets').addEventListener('click',async()=>{
  if(working||batchRunning)return;
  const source=structuredClone(trip),button=$('trip-batch-assets'),status=$('trip-batch-status');
  batchRunning=true;working=true;button.disabled=true;$('trip-batch-style').disabled=true;$('trip-curate').disabled=true;$('trip-generate-painting').disabled=true;$('trip-photos').disabled=true;
  try{
    const result=await runTripBatch(source,$('trip-batch-style').value,{api:batchRequest,listHistory,prepareModelImage,saveHistory:async record=>{await saveHistory(record);if(!record.hidden)window.dispatchEvent(new Event('trip-artifact-saved'));},onProgress:state=>{status.textContent=`${state.completed+state.skipped+state.failed}/${state.total} · ${state.message}`;}});
    const reasons=[...new Set(result.failures)].slice(0,2).join('；');
    status.textContent=`批量制作结束：新增 ${result.completed} 件，已有 ${result.skipped} 件，未完成 ${result.failed} 件。${reasons?`原因：${reasons}。`:''}${result.failures.some(reason=>reason.includes('提交结果未确认'))?'请先核对 Tripo 任务，再处理未确认的作品。':'未完成的任务可再次点击此按钮继续。'}`;
    $('refresh-history').click();
  }catch(error){status.textContent=`批量制作未启动：${error.message}`;}
  finally{batchRunning=false;working=false;button.disabled=false;$('trip-batch-style').disabled=false;$('trip-curate').disabled=false;$('trip-generate-painting').disabled=false;$('trip-photos').disabled=false;renderGallery();}
});
$('trip-painting-edit').addEventListener('click',()=>{paintingEditing=!paintingEditing;$('trip-painting-editor').hidden=!paintingEditing;$('trip-painting-edit').textContent=paintingEditing?'完成修正':'手动修正（可选）';say(paintingEditing?'选择一个记忆元素，再点击新画中的对应位置。':'已退出手动修正。');});
$('trip-painting-target').addEventListener('change',showPaintingScale);
$('trip-painting-scale').addEventListener('input',event=>{const region=trip.painting?.regions?.find(item=>item.memoryId===$('trip-painting-target').value);if(region)region.scale=Number(event.target.value)/100;});
$('trip-painting-scale').addEventListener('change',autosave);
$('trip-painting-hit').addEventListener('click',async event=>{
  if(!trip.painting?.image)return;
  if(onLettering(paintingPosition(event)))return;
  if(!paintingEditing){const region=pickedPainting(event);if(region){selected=region.memoryId;renderDetail();}return;}
  if(working)return;const memoryId=$('trip-painting-target').value,point=trip.memories.find(item=>item.id===memoryId),center=paintingPosition(event);if(!point)return;
  working=true;say('正在校准这个元素的点击区域…');
  try{
    const region=await paintingRequest('/api/trip-painting-region',{image:trip.painting.image,center,kind:point.piece?.targetKind||'scene'});
    const old=trip.painting.regions?.find(item=>item.memoryId===memoryId),updated={...region,memoryId,scale:old?.scale||1,manual:true};
    trip.painting.regions=(trip.painting.regions||[]).filter(item=>item.memoryId!==memoryId).concat(updated);
    renderGallery();if(await autosave())say('点击区域已校准并保存；无需重新生图。');
  }catch(error){say(`${error.message}；原点击区域仍保留。`,true);}finally{working=false;}
});
$('trip-painting-hit').addEventListener('pointermove',event=>{
  const hover=$('trip-painting-hover'),canvas=$('trip-painting-hit'),context=canvas.getContext('2d');context.clearRect(0,0,canvas.width,canvas.height);
  canvas.style.cursor=onLettering(paintingPosition(event))?'default':paintingEditing?'crosshair':'pointer';
  if(paintingEditing){hover.hidden=true;return;}
  const region=pickedPainting(event),point=region&&trip.memories.find(item=>item.id===region.memoryId);if(!point){hover.hidden=true;return;}
  const scale=region.scale||1,box=region.box,c=region.center,w=box.w*scale,h=box.h*scale;
  context.strokeStyle='#fff9e9';context.lineWidth=5;context.setLineDash([12,8]);context.strokeRect((c.x-w/2)*canvas.width,(c.y-h/2)*canvas.height,w*canvas.width,h*canvas.height);context.setLineDash([]);
  hover.textContent=point.title||'查看记忆';hover.style.left=`${Math.min(85,Math.max(3,paintingPosition(event).x*100+2))}%`;hover.style.top=`${Math.min(90,Math.max(4,paintingPosition(event).y*100+2))}%`;hover.hidden=false;
});
$('trip-painting-hit').addEventListener('pointerleave',()=>{$('trip-painting-hover').hidden=true;const canvas=$('trip-painting-hit');canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);});
$('trip-refresh').addEventListener('click',refreshTrips);
window.addEventListener('trip-artifact-saved',()=>{refreshShowcase(true);if(detail.open&&selected)renderDetail();});
window.addEventListener('trip-return',()=>{closeDetail();renderGallery();$('trip-section').scrollIntoView({block:'start'});});
refreshTrips();
fetch('/api/config').then(response=>response.json()).then(config=>{developerBatch3D=Boolean(config.developerBatch3D);renderGallery();}).catch(()=>{});
