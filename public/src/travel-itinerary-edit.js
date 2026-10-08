import {byId} from './travel-catalog.js';
import * as exploration from './travel-map-exploration.js';
import {mapDestinationKey} from './travel-map-data.js';
import {normalizeTravelProfile,travelProfileInput,travelFollowUps} from './travel-profile.js';
import {buildDailyPlan} from './travel-schedule.js';
import {analyzeNotes} from './travel-domain.js';

const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const key=value=>String(value??'').normalize('NFKC').replace(/\s/g,'').toLowerCase();
const cityKey=mapDestinationKey;
const mapPlace=(city,id)=>exploration.getExplorationLandmark?.(city,id)??exploration.getExplorationLandmarks(city).find(place=>place.id===id)??null;
const searchId=id=>typeof id==='string'&&/^amap-[a-zA-Z0-9_-]{6,80}$/.test(id);
const placeNames=place=>[place?.id,place?.name,place?.shortName,...(place?.aliases??[])].filter(Boolean).map(key);
const matches=(place,name)=>placeNames(place).includes(key(name));
export function isSuggestedItineraryId(id,city){return typeof id==='string'&&(/^[s]uggested-(?:[1-9]|1\d|2[0-8])$/.test(id)||searchId(id)||Boolean(mapPlace(city,id)));}

