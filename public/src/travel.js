import {places,byId,themes} from './travel-catalog.js';
import {initialState,readState,writeState,readTravelChat,writeTravelChat,unlock,addRequest,addQuote,encodeExhibition,decodeExhibition} from './travel-state.js';
import {emptyTravelProfile,normalizeTravelProfile} from './travel-profile.js';
import {makeSouvenir,souvenirSTL} from './souvenir-mesh.js';
import {createPreview} from './preview.js';
import {download} from './export-file.js';
import {normalizeRequest,planFromCatalog} from './travel-domain.js';
import {initWorkspace,renderConstraints,renderRequirements as renderRequirementSummary,renderMap,startPhases,stageEvent,finishPhases,failPhases,canvasStatus,chatMessage,setMessage,clock,icon} from './travel-workspace.js';

const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state=initialState(),current=null,previews=[],dialogPreview=null,shared=null,busy=false,textRevision=false,storageHealthy=true;
let controller=null,routePreviews=[],resetPrevious=false,destinationTouched=false,history=[],activeDay=0;
const sampleInput=normalizeRequest({description:'广州半天，预算300元，喜欢文化建筑和拍照',startTime:'13:00'});
const samplePlan={...planFromCatalog(sampleInput,undefined,{placeIds:['gz-museum','gz-square','gz-tower'],title:'广州 · 珠江两岸漫游'}),mode:'demo',trace:[],assistantReply:'这是广州珠江两岸的路线示例，你可以继续提出要求。'};
const displayedPlan=()=>state.plan||samplePlan;
try{state=readState(localStorage);resetPrevious=Boolean(state.planningReset);}catch(error){storageHealthy=false;$('storage-recovery').hidden=false;notice(error.message);}
try{history=readTravelChat(localStorage);}catch(error){notice(error.message);}
function notice(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(notice.timer);notice.timer=setTimeout(()=>$('toast').hidden=true,6500);}
function persist(){if(!storageHealthy){notice('旧记录尚未恢复，本机保存已暂停。请先下载备份，再重置记录。');return false;}try{writeState(localStorage,state);return true;}catch(error){notice(error.message);return false;}}
function persistChat(){try{writeTravelChat(localStorage,history);return true;}catch(error){notice(error.message);return false;}}
$('backup-storage').onclick=()=>{try{download(new Blob([localStorage.getItem('lvzang.v1')??''],{type:'application/json'}),'旅藏-原始记录备份.json');$('reset-storage').disabled=false;}catch(error){notice(error.message);}};
$('reset-storage').onclick=()=>{try{writeState(localStorage,initialState());writeTravelChat(localStorage,[]);location.reload();}catch(error){notice(error.message);}};
function status(message,error=false){$('plan-status').textContent=message;$('plan-status').classList.toggle('error',error);}
function navigate(view){
  if(shared)return;
  document.querySelectorAll('[data-area]').forEach(el=>el.hidden=el.dataset.area!==view);
  document.querySelectorAll('[data-nav]').forEach(el=>el.classList.toggle('active',el.dataset.nav===view));
  if(view==='merchant')renderMerchant();
  if(view==='explore')renderRoute();else{clearRoutePreviews();clearPreviews();if(view==='collection')renderCollection();}
  window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
}
document.addEventListener('click',e=>{const nav=e.target.closest('[data-nav]');if(nav)navigate(nav.dataset.nav);});
function renderThemes(){
  $('theme-list').innerHTML=[...themes,...state.activities.map(a=>({id:a.id,city:a.city,title:a.title,subtitle:'本机商家活动 · 待现场核实',description:a.description}))].map(t=>`<button type="button" class="theme-card" data-theme="${esc(t.id)}"><small>${esc(t.city)} / 探索灵感</small><strong>${esc(t.title)}</strong><p>${esc(t.subtitle)}</p><span>↗</span></button>`).join('');
  $('theme-list').querySelectorAll('[data-theme]').forEach(button=>button.onclick=()=>{
    const theme=[...themes,...state.activities].find(t=>t.id===button.dataset.theme);$('travel-brief').value=theme.description;$('destination').value=theme.city;destinationTouched=true;$('hours').value='';runPlan(false);
  });
}
function renderNotes(){
  $('note-list').innerHTML=state.notes.map((n,i)=>`<div class="note-item"><span>${i+1}. ${esc(n.title)} <small class="subtle">${n.content.length} 字</small></span><button type="button" class="text-button" data-remove="${i}">移除</button></div>`).join('');
  $('note-list').querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{state.notes.splice(Number(b.dataset.remove),1);persist();renderNotes();});
}
$('import-toggle').onclick=()=>{$('import-dialog').showModal();$('import-toggle').setAttribute('aria-expanded','true');};
$('close-import').onclick=()=>$('import-dialog').close();
$('import-dialog').addEventListener('close',()=>$('import-toggle').setAttribute('aria-expanded','false'));
$('add-note').onclick=()=>{
  if(! $('note-content').value.trim())return notice('请先粘贴攻略正文。');if(state.notes.length>=8)return notice('最多保留 8 篇攻略，请先移除一篇。');
  const raw=$('note-url').value.trim();if(raw&&!/^https?:\/\//.test(raw))return notice('出处请使用 http 或 https 链接。');
  state.notes.push({title:$('note-title').value.trim()||`攻略 ${state.notes.length+1}`,content:$('note-content').value.trim(),url:raw});
  const saved=persist();renderNotes();for(const id of ['note-content','note-title','note-url'])$(id).value='';notice(saved?'资料已加入，下次策划会结合你的实际需求。':'资料暂留在当前页面，尚未保存；请保留攻略原文。');
};
async function imageData(file){
  if(file.size>15_000_000)throw new Error('截图请控制在 15 MB 以内');
  const img=new Image(),url=URL.createObjectURL(file);try{img.src=url;await img.decode();const ratio=Math.min(1,1400/Math.max(img.width,img.height));const canvas=document.createElement('canvas');canvas.width=Math.round(img.width*ratio);canvas.height=Math.round(img.height*ratio);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/jpeg',.82);}finally{URL.revokeObjectURL(url);}
}
$('note-image').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;status('正在读取截图中的文字，请稍候…');
  try{const response=await fetch('/api/travel-import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:await imageData(file)})});const data=await response.json();if(!response.ok)throw new Error(data.error);$('note-content').value=data.text;$('note-title').value=file.name.slice(0,80);status('截图文字已填入，请核对后点击「加入资料」。');}catch(error){status(error.message,true);}finally{e.target.value='';}
};
let modeTouched=false;
function modeNote(){$('mode-note').textContent=$('agent-mode').value==='ai'?'DeepSeek 对话 · Agent 将旅行需求整合到右侧方案。':'本地示范 · 三城路线示例；开放问答请切换 AI。';}
$('agent-mode').onchange=()=>{modeTouched=true;modeNote();};
$('travel-brief').addEventListener('input',()=>textRevision=true);
$('destination').addEventListener('input',()=>destinationTouched=true);
$('destination').addEventListener('change',()=>destinationTouched=true);
function remember(role,content){history.push({role,content:String(content).slice(0,2000)});history=history.slice(-12);}
const tripSettingIds={dayCount:'trip-day-count',dailyHours:'trip-daily-hours',pace:'trip-pace'},tripSettingEdits=new Set();
function renderTripSettings(profile){
  for(const [field,id] of Object.entries(tripSettingIds))$(id).value=profile.fields[field].value??'';
  tripSettingEdits.clear();$('trip-settings-note').classList.remove('error');
  const tentative=Object.keys(tripSettingIds).some(field=>profile.fields[field].status==='tentative');
  $('trip-settings-note').textContent=tentative?'部分条件仍是暂定值；只会确认你修改后应用的字段。':'填写想修改的条件后应用，也可以继续用对话调整。';
}
function renderRequirements(profile,pending=false){renderRequirementSummary(profile,pending);if(!pending)renderTripSettings(profile);}
for(const [field,id] of Object.entries(tripSettingIds))$(id).addEventListener('input',()=>{tripSettingEdits.add(field);$('trip-settings-note').classList.remove('error');});
$('trip-settings-form').onsubmit=event=>{
  event.preventDefault();if(busy||!$('trip-settings-form').reportValidity())return;
  const settings={};
  for(const field of tripSettingEdits){const raw=$(tripSettingIds[field]).value;if(raw==='')continue;const value=field==='pace'?raw:Number(raw),old=state.profile.fields[field];if(old.status!=='confirmed'||old.value!==value)settings[field]=value;}
  if(!Object.keys(settings).length){$('trip-settings-note').textContent='请先修改至少一项；留空的条件会继续沿用。';return;}
  const phrases={dayCount:value=>`旅行改为${value}天`,dailyHours:value=>`每天游览${value}小时`,pace:value=>`游玩强度改为${{easy:'轻松慢游',normal:'正常节奏',active:'充实紧凑'}[value]}`};
  runPlan(true,{tripSettings:settings,description:`调整行程：${Object.entries(settings).map(([field,value])=>phrases[field](value)).join('，')}。`});
};
async function runPlan(usePrevious=true,settingsSubmission=null){
  if(busy)return;busy=true;$('trip-settings-fields').disabled=true;const settingsDraft=settingsSubmission?{text:$('travel-brief').value,destination:$('destination').value,destinationTouched}:null;const button=$('plan-button');button.disabled=true;$('new-trip').disabled=true;$('cancel-plan').hidden=false;$('plan-form').setAttribute('aria-busy','true');
  const before=displayedPlan(),beforeProfile=state.profile,beforePlan=state.plan,beforeDay=activeDay,beforeReset=state.planningReset,ai=!settingsSubmission&&$('agent-mode').value==='ai';
  $('day-selector').querySelectorAll('button').forEach(button=>button.disabled=true);
  const body={description:settingsSubmission?.description||$('travel-brief').value||`帮我安排${$('destination').value||'一条旅行'}路线`,destination:settingsSubmission?'':destinationTouched?$('destination').value:'',hours:settingsSubmission?undefined:$('hours').value||undefined,textRevision:settingsSubmission?true:!destinationTouched,...(settingsSubmission?{tripSettings:settingsSubmission.tripSettings}:{}),mode:$('agent-mode').value,profile:usePrevious?state.profile:emptyTravelProfile(),notes:state.notes,previous:usePrevious&&!resetPrevious&&state.plan?before.input:undefined,currentPlan:usePrevious&&!resetPrevious&&state.plan?before:undefined,history:history.slice()};
  remember('user',body.description);
  chatMessage('user',body.description.trim()||`请推荐${body.destination||'一条旅行'}路线`,new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}));
  const reply=chatMessage('assistant','已收到，正在理解你的问题…',settingsSubmission?'调整旅行条件':ai?'DeepSeek 对话':'本地规则示范');reply.classList.add('pending');
  if(!settingsSubmission){$('travel-brief').value='';textRevision=false;}controller=new AbortController();startPhases(ai);canvasStatus('正在理解你的问题',true);status('正在结合对话理解你的要求。');$('route-state').textContent='保留当前方案';let result=null;
  try{
    const response=await fetch('/api/travel-chat/stream',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(160000)])});
    if(!response.ok){const data=await response.json();throw new Error(data.error||'策划失败');}
    if(!response.body)throw new Error('浏览器未收到方案流，请重试。');
    const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
    const consume=event=>{if(event.type==='stage')stageEvent(event);else if(event.type==='profile')renderRequirements(event.profile,true);else if(event.type==='constraints'){renderConstraints(event.input,before.input,true,event.profile||null);if(event.profile)renderRequirements(event.profile,true);$('route-state').textContent='待更新';$('route-section').classList.add('pending');}else if(event.type==='reply')setMessage(reply,event.text,'正在安排路线，最终行程尚未确认');else if(event.type==='result')result=event.response||event.plan;else if(event.type==='error')throw new Error(event.error);};
    try{while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);if(line)consume(JSON.parse(line));}}buffer+=decoder.decode();if(buffer.trim())consume(JSON.parse(buffer));}finally{reader.releaseLock();}
    if(!result)throw new Error('对话连接中断，前一方案已保留。');
    if(result.kind==='answer'||result.kind==='clarify'){
      const acceptedProfile=result.profile?normalizeTravelProfile(result.profile):beforeProfile;
      const changed=JSON.stringify(acceptedProfile)!==JSON.stringify(beforeProfile);state.profile=acceptedProfile;
      setMessage(reply,result.assistantReply,result.kind==='clarify'?'补充旅行条件':result.mode==='ai'?'DeepSeek':'本地说明');remember('assistant',result.assistantReply);reply.classList.remove('pending');finishPhases(result);renderRequirements(state.profile);renderConstraints(before.input,null,false,state.profile,before.days?.[activeDay],result.kind==='clarify'||Boolean(state.profile.followUps.length));const saved=changed?persist():true,chatSaved=persistChat();canvasStatus(result.kind==='clarify'?'需求已记录 · 等你补充条件':'已回答 · 当前行程保持不变',false,!saved||!chatSaved);status(!saved||!chatSaved?'当前对话或需求尚未保存，请保留此页面。':result.kind==='clarify'?'请补充上方问题，当前行程已保留。':'已回答你的问题。需要修改行程时，直接告诉我。');return;
    }
    if(result.status!=='ready')throw new Error(result.assumptions.join(' '));
    const acceptedProfile=result.profile?normalizeTravelProfile(result.profile):beforeProfile;
    state.plan=result;state.profile=acceptedProfile;state.planningReset=false;activeDay=0;resetPrevious=false;destinationTouched=false;$('destination').value=result.city;$('hours').value='';setMessage(reply,result.assistantReply||result.changeSummary,settingsSubmission?'旅行条件已更新':result.mode==='ai'?'AI 协作已完成':'本地示范已完成');remember('assistant',result.assistantReply||result.changeSummary);renderRoute();renderConstraints(result.input,before.input,false,state.profile,result.days?.[activeDay]);renderRequirements(state.profile);finishPhases(result);const saved=persist(),chatSaved=persistChat();reply.classList.remove('pending');$('workspace-title').textContent=result.city+'城市漫游';$('chat-session-label').textContent='可以继续提问，也可以修改方案';canvasStatus(saved&&chatSaved?'方案已更新，继续说说你的想法':'方案已更新 · 尚未保存',false,!saved||!chatSaved);status(saved&&chatSaved?'方案已更新。':'方案或对话暂留在页面，尚未保存。');
  }catch(error){state.plan=beforePlan;state.profile=beforeProfile;state.planningReset=beforeReset;activeDay=beforeDay;history=body.history.slice();const message=error.name==='AbortError'?'已停止本次修订，前一方案已保留。':error.message||'网络异常，前一方案已保留。';renderRoute();renderConstraints(before.input,null,false,beforeProfile,before.days?.[activeDay],Boolean(beforeProfile.followUps.length));renderRequirements(beforeProfile);failPhases(message);setMessage(reply,message,'这次修订未保存');reply.classList.remove('pending');reply.classList.add('error');canvasStatus(message,false,true);status(message,true);}finally{busy=false;controller=null;$('trip-settings-fields').disabled=false;if(settingsDraft){$('travel-brief').value=settingsDraft.text;destinationTouched=settingsDraft.destinationTouched;if(destinationTouched)$('destination').value=settingsDraft.destination;}button.disabled=false;$('new-trip').disabled=false;$('cancel-plan').hidden=true;$('plan-form').removeAttribute('aria-busy');$('route-section').classList.remove('pending');$('day-selector').querySelectorAll('button').forEach(dayButton=>dayButton.disabled=false);$('route-state').textContent=state.profile.followUps.length?'待补充条件':state.plan?'已确认':'示例';}
}
$('plan-form').onsubmit=e=>{e.preventDefault();runPlan();};
$('travel-brief').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();runPlan();}};
$('cancel-plan').onclick=()=>controller?.abort();
$('revise').onclick=()=>$('travel-brief').focus();
$('new-trip').onclick=()=>{if(busy)return;resetPrevious=true;state.planningReset=true;history=[];state.profile=emptyTravelProfile();destinationTouched=false;$('destination').value='';$('hours').value='';$('travel-brief').value='';$('chat-messages').innerHTML='';persist();persistChat();renderRequirements(state.profile);$('travel-brief').focus();chatMessage('assistant','开始一个新方案。告诉我想去哪、可以玩多久；收藏和上次方案会继续保留。');};
function clearRoutePreviews(){routePreviews.forEach(p=>p.destroy());routePreviews=[];}
function renderRoute(){
  const fullPlan=displayedPlan();if(!fullPlan)return;
  activeDay=Math.max(0,Math.min(activeDay,(fullPlan.days?.length||1)-1));const day=fullPlan.days?.[activeDay],plan=day?{...fullPlan,...day,input:{...fullPlan.input,startTime:day.startTime,hours:day.hours}}:fullPlan;
  $('workspace-title').textContent=plan.city+'城市漫游';$('route-title').textContent=fullPlan.title;
  $('day-selector').hidden=!(fullPlan.days?.length>1);$('day-selector').innerHTML=(fullPlan.days||[]).map((d,index)=>`<button type="button" data-day="${index}" aria-pressed="${index===activeDay}" ${busy?'disabled':''}>第${d.dayIndex}天</button>`).join('');
  $('day-selector').querySelectorAll('[data-day]').forEach(button=>button.onclick=()=>{activeDay=Number(button.dataset.day);renderRoute();});
  $('route-meta').textContent=`${day?`第${day.dayIndex}天 · `:''}${plan.stops.length}站 · 游览与转场约${plan.totalMinutes}分钟 · ${plan.transport}${day?.freeMinutes?` · 留白${day.freeMinutes}分钟`:''}`;
  if(!busy)renderConstraints(fullPlan.input,null,false,state.profile,day,Boolean(state.profile.followUps.length));
  $('route-state').textContent=busy?'待更新':state.profile.followUps.length?'待补充条件':state.plan?'已确认':'示例';
  $('route-assumptions').innerHTML=[...plan.assumptions,...plan.warnings].map(t=>`<p class="assumption">${esc(t)}</p>`).join('');
  $('route-stops').innerHTML=plan.stops.map((p,i)=>{const collected=state.collection.some(c=>c.id===p.id);return `<article class="stop-card" data-stop-card="${p.id}" tabindex="-1"><span class="stop-number">${i+1}</span><h3>${esc(p.name)}</h3><p class="stop-time">${clock(plan.input,p.estimatedStart)} — ${clock(plan.input,p.estimatedStart+p.minutes)}</p><p class="stop-story">${esc(p.story)}</p><details><summary>探索任务与纪念品</summary><p>${esc(p.task)}</p><p>${byId(p.id)?'可收藏：'+esc(p.souvenir):'可用旅行照片创作专属纪念品'}<br>${esc(p.availability)}</p></details><div class="stop-actions">${byId(p.id)?`<button class="${collected?'secondary':'primary'}" data-unlock="${p.id}">${collected?'查看 3D 纪念品':'模拟签到 · 解锁'}</button>`:'<a class="secondary" href="/#single-create">定制纪念品</a>'}<a data-navigation-stop="${esc(p.id)}" data-location-status="unresolved" href="https://uri.amap.com/search?keyword=${encodeURIComponent(p.city+p.name)}" target="_blank" rel="noopener">在高德搜索</a></div></article>`;}).join('')||'<p class="day-empty">这一天尚无可靠地点安排，保留自由时间；可以补充想去的地方。</p>';
  $('route-stops').querySelectorAll('[data-unlock]').forEach(button=>button.onclick=()=>{const id=button.dataset.unlock,was=state.collection.some(c=>c.id===id);if(!state.plan)state.plan=samplePlan;unlock(state,id,fullPlan.title);const saved=persist();renderRoute();$('collection-count').textContent=state.collection.length;showSouvenir(id);if(!saved)notice('纪念品暂留在当前页面，尚未保存；请导出展览备份。');else if(!was)notice('已通过模拟签到解锁，正式活动需配置现场核验。');});
  renderMap(plan,state.collection,fullPlan.stops,{excludedPlaces:state.profile.fields.excludedPlaces.value||[],excludedIds:fullPlan.input.excludedIds||[],isExample:!state.plan});clearRoutePreviews();
  $('route-souvenirs').innerHTML=plan.stops.filter(p=>byId(p.id)).slice(0,3).map(p=>`<article class="souvenir-preview"><canvas data-route-model="${p.id}" aria-hidden="true"></canvas><div><strong>${esc(p.souvenir)}</strong><small>${state.collection.some(c=>c.id===p.id)?'已解锁 · 查看':'未解锁'}</small></div><button aria-label="查看${esc(p.souvenir)}收藏状态" data-preview-stop="${p.id}"></button></article>`).join('')||'<p class="fine">这里还没有预制纪念品。<a href="/#single-create">用照片定制自己的旅行收藏</a></p>';
  $('route-souvenirs').querySelectorAll('canvas').forEach(canvas=>{try{const preview=createPreview(canvas),m=makeSouvenir(canvas.dataset.routeModel);preview.setMesh(m.mesh,{originalColors:m.colors,widthMm:m.widthMm,heightMm:m.heightMm,centerY:20,centerZ:0});preview.setColor(true);preview.view(false);routePreviews.push(preview);}catch{canvas.hidden=true;}});
  $('route-souvenirs').querySelectorAll('[data-preview-stop]').forEach(button=>button.onclick=()=>{if(state.collection.some(c=>c.id===button.dataset.previewStop))showSouvenir(button.dataset.previewStop);else{document.querySelector(`[data-stop-card="${button.dataset.previewStop}"]`)?.focus({preventScroll:true});notice('在对应行程站点模拟签到后，可解锁纪念品并加入展柜。');}});
  const analysis=plan.analysis;
  $('analysis-content').innerHTML=`<p class="fine">${esc(analysis.summary)}</p>`+analysis.findings.map(f=>`<article class="source-entry"><strong>${esc(f.title)}</strong><p>${esc(f.text)}</p><small>原帖片段 · 未独立核实</small></article>`).join('')+analysis.places.map(p=>`<article class="source-entry"><strong>${esc(p.name)}</strong><p>${p.evidence.map(e=>esc(e.title)+(e.url?` · <a href="${esc(e.url)}" target="_blank" rel="noopener">查看出处</a>`:'')).join('<br>')}</p></article>`).join('')+`<p class="fine">${plan.stops.some(p=>p.source)?'地方参考：':'模型知识建议，暂无实时来源：'}${plan.stops.filter(p=>p.source).map(p=>`<a href="${esc(p.source)}" target="_blank" rel="noopener">${esc(p.name)}</a>`).join(' · ')}。参考入口不代表已核实当日营业、预约与票价。</p>`;
}

