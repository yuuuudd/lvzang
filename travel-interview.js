import {normalizeTravelProfile,updateTravelProfile,travelProfileSummary,TRAVEL_INTERVIEW_TOPICS} from './public/src/travel-profile.js';

const questions={
  destination:'这次想去哪个城市或目的地？',
  travelDates:'预计哪年几月几日出发、哪天结束？例如“2026年11月1日到11月3日”。如果只确定玩几天，也可以先说“3天”，具体日期留待补充。',
  dayCount:'这次一共准备玩几天？只玩半天也可以告诉我。',
  dailyHours:'每天大概能安排几小时游览？',
  startTime:'每天大约几点开始游玩？例如早上9点、下午2点半。',
  companions:'这次一共几个人？有小孩、老人或需要特别照顾的同行人吗？',
  budget:'这次预算大概多少？请说明是每人还是全团、全程还是每天；也可以说“不限预算”。',
  crowdPreference:'你偏爱热门经典、小众人少，还是两种都安排？',
  interests:'最想体验什么？比如美食、建筑、历史、自然、购物或拍照，也可以说其他兴趣。',
  requiredPlaces:'有没有特别想去、一定要保留的地方？没有也可以直接说“没有必去”。',
  excludedPlaces:'有没有不想去、希望避开的地方？没有可以说“没有排除”。',
  pace:'希望轻松少走、适中安排，还是紧凑多玩？',
  diet:'喜欢吃什么？有没有忌口或过敏？没有忌口也可以直接说。',
  stayArea:'大概住在哪个区域？没订好可以说“还没确定”。',
  startArea:'每天从哪里出发？可以说酒店区域、车站或大致位置。',
  transport:'主要怎样出行：步行、地铁公交、自驾、打车、骑行，还是混合？'
};
const startPattern=/(?:开始|开启|完整|固定|全部|系统)(?:的)?(?:旅行)?(?:问答|采访)|把.{0,12}(?:都问|问一遍)|(?:重新|从头)(?:了解|梳理|询问|问|采访|定制)|(?:深入|详细)(?:了解|询问|采访|定制)|再问我.*(?:偏好|需求)|补(?:全|齐|充).{0,8}(?:旅行)?偏好|继续了解我/;
const ordinaryQuestion=text=>(/[?？]|吗|哪里|哪儿|什么|怎么|为何|为什么|多少|有啥|有哪些|是否|能否/.test(text)||/^(?:请|帮我)?(?:介绍|解释|说说|讲讲|科普|推荐一下)/.test(text))&&!/(?:我想|请|帮我|希望).*(?:补充|完善|丰富|更新).*攻略/.test(text);
const undetermined=text=>/^(?:(?:这(?:个|题|项)|现在|目前|暂时|先|还|我|也|都|不太|没|尚未)\s*)*(?:跳过|未定|没定|没确定|不确定|没想好|不知道|待定|没订好|不清楚|以后再说|还没确定)[。！!\s]*$/.test(text);
const shortAnswer=text=>text.length<=80&&!/[，。；,;\n]/.test(text);

