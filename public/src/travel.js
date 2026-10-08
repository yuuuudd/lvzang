import {requestUserIdentity} from './account-ui.js';
import {accountInfo} from './account-client.js';
import {places,byId,themes} from './travel-catalog.js';
import {initialState,readState,writeState,readTravelChat,writeTravelChat,readRawTravelState,unlock,decodeExhibition} from './travel-state.js';
import {emptyTravelProfile,normalizeTravelProfile} from './travel-profile.js';
import {installTravelRefresh} from './travel-refresh.js';
import {initTravelGuideLayout} from './travel-guide-layout.js';
import {renderTravelGuide,appendResearchSources,installChatReturn,advisorReplyText} from './travel-guide-view.js';
import {makeSouvenir,souvenirSTL} from './souvenir-mesh.js';
import {createPreview} from './preview.js';
import {download} from './export-file.js';
import {normalizeRequest,planFromCatalog} from './travel-domain.js';
import {initWorkspace,renderConstraints,renderRequirements as renderRequirementSummary,renderMap,startPhases,stageEvent,finishPhases,failPhases,canvasStatus,chatMessage,setMessage,revealChatMessage,travelPlanStatus,clock,icon} from './travel-workspace.js';

const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state=initialState(),current=null,previews=[],dialogPreview=null,shared=null,busy=false,textRevision=false,storageHealthy=true;
const currentIdentityKey=()=>accountInfo.enabled?(accountInfo.user?.id||'guest'):'local';
let loadedIdentityKey=currentIdentityKey();
let controller=null,routePreviews=[],resetPrevious=false,destinationTouched=false,history=[],activeDay=0;
const travelUiKey='lvzang.travel-ui.v1';let toolsPreference=null;
const routeRefresh=installTravelRefresh(city=>{
  if(busy)return;
  modeTouched=true;$('agent-mode').value='ai';modeNote();
  runPlan(true,{advisorAction:'refresh',destination:city,...(['active','ready','paused'].includes(state.profile.interview?.status)?{interviewAction:'plan'}:{}),description:`请重新规划${city}的完整行程，按已保存的旅行偏好重新选择和安排地点，并补充每站怎么玩、具体餐厅分店、地址、推荐菜和资料来源。`});
});
try{const savedUi=JSON.parse(localStorage.getItem(travelUiKey)||'null');if(typeof savedUi?.toolsCollapsed==='boolean')toolsPreference=savedUi.toolsCollapsed;}catch{}
function setToolsCollapsed(collapsed,save=false){
  $('planner-tools-content').hidden=collapsed;$('planner-tools-toggle').setAttribute('aria-expanded',String(!collapsed));
  $('planner-tools-toggle').textContent=collapsed?'旅行顾问 · 展开设置':'旅行顾问 · 收起设置';
  if(save){toolsPreference=collapsed;try{localStorage.setItem(travelUiKey,JSON.stringify({toolsCollapsed:collapsed}));}catch{}}
}
function makeRoomForChat(){if(toolsPreference!==false)setToolsCollapsed(true);}
$('planner-tools-toggle').onclick=()=>setToolsCollapsed(!$('planner-tools-content').hidden,true);
setToolsCollapsed(toolsPreference===true);
const sampleInput=normalizeRequest({description:'广州半天，预算300元，喜欢文化建筑和拍照',startTime:'13:00'});
const samplePlan={...planFromCatalog(sampleInput,undefined,{placeIds:['gz-museum','gz-square','gz-tower'],title:'广州 · 珠江两岸漫游'}),mode:'demo',trace:[],assistantReply:'这是广州珠江两岸的路线示例，你可以继续提出要求。'};
const displayedPlan=()=>state.plan||samplePlan;
$('make-travel-collection')?.addEventListener('click',()=>{const plan=state.plan;if(plan)sessionStorage.setItem('lvzang-generation-context',JSON.stringify({name:plan.title,place:plan.input?.city||plan.input?.destination||plan.city||'',date:plan.input?.date||''}));else sessionStorage.removeItem('lvzang-generation-context');});
try{state=readState(localStorage);resetPrevious=Boolean(state.planningReset);}catch(error){storageHealthy=false;$('storage-recovery').hidden=false;notice(error.message);}
try{history=readTravelChat(localStorage);}catch(error){notice(error.message);}
function notice(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(notice.timer);notice.timer=setTimeout(()=>$('toast').hidden=true,6500);}
function persist(){if(currentIdentityKey()!==loadedIdentityKey){notice('身份已变化，请刷新页面后继续。');return false;}if(!storageHealthy){notice('旧记录尚未恢复，本机保存已暂停。请先下载备份，再重置记录。');return false;}try{writeState(localStorage,state);return true;}catch(error){notice(error.message);return false;}}
function persistChat(){if(currentIdentityKey()!==loadedIdentityKey){notice('身份已变化，对话暂未保存，请刷新页面。');return false;}try{writeTravelChat(localStorage,history);return true;}catch(error){notice(error.message);return false;}}
$('backup-storage').onclick=()=>{try{download(new Blob([readRawTravelState(localStorage)],{type:'application/json'}),'旅藏-原始记录备份.json');$('reset-storage').disabled=false;}catch(error){notice(error.message);}};
$('reset-storage').onclick=()=>{try{writeState(localStorage,initialState());writeTravelChat(localStorage,[]);location.reload();}catch(error){notice(error.message);}};
function status(message,error=false){$('plan-status').textContent=message;$('plan-status').classList.toggle('error',error);routeRefresh.status(message,error);}
function navigate(view){
  if(shared)return;
  if(view==='collection'){location.href='/collection.html#world/canvas';return;}
  if(view==='merchant'){location.href='/operator.html';return;}
  document.querySelectorAll('[data-area]').forEach(el=>el.hidden=el.dataset.area!==view);
  document.querySelectorAll('[data-nav]').forEach(el=>el.classList.toggle('active',el.dataset.nav===view));
  if(view==='explore')renderRoute();else{clearRoutePreviews();clearPreviews();}
  window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
}
document.addEventListener('click',e=>{const nav=e.target.closest('[data-nav]');if(nav)navigate(nav.dataset.nav);});
function redirectOldView(){if(location.hash==='#merchant')location.replace('/operator.html');if(location.hash==='#collection')location.replace('/collection.html#world/canvas');}
window.addEventListener('hashchange',redirectOldView);redirectOldView();
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
const advisorPrompts={
  guide:'请沿用当前已确认的路线、日期和地点顺序，补充详细攻略：每站怎么玩、附近吃什么、交通与预约提醒、雨天备选，并给出资料来源。不要更换景点或重新安排路线。'
};
const interviewPrompts={
  start:'开始完整旅行偏好问答，请一次问我一个问题，先保留当前路线。',
  resume:'继续完整旅行问答，从上次的问题接着聊，先保留当前路线。',
  skip:'这题先跳过，暂时还没决定，请继续问下一题。',
  pause:'先暂停完整旅行问答，保留已经记录的条件和当前路线。',
  plan:'问答完成，请按这些条件规划行程。'
};
function renderInterviewRecords(interview){
  const answers=interview?.answers??[],additions=interview?.additions??[];
  $('interview-records-disclosure').hidden=answers.length+additions.length===0;
  $('interview-records-count').textContent=`${answers.length} 条回答${additions.length?` · ${additions.length} 条补充`:''}`;
  const records=answers.map(item=>{
    const row=document.createElement('li'),question=document.createElement('p'),answer=document.createElement('p');
    question.className='interview-record-question';answer.className='interview-record-answer';
    question.textContent=item.question;answer.textContent=item.answer;row.append(question,answer);return row;
  });
  $('interview-records-list').replaceChildren(...records);
  $('interview-additions-list').hidden=!additions.length;
  $('interview-additions-list').replaceChildren(...additions.map(text=>{const row=document.createElement('li');row.textContent=text;return row;}));
}
function renderInterview(){
  const interview=state.profile.interview,phase=interview?.status;
  renderInterviewRecords(interview);
  const present=['active','ready','paused'].includes(phase);
  $('travel-brief').placeholder=phase==='active'?'按你的想法回答，怎么说都可以':phase==='ready'?'还有想补充的可以直接说':'直接回答就好，一次回答一个也可以';
  $('advisor-preferences').textContent=present?'继续问答':'开始完整问答';
  $('interview-controls').hidden=!present;
  if(!present)return;
  const progress=Number.isFinite(interview.step)&&Number.isFinite(interview.total)?` · ${interview.step} / ${interview.total}`:'';
  $('interview-progress').textContent=(phase==='paused'?'问答已暂停':phase==='ready'?'问答已完成，可以补充或开始规划':'完整旅行问答')+progress;
  $('interview-skip').hidden=phase!=='active';$('interview-pause').hidden=phase==='paused';
  $('interview-resume').hidden=phase!=='paused';$('interview-plan').hidden=phase!=='ready';
  document.querySelectorAll('.interview-actions button').forEach(button=>button.disabled=busy);
}
function renderAdvisorEntry(){
  $('workspace-title').textContent=resetPrevious?'新的旅行':state.plan?`${state.plan.city}旅行攻略`:'我的旅行';
  routeRefresh.setBusy(busy);
  routeRefresh.sync(resetPrevious?'':state.profile.fields.destination.value||state.plan?.city||'');
  const accepted=Boolean(state.plan&&!resetPrevious);
  $('advisor-context').textContent=['active','ready','paused'].includes(state.profile.interview?.status)?'先逐题聊你的想法，回答会原样记录。答完后，一起交给 DeepSeek 理解和规划。':accepted?state.plan.guide?'沿用已保存的方案，随时补充或修改想法，也可以直接说哪里不满意。':'当前保留的是之前方案。可补充详细攻略，也可随时补充或修改想法。':resetPrevious?'正在了解这次新旅行。说说想法，我会逐步记住你的偏好。':'可以从完整问答开始，一次聊一题，随时补充或修改想法。';
  document.querySelectorAll('[data-advisor-action]').forEach(button=>button.disabled=busy);
  $('advisor-guide').disabled=busy||!accepted;
  $('advisor-guide').title=accepted?'沿用已确认的路线，补充玩法、餐饮和提醒':'先聊出一份自己的路线，再补充详细攻略';
  renderInterview();
}
function focusAdvisor(){
  if(busy)return false;
  modeTouched=true;$('agent-mode').value='ai';modeNote();
  makeRoomForChat();
  $('travel-brief').scrollIntoView({block:'center',behavior:'instant'});$('travel-brief').focus({preventScroll:true});return true;
}
function sendAdvisorPrompt(action,description=advisorPrompts[action]){
  if(busy||!description)return Promise.resolve(false);
  if(action==='guide'&&(!state.plan||resetPrevious))return Promise.resolve(false);
  focusAdvisor();
  // This internal marker keeps the draft intact; the server receives only the explicit natural-language request.
  return runPlan(true,{advisorAction:action,description});
}
function requestInterview(action){
  if(busy||!interviewPrompts[action])return Promise.resolve(false);
  focusAdvisor();
  return runPlan(true,{advisorAction:'interview',interviewAction:action,description:interviewPrompts[action]});
}
$('advisor-continue').onclick=()=>focusAdvisor();
$('advisor-preferences').onclick=()=>requestInterview(['active','ready','paused'].includes(state.profile.interview?.status)?'resume':'start');
$('interview-skip').onclick=()=>requestInterview('skip');
$('interview-pause').onclick=()=>requestInterview('pause');
$('interview-resume').onclick=()=>requestInterview('resume');
$('interview-plan').onclick=()=>requestInterview('plan');
$('advisor-guide').onclick=()=>sendAdvisorPrompt('guide');
$('advisor-feedback').onclick=()=>{if(busy)return;if(!$('travel-brief').value.trim()){$('travel-brief').value='这份攻略我想改善：';textRevision=true;}focusAdvisor();};
$('travel-brief').addEventListener('input',()=>textRevision=true);
$('destination').addEventListener('input',()=>destinationTouched=true);
$('destination').addEventListener('change',()=>destinationTouched=true);
function remember(role,content){history.push({role,content:String(content).slice(0,2000)});history=history.slice(-12);}
function composeClarification(reply,followUps=[]){
  const normalize=value=>String(value||'').replace(/[\s，。！？、：；,.!?;:（）()“”"'‘’]/g,'');
  const parts=[String(reply||'')];let shown=normalize(reply);
  for(const item of followUps){const question=String(item?.question||'').trim(),key=normalize(question);if(key&&!shown.includes(key)){parts.push(question);shown+=key;}}
  return parts.filter(Boolean).join('\n\n');
}
function restorePendingQuestions(){
  $('restored-follow-up-message')?.remove();
  const normalize=value=>String(value||'').replace(/[\s，。！？、：；,.!?;:（）()“”"'‘’]/g,'');
  const previousQuestions=history.filter(message=>message.role==='assistant').map(message=>normalize(message.content));
  const questions=(state.profile.followUps||[]).map(item=>item.question).filter(question=>question&&!previousQuestions.some(content=>content.includes(normalize(question))));
  if(!questions.length)return;
  // Restore the visible conversation from the saved profile without duplicating or rewriting saved history.
  const article=chatMessage('assistant',`我们接着聊，想再了解这几件事：\n\n${questions.map((question,index)=>`${index+1}. ${question}`).join('\n\n')}\n\n直接回答就好，一次回答一个也可以。`,'继续上次对话');
  article.id='restored-follow-up-message';article.dataset.restoredFollowUps='';article.dataset.messageKind='clarify';revealChatMessage(article);
}
const tripSettingIds={dayCount:'trip-day-count',dailyHours:'trip-daily-hours',pace:'trip-pace'},tripSettingEdits=new Set();
function renderTripSettings(profile){
  for(const [field,id] of Object.entries(tripSettingIds))$(id).value=profile.fields[field].value??'';
  tripSettingEdits.clear();$('trip-settings-note').classList.remove('error');
  const tentative=Object.keys(tripSettingIds).some(field=>profile.fields[field].status==='tentative');
  $('trip-settings-note').textContent=tentative?'部分条件仍是暂定值；只会确认你修改后应用的字段。':'填写想修改的条件后应用，也可以继续用对话调整。';
}
function renderRequirements(profile,pending=false){renderRequirementSummary(profile,pending);if(!pending)renderTripSettings(profile);renderAdvisorEntry();}
for(const [field,id] of Object.entries(tripSettingIds))$(id).addEventListener('input',()=>{tripSettingEdits.add(field);$('trip-settings-note').classList.remove('error');});
$('trip-settings-form').onsubmit=event=>{
  event.preventDefault();if(busy||!$('trip-settings-form').reportValidity())return;
  const settings={};
  for(const field of tripSettingEdits){const raw=$(tripSettingIds[field]).value;if(raw==='')continue;const value=field==='pace'?raw:Number(raw),old=state.profile.fields[field];if(old.status!=='confirmed'||old.value!==value)settings[field]=value;}
  if(!Object.keys(settings).length){$('trip-settings-note').textContent='请先修改至少一项；留空的条件会继续沿用。';return;}
  const phrases={dayCount:value=>`旅行改为${value}天`,dailyHours:value=>`每天游览${value}小时`,pace:value=>`游玩强度改为${{easy:'轻松慢游',normal:'正常节奏',active:'充实紧凑'}[value]}`};
  runPlan(true,{tripSettings:settings,description:`调整行程：${Object.entries(settings).map(([field,value])=>phrases[field](value)).join('，')}。`});
};
function requestItineraryEdit({action,stop,dayIndex}){
  if(busy)return Promise.resolve(false);
  if(state.planningReset){const message='你正在创建新方案，地图展示的是上次的路线。请先完成新方案，再加入或移出地点。';status(message);$('map-membership-status').textContent=message;return Promise.resolve(false);}
  const itineraryEdit={action,stopId:stop.id,stopName:stop.name,...(action==='add'?{dayIndex:dayIndex??activeDay+1}:{})};
  return runPlan(true,{itineraryEdit,description:action==='add'?`将${stop.name}加入第${itineraryEdit.dayIndex}天行程。`:`将${stop.name}移出行程。`});
}
function reloadPlanningIdentity(){
  state=initialState();history=[];storageHealthy=true;$('storage-recovery').hidden=true;
  try{state=readState(localStorage);}catch(error){storageHealthy=false;$('storage-recovery').hidden=false;notice(error.message);}
  try{history=readTravelChat(localStorage);}catch(error){notice(error.message);}
  loadedIdentityKey=currentIdentityKey();resetPrevious=Boolean(state.planningReset);activeDay=0;destinationTouched=false;textRevision=false;
  $('destination').value=resetPrevious?'':state.plan?.city||'';$('hours').value='';$('travel-brief').value='';$('chat-messages').innerHTML='';
  history.forEach(message=>chatMessage(message.role,message.content,'上次对话'));
  if(!history.length)chatMessage('assistant',state.plan&&!resetPrevious?state.plan.assistantReply||state.plan.changeSummary:'告诉我想去哪里、玩几天和每天能安排多久。');
  renderThemes();renderNotes();renderRequirements(state.profile);renderRoute();restorePendingQuestions();
}
function releasePlanningControls(){
  busy=false;$('trip-settings-fields').disabled=false;document.querySelectorAll('[data-remove-stop]').forEach(button=>button.disabled=false);$('plan-button').disabled=false;$('new-trip').disabled=false;$('cancel-plan').hidden=true;$('plan-form').removeAttribute('aria-busy');
  $('day-selector').querySelectorAll('button').forEach(button=>button.disabled=false);
  renderAdvisorEntry();
}
async function runPlan(usePrevious=true,settingsSubmission=null){
  if(busy)return false;
  if(!settingsSubmission&&['active','ready','paused'].includes(state.profile.interview?.status)&&!$('travel-brief').value.trim()){
    status(state.profile.interview.status==='active'?'请先输入这题的回答；暂时没确定，可以点“这题先跳过”。':'请先输入想补充的内容，或使用上方的问答操作。');
    $('travel-brief').focus();return false;
  }
  busy=true;
  if(!settingsSubmission||settingsSubmission.advisorAction)makeRoomForChat();
  renderAdvisorEntry();
  document.querySelectorAll('[data-remove-stop]').forEach(button=>button.disabled=true);
  // Capture this explicit submission, then load the chosen identity before taking any saved context.
  const submittedText=$('travel-brief').value;
  const turnDraft={description:settingsSubmission?.description||$('travel-brief').value||`帮我安排${destinationTouched?$('destination').value:'一条旅行'}路线`,destination:destinationTouched?$('destination').value:'',hours:$('hours').value||undefined,textRevision:!destinationTouched,mode:$('agent-mode').value};
  let settingsDraft=settingsSubmission?{text:$('travel-brief').value,destination:$('destination').value,destinationTouched}:null;
  $('trip-settings-fields').disabled=true;const button=$('plan-button');button.disabled=true;$('new-trip').disabled=true;$('plan-form').setAttribute('aria-busy','true');
  try{
    const user=await requestUserIdentity();
    if(!user||user.activeRole!=='user'){status('尚未选择用户身份，本次调整未提交。');releasePlanningControls();return false;}
    if(currentIdentityKey()!==loadedIdentityKey){reloadPlanningIdentity();settingsDraft=null;}
  }catch(error){status(error.message||'无法确认当前身份，请稍后重试。',true);releasePlanningControls();return false;}
  $('cancel-plan').hidden=false;
  const before=displayedPlan(),beforeProfile=state.profile,beforePlan=state.plan,beforeDay=activeDay,beforeReset=state.planningReset,ai=Boolean(settingsSubmission?.advisorAction)||(!settingsSubmission&&$('agent-mode').value==='ai');
  $('day-selector').querySelectorAll('button').forEach(button=>button.disabled=true);
  const body={description:turnDraft.description,destination:settingsSubmission?.advisorAction==='refresh'?settingsSubmission.destination:settingsSubmission?'':turnDraft.destination,hours:settingsSubmission?undefined:turnDraft.hours,textRevision:settingsSubmission?.advisorAction==='refresh'?false:settingsSubmission?true:turnDraft.textRevision,...(settingsSubmission?.tripSettings?{tripSettings:settingsSubmission.tripSettings}:{}),...(settingsSubmission?.itineraryEdit?{itineraryEdit:settingsSubmission.itineraryEdit}:{}),...(settingsSubmission?.interviewAction?{interviewAction:settingsSubmission.interviewAction}:{}),mode:settingsSubmission?.advisorAction?'ai':turnDraft.mode,profile:usePrevious?state.profile:emptyTravelProfile(),notes:state.notes,previous:usePrevious&&!resetPrevious&&state.plan?before.input:undefined,currentPlan:usePrevious&&!resetPrevious&&state.plan?before:undefined,history:history.slice()};
  remember('user',body.description);
  chatMessage('user',body.description.trim()||`请推荐${body.destination||'一条旅行'}路线`,new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}));
  const reply=chatMessage('assistant','已收到，正在理解你的问题…',settingsSubmission?.advisorAction?'DeepSeek 旅行顾问':settingsSubmission?.itineraryEdit?'调整行程地点':settingsSubmission?'调整旅行条件':ai?'DeepSeek 对话':'本地规则示范');reply.classList.add('pending');
  const revealReply=()=>{if(settingsSubmission?.advisorAction!=='refresh')revealChatMessage(reply);};
  if(!settingsSubmission){$('travel-brief').value='';textRevision=false;}controller=new AbortController();startPhases(ai);canvasStatus('正在理解你的问题',true);status('正在结合对话理解你的要求。');$('route-state').textContent='保留当前方案';let result=null;
  try{
    const response=await fetch('/api/travel-chat/stream',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(240000)])});
    if(!response.ok){const data=await response.json();throw new Error(data.error||'策划失败');}
    if(!response.body)throw new Error('浏览器未收到方案流，请重试。');
    const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
    const consume=event=>{if(event.type==='stage'){stageEvent(event);if(event.status==='working'&&event.detail)status(event.detail);}else if(event.type==='profile')renderRequirements(event.profile,true);else if(event.type==='constraints'){renderConstraints(event.input,before.input,true,event.profile||null);if(event.profile)renderRequirements(event.profile,true);$('route-state').textContent='待更新';$('route-section').classList.add('pending');}else if(event.type==='reply')setMessage(reply,event.text,'正在安排路线，最终行程尚未确认');else if(event.type==='result')result=event.response||event.plan;else if(event.type==='error')throw new Error(event.error);};
    try{while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);if(line)consume(JSON.parse(line));}}buffer+=decoder.decode();if(buffer.trim())consume(JSON.parse(buffer));}finally{reader.releaseLock();}
    if(!result)throw new Error('对话连接中断，前一方案已保留。');
    if(result.kind==='answer'||result.kind==='clarify'){
      const acceptedProfile=result.profile?normalizeTravelProfile(result.profile):beforeProfile,partial=result.status==='partial',asking=result.kind==='clarify'&&!partial;
      const changed=JSON.stringify(acceptedProfile)!==JSON.stringify(beforeProfile);state.profile=acceptedProfile;
      reply.dataset.messageKind=result.kind;reply.dataset.messageStatus=result.status||'';const rawReply=asking?composeClarification(result.assistantReply,Array.isArray(result.followUps)?result.followUps:acceptedProfile.followUps):result.assistantReply;const readableReply=advisorReplyText(rawReply,result.research);setMessage(reply,readableReply,partial?'本次规划未完成':asking?'补充旅行条件':result.mode==='ai'?'DeepSeek':'本地说明');appendResearchSources(reply.querySelector('.chat-bubble'),result.research);remember('assistant',readableReply);reply.classList.remove('pending');finishPhases(result);renderRequirements(state.profile);renderConstraints(before.input,null,false,state.profile,before.days?.[activeDay],asking||Boolean(state.profile.followUps.length));const saved=changed?persist():true,chatSaved=persistChat();canvasStatus(partial?'本次规划尚未完成 · 原方案已保留':asking?'需求已记录 · 等你补充条件':'已回答 · 当前行程保持不变',false,partial||!saved||!chatSaved);status(!saved||!chatSaved?'当前对话或需求尚未保存，请保留此页面。':partial?'本次规划尚未完成，请重试规划；原方案已保留。':asking?'直接回答就好，一次回答一个也可以。当前行程已保留。':'已回答你的问题。需要修改行程时，直接告诉我。');revealReply();return result.kind==='answer';
    }
    if(result.status!=='ready')throw new Error(result.assumptions.join(' '));
    const acceptedProfile=result.profile?normalizeTravelProfile(result.profile):beforeProfile,guideFailed=result.guideUpdateStatus==='failed',quality=travelPlanStatus(result);
    state.plan=result;state.profile=acceptedProfile;state.planningReset=false;activeDay=settingsSubmission?.itineraryEdit?Math.max(0,(settingsSubmission.itineraryEdit.dayIndex??beforeDay+1)-1):Number.isInteger(result.editedDayIndex)?Math.max(0,result.editedDayIndex-1):result.guideUpdateStatus?beforeDay:0;resetPrevious=false;destinationTouched=false;$('destination').value=result.city;$('hours').value='';setMessage(reply,result.assistantReply||result.changeSummary,quality.missingDays.length?'行程尚待补充':guideFailed?'攻略更新未完成':quality.guidePending?'攻略待补充':result.guideUpdateStatus==='updated'?'详细攻略已补充':settingsSubmission?.advisorAction?'顾问已回复':settingsSubmission?.itineraryEdit?'行程地点已更新':settingsSubmission?'旅行条件已更新':result.mode==='ai'?'AI 协作已完成':'本地示范已完成');remember('assistant',result.assistantReply||result.changeSummary);renderRoute();renderConstraints(result.input,before.input,false,state.profile,result.days?.[activeDay]);renderRequirements(state.profile);finishPhases(result);const saved=persist(),chatSaved=persistChat();reply.classList.remove('pending');$('workspace-title').textContent=result.city+'城市漫游';$('chat-session-label').textContent='可以继续提问，也可以修改方案';canvasStatus(guideFailed?'攻略更新未完成 · 原方案已保留':!saved||!chatSaved?'方案已更新 · 尚未保存':quality.missingDays.length||quality.guidePending?quality.summary:'方案已更新，继续说说你的想法',false,guideFailed||Boolean(quality.missingDays.length)||!saved||!chatSaved);status(!saved||!chatSaved?'方案或对话暂留在页面，尚未保存。':guideFailed?'攻略更新未完成，原方案已保留，可继续反馈或稍后重试。':quality.missingDays.length||quality.guidePending?quality.summary+'。':'方案已更新。',guideFailed);revealReply();return !guideFailed;
  }catch(error){if(!settingsSubmission&&submittedText&&!$('travel-brief').value.trim())$('travel-brief').value=submittedText;state.plan=beforePlan;state.profile=beforeProfile;state.planningReset=beforeReset;activeDay=beforeDay;history=body.history.slice();const message=error.name==='AbortError'?'已停止本次修订，前一方案已保留。':error.message||'网络异常，前一方案已保留。';renderRoute();renderConstraints(before.input,null,false,beforeProfile,before.days?.[activeDay],Boolean(beforeProfile.followUps.length));renderRequirements(beforeProfile);failPhases(message);setMessage(reply,message,'这次修订未保存');reply.classList.remove('pending');reply.classList.add('error');canvasStatus(message,false,true);status(message,true);revealReply();return false;}finally{busy=false;controller=null;$('trip-settings-fields').disabled=false;document.querySelectorAll('[data-remove-stop]').forEach(button=>button.disabled=false);if(settingsDraft){if(!settingsSubmission?.advisorAction)$('travel-brief').value=settingsDraft.text;destinationTouched=settingsDraft.destinationTouched;if(destinationTouched)$('destination').value=settingsDraft.destination;}button.disabled=false;$('new-trip').disabled=false;$('cancel-plan').hidden=true;$('plan-form').removeAttribute('aria-busy');$('route-section').classList.remove('pending');$('day-selector').querySelectorAll('button').forEach(dayButton=>dayButton.disabled=false);renderRouteState();renderAdvisorEntry();}
}
$('plan-form').onsubmit=e=>{e.preventDefault();runPlan();};
$('travel-brief').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();runPlan();}};
$('cancel-plan').onclick=()=>controller?.abort();
$('revise').onclick=()=>$('travel-brief').focus();
$('new-trip').onclick=()=>{if(busy)return;resetPrevious=true;state.planningReset=true;history=[];state.profile=emptyTravelProfile();destinationTouched=false;$('destination').value='';$('hours').value='';$('travel-brief').value='';$('chat-messages').innerHTML='';persist();persistChat();renderRequirements(state.profile);$('travel-brief').focus();chatMessage('assistant','开始一个新方案。告诉我想去哪、可以玩多久；收藏和上次方案会继续保留。');};
function clearRoutePreviews(){routePreviews.forEach(p=>p.destroy());routePreviews=[];}
function renderRouteState(plan=displayedPlan()){
  const quality=travelPlanStatus(plan,{isExample:!state.plan,awaitingInfo:Boolean(state.profile.followUps.length),dayIndex:activeDay+1});
  $('route-state').textContent=busy?'待更新':quality.label;$('route-state').title=quality.summary;return quality;
}
function renderRoute(){
  const fullPlan=displayedPlan();if(!fullPlan)return;
  activeDay=Math.max(0,Math.min(activeDay,(fullPlan.days?.length||1)-1));const day=fullPlan.days?.[activeDay],plan=day?{...fullPlan,...day,input:{...fullPlan.input,startTime:day.startTime,hours:day.hours}}:fullPlan;
  $('workspace-title').textContent=plan.city+'城市漫游';$('route-title').textContent=fullPlan.title;
  $('day-selector').hidden=!(fullPlan.days?.length>1);$('day-selector').innerHTML=(fullPlan.days||[]).map((d,index)=>`<button type="button" data-day="${index}" aria-pressed="${index===activeDay}" ${busy?'disabled':''}>第${d.dayIndex}天</button>`).join('');
  $('day-selector').querySelectorAll('[data-day]').forEach(button=>button.onclick=()=>{activeDay=Number(button.dataset.day);renderRoute();});
  const quality=renderRouteState(fullPlan);
  $('route-meta').textContent=quality.currentMissing?`第${activeDay+1}天 · 尚未安排具体地点`:quality.currentFree?`第${activeDay+1}天 · 按你的选择保留自由安排`:`${day?`第${day.dayIndex}天 · `:''}${plan.stops.length}站 · 游览与转场约${plan.totalMinutes}分钟 · ${plan.transport}${day?.freeMinutes?` · 未分配${day.freeMinutes}分钟`:''}`;
  if(!busy)renderConstraints(fullPlan.input,null,false,state.profile,day,Boolean(state.profile.followUps.length));
  $('route-assumptions').innerHTML=[...plan.assumptions,...plan.warnings].map(t=>`<p class="assumption">${esc(t)}</p>`).join('');
  $('route-stops').innerHTML=plan.stops.map((p,i)=>{const collected=state.collection.some(c=>c.id===p.id);return `<article class="stop-card" data-stop-card="${p.id}" tabindex="-1"><span class="stop-number">${i+1}</span><h3>${esc(p.name)}</h3><p class="stop-time">${clock(plan.input,p.estimatedStart)} — ${clock(plan.input,p.estimatedStart+p.minutes)}</p><p class="stop-story">${esc(p.story)}</p><details><summary>探索任务与纪念品</summary><p>${esc(p.task)}</p><p>${byId(p.id)?'可收藏：'+esc(p.souvenir):'可用旅行照片创作专属纪念品'}<br>${esc(p.availability)}</p></details><div class="stop-actions">${byId(p.id)?`<button class="${collected?'secondary':'primary'}" data-unlock="${p.id}">${collected?'查看 3D 纪念品':'模拟签到 · 解锁'}</button>`:'<a class="secondary" href="/collection.html#world/create">定制纪念品</a>'}<a data-navigation-stop="${esc(p.id)}" data-location-status="unresolved" href="https://uri.amap.com/search?keyword=${encodeURIComponent(p.city+p.name)}" target="_blank" rel="noopener">在高德搜索</a></div>${state.plan?`<button type="button" class="text-button" data-remove-stop="${esc(p.id)}" data-request-identity aria-label="将${esc(p.name)}移出行程" ${busy?'disabled':''}>移出行程</button>`:''}</article>`;}).join('')||`<p class="day-empty">${quality.currentFree?`按你的选择，第${activeDay+1}天留作自由安排；仍可从地图明确加入地点。`:`第${activeDay+1}天还没有排入具体地点，这一天的行程尚未完成。`}</p>`;
  $('route-stops').querySelectorAll('[data-unlock]').forEach(button=>button.onclick=()=>{const id=button.dataset.unlock,was=state.collection.some(c=>c.id===id);if(!state.plan)state.plan=samplePlan;unlock(state,id,fullPlan.title);const saved=persist();renderRoute();showSouvenir(id);if(!saved)notice('纪念品暂留在当前页面，尚未保存；请导出展览备份。');else if(!was)notice('已通过模拟签到解锁，正式活动需配置现场核验。');});
  $('route-stops').querySelectorAll('[data-remove-stop]').forEach(button=>button.onclick=()=>requestItineraryEdit({action:'remove',stop:fullPlan.stops.find(stop=>stop.id===button.dataset.removeStop)}));
  renderMap(plan,state.collection,fullPlan.stops,{excludedPlaces:state.profile.fields.excludedPlaces.value||[],excludedIds:fullPlan.input.excludedIds||[],isExample:!state.plan,activeDayIndex:activeDay+1,onMembershipChange:requestItineraryEdit});clearRoutePreviews();
  $('route-souvenirs').innerHTML=plan.stops.filter(p=>byId(p.id)).slice(0,3).map(p=>`<article class="souvenir-preview"><canvas data-route-model="${p.id}" aria-hidden="true"></canvas><div><strong>${esc(p.souvenir)}</strong><small>${state.collection.some(c=>c.id===p.id)?'已解锁 · 查看':'未解锁'}</small></div><button aria-label="查看${esc(p.souvenir)}收藏状态" data-preview-stop="${p.id}"></button></article>`).join('')||'<p class="fine">这里还没有预制纪念品。<a href="/collection.html#world/create">用照片定制自己的旅行收藏</a></p>';
  $('route-souvenirs').querySelectorAll('canvas').forEach(canvas=>{try{const preview=createPreview(canvas),m=makeSouvenir(canvas.dataset.routeModel);preview.setMesh(m.mesh,{originalColors:m.colors,widthMm:m.widthMm,heightMm:m.heightMm,centerY:20,centerZ:0});preview.setColor(true);preview.view(false);routePreviews.push(preview);}catch{canvas.hidden=true;}});
  $('route-souvenirs').querySelectorAll('[data-preview-stop]').forEach(button=>button.onclick=()=>{if(state.collection.some(c=>c.id===button.dataset.previewStop))showSouvenir(button.dataset.previewStop);else{document.querySelector(`[data-stop-card="${button.dataset.previewStop}"]`)?.focus({preventScroll:true});notice('在对应行程站点模拟签到后，可解锁纪念品并加入展柜。');}});
  const analysis=plan.analysis;
  $('analysis-content').innerHTML=`<p class="fine">${esc(analysis.summary)}</p>`+analysis.findings.map(f=>`<article class="source-entry"><strong>${esc(f.title)}</strong><p>${esc(f.text)}</p><small>原帖片段 · 未独立核实</small></article>`).join('')+analysis.places.map(p=>`<article class="source-entry"><strong>${esc(p.name)}</strong><p>${p.evidence.map(e=>esc(e.title)+(e.url?` · <a href="${esc(e.url)}" target="_blank" rel="noopener">查看出处</a>`:'')).join('<br>')}</p></article>`).join('')+`<p class="fine">${plan.stops.some(p=>p.source)?'地方参考：':(fullPlan.guide?.sources?.length||fullPlan.research?.sources?.length)?'本轮公开资料见下方来源':'暂无本轮可引用的公开资料'}${plan.stops.filter(p=>p.source).map(p=>`<a href="${esc(p.source)}" target="_blank" rel="noopener">${esc(p.name)}</a>`).join(' · ')}。参考入口不代表已核实当日营业、预约与票价。</p>`;
  renderTravelGuide(fullPlan,activeDay+1,question=>sendAdvisorPrompt('question',question),{isExample:!state.plan||resetPrevious,onEnrich:()=>sendAdvisorPrompt('guide')});
}

