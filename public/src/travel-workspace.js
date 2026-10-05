const $=id=>document.getElementById(id);
export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const icon=name=>`<img src="/assets/icons/${name}.svg" alt="">`;
const mobile=()=>matchMedia('(max-width:767px)').matches;
const anchors={'gz-museum':[80,40],'gz-square':[51,30],'gz-tower':[48,87],'gz-opera':[23,39]};
let schematic=false,lastMap=null,selected=null;
export function budgetText(input){return input?.budget?input.budget.replace(/^(\d+(?:\.\d+)?)元/,'¥$1'):'未设置';}
export function timeText(input){if(!input)return '待安排';return `${input.startTime||'09:00'} — ${clock(input,(input.hours||4)*60)}`;}
export function clock(input,minutes=0){const [h,m]=(input.startTime||'09:00').split(':').map(Number),value=h*60+m+minutes;return `${value>=1440?'次日 ':''}${String(Math.floor(value/60)%24).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;}
export function renderConstraints(input,previous=null,temporary=false){
  $('time-value').textContent=timeText(input);$('time-detail').textContent=`${input.hours}小时可用时间${temporary?' · 正在修订':''}`;
  $('budget-value').textContent=budgetText(input);
  $('time-previous').textContent=previous?`原来：${timeText(previous)}`:'可通过对话调整';
  $('budget-previous').textContent=previous?`原来：${budgetText(previous)}`:'可通过对话调整';
  const labels=[...(input.easy?['少走路']:['轻松漫游']),...input.interests,'纪念收藏'];
  $('preference-tags').innerHTML=[...new Set(labels)].map(t=>`<span>${esc(t)}</span>`).join('');
  const changedTime=previous&&(input.hours!==previous.hours||input.startTime!==previous.startTime),changedBudget=previous&&input.budget!==previous.budget,changedPrefs=previous&&(input.easy!==previous.easy||JSON.stringify(input.interests)!==JSON.stringify(previous.interests)||JSON.stringify(input.requiredIds)!==JSON.stringify(previous.requiredIds)||JSON.stringify(input.excludedIds)!==JSON.stringify(previous.excludedIds));
  for(const [name,changed]of [['time',changedTime],['budget',changedBudget],['preferences',changedPrefs]]){
    $(`${name}-node`).classList.toggle('updated',Boolean(changed));$(`${name}-node`).classList.toggle('pending',temporary);$(`${name}-state`).textContent=temporary?'待确认':changed?'已更新':previous?'已确认':'示例';
  }
  const changes=[];if(changedTime)changes.push(['clock',`${esc(timeText(previous))} → ${esc(timeText(input))}`]);if(changedBudget)changes.push(['coins',`${esc(budgetText(previous))} → ${esc(budgetText(input))}`]);if(changedPrefs)changes.push(['heart',esc(labels.join(' · '))]);
  $('change-list').innerHTML=changes.length?changes.map(([name,text])=>`<p class="change-row">${icon(name)}<span>${text}${temporary?' <small>待确认</small>':''}</span></p>`).join(''):`<p class="fine">${previous?'已沿用时间、预算和偏好。':'当前为广州示例，等你补充想法。'}</p>`;
}
const roles=['对话 Agent','资料 Agent','研判 Agent','路线 Agent','总控 Agent'];
const displayRole={'对话 Agent':'DeepSeek 对话','资料 Agent':'资料 Agent','研判 Agent':'需求 Agent','路线 Agent':'路线 Agent','总控 Agent':'协调 Agent'};
let phases=new Map(),settled=false;
function drawPhases(){
  $('agent-trace').innerHTML=roles.filter(role=>!settled||phases.has(role)).map(role=>{const i=roles.indexOf(role),stage=phases.get(role)||{status:'waiting',detail:i?'问答时无需执行此阶段':'准备接收需求'};return `<li class="agent-step ${stage.status}">${icon(['sparkle','book-open','note-pencil','path','check-circle'][i])}<div><strong>${displayRole[role]}</strong><p>${esc(stage.detail)}</p></div>${icon(stage.status==='complete'?'check-circle':stage.status==='working'?'circle-notch':stage.status==='error'?'x':'clock').replace('<img','<img class="phase-icon"')}</li>`;}).join('');
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
  if(plan.city==='广州'&&!schematic)return Object.fromEntries(plan.stops.map(p=>[p.id,anchors[p.id]]));
  const all=plan.stops;if(!all.length)return {};
  if(all.some(p=>!Array.isArray(p.coords)))return Object.fromEntries(all.map((p,i)=>[p.id,[20+(i%3)*28,25+Math.floor(i/3)*40]]));
  const lats=all.map(p=>p.coords[0]),lngs=all.map(p=>p.coords[1]),a=Math.min(...lats),b=Math.max(...lats),c=Math.min(...lngs),d=Math.max(...lngs);
  return Object.fromEntries(all.map(p=>[p.id,[18+(p.coords[1]-c)/Math.max(.008,d-c)*64,78-(p.coords[0]-a)/Math.max(.008,b-a)*56]]));
}
export function renderMap(plan,collection){
  lastMap={plan,collection};const illustrated=plan.city==='广州'&&!schematic,positions=mapPositions(plan);
  const proposed=plan.stops.some(p=>p.kind==='suggested');
  document.querySelector('.route-map').classList.toggle('schematic',!illustrated);$('city-map').alt='广州珠江两岸风格化导览图，地标位置为示意';$('map-title').textContent=illustrated?'广州 · 珠江两岸':`${plan.city} · ${proposed?'路线顺序示意':'地点示意'}`;document.querySelector('.map-caption').textContent=illustrated?'示意导览 · 非导航地图':proposed?'顺序示意 · 地点与交通待核实':'地点相对位置 · 非导航地图';
  $('map-view-toggle').disabled=plan.city!=='广州';$('map-view-toggle').innerHTML=(illustrated?'地点示意':'城市导览')+icon('arrows-clockwise');
  const route=[];
  plan.stops.forEach((p,i)=>{const pos=positions[p.id];if(!pos)return;const prev=plan.stops[i-1];if(illustrated&&prev&&((p.id==='gz-tower')!==(prev.id==='gz-tower'))){const bridge=[[48,46],[34,49],[27,60],[18,74],[48,87]];route.push(...(p.id==='gz-tower'?bridge:bridge.toReversed()));}route.push(pos);});
  const path=route.map(([x,y],i)=>`${i?'L':'M'}${x*10},${y*6.67}`).join(' ');$('route-line').innerHTML=path?`<path class="route-underlay" d="${path}"/><path class="route-path" d="${path}"/>`:'';
  $('map-markers').innerHTML=plan.stops.map((p,i)=>`<button class="map-marker ${collection.some(c=>c.id===p.id)?'collected':''} ${selected===p.id?'selected':''}" data-stop="${p.id}" aria-label="查看第 ${i+1} 站 ${esc(p.name)}"><b>${i+1}</b><span>${esc(p.name)}</span></button>`).join('');
  $('map-markers').querySelectorAll('[data-stop]').forEach(button=>{const [x,y]=positions[button.dataset.stop];button.style.left=x+'%';button.style.top=y+'%';button.onclick=()=>{selected=button.dataset.stop;document.querySelectorAll('.map-marker,.stop-card').forEach(el=>el.classList.toggle('selected',(el.dataset.stop||el.dataset.stopCard)===selected));const stop=document.querySelector(`[data-stop-card="${selected}"]`);stop?.focus({preventScroll:true});const container=document.querySelector('.itinerary-content');if(stop)container.scrollTop=stop.offsetTop-50;};});
}
export function initWorkspace(){
  drawPhases();$('map-view-toggle').onclick=()=>{schematic=!schematic;if(lastMap)renderMap(lastMap.plan,lastMap.collection);};
  const viewport=$('canvas-viewport'),world=$('canvas-world'),nodes=[...world.querySelectorAll('.canvas-node')];let scale=1,panX=24,panY=10,drag=null,panning=true;
  const initial=nodes.map(node=>({node,x:Number(node.dataset.x),y:Number(node.dataset.y)}));
  function connections(){const from=$('map-node'),fx=Number(from.dataset.x)+from.offsetWidth/2,fy=Number(from.dataset.y)+from.offsetHeight;const paths=nodes.filter(node=>node!==from).map(node=>{const tx=Number(node.dataset.x)+node.offsetWidth/2,ty=Number(node.dataset.y);return `<path d="M${fx} ${fy} C${fx} ${(fy+ty)/2},${tx} ${(fy+ty)/2},${tx} ${ty}"/><circle cx="${tx}" cy="${ty}" r="3"/>`;});$('canvas-connections').innerHTML=paths.join('');}
  function update(){world.style.transform=`translate(${panX}px,${panY}px) scale(${scale})`;$('zoom-value').textContent=Math.round(scale*100)+'%';connections();}
  function position(node,x,y){node.dataset.x=String(x);node.dataset.y=String(y);node.style.left=x+'px';node.style.top=y+'px';}
  function fit(){if(mobile())return;const minX=Math.min(...nodes.map(n=>Number(n.dataset.x))),minY=Math.min(...nodes.map(n=>Number(n.dataset.y))),maxX=Math.max(...nodes.map(n=>Number(n.dataset.x)+n.offsetWidth)),maxY=Math.max(...nodes.map(n=>Number(n.dataset.y)+n.offsetHeight));scale=Math.max(.35,Math.min(1,(viewport.clientWidth-48)/(maxX-minX),(viewport.clientHeight-35)/(maxY-minY)));panX=24-minX*scale;panY=10-minY*scale;update();}
  function zoom(next,x=viewport.clientWidth/2,y=viewport.clientHeight/2){const value=Math.max(.35,Math.min(1.6,next)),ratio=value/scale;panX=x-(x-panX)*ratio;panY=y-(y-panY)*ratio;scale=value;update();}
  initial.forEach(({node,x,y})=>position(node,x,y));
  $('zoom-in').onclick=()=>zoom(scale+.1);$('zoom-out').onclick=()=>zoom(scale-.1);$('fit-top').onclick=fit;$('fit-bottom').onclick=fit;
  $('reset-layout').onclick=()=>{initial.forEach(({node,x,y})=>position(node,x,y));fit();};
  $('pan-tool').onclick=()=>{panning=!panning;$('pan-tool').setAttribute('aria-pressed',String(panning));viewport.style.cursor=panning?'grab':'default';};
  viewport.addEventListener('pointerdown',e=>{if(mobile()||e.button!==0||e.target.closest('button,a,input,textarea,select,summary,canvas'))return;const header=e.target.closest('.node-header'),node=header?.closest('.canvas-node');if(!node&&(e.target.closest('.canvas-node')||!panning))return;drag={node,startX:e.clientX,startY:e.clientY,x:node?Number(node.dataset.x):panX,y:node?Number(node.dataset.y):panY};viewport.setPointerCapture(e.pointerId);viewport.classList.add('is-dragging');node?.classList.add('dragging');e.preventDefault();});
  viewport.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.startX,dy=e.clientY-drag.startY;if(drag.node)position(drag.node,drag.x+dx/scale,drag.y+dy/scale);else{panX=drag.x+dx;panY=drag.y+dy;}update();});
  const end=()=>{drag?.node?.classList.remove('dragging');drag=null;viewport.classList.remove('is-dragging');};viewport.addEventListener('pointerup',end);viewport.addEventListener('pointercancel',end);viewport.addEventListener('lostpointercapture',end);
  viewport.addEventListener('wheel',e=>{if(mobile()||e.target.closest('.itinerary-content,.source-panel'))return;e.preventDefault();if(e.ctrlKey||e.metaKey){const r=viewport.getBoundingClientRect();zoom(scale*Math.exp(-e.deltaY*.002),e.clientX-r.left,e.clientY-r.top);}else{panX-=e.deltaX;panY-=e.deltaY;update();}},{passive:false});
  viewport.addEventListener('keydown',e=>{if(mobile()||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)||e.target.closest('button,a,canvas,summary'))return;const dx=e.key==='ArrowLeft'?-20:e.key==='ArrowRight'?20:0,dy=e.key==='ArrowUp'?-20:e.key==='ArrowDown'?20:0,node=e.target.closest('.node-header')?.closest('.canvas-node');if(node)position(node,Number(node.dataset.x)+dx,Number(node.dataset.y)+dy);else{panX+=dx;panY+=dy;}update();e.preventDefault();});
  new ResizeObserver(()=>{if(!drag)fit();}).observe(viewport);requestAnimationFrame(fit);
}