function complete(profile,field){
  const record=profile.fields[field],value=record.value;
  if(record.status!=='confirmed')return false;
  if(field==='budget')return value.amount===null?value.scope==='unknown'&&value.period==='unknown':value.scope!=='unknown'&&value.period!=='unknown';
  if(field==='companions')return value.count!==null;
  if(field==='diet')return value.restrictions!==null;
  return true;
}
function question(profile,field){
  if(field==='diet'&&profile.fields.diet.value?.restrictions===null)return '饮食口味已记下。还有什么忌口或过敏吗？没有忌口可以直接说。';
  if(field==='budget'&&profile.fields.budget.value?.amount===null)return '预算金额大概多少元？也可以说“不限预算”。';
  if(field==='budget'&&profile.fields.budget.value?.amount!=null){const value=profile.fields.budget.value;return value.scope==='unknown'&&value.period==='unknown'?'这笔预算是每人还是全团、全程还是每天？':value.scope==='unknown'?'这笔预算是每人还是全团的预算？':'这笔预算是全程还是每天的预算？';}
  return questions[field];
}
function progress(profile,skipped=profile.interview?.skipped??[]){
  skipped=skipped.filter(field=>!complete(profile,field));
  const topic=TRAVEL_INTERVIEW_TOPICS.find(field=>!complete(profile,field)&&!skipped.includes(field))??null;
  return normalizeTravelProfile({...profile,interview:{status:topic?'active':'ready',topic,skipped},followUps:topic?[{field:topic,question:question(profile,topic)}]:[]});
}
function summary(profile){
  const rows=travelProfileSummary(profile).filter(row=>row.status!=='missing').map(row=>`${row.label}：${row.value}${row.status==='tentative'?'（暂定）':''}`);
  const skipped=profile.interview.skipped;
  const unresolved=skipped.length?`\n暂未确定：${skipped.map(field=>({travelDates:'日期',startTime:'出发时间',stayArea:'住宿区域',startArea:'出发区域'}[field]??travelProfileSummary(profile)[Object.keys(profile.fields).indexOf(field)]?.label??field)).join('、')}。`:'';
  return `旅行问答已完成，已记录：\n${rows.join('；')||'暂时没有确定条件'}。${unresolved}\n你还可以继续补充或修改。要按这些条件生成或更新攻略吗？确认后说“开始规划”，我再安排路线。`;
}
function response(profile,body,prefix=''){
  const ready=profile.interview.status==='ready';
  return {kind:'clarify',status:'needs-info',profile,followUps:profile.followUps,mode:body.mode==='ai'?'ai':'demo',trace:[],assistantReply:ready?summary(profile):[prefix||'已记下，继续下一项。',profile.followUps[0]?.question].filter(Boolean).join('\n')};
}
function contextualText(text,profile){
  const field=profile.interview.topic;
  if(field==='travelDates'&&/\d{4}[-/年]/.test(text)){
    const year=text.match(/(\d{4})[-/年]/)[1];
    return `旅行日期${text.replace(/(到|至)\s*(\d{1,2})月/g,`$1${year}年$2月`)}`;
  }
  if(field==='interests'&&text.length<=120&&!/预算|每天|同行|不吃|住在|出发|想去|不去|必去|加上|加入|取消|小时|几天|\d/.test(text))return /^(?:没有|无|都行|都可以|无所谓|不挑)$/.test(text)?'没有特别兴趣':`喜欢${text.replace(/^(?:我(?:们)?(?:很|比较)?)?(?:喜欢|兴趣(?:是|为)?|偏好)/,'').replace(/(?:都喜欢|都感兴趣)$/,'').replace(/[，,]/g,'、')}`;
  if(!shortAnswer(text))return text;
  if(field==='destination'&&/^[\p{L}·\s]{2,40}$/u.test(text)&&!/(?:喜欢|不去|必去|小众|人|天|小时)/.test(text))return `目的地是${text}`;
  if(field==='companions'&&/^[一二两三四五六七八九十\d]+$/.test(text))return `${text}人`;
  if(field==='startTime'&&/^[一二两三四五六七八九十\d]+(?:点(?:半)?)?$/.test(text))return `开始${text.replace(/点(?:半)?$/,'')}${/半/.test(text)?'点半':'点'}`;
  if(field==='budget'&&/^(?:不限|无上限|没有上限|不设上限)$/.test(text))return '预算不限';
  if(field==='crowdPreference'){
    if(/热门|大众|小众|冷门/.test(text)&&/都|结合|兼顾|混合/.test(text))return '喜欢热门和小众都安排';
    if(/^(?:都行|都可以|均可|无所谓|随意)$/.test(text))return '大众小众都可以';
  }
  if(['requiredPlaces','excludedPlaces'].includes(field)&&!/(?:预算|每天|同行|不吃|住在|出发|小时|\d)/.test(text)){
    if(/^(?:没有|无|暂无|没有特别的|没什么|都可以)$/.test(text))return field==='requiredPlaces'?'没有必去':'没有排除';
    if(!/想去|不去|避开|必去|排除|保留|加上|加入|删除|取消/.test(text))return `${field==='requiredPlaces'?'必去':'避开'}${text.replace(/[、]/g,'、')}`;
  }
  if(field==='diet'){
    if(/^(?:没有|无|都可以|没有过敏|不挑食)$/.test(text))return '没有忌口';
    if(!/喜欢|爱吃|想吃|口味|不吃|不能吃|过敏|忌口|忌|预算|住在|天|小时/.test(text))return `喜欢${text}`;
  }
  if(field==='stayArea'&&!/住在|住宿|酒店|从|出发|预算|每天|想去|不吃/.test(text))return `住在${text}`;
  if(field==='startArea'&&!/出发|每天|预算|想去|不吃/.test(text))return `从${text}出发`;
  if(field==='transport'&&text==='步行')return '步行为主';
  return text;
}