function clearPreviews(){previews.forEach(p=>p.destroy());previews=[];}
function populateCabinet(target,items,readonly=false){
  target.innerHTML=items.map((c,i)=>{const p=byId(c.id);return `<article class="exhibit"><canvas tabindex="0" data-model="${c.id}" role="img" aria-label="${esc(p.souvenir)}三维模型，方向键或拖动旋转"></canvas><h3>${esc(p.souvenir)}</h3><small>${esc(p.city)} / ${esc(p.name)} · ${esc(c.date)}</small><p>${esc(c.story||'一站风景，一份自己的记忆。')}</p>${readonly?'':`<div class="exhibit-actions"><button data-open="${c.id}">故事与实物 ↗</button>${i>0?`<button data-move="${c.id}">移到前面 ↑</button>`:''}</div>`}</article>`;}).join('');
  target.querySelectorAll('[data-model]').forEach(canvas=>{const model=makeSouvenir(canvas.dataset.model);let preview;try{preview=createPreview(canvas);}catch{}if(preview){preview.setMesh(model.mesh,{originalColors:model.colors,widthMm:model.widthMm,heightMm:model.heightMm,centerY:20,centerZ:0});preview.setColor(true);preview.view(false);previews.push(preview);}else{canvas.insertAdjacentHTML('afterend','<p>当前设备无法显示 3D，请在支持 WebGL 的浏览器打开。</p>');}});
  target.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>showSouvenir(b.dataset.open));
  target.querySelectorAll('[data-move]').forEach(b=>b.onclick=()=>{const i=state.collection.findIndex(c=>c.id===b.dataset.move);[state.collection[i-1],state.collection[i]]=[state.collection[i],state.collection[i-1]];persist();renderCollection();});
}
function renderCollection(){
  clearPreviews();$('collection-count').textContent=state.collection.length;$('exhibition-title').value=state.title;$('exhibition-meta').textContent=`${state.collection.length} 件收藏 · 保存在当前浏览器`;
  $('collection-empty').hidden=state.collection.length>0;$('cabinet').hidden=!state.collection.length;$('share-exhibition').disabled=!state.collection.length;$('export-exhibition').disabled=!state.collection.length;
  populateCabinet($('cabinet'),state.collection);
}
$('exhibition-title').onchange=()=>{state.title=$('exhibition-title').value.trim()||'我的旅行展柜';persist();};
$('share-exhibition').onclick=()=>{
  const payload=encodeExhibition({title:state.title,collection:state.collection});const url=`${location.origin}/travel.html#exhibition=${payload}`;
  $('share-panel').querySelector('.fine').textContent='链接包含展品与故事，不包含照片、攻略或订单；任何持有链接的人均可查看。'+(['localhost','127.0.0.1'].includes(location.hostname)?' 当前是本地网址，可在本机跨浏览器预览；向朋友分享前，需要将应用部署到可访问的地址。':'');
  $('share-url').value=url;$('open-share').href=url;$('share-panel').hidden=false;$('share-panel').scrollIntoView({block:'center',behavior:'smooth'});
};
$('copy-share').onclick=async()=>{try{await navigator.clipboard.writeText($('share-url').value);notice('链接已复制。');}catch{$('share-url').select();notice('请复制已选中的分享链接。');}};
$('export-exhibition').onclick=()=>download(new Blob([JSON.stringify({title:state.title,collection:state.collection},null,2)],{type:'application/json'}),'旅藏-旅行展览.json');
function showSouvenir(id){
  current=id;const p=byId(id),item=state.collection.find(c=>c.id===id);
  $('souvenir-title').textContent=p.souvenir;$('souvenir-story').textContent=p.story;$('memory-story').value=item?.story||'';$('souvenir-status').textContent='';$('print-text').value='';
  $('memory-story').disabled=shared!==null;$('save-story').hidden=shared!==null;$('print-form').hidden=shared!==null;
  $('souvenir-dialog').showModal();dialogPreview?.destroy();dialogPreview=null;
  try{dialogPreview=createPreview($('souvenir-canvas'));}catch{}$('webgl-note').hidden=Boolean(dialogPreview);
  if(dialogPreview){const m=makeSouvenir(id);dialogPreview.setMesh(m.mesh,{originalColors:m.colors,widthMm:m.widthMm,heightMm:m.heightMm,centerY:20,centerZ:0});dialogPreview.setColor(true);dialogPreview.view(false);dialogPreview.setAutoRotate(!matchMedia('(prefers-reduced-motion: reduce)').matches);}
}
$('close-souvenir').onclick=()=>$('souvenir-dialog').close();
$('souvenir-dialog').addEventListener('close',()=>{dialogPreview?.destroy();dialogPreview=null;});
$('save-story').onclick=()=>{const c=state.collection.find(c=>c.id===current);if(!c)return;c.story=$('memory-story').value.trim();const saved=persist();$('souvenir-status').textContent=saved?'这段记忆已保存。':'这段记忆尚未保存，请导出展览备份并保留此页面。';renderCollection();};
$('download-stl').onclick=()=>{try{if(!$('print-width').reportValidity())throw new Error('导出尺寸需要在 40–120 mm 之间');download(new Blob([souvenirSTL(current,Number($('print-width').value))],{type:'application/octet-stream'}),`${byId(current).souvenir}.stl`);$('souvenir-status').textContent='文件已导出。请在切片器合并部件、检查支撑与结构，并先试打。';}catch(error){$('souvenir-status').textContent=error.message;}};
$('print-form').onsubmit=e=>{e.preventDefault();try{const req=addRequest(state,{souvenirId:current,width:$('print-width').value,material:$('print-material').value,text:$('print-text').value});const saved=persist();$('souvenir-status').textContent=saved?`需求已保存到商家工作台 · ${req.status}。未付款、未生产。`:'需求暂留在内存，未能保存；请保留此页面。';}catch(error){$('souvenir-status').textContent=error.message;}};
function renderMerchant(){
  $('merchant-stats').innerHTML=[['主题活动',state.activities.length],['定制需求',state.requests.length],['已录入报价',state.requests.reduce((n,r)=>n+(r.quotes?.length||0),0)]].map(([label,value])=>`<div><strong>${value}</strong><span>${label} · 本机记录</span></div>`).join('');
  $('activity-list').innerHTML=state.activities.map(a=>`<div class="source-entry"><strong>${esc(a.title)}</strong><p>${esc(a.city)} · ${esc(a.description)}</p><button class="text-button" data-activity="${a.id}">用 Agent 策划这场活动 ↗</button></div>`).join('');
  $('activity-list').querySelectorAll('[data-activity]').forEach(b=>b.onclick=()=>{const a=state.activities.find(a=>a.id===b.dataset.activity);navigate('explore');$('destination').value=a.city;destinationTouched=true;$('travel-brief').value=a.description;$('hours').value='';runPlan(false);});
  $('request-list').innerHTML=state.requests.length?state.requests.map(r=>`<article class="request-card"><strong>${esc(byId(r.souvenirId)?.souvenir||'纪念品')} · ${esc(r.status)}</strong><p>${esc(r.width)} mm / ${esc(r.material)}<br>定制文字：${esc(r.text||'无')}</p><small>本机需求 · 尚未付款或发送工厂</small>${(r.quotes||[]).slice().sort((a,b)=>a.price-b.price).map(q=>`<div class="quote-row">${esc(q.supplier)} · ¥${q.price.toFixed(2)} / 件 · ${esc(q.days)} 天<br>${esc(q.note||'价格是否含后处理与运费，请与供应商确认。')}</div>`).join('')}<form data-quote="${r.id}"><div class="quote-fields"><label>供应商<input name="supplier" maxlength="80" required placeholder="实际询价对象"></label><label>报价 / 元<input name="price" type="number" min="0.01" max="100000" step="0.01" required></label><label>交期 / 天<input name="days" type="number" min="1" max="365" required></label><label>包含费用与备注<input name="note" maxlength="200" placeholder="材料、后处理、运费…"></label></div><button class="secondary" type="submit">记录供应商报价</button></form></article>`).join(''):'<p class="fine">还没有定制需求。游客可以在已解锁纪念品中提交规格与定制文字。</p>';
  $('request-list').querySelectorAll('[data-quote]').forEach(form=>form.onsubmit=e=>{e.preventDefault();try{const values=new FormData(form);addQuote(state,form.dataset.quote,Object.fromEntries(values));const saved=persist();renderMerchant();notice(saved?'报价已记录；仍需用户确认并与供应商落实生产。':'报价暂留在当前页面，尚未保存。');}catch(error){notice(error.message);}});
}
$('activity-form').onsubmit=e=>{e.preventDefault();if(state.activities.length>=12)return notice('试点版本最多保留 12 个本机活动。');state.activities.push({id:crypto.randomUUID(),title:$('activity-title').value.trim(),city:$('activity-city').value,description:$('activity-description').value.trim()});const saved=persist();renderThemes();renderMerchant();$('activity-title').value='';$('activity-description').value='';notice(saved?'活动已保存，可在探索入口选择。':'活动暂留在当前页面，尚未保存；请保留活动原文。');};
function loadShared(){
  const match=location.hash.match(/^#exhibition=(.*)$/);if(!match)return false;
  try{shared=decodeExhibition(match[1]);document.querySelectorAll('[data-area]').forEach(el=>el.hidden=true);document.querySelector('.site-header nav').hidden=true;$('shared-section').hidden=false;$('shared-title').textContent=shared.title;clearPreviews();populateCabinet($('shared-cabinet'),shared.collection,true);return true;}catch(error){notice(error.message);$('plan-status').textContent=error.message;return false;}
}
renderThemes();renderNotes();$('collection-count').textContent=state.collection.length;
if(!loadShared()){initWorkspace();renderRequirements(state.profile);renderConstraints(displayedPlan().input,null,false,state.profile,null,Boolean(state.profile.followUps.length));if(history.length){$('chat-messages').innerHTML='';history.forEach(message=>chatMessage(message.role,message.content,'上次对话'));}if(state.plan){if(!resetPrevious)$('destination').value=state.plan.city;if(!history.length&&!resetPrevious){remember('assistant',state.plan.assistantReply||state.plan.changeSummary);chatMessage('assistant',state.plan.assistantReply||state.plan.changeSummary,'上次保存的方案');}finishPhases(state.plan);canvasStatus('上次方案已恢复，继续说说你的想法');}navigate('explore');}
fetch('/api/config').then(r=>r.json()).then(config=>{if(!config.configured){$('agent-mode').querySelector('[value="ai"]').textContent='AI Agent 协作 · 未配置';}else if(!modeTouched){$('agent-mode').value='ai';}modeNote();}).catch(()=>{});
