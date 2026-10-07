import {normalizeTravelProfile,travelProfileInput} from './travel-profile.js';
import {byId} from './travel-catalog.js';

const nameKey=value=>String(value??'').trim().replace(/[\s·•]/g,'').replace(/市$/,'');
function stopNames(stop){const known=byId(stop.id);return [...new Set([stop.name,...(stop.aliases??[]),known?.name,...(known?.aliases??[])].filter(Boolean).map(nameKey))];}
function matches(stop,name){const known=byId(name);return stopNames(stop).some(candidate=>candidate===nameKey(name)||(known&&candidate===nameKey(known.name)));}
function timeValue(value,label,max){if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>max)throw new Error(`${label}格式无效`);return Math.round(value);}

export function buildDailyPlan(plan,value){
  if(!plan||typeof plan!=='object'||Array.isArray(plan))throw new Error('每日方案格式无效');
  const profile=normalizeTravelProfile(value),input=travelProfileInput(profile,plan.input??{}),dayCount=input.dayCount,dailyMinutes=Math.round(input.dailyHours*60),pace=profile.fields.pace.value??(input.easy?'easy':'normal'),maxStops=pace==='easy'?2:pace==='active'?4:3;
  const source=Array.isArray(plan.days)&&plan.days.length?plan.days.flatMap((day,index)=>{if(!day||!Array.isArray(day.stops))throw new Error('每日地点格式无效');return day.stops.map(stop=>({...stop,dayIndex:stop.dayIndex??day.dayIndex??index+1}));}):plan.stops;
  if(!Array.isArray(source)||source.length>28)throw new Error('每日方案最多安排 28 个停留点');
  const required=profile.fields.requiredPlaces.value??[],excluded=profile.fields.excludedPlaces.value??[];
  const candidates=[],seen=new Set();
  for(const raw of source){
    if(!raw||typeof raw!=='object'||typeof raw.name!=='string'||!raw.name.trim())throw new Error('每日地点格式无效');
    const stop={...raw,name:raw.name.trim(),minutes:timeValue(raw.minutes,'游览时长',720),transit:timeValue(raw.transit??0,'转场时长',720)};
    if(stop.minutes<1)throw new Error(`${stop.name}的游览时长需要大于零`);
    const catalogCity=byId(stop.id)?.city;
    if(input.destination&&((stop.city&&nameKey(stop.city)!==nameKey(input.destination))||(catalogCity&&nameKey(catalogCity)!==nameKey(input.destination))))throw new Error(`地点“${stop.name}”不属于${input.destination}，请修订路线`);
    if(stop.dayIndex!==undefined&&(!Number.isInteger(stop.dayIndex)||stop.dayIndex<1||stop.dayIndex>dayCount))throw new Error('地点的旅行日序号无效');
    if(excluded.some(name=>matches(stop,name)))throw new Error(`方案包含你要求避开的“${stop.name}”，请修订路线`);
    const key=stop.id&&!stop.id.startsWith('suggested-')?stop.id:nameKey(stop.name);
    if(seen.has(key))continue;seen.add(key);candidates.push(stop);
  }
  const missing=required.filter(name=>!candidates.some(stop=>matches(stop,name)));
  if(missing.length)throw new Error(`必去地点“${missing.join('、')}”尚未安排，请补充这些地点或明确放宽必去要求`);
  const requiredStops=new Set(candidates.filter(stop=>required.some(name=>matches(stop,name))));
  const days=Array.from({length:dayCount},(_,index)=>({dayIndex:index+1,title:`第 ${index+1} 天`,startTime:input.startTime,hours:input.dailyHours,stops:[],totalMinutes:0,freeMinutes:dailyMinutes}));
  const clock=input.startTime.split(':').map(Number),startMinutes=clock[0]*60+clock[1];
  if(startMinutes+dailyMinutes>24*60)throw new Error('每日可用时间会跨过午夜，请缩短当天时长或提前开始时间');
  const skipped=[];
  const add=(day,stop)=>{
    const transit=day.stops.length?stop.transit:0;
    if(day.stops.length>=maxStops||day.totalMinutes+transit+stop.minutes>dailyMinutes)return false;
    const estimatedStart=day.totalMinutes+transit;
    const item={...stop,dayIndex:day.dayIndex,transit,estimatedStart,clockStart:`${String(Math.floor((startMinutes+estimatedStart)/60)).padStart(2,'0')}:${String((startMinutes+estimatedStart)%60).padStart(2,'0')}`};
    day.stops.push(item);day.totalMinutes+=transit+stop.minutes;day.freeMinutes=dailyMinutes-day.totalMinutes;return true;
  };
  // Allocate mandatory candidates first, preserving their relative order. Optional stops
  // use the remaining capacity; no mandatory point silently disappears due to a greedy prefix.
  for(const stop of [...candidates.filter(item=>requiredStops.has(item)),...candidates.filter(item=>!requiredStops.has(item))]){
    const eligible=stop.dayIndex!==undefined?[days[stop.dayIndex-1]]:[...days].sort((a,b)=>a.totalMinutes-b.totalMinutes||a.stops.length-b.stops.length||a.dayIndex-b.dayIndex);
    if(!eligible.some(day=>add(day,stop))){
      if(requiredStops.has(stop))throw new Error(`必去地点“${stop.name}”无法放入${dayCount}天、每天${input.dailyHours}小时的${pace==='easy'?'轻松':''}安排；请增加可用时间、调整天数、放宽每日节奏或减少必去地点`);
      skipped.push(stop.name);
    }
  }
  // Preserve the original proposed order within each day, then recompute clocks/transit.
  const order=new Map(candidates.map((stop,index)=>[stop,index]));
  for(const day of days){
    const allocated=day.stops.map(item=>({item,original:candidates.find(stop=>stop.name===item.name)})).sort((a,b)=>order.get(a.original)-order.get(b.original));
    day.stops=[];day.totalMinutes=0;day.freeMinutes=dailyMinutes;
    for(let index=0;index<allocated.length;index++){
      const {original}=allocated[index],remaining=allocated.slice(index+1).map(entry=>entry.original).filter(stop=>requiredStops.has(stop));
      const reserve=remaining.reduce((sum,stop)=>sum+stop.minutes+stop.transit,0),cost=original.minutes+(day.stops.length?original.transit:0);
      if(!requiredStops.has(original)&&(day.totalMinutes+cost+reserve>dailyMinutes||day.stops.length+1+remaining.length>maxStops)){skipped.push(original.name);continue;}
      if(!add(day,original)){
        if(requiredStops.has(original))throw new Error(`第${day.dayIndex}天必去地点的转场与游览超过每日可用时间，请调整路线顺序或增加时间`);
        skipped.push(original.name);
      }
    }
  }
  const stops=days.flatMap(day=>day.stops),warnings=[...(Array.isArray(plan.warnings)?plan.warnings:[])],assumptions=[...(Array.isArray(plan.assumptions)?plan.assumptions:[])];
  if(skipped.length)warnings.push(`受每日时间与旅行节奏限制，暂未安排：${skipped.join('、')}。这些是可选地点，可继续调整。`);
  const spare=days.filter(day=>day.freeMinutes>0);
  if(spare.length)assumptions.push(`每日空余时间尚未排入餐饮、休息及起终点交通：${spare.map(day=>`第${day.dayIndex}天${day.freeMinutes}分钟`).join('，')}。`);
  const empty=days.filter(day=>!day.stops.length);
  if(empty.length)warnings.push(`现有地点资料有限，${empty.map(day=>`第${day.dayIndex}天`).join('、')}尚未安排地点；没有重复地点来填满行程。`);
  if(profile.fields.dailyHours.status==='missing')assumptions.push(`每日可用时长暂按${input.dailyHours}小时安排，待你确认。`);
  if(profile.fields.startTime.status==='missing')assumptions.push(`每日暂从${input.startTime}开始，待你确认。`);
  return {...plan,input,profile,days,stops,totalMinutes:days.reduce((sum,day)=>sum+day.totalMinutes,0),warnings:[...new Set(warnings)],assumptions:[...new Set(assumptions)]};
}