function clearPreviews(){previews.forEach(p=>p.destroy());previews=[];}
function populateCabinet(target,items,readonly=false){
  target.innerHTML=items.map((c,i)=>{const p=byId(c.id);return `<article class="exhibit"><canvas tabindex="0" data-model="${c.id}" role="img" aria-label="${esc(p.souvenir)}三维模型，方向键或拖动旋转"></canvas><h3>${esc(p.souvenir)}</h3><small>${esc(p.city)} / ${esc(p.name)} · ${esc(c.date)}</small><p>${esc(c.story||'一站风景，一份自己的记忆。')}</p>${readonly?'':`<div class="exhibit-actions"><button data-open="${c.id}">故事与实物 ↗</button>${i>0?`<button data-move="${c.id}">移到前面 ↑</button>`:''}</div>`}</article>`;}).join('');
  target.querySelectorAll('[data-model]').forEach(canvas=>{const model=makeSouvenir(canvas.dataset.model);let preview;try{preview=createPreview(canvas);}catch{}if(preview){preview.setMesh(model.mesh,{originalColors:model.colors,widthMm:model.widthMm,heightMm:model.heightMm,centerY:20,centerZ:0});preview.setColor(true);preview.view(false);previews.push(preview);}else{canvas.insertAdjacentHTML('afterend','<p>当前设备无法显示 3D，请在支持 WebGL 的浏览器打开。</p>');}});
  target.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>showSouvenir(b.dataset.open));
}
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
$('save-story').onclick=()=>{const c=state.collection.find(c=>c.id===current);if(!c)return;c.story=$('memory-story').value.trim();const saved=persist();$('souvenir-status').textContent=saved?'这段记忆已保存。':'这段记忆尚未保存，请导出展览备份并保留此页面。';};
$('download-stl').onclick=()=>{try{if(!$('print-width').reportValidity())throw new Error('导出尺寸需要在 40–120 mm 之间');download(new Blob([souvenirSTL(current,Number($('print-width').value))],{type:'application/octet-stream'}),`${byId(current).souvenir}.stl`);$('souvenir-status').textContent='文件已导出。请在切片器合并部件、检查支撑与结构，并先试打。';}catch(error){$('souvenir-status').textContent=error.message;}};
$('print-form').onsubmit=async e=>{e.preventDefault();try{$('souvenir-dialog').close();const user=await requestUserIdentity();if(!user||user.activeRole!=='user')return;const place=byId(current);sessionStorage.setItem('lvzang-order-draft',JSON.stringify({title:place.souvenir,place:place.city,raw:[$('memory-story').value,`尺寸：${$('print-width').value} mm；材料：${$('print-material').value}；定制文字：${$('print-text').value}`].filter(Boolean).join('\n')}));location.href='/orders.html#new';}catch(error){$('souvenir-status').textContent=error.message;$('souvenir-dialog').showModal();}};
function loadShared(){
  const match=location.hash.match(/^#exhibition=(.*)$/);if(!match)return false;
  try{shared=decodeExhibition(match[1]);document.querySelectorAll('[data-area]').forEach(el=>el.hidden=true);document.querySelector('.site-header nav').hidden=true;$('shared-section').hidden=false;$('shared-title').textContent=shared.title;clearPreviews();populateCabinet($('shared-cabinet'),shared.collection,true);return true;}catch(error){notice(error.message);$('plan-status').textContent=error.message;return false;}
}
renderThemes();renderNotes();
if(!loadShared()){initWorkspace();initTravelGuideLayout();renderRequirements(state.profile);renderConstraints(displayedPlan().input,null,false,state.profile,null,Boolean(state.profile.followUps.length));if(history.length){$('chat-messages').innerHTML='';history.forEach(message=>chatMessage(message.role,message.content,'上次对话'));}if(state.plan){if(!resetPrevious)$('destination').value=state.plan.city;if(!history.length&&!resetPrevious){remember('assistant',state.plan.assistantReply||state.plan.changeSummary);chatMessage('assistant',state.plan.assistantReply||state.plan.changeSummary,'上次保存的方案');}finishPhases(state.plan);const restored=travelPlanStatus(state.plan);canvasStatus(restored.missingDays.length||restored.guidePending?`已恢复上次方案 · ${restored.summary}`:'上次方案已恢复，继续说说你的想法',false,Boolean(restored.missingDays.length));}navigate('explore');restorePendingQuestions();}
fetch('/api/config').then(r=>r.json()).then(config=>{if(!config.configured){$('agent-mode').querySelector('[value="ai"]').textContent='AI Agent 协作 · 未配置';}else if(!modeTouched){$('agent-mode').value='ai';}modeNote();}).catch(()=>{});

installChatReturn();
