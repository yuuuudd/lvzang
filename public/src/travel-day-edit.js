import {normalizeTravelProfile} from './travel-profile.js';
import {buildDailyPlan} from './travel-schedule.js';
import {byId} from './travel-catalog.js';
import {reconcileGuide} from './travel-itinerary-edit.js';

const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const numbers={一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10};
const numeric=value=>{if(Object.hasOwn(numbers,value))return numbers[value];if(/^[一二两三四五六七八九]?十[一二三四五六七八九]?$/.test(value)){const [tens,ones]=value.split('十');return (numbers[tens]||1)*10+(numbers[ones]||0);}return Number(value);};
const ordinal=/第\s*([一二两三四五六七八九十\d]+)\s*天/g;
const unsupported=(dayIndex,reason)=>({dayIndex,changes:{},unsupported:true,reason});

/** Distinguish an explicit local edit from an informational question about a day. */
export function detectTravelDayEdit(text){
 if(typeof text!=='string')return null;
 const days=[...text.matchAll(ordinal)];if(!days.length)return null;
 const dayIndex=numeric(days[0][1]);
 const question=/什么|怎么|哪里|哪儿|为何|为什么|够吗|够不够|吗|[？?]/.test(text);
 const explicitMutation=/改为|改成|调整|请.{0,12}(?:改|安排)|帮我.{0,12}(?:改|安排)/.test(text);
 if(question&&!explicitMutation)return null;
 const modification=/少走|轻松|慢游|休闲|紧凑|充实|多走|徒步|正常节奏|适中|只玩|小时|出发|开始|调整|改|换|加入|移除|取消|删除|不去|去/.test(text);
 if(!modification&&/什么|怎么|哪里|哪儿|为何|为什么|吗|[？?]/.test(text))return null;
 if(new Set(days.map(day=>numeric(day[1]))).size>1)return unsupported(dayIndex,'请一次调整一天，例如“第2天少走一点”；其他日期会继续保留。');
 if(!Number.isInteger(dayIndex)||dayIndex<1||dayIndex>7)return unsupported(dayIndex,'请选择当前行程中的有效日期。');
 if(/(?:不去|想去|去|加入|移除|删除|取消|换成|改去|预算|酒店|住宿|同行|吃|忌口|喜欢|偏好|地铁|公交|打车|骑行)/.test(text))return unsupported(dayIndex,'单日快捷调整支持游览时长、开始时间和强度。修改地点请使用该日地点的加入或移出按钮；需要复杂调整可以说明具体要求。');
 const changes={};
 const hours=text.match(/([一二两三四五六七八九十]+|\d+(?:\.\d+)?)\s*(?:个)?小时/);
 if(hours)changes.hours=numeric(hours[1]);
 if(/少走|轻松|慢游|休闲|不要太累/.test(text))changes.pace='easy';
 else if(/紧凑|充实|多走|徒步/.test(text))changes.pace='active';
 else if(/正常节奏|适中/.test(text))changes.pace='normal';
 const clock=text.match(/(?:(上午|下午|晚上|早上)\s*)?(\d{1,2})[:：](\d{2})/),chineseClock=text.replace(ordinal,'').match(/(?:^|[\s，。；,;]|改为|改成|从|安排在)(上午|下午|晚上|早上)?\s*([一二两三四五六七八九十]+|\d{1,2})点(?:(半)|([一二两三四五六七八九十]+|\d{1,2})分)?/);
 if(clock||chineseClock){
  const match=clock||chineseClock;let hour=numeric(match[2]),minute=clock?Number(match[3]):match[3]?30:numeric(match[4]||'0');
  if(/下午|晚上/.test(match[1]||'')&&hour<12)hour+=12;
  changes.startTime=`${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
 }
 if(/下午|上午|早上|晚上|出发|开始/.test(text)&&!changes.startTime)return unsupported(dayIndex,'请给出这一天的具体开始时间，例如“第2天下午14:00出发”。');
 if(!Object.keys(changes).length)return unsupported(dayIndex,'请说明这一天想改的时长、开始时间或强度，例如“第2天只玩3小时，轻松一点”。');
 return {dayIndex,changes};
}

/** Explicit full-trip settings supersede corresponding local settings. */
export function reconcileDayOverrides(value,changedFields=[],dayCount=7){
 if(changedFields.includes('dayCount'))return {};
 const removed=new Set(changedFields.map(field=>({dailyHours:'hours',startTime:'startTime',pace:'pace'}[field])).filter(Boolean)),result={};
 for(const [key,override]of Object.entries(object(value)?value:{})){
  if(!/^\d+$/.test(key)||Number(key)<1||Number(key)>dayCount||!object(override))continue;
  const retained=Object.fromEntries(Object.entries(override).filter(([field])=>['hours','startTime','pace'].includes(field)&&!removed.has(field)));
  if(Object.keys(retained).length)result[key]=retained;
 }
 return result;
}
const names=stop=>[stop.name,...(stop.aliases||[]),byId(stop.id)?.name,...(byId(stop.id)?.aliases||[])].filter(Boolean).map(name=>name.replace(/\s/g,''));

/** Apply one local change transactionally; a clarification never replaces the saved plan. */
export function applyTravelDayEdit({profile:sourceProfile,currentPlan},edit){
 const profile=normalizeTravelProfile(sourceProfile),mode=['ai','demo'].includes(currentPlan?.mode)?currentPlan.mode:'demo';
 const clarify=reason=>({kind:'clarify',status:'needs-info',mode,profile,followUps:[],trace:[],assistantReply:`${reason} 原方案和其他日期保持不变。`});
 if(!edit||edit.unsupported)return clarify(edit?.reason||'请说明要调整哪一天，以及时长、开始时间或强度。');
 const {dayIndex,changes}=edit,day=currentPlan?.days?.find(item=>item.dayIndex===dayIndex);
 if(!day)return clarify('当前行程没有这一天，请先确认旅行天数或生成每日行程。');
 if(!object(changes)||!Object.keys(changes).length||Object.keys(changes).some(field=>!['hours','startTime','pace'].includes(field)))return clarify('这项单日调整暂不支持，请分别说明时长、开始时间或强度。');
 if(changes.hours!==undefined&&(!Number.isFinite(changes.hours)||changes.hours<1||changes.hours>12||!Number.isInteger(changes.hours*2)))return clarify('单日游览时间请设为1至12小时，按半小时调整。');
 if(changes.startTime!==undefined&&(typeof changes.startTime!=='string'||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(changes.startTime)))return clarify('请使用有效的24小时开始时间，例如14:00。');
 if(changes.pace!==undefined&&!['easy','normal','active'].includes(changes.pace))return clarify('请将当天强度设为轻松、正常或紧凑。');
 const dayOverrides=reconcileDayOverrides(currentPlan.dayOverrides,[],currentPlan.days.length),override={...(dayOverrides[dayIndex]||{}),...changes};
 const local=normalizeTravelProfile(profile);
 local.fields.dayCount={value:1,status:'confirmed'};local.fields.dailyHours={value:override.hours??day.hours,status:'confirmed'};local.fields.startTime={value:override.startTime??day.startTime,status:'confirmed'};
 local.fields.pace={value:override.pace??profile.fields.pace.value??'normal',status:'confirmed'};
 local.fields.requiredPlaces={value:(profile.fields.requiredPlaces.value||[]).filter(name=>day.stops.some(stop=>names(stop).includes(name.replace(/\s/g,'')))),status:'confirmed'};
 try{
  const one=buildDailyPlan({city:currentPlan.city,input:currentPlan.input,stops:day.stops.map(stop=>({...stop,dayIndex:1})),warnings:[],assumptions:[]},local);
  if(day.stops.length&&!one.stops.length)return clarify(`第${dayIndex}天的现有地点无法放入这段时间，请增加时间或明确移出地点。`);
  const adjusted={...day,...one.days[0],dayIndex,title:day.title,stops:one.days[0].stops.map(stop=>({...stop,dayIndex})),...(override.pace?{pace:override.pace}:{})};
  const days=currentPlan.days.map(item=>item.dayIndex===dayIndex?adjusted:item),stops=days.flatMap(item=>item.stops);
  dayOverrides[dayIndex]=override;
  const plan={...currentPlan,kind:'plan',status:'ready',mode,profile,days,stops,dayOverrides,editedDayIndex:dayIndex,totalMinutes:days.reduce((sum,item)=>sum+item.totalMinutes,0),trace:[],warnings:[...(currentPlan.warnings||[]),...one.warnings.map(line=>line.replace(/第1天/g,`第${dayIndex}天`))],assumptions:[...(currentPlan.assumptions||[]).filter(line=>!line.startsWith('每日空余时间尚未排入')),`第${dayIndex}天单独调整；其他日期及全程需求继续沿用。`],assistantReply:`已单独调整第${dayIndex}天：${adjusted.startTime}开始，游览${adjusted.hours}小时，${{easy:'轻松慢游',normal:'正常节奏',active:'充实紧凑'}[local.fields.pace.value]}。其他日期、全程天数与需求保持不变。`,changeSummary:`仅调整第${dayIndex}天`};
  if(currentPlan.guide){plan.guide=reconcileGuide(currentPlan.guide,plan);plan.guide.days=plan.guide.days.map(item=>item.dayIndex===dayIndex?item:currentPlan.guide.days?.find(old=>old.dayIndex===item.dayIndex)||item);}
  return plan;
 }catch(error){return clarify(`第${dayIndex}天无法按这个条件安排：${error.message}`);}
}
