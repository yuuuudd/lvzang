import {places,byId} from './travel-catalog.js';
const tags=['园林','建筑','文化','美食','拍照','手作','风景','室内'];
const text=(v,max,name)=>{if(v==null)return '';if(typeof v!=='string'||v.length>max)throw new Error(`${name}格式无效或过长`);return v.trim();};
export function normalizeRequest(body={}) {
  if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('请求格式无效');
  const description=text(body.description,2000,'旅行需求'),previous=body.previous&&typeof body.previous==='object'?body.previous:{};
  const described=description.match(/苏州|杭州|北京|上海|成都|重庆|广州|深圳|西安|南京|青岛|厦门|武汉|长沙|云南|日本|巴黎/g)?.at(-1);
  const selected=text(body.destination,40,'目的地'),explicit=body.textRevision===true&&described?'':selected;
  const destination=explicit||described||previous.destination||'';
  let hours=Number(body.hours)||Number(previous.hours)||4;
  const m=description.match(/(\d+(?:\.\d+)?)\s*(?:个)?小时/);
  if(!body.hours||body.textRevision===true){if(m)hours=Number(m[1]);else if(/两小时|二小时/.test(description))hours=2;else if(/半天/.test(description))hours=4;else if(/两天|2天/.test(description))hours=16;else if(/一天|一日|1天/.test(description))hours=8;}
  if(!Number.isFinite(hours)||hours<1||hours>24)throw new Error('旅行时长需要在 1–24 小时之间');
  const interests=Array.isArray(body.interests)?body.interests.filter(t=>tags.includes(t)):tags.filter(t=>description.includes(t));
  const easy=/少走|老人|父母|轻松|带娃/.test(description)?true:/多走|徒步/.test(description)?false:Boolean(body.easy??previous.easy);
  const notes=body.notes??[];
  if(!Array.isArray(notes)||notes.length>8)throw new Error('最多导入 8 篇攻略');
  const cleanNotes=notes.map((n,i)=>{if(!n||typeof n!=='object')throw new Error('攻略格式无效');return {id:`n${i+1}`,title:text(n.title,80,'攻略标题')||`攻略 ${i+1}`,content:text(n.content,6000,'攻略正文'),url:safeURL(n.url)};});
  const budgetMatch=description.match(/(?:预算|人均|每人|不超过|控制在)\s*(?:改成|改为|改到|调整为|调到|降到|降至|减少到|提高到|提高至|增加到|缩减到|是|为|到)?\s*[¥￥]?\s*(\d+(?:\.\d+)?)\s*(?:元|块)?/);
  const budget=/预算不限|不限预算|不限制预算/.test(description)?'不限':budgetMatch?`${budgetMatch[1]}元${/人均|每人/.test(description)?'/人':''}`:text(body.budget??previous.budget,80,'预算');
  const startMatch=description.match(/(?:从|出发|开始)?\s*(\d{1,2})[:：](\d{2})/);
  let startTime=text(body.startTime??previous.startTime,5,'开始时间')||'09:00';
  if(startMatch)startTime=`${startMatch[1].padStart(2,'0')}:${startMatch[2]}`;else if(/下午/.test(description))startTime='13:00';else if(/上午|早上/.test(description))startTime='09:00';
  if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(startTime))throw new Error('开始时间格式无效');
  const ids=(v)=>Array.isArray(v)?v.filter(id=>{const p=byId(id);return p&&(!destination||p.city===destination);}):[];
  const mentioned=(segment,p)=>[p.name,...p.aliases].some(n=>segment.includes(n))||(segment.includes('博物馆')&&p.name.includes('博物馆'))||(segment.includes('园林')&&p.tags.includes('园林'));
  const required=new Set(ids(body.requiredIds??previous.requiredIds)),excluded=new Set(ids(body.excludedIds??previous.excludedIds));
  for(const part of description.split(/[，。；,;\n]/)){
    const negative=/(?:不去|不想去|去掉|删除|不要|取消|避开)/.test(part),positive=/(?:保留|一定要去|必须去|想去|改去)/.test(part);
    for(const p of places)if(mentioned(part,p)){if(negative){excluded.add(p.id);required.delete(p.id);}else if(positive){required.add(p.id);excluded.delete(p.id);}}
  }
  return {description,destination,hours,easy,startTime,requiredIds:[...required],excludedIds:[...excluded],interests:interests.length?interests:Array.isArray(previous.interests)?previous.interests.filter(t=>tags.includes(t)):[],notes:cleanNotes,budget};
}
export function safeURL(value){if(!value)return '';try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)&&u.href.length<1000?u.href:'';}catch{return '';}}
export function analyzeNotes(notes=[]) {
  const matches=new Map(),findings=[];
  for(const n of notes){
    for(const p of places){if([p.name,...p.aliases].some(alias=>n.content.includes(alias))){
      const entry=matches.get(p.id)||{id:p.id,name:p.name,city:p.city,evidence:[]};
      entry.evidence.push({noteId:n.id,title:n.title,url:n.url,excerpt:n.content.slice(0,240)});matches.set(p.id,entry);
    }}
    if(n.content)findings.push({noteId:n.id,title:n.title,text:n.content.slice(0,260)});
  }
  return {notes,places:[...matches.values()],findings,summary:notes.length?`已整理 ${notes.length} 篇资料，匹配 ${matches.size} 个已维护地点。未匹配内容保留在原文，尚未核实。`:'未导入攻略，将从维护的地方资料中推荐。'};
}
function distance(a,b){const [lat,lng]=a.coords,[lat2,lng2]=b.coords;return Math.hypot((lat-lat2)*111,(lng-lng2)*95);}
export function planFromCatalog(input,analysis=analyzeNotes(input.notes),selection={}) {
  const city=input.destination||analysis.places[0]?.city||'苏州',assumptions=[];
  if(!places.some(p=>p.city===city))return {status:'needs-destination',city,input,analysis,stops:[],assumptions:[`当前示范资料覆盖广州、苏州和杭州。已记录“${city}”，请选择现有主题继续体验。`],warnings:['尚未接入全网旅行检索，不能生成未经核实的当地路线。']};
  if(!input.destination)assumptions.push(`暂以${city}作为探索方向，可随时更换。`);
  if(!input.description&&!input.interests.length)assumptions.push('暂按半日文化漫游推荐，尚未包含出发地与个人交通安排。');
  const evidence=new Map(analysis.places.map(p=>[p.id,p.evidence]));
  const candidates=places.filter(p=>p.city===city&&!input.excludedIds?.includes(p.id));
  const score=p=>p.tags.filter(t=>input.interests.includes(t)).length*4+(evidence.has(p.id)?6:0);
  const selected=Array.isArray(selection.placeIds)?selection.placeIds.map(byId).filter(p=>p?.city===city&&!input.excludedIds?.includes(p.id)):[...candidates].sort((a,b)=>score(b)-score(a));
  const required=(input.requiredIds||[]).map(byId).filter(p=>p?.city===city&&!input.excludedIds?.includes(p.id));
  const preferred=[...required,...selected];
  const limit=input.hours<=2||input.easy?2:input.hours<=4?3:4;
  const stops=[];let spent=0;
  for(const p of preferred){if(stops.some(s=>s.id===p.id))continue;const last=stops.at(-1);const km=last?distance(last,p):0;
    const transit=last?Math.max(10,Math.ceil(km/(input.easy?12:8)*60)+8):0;
    if(stops.length>=limit||spent+transit+p.minutes>input.hours*60)continue;
    stops.push({...p,transit,estimatedStart:spent+transit,evidence:evidence.get(p.id)||[],reason:selection.reason||`${p.tags.filter(t=>input.interests.includes(t)).join('、')||'地方文化'}与这条路线相符。`});spent+=transit+p.minutes;
  }
  return {status:stops.length?'ready':'needs-time',city,title:selection.title||`${city} · ${input.easy?'慢游记':'寻味与拾光'}`,input,analysis,stops,totalMinutes:spent,transport:input.easy?'优先公共交通与短距离步行':'步行与公共交通结合',assumptions:[...assumptions,...(stops.length?[]:['现有时间与排除条件下无法安排地点，请增加时间或放宽要求。'])],warnings:['当前路线使用策划资料，交通时间为粗略估算；开放时间、预约、费用与起终点交通尚需出发前确认。',...(input.budget?['预算是你的规划上限；门票、交通与餐饮未核价，当前不能保证实际消费不超额。']:[]),...(required.filter(p=>!stops.some(s=>s.id===p.id)).map(p=>`${p.name}未能安排进时长，请增加时间或减少必去地点。`)),...(analysis.notes.length?['帖子是用户体验资料，未经独立核实；未匹配的地点不会自动加入路线。']:[])],changeSummary:input.description?'已按本次需求重新筛选地点并安排停留。':'先给你一个起点，补充需求后可以继续修正。'};
}
