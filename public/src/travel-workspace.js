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
  const followUps=(profile?.followUps||[]).slice(0,3);$('follow-up-panel').hidden=!followUps.length;$('follow-up-list').innerHTML=followUps.map(({question})=>`<li>${esc(question)}</li>`).join('');
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
export function setMessage(article,text,meta=''){const bubble=article.querySelector('.chat-bubble');bubble.textContent=text;if(meta){const note=document.createElement('span');note.className='message-meta';note.textContent=meta;bubble.append(note);}}
function mapPositions(plan){
  if(plan.city==='广州'&&plan.stops.every(p=>anchors[p.id]))return Object.fromEntries(plan.stops.map(p=>[p.id,anchors[p.id]]));
  const all=plan.stops;if(!all.length)return {};
  if(all.some(p=>!Array.isArray(p.coords)))return Object.fromEntries(all.map((p,i)=>[p.id,[20+(i%3)*28,25+Math.floor(i/3)*40]]));
  const lats=all.map(p=>p.coords[0]),lngs=all.map(p=>p.coords[1]),a=Math.min(...lats),b=Math.max(...lats),c=Math.min(...lngs),d=Math.max(...lngs);
  return Object.fromEntries(all.map(p=>[p.id,[18+(p.coords[1]-c)/Math.max(.008,d-c)*64,78-(p.coords[0]-a)/Math.max(.008,b-a)*56]]));
}
function selectMapStop(id){selected=id;document.querySelectorAll('#map-markers .map-marker').forEach(el=>el.classList.toggle('selected',el.dataset.stop===selected));}
export function renderMap(plan,collection,landmarkStops=plan.stops,mapOptions={}){
  lastMap={plan,collection,landmarkStops,mapOptions};mapController ||= createTravelMap();
  $('map-title').textContent=`${plan.city} · ${illustration?'可选示意图':'立体地标'}`;$('map-view-toggle').textContent=illustration?'返回高德地图':'查看示意图';$('map-view-toggle').disabled=false;
  $('route-line').replaceChildren();$('map-markers').replaceChildren();
  if(!illustration){mapController.render(plan,{landmarkStops,...mapOptions});return;}
  mapController.pause();document.querySelector('.route-map').classList.add('illustration');
  const illustrated=plan.city==='广州'&&plan.stops.every(p=>anchors[p.id]),positions=mapPositions(plan);
  const proposed=plan.stops.some(p=>p.kind==='suggested');
  document.querySelector('.route-map').classList.toggle('schematic',!illustrated);$('city-map').alt='广州珠江两岸风格化导览图，地标位置为示意';document.querySelector('.map-caption').textContent=illustrated?'示意导览 · 线路非交通路线':proposed?'顺序示意 · 地点与交通待核实':'地点相对位置 · 非导航地图';
  const route=[];
  plan.stops.forEach((p,i)=>{const pos=positions[p.id];if(!pos)return;const prev=plan.stops[i-1];if(illustrated&&prev&&((p.id==='gz-tower')!==(prev.id==='gz-tower'))){const bridge=[[48,46],[34,49],[27,60],[18,74],[48,87]];route.push(...(p.id==='gz-tower'?bridge:bridge.toReversed()));}route.push(pos);});
  const path=route.map(([x,y],i)=>`${i?'L':'M'}${x*10},${y*6.67}`).join(' ');$('route-line').innerHTML=path?`<path class="route-underlay" d="${path}"/><path class="route-path" d="${path}"/>`:'';
  $('map-markers').innerHTML=plan.stops.map((p,i)=>`<button class="map-marker ${collection.some(c=>c.id===p.id)?'collected':''} ${selected===p.id?'selected':''}" data-stop="${p.id}" aria-label="查看第 ${i+1} 站 ${esc(p.name)}"><b>${i+1}</b><span>${esc(p.name)}</span></button>`).join('');
  $('map-markers').querySelectorAll('[data-stop]').forEach(button=>{const [x,y]=positions[button.dataset.stop];button.style.left=x+'%';button.style.top=y+'%';button.onclick=()=>selectMapStop(button.dataset.stop);});
}
export function initWorkspace(){
  drawPhases();$('map-view-toggle').onclick=()=>{illustration=!illustration;if(lastMap)renderMap(lastMap.plan,lastMap.collection,lastMap.landmarkStops,lastMap.mapOptions);};
  const viewport=$('canvas-viewport'),world=$('canvas-world'),nodes=[...world.querySelectorAll('.canvas-node')];let scale=1,panX=24,panY=10,drag=null,panning=true,automaticView=true,wasMobile=mobile();
  const initial=nodes.map(node=>({node,x:Number(node.dataset.x),y:Number(node.dataset.y)}));
  const followingRow=initial.filter(({node})=>['time-node','budget-node','preferences-node'].includes(node.id));let automaticRowY=704;
  function arrangeFollowingRow(){
    if(mobile())return;
    const nextY=Math.max(704,$('map-node').offsetHeight+18);
    for(const {node,x,y}of followingRow){const currentX=Number(node.dataset.x),currentY=Number(node.dataset.y);if(currentX===x&&(currentY===automaticRowY||currentY===y))position(node,x,nextY);}
    automaticRowY=nextY;
  }
  function connections(){const from=$('map-node'),fx=Number(from.dataset.x)+from.offsetWidth/2,fy=Number(from.dataset.y)+from.offsetHeight;const paths=nodes.filter(node=>node!==from).map(node=>{const tx=Number(node.dataset.x)+node.offsetWidth/2,ty=Number(node.dataset.y);return `<path d="M${fx} ${fy} C${fx} ${(fy+ty)/2},${tx} ${(fy+ty)/2},${tx} ${ty}"/><circle cx="${tx}" cy="${ty}" r="3"/>`;});$('canvas-connections').innerHTML=paths.join('');}
  function update(){world.style.transform=`translate(${panX}px,${panY}px) scale(${scale})`;$('zoom-value').textContent=Math.round(scale*100)+'%';connections();}
  function position(node,x,y){node.dataset.x=String(x);node.dataset.y=String(y);node.style.left=x+'px';node.style.top=y+'px';}
  function bounds(){return {minX:Math.min(...nodes.map(n=>Number(n.dataset.x))),minY:Math.min(...nodes.map(n=>Number(n.dataset.y))),maxX:Math.max(...nodes.map(n=>Number(n.dataset.x)+n.offsetWidth)),maxY:Math.max(...nodes.map(n=>Number(n.dataset.y)+n.offsetHeight))};}
  // Default to a readable width. A taller map must not shrink the entire workspace.
  function widthView(){if(mobile())return;const {minX,minY,maxX}=bounds();scale=Math.max(.35,Math.min(1.6,(viewport.clientWidth-48)/(maxX-minX)));panX=24-minX*scale;panY=10-minY*scale;update();}
  function fit(){if(mobile())return;automaticView=false;const {minX,minY,maxX,maxY}=bounds();scale=Math.max(.35,Math.min(1,(viewport.clientWidth-48)/(maxX-minX),(viewport.clientHeight-35)/(maxY-minY)));panX=24-minX*scale;panY=10-minY*scale;update();}
  function zoom(next,x=viewport.clientWidth/2,y=viewport.clientHeight/2){automaticView=false;const value=Math.max(.35,Math.min(1.6,next)),ratio=value/scale;panX=x-(x-panX)*ratio;panY=y-(y-panY)*ratio;scale=value;update();}
  initial.forEach(({node,x,y})=>position(node,x,y));
  $('zoom-in').onclick=()=>zoom(scale+.1);$('zoom-out').onclick=()=>zoom(scale-.1);$('fit-top').onclick=fit;$('fit-bottom').onclick=fit;
  $('reset-layout').onclick=()=>{initial.forEach(({node,x,y})=>position(node,x,y));arrangeFollowingRow();automaticView=true;widthView();};
  $('pan-tool').onclick=()=>{panning=!panning;$('pan-tool').setAttribute('aria-pressed',String(panning));viewport.style.cursor=panning?'grab':'default';};
  viewport.addEventListener('pointerdown',e=>{if(mobile()||e.button!==0||e.target.closest('button,a,input,textarea,select,summary,canvas'))return;const header=e.target.closest('.node-header'),node=header?.closest('.canvas-node');if(!node&&(e.target.closest('.canvas-node')||!panning))return;automaticView=false;drag={node,startX:e.clientX,startY:e.clientY,x:node?Number(node.dataset.x):panX,y:node?Number(node.dataset.y):panY};viewport.setPointerCapture(e.pointerId);viewport.classList.add('is-dragging');node?.classList.add('dragging');e.preventDefault();});
  viewport.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.startX,dy=e.clientY-drag.startY;if(drag.node)position(drag.node,drag.x+dx/scale,drag.y+dy/scale);else{panX=drag.x+dx;panY=drag.y+dy;}update();});
  const end=()=>{drag?.node?.classList.remove('dragging');drag=null;viewport.classList.remove('is-dragging');};viewport.addEventListener('pointerup',end);viewport.addEventListener('pointercancel',end);viewport.addEventListener('lostpointercapture',end);
  viewport.addEventListener('wheel',e=>{if(mobile()||e.target.closest('.route-map,.map-details,.itinerary-content,.source-panel'))return;e.preventDefault();automaticView=false;if(e.ctrlKey||e.metaKey){const r=viewport.getBoundingClientRect();zoom(scale*Math.exp(-e.deltaY*.002),e.clientX-r.left,e.clientY-r.top);}else{panX-=e.deltaX;panY-=e.deltaY;update();}},{passive:false});
  viewport.addEventListener('keydown',e=>{if(mobile()||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)||e.target.closest('.route-map,input,textarea,select,button,a,canvas,summary'))return;automaticView=false;const dx=e.key==='ArrowLeft'?-20:e.key==='ArrowRight'?20:0,dy=e.key==='ArrowUp'?-20:e.key==='ArrowDown'?20:0,node=e.target.closest('.node-header')?.closest('.canvas-node');if(node)position(node,Number(node.dataset.x)+dx,Number(node.dataset.y)+dy);else{panX+=dx;panY+=dy;}update();e.preventDefault();});
  new ResizeObserver(()=>{const isMobile=mobile();if(isMobile!==wasMobile){automaticView=true;wasMobile=isMobile;}arrangeFollowingRow();if(!drag&&automaticView)widthView();else connections();}).observe(viewport);
  new ResizeObserver(()=>{arrangeFollowingRow();connections();}).observe($('map-node'));
  requestAnimationFrame(()=>{arrangeFollowingRow();widthView();});
}
