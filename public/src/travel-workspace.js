import {travelProfileSummary} from './travel-profile.js';
import {createTravelMap} from './travel-map.js';
const $=id=>document.getElementById(id);
export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const icon=name=>`<img src="/assets/icons/${name}.svg" alt="">`;
const mobile=()=>matchMedia('(max-width:767px)').matches;
const anchors={'gz-museum':[80,40],'gz-square':[51,30],'gz-tower':[48,87],'gz-opera':[23,39]};
let illustration=false,lastMap=null,selected=null,mapController=null;
export function budgetText(input,profile=null){const budget=profile?.fields?.budget?.value;return budget?.amount!=null?`¥${budget.amount}`:input?.budget?input.budget.replace(/^(\d+(?:\.\d+)?)元/,'¥$1'):'未设置';}
export function timeText(input){if(!input)return '待安排';return `${input.startTime||'09:00'} — ${clock(input,(input.hours||4)*60)}`;}
export function travelPlanStatus(plan,{isExample=false,awaitingInfo=false,dayIndex=1}={}){
  const days=Array.isArray(plan?.days)&&plan.days.length?plan.days:[{dayIndex:1,stops:plan?.stops||[]}];
  const requested=Number.isInteger(plan?.input?.dayCount)?plan.input.dayCount:days.length;
  const coveredDays=days.filter(day=>day.stops?.length).map(day=>day.dayIndex);
  const freeDays=(plan?.planningCoverage?.freeDays||[]).filter(day=>Number.isInteger(day)&&day>=1&&day<=requested&&!coveredDays.includes(day));
  const missingDays=Array.from({length:requested},(_,index)=>index+1).filter(day=>!coveredDays.includes(day)&&!freeDays.includes(day));
  const currentFree=freeDays.includes(dayIndex),currentMissing=missingDays.includes(dayIndex);
  const diningPending=plan?.guide?.diningStatus==='partial';
  const diningMissingDays=(plan?.guide?.diningMissingDays||[]).filter(day=>Number.isInteger(day)&&day>=1&&day<=requested);
  const diningRetainedDays=(plan?.guide?.diningRetainedDays||[]).filter(day=>Number.isInteger(day)&&day>=1&&day<=requested);
  const guidePending=coveredDays.length>0&&(!plan?.guide||['unavailable','partial'].includes(plan.guide.status)||diningPending);
  const missingText=missingDays.map(day=>`第${day}天`).join('、');
  const diningRetainedOnly=diningRetainedDays.length>0&&!diningMissingDays.length;
  const label=isExample?(awaitingInfo?'待补充条件':'示例'):missingDays.length?'行程待补充':currentFree?'自由安排':awaitingInfo?'待补充条件':diningPending?diningRetainedOnly?'餐饮待更新':'餐饮待补充':guidePending?'攻略待补充':'已生成';
  const summary=missingDays.length?`${missingText}尚未安排具体地点`:diningPending?diningRetainedOnly?'本次餐饮更新未完成，已保留上一版店家':`${diningMissingDays.map(day=>`第${day}天`).join('、')||'部分日期'}的具体餐厅尚待补充`:guidePending?'路线已生成，详细攻略待补充':currentFree?'按你的选择保留自由安排':'行程已生成';
  return {label,summary,coveredDays,freeDays,missingDays,currentFree,currentMissing,guidePending,diningPending,diningMissingDays,diningRetainedDays};
}
export function clock(input,minutes=0){const [h,m]=(input.startTime||'09:00').split(':').map(Number),value=h*60+m+minutes;return `${value>=1440?'次日 ':''}${String(Math.floor(value/60)%24).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;}
export function travelTimeDisplay(input,profile=null,day=null,awaitingInfo=false){
  const fields=profile?.fields;
  if(awaitingInfo){
    const days=fields?.dayCount?.value,hours=fields?.dailyHours?.value,start=fields?.startTime?.value;
    return {value:hours!=null?`每天${hours}小时`:'每日时间待补充',detail:`${days!=null?`共${days}天`:'旅行天数待补充'}${hours!=null?` · 每日${hours}小时`:''}${start?` · ${start}开始`:''} · 尚待排入路线`,status:'待补充条件'};
  }
  const days=fields?.dayCount?.value||input.dayCount||1,shown=day?{...input,startTime:day.startTime,hours:day.hours}:input;
  return {value:timeText(shown),detail:`${days>1?(day?`第${day.dayIndex}天 / 共${days}天 · `:`共${days}天 · 每日`):''}${shown.hours}小时可用时间`,status:null};
}
export function renderRequirements(profile,temporary=false){
  const labels={confirmed:'已确认',tentative:'暂定',missing:'待补充'};
  const entries=travelProfileSummary(profile).filter(item=>item.status!=='missing');
  $('requirements-summary').innerHTML=entries.map(({label,value,status})=>`<div class="requirement-row ${status}"><dt>${esc(label)}</dt><dd>${esc(value)}<small>${temporary?'待确认':labels[status]||'待补充'}</small></dd></div>`).join('')||'<div class="requirement-row missing"><dt>旅行条件</dt><dd>待补充</dd></div>';
  $('requirements-panel').classList.toggle('pending',temporary);
}
export function renderConstraints(input,previous=null,temporary=false,profile=null,day=null,awaitingInfo=false){
  profile=profile||input.profile||null;
  const time=travelTimeDisplay(input,profile,day,awaitingInfo);
  $('time-value').textContent=time.value;$('time-detail').textContent=time.detail+(temporary?' · 正在修订':'');
  $('budget-value').textContent=awaitingInfo?(profile?.fields?.budget?.value?.amount!=null?`¥${profile.fields.budget.value.amount}`:'预算待补充'):budgetText(input,profile);
  const budget=profile?.fields?.budget?.value,scope={"per-person":'每人',group:'同行总计',unknown:'人数口径待补充'},period={trip:'全程',day:'每日',unknown:'时间口径待补充'};
  $('budget-detail').textContent=(budget?.amount!=null?`${scope[budget.scope]||scope.unknown} · ${period[budget.period]||period.unknown} · 消费待核价`:awaitingInfo?'尚未提供预算':'预算上限 · 消费待核价')+(awaitingInfo?' · 尚待排入路线':'');
  $('time-previous').textContent=previous?`原来：${timeText(previous)}`:'可通过对话调整';
  $('budget-previous').textContent=previous?`原来：${budgetText(previous)}`:'可通过对话调整';
  const paceLabel={easy:'轻松少走',normal:'适中',active:'紧凑多走'}[(!awaitingInfo&&day?.pace)||profile?.fields?.pace?.value]||(awaitingInfo?'节奏待补充':input.easy?'轻松少走':'适中');
  const labels=awaitingInfo?[paceLabel,...(profile?.fields?.interests?.value||[])]:[paceLabel,...input.interests,'纪念收藏'];
  $('preference-tags').innerHTML=[...new Set(labels)].map(t=>`<span>${esc(t)}</span>`).join('');
  const changedTime=previous&&(input.hours!==previous.hours||input.startTime!==previous.startTime),changedBudget=previous&&input.budget!==previous.budget,changedPrefs=previous&&(input.easy!==previous.easy||JSON.stringify(input.interests)!==JSON.stringify(previous.interests)||JSON.stringify(input.requiredIds)!==JSON.stringify(previous.requiredIds)||JSON.stringify(input.excludedIds)!==JSON.stringify(previous.excludedIds));
  for(const [name,changed]of [['time',changedTime],['budget',changedBudget],['preferences',changedPrefs]]){
    $(`${name}-node`).classList.toggle('updated',Boolean(changed));$(`${name}-node`).classList.toggle('pending',temporary);$(`${name}-state`).textContent=temporary?'待确认':awaitingInfo?'待补充条件':changed?'已更新':previous||profile?.revision>0?'已确认':'示例';
  }
  const changes=[];if(changedTime)changes.push(['clock',`${esc(timeText(previous))} → ${esc(timeText(input))}`]);if(changedBudget)changes.push(['coins',`${esc(budgetText(previous))} → ${esc(budgetText(input))}`]);if(changedPrefs)changes.push(['heart',esc(labels.join(' · '))]);
  $('change-list').innerHTML=changes.length?changes.map(([name,text])=>`<p class="change-row">${icon(name)}<span>${text}${temporary?' <small>待确认</small>':''}</span></p>`).join(''):`<p class="fine">${previous?'已沿用时间、预算和偏好。':'本轮未调整行程，可以继续补充需求。'}</p>`;
}
const roles=['对话 Agent','资料 Agent','研判 Agent','路线 Agent','总控 Agent','攻略顾问'];
const displayRole={'对话 Agent':'DeepSeek 对话','资料 Agent':'资料 Agent','研判 Agent':'需求 Agent','路线 Agent':'路线 Agent','总控 Agent':'协调 Agent','攻略顾问':'游览攻略'};
let phases=new Map(),settled=false;
function drawPhases(){
  $('agent-trace').innerHTML=roles.filter(role=>!settled||phases.has(role)).map(role=>{const i=roles.indexOf(role),stage=phases.get(role)||{status:'waiting',detail:i?'问答时无需执行此阶段':'准备接收需求'};return `<li class="agent-step ${stage.status}">${icon(['sparkle','book-open','note-pencil','path','check-circle','book-open'][i])}<div><strong>${displayRole[role]}</strong><p>${esc(stage.detail)}</p></div>${icon(stage.status==='complete'?'check-circle':stage.status==='working'?'circle-notch':stage.status==='error'?'x':'clock').replace('<img','<img class="phase-icon"')}</li>`;}).join('');
}
export function startPhases(ai){phases=new Map();settled=false;$('trace-mode').textContent=ai?'真实 AI 阶段':'本地规则示范';drawPhases();}
export function stageEvent(event){phases.set(event.role,event);drawPhases();canvasStatus(event.detail,event.status==='working');}
export function finishPhases(plan){phases=new Map(plan.trace.map(t=>[t.role,t]));settled=true;$('trace-mode').textContent=plan.mode==='ai'?'真实 AI 阶段':'本地规则示范';drawPhases();}
export function failPhases(message){for(const [role,value]of phases)if(value.status==='working')phases.set(role,{...value,status:'error',detail:message});drawPhases();}
export function canvasStatus(text,working=false,error=false){$('workspace-status').innerHTML=icon(working?'circle-notch':error?'x':'check-circle')+`<span>${esc(text)}</span>`;$('workspace-status').classList.toggle('is-working',working);$('workspace-status').classList.toggle('is-error',error);}
export function chatMessage(role,text,meta=''){
  const article=document.createElement('article');article.className=`chat-message ${role}`;article.innerHTML=`<span class="chat-avatar">${icon(role==='user'?'user':'sparkle')}</span><div class="chat-bubble"></div>`;
  setMessage(article,text,meta);$('chat-messages').append(article);article.scrollIntoView({block:'nearest'});return article;
}
export function setMessage(article,text,meta=''){
  const bubble=article.querySelector('.chat-bubble'),content=document.createElement('div');content.className='message-content';
  for(const line of String(text??'').split(/\r?\n/).filter(line=>line.trim())){const paragraph=document.createElement('p');paragraph.textContent=line;content.append(paragraph);}
  bubble.replaceChildren(content);
  if(meta){const note=document.createElement('span');note.className='message-meta';note.textContent=meta;bubble.append(note);}
}
export function revealChatMessage(article){
  requestAnimationFrame(()=>{
    if(!article.isConnected)return;
    const scroller=article.closest('.chat-scroll');
    if(scroller)scroller.scrollTop+=article.getBoundingClientRect().top-scroller.getBoundingClientRect().top-12;
    if(mobile()){
      const toolbarHeight=$('route-refresh-slot')?.getBoundingClientRect().height||0;
      window.scrollTo({top:Math.max(0,window.scrollY+article.getBoundingClientRect().top-toolbarHeight-12),behavior:'instant'});
      return;
    }
  });
}
function mapPositions(plan){
  if(plan.city==='广州'&&plan.stops.every(p=>anchors[p.id]))return Object.fromEntries(plan.stops.map(p=>[p.id,anchors[p.id]]));
  const all=plan.stops;if(!all.length)return {};
  if(all.some(p=>!Array.isArray(p.coords)))return Object.fromEntries(all.map((p,i)=>[p.id,[20+(i%3)*28,25+Math.floor(i/3)*40]]));
  const lats=all.map(p=>p.coords[0]),lngs=all.map(p=>p.coords[1]),a=Math.min(...lats),b=Math.max(...lats),c=Math.min(...lngs),d=Math.max(...lngs);
  return Object.fromEntries(all.map(p=>[p.id,[18+(p.coords[1]-c)/Math.max(.008,d-c)*64,78-(p.coords[0]-a)/Math.max(.008,b-a)*56]]));
}
function selectMapStop(id){selected=id;document.querySelectorAll('#map-markers .map-marker').forEach(el=>el.classList.toggle('selected',el.dataset.stop===selected));}
export function renderMap(plan,collection,landmarkStops=plan.stops,mapOptions={}){
  if(lastMap&&lastMap.plan.city!==plan.city){illustration=false;selected=null;}
  lastMap={plan,collection,landmarkStops,mapOptions};mapController ||= createTravelMap();
  $('map-title').textContent=`${plan.city} · ${illustration?'可选示意图':'高德地图'}`;$('map-view-toggle').textContent=illustration?'返回高德地图':'查看示意图';$('map-view-toggle').disabled=false;
  $('route-line').replaceChildren();$('map-markers').replaceChildren();
  if(!illustration){mapController.render(plan,{landmarkStops,...mapOptions});return;}
  mapController.pause();document.querySelector('.route-map').classList.add('illustration');
  const illustrated=plan.city==='广州'&&plan.stops.every(p=>anchors[p.id]),positions=mapPositions(plan);
  const proposed=plan.stops.some(p=>p.kind==='suggested');
  document.querySelector('.route-map').classList.toggle('schematic',!illustrated);$('city-map').alt=illustrated?'广州珠江两岸风格化导览图，地标位置为示意':`${plan.city}行程顺序示意，非真实地图`;document.querySelector('.map-caption').textContent=illustrated?'示意导览 · 线路非交通路线':proposed?'顺序示意 · 地点与交通待核实':'地点相对位置 · 非导航地图';
  const route=[];
  plan.stops.forEach((p,i)=>{const pos=positions[p.id];if(!pos)return;const prev=plan.stops[i-1];if(illustrated&&prev&&((p.id==='gz-tower')!==(prev.id==='gz-tower'))){const bridge=[[48,46],[34,49],[27,60],[18,74],[48,87]];route.push(...(p.id==='gz-tower'?bridge:bridge.toReversed()));}route.push(pos);});
  const path=route.map(([x,y],i)=>`${i?'L':'M'}${x*10},${y*6.67}`).join(' ');$('route-line').innerHTML=path?`<path class="route-underlay" d="${path}"/><path class="route-path" d="${path}"/>`:'';
  $('map-markers').innerHTML=plan.stops.map((p,i)=>`<button class="map-marker ${collection.some(c=>c.id===p.id)?'collected':''} ${selected===p.id?'selected':''}" data-stop="${p.id}" aria-label="查看第 ${i+1} 站 ${esc(p.name)}"><b>${i+1}</b><span>${esc(p.name)}</span></button>`).join('');
  $('map-markers').querySelectorAll('[data-stop]').forEach(button=>{const [x,y]=positions[button.dataset.stop];button.style.left=x+'%';button.style.top=y+'%';button.onclick=()=>selectMapStop(button.dataset.stop);});
}
export function initWorkspace(){
  drawPhases();
  $('map-view-toggle').onclick=()=>{illustration=!illustration;if(lastMap)renderMap(lastMap.plan,lastMap.collection,lastMap.landmarkStops,lastMap.mapOptions);};
}