export function normalizeItineraryEdit(value){
 if(!object(value)||Object.keys(value).some(field=>!['action','stopId','stopName','dayIndex'].includes(field)))throw new Error('行程地点修改字段无效');
 if(!['add','remove'].includes(value.action)||typeof value.stopId!=='string'||value.stopId.length>100||typeof value.stopName!=='string'||!value.stopName.trim()||value.stopName.length>80)throw new Error('行程地点修改格式无效');
 if(value.dayIndex!==undefined&&(!Number.isInteger(value.dayIndex)||value.dayIndex<1||value.dayIndex>7))throw new Error('请选择有效的旅行日期');
 return {...value,stopName:value.stopName.trim()};
}
function manualStop(edit,city,dayIndex){
 const scopedPlace=mapPlace(city,edit.stopId),known=byId(edit.stopId)||scopedPlace;
 // A regional catalog lookup already checks membership, e.g. Lhasa belongs to Tibet.
 if(known&&!scopedPlace&&cityKey(known.city)!==cityKey(city))throw new Error('这个地点不属于当前旅行城市，请先调整目的地');
 if(known&&!matches(known,edit.stopName))throw new Error('地点名称与所选地标不一致，请重新选择');
 if(!known&&!searchId(edit.stopId))throw new Error('这个地点尚未确认，请从地图重新选择');
 if(byId(edit.stopId))return {...known,dayIndex,transit:0,evidence:[],reason:'用户明确加入行程'};
 return {id:edit.stopId,kind:'suggested',city,name:known?.name||edit.stopName,aliases:known?.aliases||[],tags:[],minutes:30,transit:0,dayIndex,estimatedStart:0,story:'你选择加入的地点；具体游览、开放与预约安排待确认。',task:'记录这一站想留下的旅行记忆。',coords:null,source:'',availability:'开放时间、预约、费用与交通未核实',souvenir:'可用照片定制',evidence:[],reason:'用户明确加入；停留与转场使用暂定估算'};
}
const transit=(previous,stop)=>{
 if(!previous)return 0;
 const a=byId(previous.id),b=byId(stop.id);
 if(a&&b)return Math.max(10,Math.ceil(Math.hypot((a.coords[0]-b.coords[0])*111,(a.coords[1]-b.coords[1])*111*Math.cos(a.coords[0]*Math.PI/180))/8*60)+8);
 return 15;
};
// Membership changes preserve useful place details, but invalidate route-wide prose.
// Sources keep their original read status and timestamps; this operation performs no research.
export function reconcileGuide(previous,plan){
 const guide=object(previous)?previous:{},oldDetails=new Map();
 for(const day of Array.isArray(guide.days)?guide.days:[])for(const detail of Array.isArray(day?.stops)?day.stops:[]){
  if(object(detail)&&typeof detail.stopId==='string')oldDetails.set(detail.stopId,detail);
 }
 const available=new Map((Array.isArray(guide.sources)?guide.sources:[]).filter(source=>source&&['fetched','search-snippet'].includes(source.accessStatus)).map(source=>[source.id,source]));
 const retainedIds=new Set(),references=ids=>(Array.isArray(ids)?ids:[]).filter(id=>{if(!available.has(id))return false;retainedIds.add(id);return true;});
 const days=plan.days.map(day=>({dayIndex:day.dayIndex,overview:'',stops:day.stops.map(stop=>{
  const previousDetail=oldDetails.get(stop.id),detail=previousDetail?.name===stop.name?previousDetail:null;
  if(!detail)return {stopId:stop.id,name:stop.name,howToPlay:'此地点的详细玩法、餐饮与预约攻略待补充。可以继续询问，当前路线已保留。',highlights:[],food:[],transport:'',reservation:'',rainyAlternative:'',sourceIds:[]};
  return {stopId:stop.id,name:stop.name,howToPlay:detail.howToPlay||'',highlights:[...(Array.isArray(detail.highlights)?detail.highlights:[])],food:(Array.isArray(detail.food)?detail.food:[]).filter(object).map(food=>({...food,sourceIds:references(food.sourceIds)})),transport:'',reservation:detail.reservation||'',rainyAlternative:detail.rainyAlternative||'',sourceIds:references(detail.sourceIds)};
 })}));
 return {status:'partial',summary:'行程安排已调整；保留未变地点的玩法，缺少的详细攻略可继续补充。站间交通需按新路线重新确认。',days,sources:[...available.values()].filter(source=>retainedIds.has(source.id)).map(source=>({...source})),researchStatus:guide.researchStatus||'not-requested',warnings:['本次仅调整行程安排，没有重新查询攻略或交通；营业、预约和价格仍需临行确认。'],...(guide.generatedAt?{generatedAt:guide.generatedAt}:{})};
}
export function applyItineraryEdit({profile:sourceProfile,currentPlan,notes=[]},rawEdit){
 const edit=normalizeItineraryEdit(rawEdit),profile=normalizeTravelProfile(sourceProfile),city=profile.fields.destination.value||currentPlan?.city,mode=['ai','demo'].includes(currentPlan?.mode)?currentPlan.mode:'demo';
 if(!city||profile.fields.dayCount.status!=='confirmed'||profile.fields.dailyHours.status!=='confirmed')throw new Error('请先确认旅行城市、天数和每天可用时间，再加入或移出地点');
 if(currentPlan&&cityKey(currentPlan.city)!==cityKey(city))throw new Error('已保存路线与当前城市不同，请先生成当前城市的行程');
 const input=travelProfileInput(profile,currentPlan?.input??{}),oldStops=Array.isArray(currentPlan?.stops)?currentPlan.stops:[];
 if(oldStops.length>28)throw new Error('行程地点数量过多，请先调整行程');
 const existing=oldStops.find(stop=>stop.id===edit.stopId);
 if(existing&&!matches({...existing,aliases:[...(existing.aliases||[]),...(byId(existing.id)?.aliases||[])]},edit.stopName))throw new Error('地点名称与行程记录不一致，请重新选择');
 if(edit.action==='remove'&&!existing||edit.action==='add'&&existing)return {kind:'answer',status:'answered',mode,profile,trace:[],assistantReply:edit.action==='remove'?'该地点已经不在行程中。':'该地点已经在行程中。'};
 const dayIndex=edit.dayIndex??1;
 if(dayIndex>input.dayCount)throw new Error('选择的日期超出旅行天数，请先调整天数');
 const target=edit.action==='add'?manualStop(edit,city,dayIndex):{...existing,aliases:[...(existing.aliases||[]),...(byId(existing.id)?.aliases||[])]};
 const required=profile.fields.requiredPlaces.value??[],excluded=profile.fields.excludedPlaces.value??[];
 const nextRequired=required.filter(name=>!matches(target,name)),nextExcluded=excluded.filter(name=>!matches(target,name));
 if(edit.action==='add')nextRequired.push(target.name);else nextExcluded.push(target.name);
 if(edit.action==='add'||required.some(name=>matches(target,name)))profile.fields.requiredPlaces={value:nextRequired,status:'confirmed'};
 if(edit.action==='remove'||excluded.some(name=>matches(target,name)))profile.fields.excludedPlaces={value:nextExcluded,status:'confirmed'};
 profile.revision++;profile.followUps=travelFollowUps(profile);
 const candidates=edit.action==='add'?[...oldStops.map(stop=>({...stop})),target]:oldStops.filter(stop=>stop.id!==target.id).map(stop=>({...stop}));
 const lastByDay=new Map();for(const stop of candidates){stop.dayIndex=stop.dayIndex??1;stop.transit=transit(lastByDay.get(stop.dayIndex),stop);lastByDay.set(stop.dayIndex,stop);}
 const warnings=['开放时间、预约、费用与实际交通尚未核实；预算保留为规划上限。'];
 const assumptions=['各站转场为粗略估算，包含非目录地点的转场暂按15分钟；出发前请核对实际路线。'];
 if(candidates.some(stop=>!byId(stop.id)))assumptions.push('手动加入的地图地点暂按停留30分钟估算，可继续通过对话调整。');
 const base={...(currentPlan??{}),kind:'plan',status:'ready',mode,city,title:currentPlan?.title||`${city}${input.dayCount}天定制行程`,input,analysis:currentPlan?.analysis||analyzeNotes(notes),days:undefined,stops:candidates,transport:'游览与转场时间为估算，出发前确认',warnings,assumptions,trace:[]};
 const plan=buildDailyPlan(base,profile);
 // Only a day emptied by this explicit removal becomes free time. Existing gaps remain unfinished.
 const previousFree=new Set(currentPlan?.planningCoverage?.freeDays||[]);
 const removedDay=existing?.dayIndex??currentPlan?.days?.find(day=>day.stops.some(stop=>stop.id===existing?.id))?.dayIndex??1;
 if(edit.action==='remove'&&!plan.days.find(day=>day.dayIndex===removedDay)?.stops.length)previousFree.add(removedDay);
 const coveredDays=plan.days.filter(day=>day.stops.length).map(day=>day.dayIndex);
 const freeDays=plan.days.filter(day=>!day.stops.length&&previousFree.has(day.dayIndex)).map(day=>day.dayIndex);
 const missingDays=plan.days.filter(day=>!day.stops.length&&!previousFree.has(day.dayIndex)).map(day=>day.dayIndex);
 plan.planningCoverage={status:missingDays.length?'partial':'complete',requestedDays:input.dayCount,coveredDays,missingDays,freeDays,supplementAttempts:currentPlan?.planningCoverage?.supplementAttempts===1?1:0};
 plan.warnings=plan.warnings.filter(warning=>!/^现有地点资料有限，.*尚未安排地点；没有重复地点来填满行程。$/.test(warning));
 if(missingDays.length)plan.warnings.push(`${missingDays.map(day=>`第${day}天`).join('、')}尚未安排具体地点，需要继续补充行程。`);
 if(currentPlan?.guide||edit.action==='add')plan.guide=reconcileGuide(currentPlan?.guide,plan);
 if(plan.stops.length!==candidates.length)throw new Error('这一天的时间或游玩强度无法容纳全部地点，请先增加每日时间、放宽强度，或移出一个地点后重试');
 return {...plan,kind:'plan',status:'ready',mode,trace:[],assistantReply:edit.action==='add'?`已将${target.name}加入第${dayIndex}天行程，其他旅行条件继续沿用。`:`已将${target.name}移出行程，并记录为避开地点；需要时可明确重新加入。`,changeSummary:edit.action==='add'?`加入${target.name}`:`移出${target.name}`};
}
