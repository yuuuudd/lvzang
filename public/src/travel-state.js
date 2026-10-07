import {byId,places} from './travel-catalog.js';
import {emptyTravelProfile,normalizeTravelProfile} from './travel-profile.js';
import {accountInfo,storageKey} from './account-client.js';
import {isSuggestedItineraryId} from './travel-itinerary-edit.js';
const LEGACY_KEYS={state:'lvzang.v1',chat:'lvzang.chat.v1'};
export function travelStorageKeys(){return {state:storageKey(LEGACY_KEYS.state),chat:storageKey(LEGACY_KEYS.chat)};}
function sourceRecord(storage,name){
  const raw=storage.getItem(travelStorageKeys()[name]);
  if(raw!=null||!accountInfo.enabled)return raw;
  if(!accountInfo.user)return storage.getItem(LEGACY_KEYS[name]);
  if(accountInfo.user.workspaceOwner)return storage.getItem(LEGACY_KEYS[name]+':guest')??storage.getItem(LEGACY_KEYS[name]);
  return null;
}
function migrateTravelStorage(storage){
  if(!accountInfo.enabled)return;
  const keys=travelStorageKeys();
  try{for(const name of Object.keys(LEGACY_KEYS)){
    if(storage.getItem(keys[name])!=null)continue;
    const raw=sourceRecord(storage,name);
    // Copy the original bytes, including damaged records, so recovery stays possible.
    if(raw!=null)storage.setItem(keys[name],raw);
  }}catch{throw new Error('本机资料迁移尚未保存，原始记录已保留，请先下载备份。');}
}
export function readRawTravelState(storage){return sourceRecord(storage,'state')??'';}
const clean=v=>typeof v==='string'?v:'';
export function initialState(){return {version:1,plan:null,profile:emptyTravelProfile(),collection:[],requests:[],activities:[],notes:[],title:'我的旅行展柜'};}
export function readState(storage){
  migrateTravelStorage(storage);
  const raw=storage.getItem(travelStorageKeys().state);if(!raw)return initialState();
  try{
    const value=JSON.parse(raw);if(!value||value.version!==1)throw new Error();
    const result={...initialState(),...value};
    const string=(v,max)=>typeof v==='string'&&v.length<=max;
    const webLink=v=>string(v,1000)&&(!v||/^https?:\/\//.test(v));
    const quote=q=>q&&string(q.supplier,80)&&q.supplier.trim()&&Number.isFinite(q.price)&&q.price>0&&q.price<=100000&&Number.isInteger(q.days)&&q.days>=1&&q.days<=365&&string(q.note,200);
    const valid={
      collection:c=>c&&byId(c.id)&&string(c.story,300)&&string(c.date,30),
      notes:n=>n&&string(n.title,80)&&string(n.content,6000)&&webLink(n.url??''),
      activities:a=>a&&string(a.id,80)&&string(a.title,60)&&places.some(p=>p.city===a.city)&&string(a.description,500),
      requests:r=>r&&string(r.id,80)&&byId(r.souvenirId)&&Number.isFinite(r.width)&&r.width>=40&&r.width<=120&&string(r.material,40)&&string(r.text,100)&&string(r.status,40)&&(r.quotes===undefined||(Array.isArray(r.quotes)&&r.quotes.every(quote)))
    };
    for(const [key,check] of Object.entries(valid))if(!Array.isArray(result[key])||!result[key].every(check))throw new Error();
    if(result.collection.length>places.length||result.notes.length>8||result.activities.length>12)throw new Error();
    if(!string(result.title,60))throw new Error();
    if(result.planningReset!==undefined&&typeof result.planningReset!=='boolean')throw new Error();
    const p=result.plan;
    const stop=s=>s&&(byId(s.id)?webLink(s.source)&&s.source:s.kind==='suggested'&&isSuggestedItineraryId(s.id,p.city)&&string(s.name,80)&&s.name.trim()&&string(s.city,40)&&s.city===p.city&&s.source===''&&s.coords===null&&Number.isFinite(s.minutes)&&s.minutes>=10&&s.minutes<=240&&Number.isFinite(s.transit)&&s.transit>=0&&Number.isFinite(s.estimatedStart)&&s.estimatedStart>=0&&string(s.story,240)&&string(s.task,160));
    if(p&&(!Array.isArray(p.stops)||!p.stops.every(stop)||!Array.isArray(p.assumptions)||!Array.isArray(p.warnings)||!Array.isArray(p.trace)||!p.trace.every(t=>t&&string(t.role,80)&&string(t.detail,1000))||!p.analysis||!Array.isArray(p.analysis.findings)||!p.analysis.findings.every(f=>f&&string(f.title,80)&&string(f.text,6000))||!Array.isArray(p.analysis.places)||!p.analysis.places.every(a=>a&&string(a.name,80)&&Array.isArray(a.evidence)&&a.evidence.every(e=>e&&string(e.title,80)&&webLink(e.url??'')))||!p.input||!string(p.input.destination,40)))throw new Error();
    const named=p?.input?.placeConstraints;
    const placeNames=v=>Array.isArray(v)&&v.length<=12&&v.every(n=>string(n,80)&&n.trim());
    if(named&&(!string(named.city,40)||named.city!==p.city||!placeNames(named.required)||!placeNames(named.excluded)))throw new Error();
    result.profile=normalizeTravelProfile(value.profile!==undefined?value.profile:p?.profile??emptyTravelProfile());
    if(p?.profile!==undefined)normalizeTravelProfile(p.profile);
    if(p?.days!==undefined){
      if(!Array.isArray(p.days)||p.days.length<1||p.days.length>7)throw new Error();
      const ids=new Set(),flat=new Map(p.stops.map(s=>[s.id,s]));
      if(flat.size!==p.stops.length)throw new Error();
      for(const [index,day]of p.days.entries()){
        if(!day||day.dayIndex!==index+1||!string(day.title,120)||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(day.startTime)||!Number.isFinite(day.hours)||day.hours<1||day.hours>12||!Number.isFinite(day.totalMinutes)||day.totalMinutes<0||!Number.isFinite(day.freeMinutes)||day.freeMinutes<0||!Array.isArray(day.stops)||!day.stops.every(stop))throw new Error();
        for(const s of day.stops){if(s.dayIndex!==day.dayIndex||ids.has(s.id)||!flat.has(s.id)||JSON.stringify(flat.get(s.id))!==JSON.stringify(s))throw new Error();ids.add(s.id);}
      }
      if(ids.size!==p.stops.length)throw new Error();
    }
    return result;
  }
  catch{throw new Error('本机收藏记录无法读取，请先导出或清理损坏数据。');}
}
export function writeState(storage,state){try{storage.setItem(travelStorageKeys().state,JSON.stringify({...state,version:1}));}catch{throw new Error('本机保存失败，当前内容仍可查看，请导出展览备份。');}}
function chatMessages(value){
  if(!Array.isArray(value)||value.length>12||value.some(m=>!m||!['user','assistant'].includes(m.role)||typeof m.content!=='string'||m.content.length>2000))throw new Error('本机对话记录无法读取。');
  return value.map(({role,content})=>({role,content}));
}
export function readTravelChat(storage){migrateTravelStorage(storage);const raw=storage.getItem(travelStorageKeys().chat);if(!raw)return [];try{const value=JSON.parse(raw);if(value?.version!==1)throw new Error();return chatMessages(value.messages);}catch{throw new Error('本机对话记录无法读取；旅行方案仍可恢复。');}}
export function writeTravelChat(storage,messages){const bounded=chatMessages(messages.slice(-12).map(({role,content})=>({role,content:String(content).slice(0,2000)})));try{storage.setItem(travelStorageKeys().chat,JSON.stringify({version:1,messages:bounded}));}catch{throw new Error('本机对话保存失败，当前对话仍可查看。');}}
export function unlock(state,id,title=''){
  if(!byId(id))throw new Error('纪念品不存在');
  let item=state.collection.find(c=>c.id===id);
  if(!item){item={id,story:'',date:new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date()),trip:clean(title).slice(0,60),method:'模拟签到'};state.collection.push(item);}
  return item;
}
export function addRequest(state,body){
  if(!byId(body.souvenirId))throw new Error('请选择已有纪念品');
  const width=Number(body.width);if(width<40||width>120||!Number.isFinite(width))throw new Error('宽度需要在 40–120 mm 之间');
  if(!['白色 PLA','树脂 · 需询价'].includes(body.material))throw new Error('材料无效');
  const text=clean(body.text).trim().slice(0,100),fingerprint=JSON.stringify([body.souvenirId,width,body.material,text]);
  const existing=state.requests.find(r=>r.fingerprint===fingerprint);if(existing)return existing;
  const req={id:globalThis.crypto.randomUUID(),fingerprint,souvenirId:body.souvenirId,width,material:body.material,text,status:'待询价',created:new Date().toISOString(),quote:null};
  state.requests.push(req);return req;
}
export function addQuote(state,id,body){
  const req=state.requests.find(r=>r.id===id);if(!req)throw new Error('定制需求不存在');
  const supplier=clean(body.supplier).trim(),note=clean(body.note).trim(),price=Number(body.price),days=Number(body.days);
  if(!supplier||supplier.length>80||note.length>200||!Number.isFinite(price)||price<=0||price>100000||!Number.isInteger(days)||days<1||days>365)throw new Error('请填写有效的供应商、报价与交期。');
  const quotes=req.quotes??=[],existing=quotes.find(q=>q.supplier===supplier&&q.price===price&&q.days===days&&q.note===note);
  if(existing)return existing;
  const q={supplier,price,days,note};quotes.push(q);req.quotes=quotes;req.status='已录入报价';return q;
}
function exhibition(value){
  if(!value||typeof value!=='object'||!Array.isArray(value.collection)||value.collection.length>places.length)throw new Error('展览格式无效');
  if(typeof value.title!=='string'||value.title.length>60)throw new Error('展览标题无效');
  const collection=value.collection.map(c=>{
    if(!c||!byId(c.id)||typeof c.story!=='string'||c.story.length>300||typeof c.date!=='string'||c.date.length>30)throw new Error('展品格式无效');
    return {id:c.id,story:c.story,date:c.date};
  });
  return {version:1,title:value.title,collection};
}
export function encodeExhibition(value){const bytes=new TextEncoder().encode(JSON.stringify(exhibition(value)));return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
export function decodeExhibition(value){
  if(typeof value!=='string'||value.length>30000||!value.length||!/^[A-Za-z0-9_-]+$/.test(value))throw new Error('分享链接无效或过长');
  try{const bytes=Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));const parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(parsed.version!==1)throw new Error();return exhibition(parsed);}catch{throw new Error('分享内容无法读取，请重新生成链接');}
}