// A fixed interview is local state orchestration, not an invitation for the model
// to generate a route. Accepted plans are never changed by these responses.
export function handleTravelInterview(body){
  const profile=normalizeTravelProfile(body.profile),text=body.description.trim(),state=profile.interview;
  let action=body.interviewAction;
  if(action!==undefined&&!['start','resume','skip','pause','plan'].includes(action))throw new Error('旅行问答操作无效');
  if(!action){
    if(startPattern.test(text))action='start';
    else if(state&&/^(?:请|先)?(?:暂停|先不问|暂停问答|暂停采访|停止问答|先聊别的)[。！!\s]*$/.test(text))action='pause';
    else if(state&&/^(?:继续问答|继续采访|继续问|恢复问答)[。！!\s]*$/.test(text))action='resume';
    else if(state&&/^(?:请|那就|现在|确认|可以)?\s*(?:开始规划|生成攻略|生成行程|按这些条件(?:规划|安排|生成|更新)(?:攻略|行程)?)[。！!\s]*$/.test(text))action='plan';
    else if(state?.status==='active'&&undetermined(text))action='skip';
  }
  if(!action&&(!state||['paused','completed'].includes(state.status)||ordinaryQuestion(text)))return null;
  if(action==='start'||action==='resume'){
    const next=progress(profile,state?.status==='completed'&&action==='start'?[]:state?.skipped??[]);
    return {response:response(next,body,'我们按顺序逐项了解；已确认的会跳过。原行程先保留，任何一题都能跳过或暂停。')};
  }
  if(action==='pause'){
    if(!state)return null;
    const next=normalizeTravelProfile({...profile,followUps:[],interview:{...state,status:'paused'}});
    return {response:{...response(next,body,'问答已暂停，进度已保存。你可以自由补充或提问，想继续时说“继续问答”。'),kind:'answer',status:'answered'}};
  }
  if(action==='plan'){
    if(!state)return null;
    const needed=['destination','dayCount','dailyHours'].find(field=>!complete(profile,field));
    if(needed){const next=normalizeTravelProfile({...profile,interview:{...state,status:'active',topic:needed,skipped:state.skipped.filter(field=>field!==needed)},followUps:[{field:needed,question:question(profile,needed)}]});return {response:response(next,body,'开始规划前，还需要确认这一项必要条件；其他未定项会继续保留。')};}
    return {body:{...body,profile:normalizeTravelProfile({...profile,followUps:[],interview:{...state,status:'completed',topic:null}})}};
  }
  if(action==='skip'){
    if(state?.status!=='active')return {response:response(profile,body,'当前没有待跳过的问题。')};
    return {response:response(progress(profile,[...new Set([...state.skipped,state.topic])]),body,'这项先记为未确定，不替你作假设。')};
  }
  if(!['active','ready'].includes(state?.status))return null;
  let updated;
  try{
    const direct=updateTravelProfile(profile,{text});
    // A free addition about another field is not a short answer to this topic.
    // Only attach the question's context when it would not reinterpret that fact.
    const expanded=state.status==='active'&&(!direct.changes.length||direct.changes.includes(state.topic))?contextualText(text,profile):text;
    updated=updateTravelProfile(profile,{text:expanded});
    // An explicit open-ended interest answer is valid even outside the built-in tags.
    if(state.topic==='interests'&&expanded.startsWith('喜欢')){
      const interests=expanded.slice(2).split(/[、，,和]/).map(item=>item.trim()).filter(Boolean);
      if(interests.length)updated.profile=normalizeTravelProfile({...updated.profile,fields:{...updated.profile.fields,interests:{value:interests,status:'confirmed'}}});
    }
    if(state.topic==='interests'&&expanded==='没有特别兴趣')updated=updateTravelProfile(profile,{text:'兴趣没有特别限制',patch:{interests:[]}});
    const foodPattern=state.topic==='diet'?/(?<!不)(?:喜欢(?:吃)?|爱吃|想吃|口味(?:是|为))\s*([^，。；,;\n]{1,40})/g:/(?<!不)(?:喜欢吃|爱吃|想吃|口味(?:是|为))\s*([^，。；,;\n]{1,40})/g;
    const foods=[...expanded.matchAll(foodPattern)].flatMap(match=>match[1].split('、')).map(item=>item.trim()).filter(item=>item&&!/不吃|忌口|过敏|什么|哪/.test(item));
    if(foods.length)updated=updateTravelProfile(updated.profile,{text:expanded,patch:{diet:{preferences:[...new Set([...(updated.profile.fields.diet.value?.preferences??[]),...foods])]}}});
    updated.changed=Object.keys(profile.fields).some(field=>JSON.stringify(profile.fields[field])!==JSON.stringify(updated.profile.fields[field]));
    updated.profile.revision=profile.revision+(updated.changed?1:0);
  }catch(error){return {response:response(profile,body,`这项还没记下：${error.message}。可以换一种说法，或先跳过。`)};}
  // Travelers commonly answer the calendar question with a trip duration. An
  // explicit duration is useful even when identical to the saved value; defer
  // only the still-unknown calendar dates instead of repeating the same question.
  const durationAnswer=/^(?:(?:我(?:们)?|这次|准备|计划|一共|总共|想|要|玩|游玩|旅行|安排|大概|约|改成|改为)\s*)*[一二两三四五六七八九十\d]+\s*(?:天|日)(?:\s*[一二两三四五六七八九十\d]+\s*(?:晚|夜))?(?:左右|吧|就行|就好)?[。！!\s]*$/.test(text);
  if(state.status==='active'&&state.topic==='travelDates'&&durationAnswer&&!complete(updated.profile,'travelDates')&&complete(updated.profile,'dayCount')){
    const next=progress(updated.profile,[...new Set([...state.skipped,'travelDates'])]);
    return {response:response(next,body,`已记下玩${updated.profile.fields.dayCount.value}天；具体日期先留待补充。`)};
  }
  if(state.status==='ready'){
    const next=normalizeTravelProfile({...updated.profile,followUps:[],interview:{...state,skipped:state.skipped.filter(field=>!complete(updated.profile,field))}});
    return {response:response(next,body)};
  }
  const next=progress(updated.profile);
  const budget=updated.profile.fields.budget.value;
  const budgetAnswer=/^(?:(?:预算|大概|约|是|改为|改成|人均|每人|全团|全程|每天)\s*)*[¥￥]?[零一二两三四五六七八九十百千万\d]+(?:\.\d+)?\s*(?:元|块)?[。！!\s]*$/.test(text)||/^(?:是|按)?(?:(?:人均|每人|全团|全组|全程|整趟|每天|每日)\s*)+[。！!\s]*$/.test(text);
  if(state.topic==='budget'&&next.interview.topic==='budget'&&budget&&(updated.changes.includes('budget')||budgetAnswer)){
    const basis=[{'per-person':'每人',group:'全团'}[budget.scope],{trip:'全程',day:'每天'}[budget.period]].filter(Boolean).join('、');
    return {response:response(next,body,`已记下${budget.amount!=null?`预算${budget.amount}元`:`预算口径：${basis}`}。`)};
  }
  return {response:response(next,body,updated.changed?'已记下你补充的条件，已回答的项目会自动跳过。':'这一项还没有足够明确的信息。可以直接回答，或说“跳过”。')};
}

export function preserveTravelInterview(result,previous){
  if(previous?.interview?.status!=='active'||!result?.profile||result.profile.interview?.status!=='active')return result;
  const profile=progress(result.profile);
  return {...result,profile,...(result.kind==='plan'?{input:{...result.input,profile}}:{}),...(result.followUps?{followUps:profile.followUps}:{})};
}
