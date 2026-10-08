import test from 'node:test';
import assert from 'node:assert/strict';
import {chatTravel} from '../travel-agent.js';
import {handleTravelInterview,applyTravelInterviewSynthesis} from '../travel-interview.js';
import {emptyTravelProfile,normalizeTravelProfile,updateTravelProfile,TRAVEL_INTERVIEW_TOPICS} from '../public/src/travel-profile.js';
import {buildDailyPlan} from '../public/src/travel-schedule.js';
import {normalizeRequest,planFromCatalog} from '../public/src/travel-domain.js';
import {validateTravelGuide} from '../travel-advisor.js';

const noModel={advisorEnabled:true,key:'fixture',fetchImpl:async()=>{throw Error('Collection must never call a model');}};
const call=(profile,description,interviewAction,extra={},options=noModel)=>chatTravel({profile,description,mode:'ai',textRevision:true,...(interviewAction?{interviewAction}:{}),...extra},options);
const atTopic=topic=>normalizeTravelProfile({...emptyTravelProfile(),interview:{status:'active',topic,skipped:TRAVEL_INTERVIEW_TOPICS.slice(0,TRAVEL_INTERVIEW_TOPICS.indexOf(topic)),answers:[],additions:[]},followUps:[{field:topic,question:'当前问题？'}]});
const model=content=>Response.json({choices:[{message:{content:typeof content==='string'?content:JSON.stringify(content)}}]});
function savedTrip(){
  const profile=updateTravelProfile(emptyTravelProfile(),{text:'广州3天，每天4小时，正常节奏'}).profile;
  const plan=buildDailyPlan({...planFromCatalog(normalizeRequest({destination:'广州',hours:4}),undefined,{placeIds:['gz-museum','gz-square','gz-opera']}),mode:'ai',trace:[]},profile);
  plan.guide=validateTravelGuide({summary:'已保存攻略',days:plan.days.map(day=>({dayIndex:day.dayIndex,overview:'按既定顺序游玩。',stops:day.stops.map(stop=>({stopId:stop.id,name:stop.name,howToPlay:'结合现场展览自由参观。',highlights:[],food:[],transport:'交通待核实',reservation:'预约待核实',rainyAlternative:'下雨时缩短户外活动。',sourceIds:[]}))}))},plan,{status:'not-requested',sources:[],errors:[]});
  return plan;
}
const answers={destination:'广州',travelDates:'日期还没想好',dayCount:'一周',dailyHours:'每天25小时',startTime:'睡醒再说',companions:'2',budget:'500',crowdPreference:'都安排',interests:'美食、建筑，还有别的',requiredPlaces:'没什么特别想去的',excludedPlaces:'没有不想去的',pace:'可以轻松一点吗？',diet:'清淡就好',stayArea:'还没订',startArea:'不知道',transport:'都可以'};
async function collect(values=answers){let result=await call(emptyTravelProfile(),'开始完整问答','start');const seen=[];while(result.profile.interview.status==='active'){const field=result.profile.interview.topic;assert.ok(!seen.includes(field));seen.push(field);result=await call(result.profile,values[field]);}return {result,seen};}

test('restart keeps only the selected destination and actively starts at question one without calling a model',async()=>{
  const plan=savedTrip(),oldProfile=updateTravelProfile(plan.profile,{text:'预算每人全程500元，必去广州塔，不去陈家祠，住在广州东，从珠江新城出发，地铁出行'}).profile;
  oldProfile.interview={status:'ready',topic:null,answers:[{field:'interests',question:'想体验什么？',answer:'广州美食购物'}],additions:['再去天环'],skipped:['diet'],step:16,total:16};
  oldProfile.revision=27;
  const before=JSON.stringify({plan,oldProfile});
  const result=await call(oldProfile,'刷新目的地','restart',{destination:' 西藏 ',currentPlan:plan,previous:plan.input,history:[{role:'user',content:'广州3天，每天4小时'}],notes:'旧广州攻略'});
  assert.equal(result.kind,'clarify');assert.equal(result.stops,undefined);assert.equal(result.profile.revision,0);
  assert.deepEqual(result.profile.fields,{...emptyTravelProfile().fields,destination:{value:'西藏',status:'confirmed'}});
  assert.deepEqual(result.profile.interview.answers,[]);assert.deepEqual(result.profile.interview.additions,[]);assert.deepEqual(result.profile.interview.skipped,[]);
  assert.equal(result.profile.interview.status,'active');assert.equal(result.profile.interview.topic,'destination');assert.equal(result.profile.interview.step,1);assert.equal(result.profile.interview.total,16);
  assert.equal(result.profile.interview.pendingQuestion.field,'destination');assert.equal(result.followUps[0].question,result.profile.interview.pendingQuestion.question);
  assert.match(result.followUps[0].question,/西藏/);assert.match(result.followUps[0].question,/城市|地点/);
  assert.match(result.assistantReply,/开始.*西藏.*16/);assert.match(result.assistantReply,/旧行程.*保留/);assert.match(result.assistantReply,/不沿用旧条件/);
  assert.equal(JSON.stringify({plan,oldProfile}),before);
  const resumed=await call(normalizeTravelProfile(JSON.parse(JSON.stringify(result.profile))),'','resume');
  assert.equal(resumed.profile.interview.topic,'destination');assert.equal(resumed.followUps[0].question,result.followUps[0].question);
});

test('restart collects all sixteen new topics verbatim with skip and never restores old conditions',async()=>{
  let result=await call(savedTrip().profile,'','restart',{destination:'杭州'});
  const seen=[];
  while(result.profile.interview.status==='active'){
    const topic=result.profile.interview.topic;assert.ok(!seen.includes(topic));seen.push(topic);
    result=topic==='travelDates'?await call(result.profile,'','skip'):await call(result.profile,topic==='destination'?'  杭州，想先去西湖附近  ':`新旅行的${topic}回答`);
  }
  assert.deepEqual(seen,TRAVEL_INTERVIEW_TOPICS);assert.equal(result.profile.interview.status,'ready');assert.equal(result.profile.interview.answers.length,15);
  assert.deepEqual(result.profile.interview.skipped,['travelDates']);assert.equal(result.profile.interview.answers[0].answer,'  杭州，想先去西湖附近  ');
  assert.deepEqual(result.profile.fields,{...emptyTravelProfile().fields,destination:{value:'杭州',status:'confirmed'}});
  assert.equal(result.profile.interview.pendingQuestion,undefined);
});

test('restart requires its explicit destination and does not fall back to the previous trip',()=>{
  const body={profile:savedTrip().profile,description:'',interviewAction:'restart'};
  for(const destination of [undefined,null,'', '   ',42,'城'.repeat(41)])assert.throws(()=>handleTravelInterview({...body,destination}),/目的地/);
});

test('all sixteen raw answers advance locally without semantic gates or changes to structured fields',async()=>{
  const {result,seen}=await collect();assert.deepEqual(seen,TRAVEL_INTERVIEW_TOPICS);assert.equal(result.profile.interview.status,'ready');assert.equal(result.profile.interview.answers.length,16);assert.equal(result.stops,undefined);
  assert.deepEqual(result.profile.fields,emptyTravelProfile().fields);
  for(const item of result.profile.interview.answers){assert.equal(item.answer,answers[item.field]);assert.ok(item.question);}
  assert.match(result.assistantReply,/统一交给 DeepSeek/);assert.ok(result.assistantReply.length<600);
  assert.deepEqual(normalizeTravelProfile(JSON.parse(JSON.stringify(result.profile))),result.profile);
});

test('short, question-shaped, off-topic and out-of-range raw answers are recorded without calling AI',async()=>{
  for(const [field,text] of [['crowdPreference','都安排'],['budget','500'],['dailyHours','每天25小时'],['pace','可以轻松一点吗？'],['interests','介绍一下粤博'],['diet','我想补全旅行偏好，但是目前先记下这个问题'],['dayCount','第二天少走一点']]){
    const profile=atTopic(field),result=await call(profile,text,undefined,{currentPlan:savedTrip()});assert.notEqual(result.profile.interview.topic,field);assert.equal(result.profile.interview.answers.at(-1).answer,text);assert.deepEqual(result.profile.fields,profile.fields);assert.equal(result.stops,undefined);
  }
});

test('exact raw whitespace and original questions persist while empty answers do not advance',async()=>{
  const profile=atTopic('budget');profile.followUps[0].question='这一笔是你们两个人一起花，还是一个人的？';
  const result=await call(profile,'  先记下来\n我还没决定  ');assert.equal(result.profile.interview.answers[0].answer,'  先记下来\n我还没决定  ');assert.equal(result.profile.interview.answers[0].question,profile.followUps[0].question);
  const empty=await call(profile,'  \n ');assert.deepEqual(empty.profile,profile);assert.equal(empty.profile.interview.topic,'budget');
});

test('skip, pause and resume preserve raw answers and the accepted route',async()=>{
  const plan=savedTrip(),before=JSON.stringify(plan);let result=await call(plan.profile,'','start',{currentPlan:plan});assert.equal(result.profile.interview.topic,'travelDates');
  result=await call(result.profile,'3天',undefined,{currentPlan:plan});assert.equal(result.profile.interview.topic,'startTime');assert.equal(result.profile.interview.answers[0].answer,'3天');assert.equal(result.profile.fields.travelDates.status,'missing');
  result=await call(result.profile,'','skip');assert.ok(result.profile.interview.skipped.includes('startTime'));assert.equal(result.profile.fields.startTime.status,'missing');
  result=await call(result.profile,'','pause');assert.equal(result.profile.interview.status,'paused');assert.deepEqual(result.followUps,[]);
  const resumed=await call(normalizeTravelProfile(result.profile),'','resume');assert.equal(resumed.profile.interview.topic,'companions');assert.deepEqual(resumed.profile.interview.answers,result.profile.interview.answers);assert.equal(JSON.stringify(plan),before);
});

test('ready additions stay verbatim and do not reinterpret or replace the route before approval',async()=>{
  const {result}=await collect(),plan=savedTrip(),before=JSON.stringify(plan);
  let added=await call(result.profile,'我想补充旅行偏好：再去天环，预算改为900元',undefined,{currentPlan:plan});added=await call(added.profile,'每人全程900元',undefined,{currentPlan:plan});
  assert.equal(added.profile.interview.status,'ready');assert.deepEqual(added.profile.interview.additions,['我想补充旅行偏好：再去天环，预算改为900元','每人全程900元']);assert.deepEqual(added.profile.fields,result.profile.fields);assert.equal(added.stops,undefined);assert.equal(JSON.stringify(plan),before);
  const completed=normalizeTravelProfile({...added.profile,interview:{...added.profile.interview,status:'completed'}});assert.equal(handleTravelInterview({profile:completed,description:'补充餐饮攻略'}),null);
});

test('the final model receives every full answer and addition independently of short chat history',async()=>{
  const values={...answers,destination:'广州 '+ '早期回答原文'.repeat(250)},collected=await collect(values);let profile=(await call(collected.result.profile,'稍后再定具体日期')).profile;const calls=[];
  const result=await call(profile,'开始规划','plan',{history:[{role:'user',content:'只剩最后一条聊天'}]}, {...noModel,fetchImpl:async(url,init)=>{
    const request=JSON.parse(init.body),data=JSON.parse(request.messages.at(-1).content);calls.push(request);assert.equal(request.tools,undefined);assert.match(request.messages[0].content,/旅行问答归纳/);assert.deepEqual(data.answers,profile.interview.answers);assert.deepEqual(data.additions,profile.interview.additions);assert.equal(data.answers.length,16);assert.ok(data.answers[0].answer.length>1000);assert.equal(data.answers[0].answer,values.destination);assert.equal(data.history,undefined);
    return model({intent:'clarify',fields:{destination:{value:'广州',evidence:['广州']}},followUp:{field:'dailyHours',question:'每天25小时超出一天，实际每天打算游览几小时？'}});
  }});
  assert.equal(calls.length,1);assert.equal(result.kind,'clarify');assert.equal(result.profile.interview.topic,'dailyHours');assert.deepEqual(result.profile.interview.answers,profile.interview.answers);assert.equal(result.profile.fields.destination.value,'广州');assert.equal(result.stops,undefined);
  const follow=await call(result.profile,'半天');assert.equal(follow.profile.interview.status,'ready');assert.equal(follow.profile.interview.answers.length,17);assert.equal(follow.profile.interview.answers.at(-1).answer,'半天');assert.equal(follow.profile.interview.answers.at(-1).question,result.followUps[0].question);assert.equal(follow.profile.interview.answers.find(item=>item.field==='dailyHours').answer,'每天25小时');
});

test('final semantic interpretation accepts natural wording while enforcing field schemas and raw evidence',async()=>{
  const {result}=await collect({...answers,dailyHours:'半天'}),body={profile:result.profile,description:'开始规划'};
  const decision={intent:'ready',fields:{destination:{value:'广州',evidence:['广州']},dayCount:{value:7,evidence:['一周']},dailyHours:{value:4,evidence:['半天']},companions:{value:{count:2},evidence:['2']},budget:{value:{amount:500},evidence:['500']},crowdPreference:{value:'mixed',evidence:['都安排']},diet:{value:{preferences:['清淡口味']},evidence:['清淡就好']}}};
  const done=applyTravelInterviewSynthesis(body,decision);assert.equal(done.body.profile.interview.status,'completed');assert.equal(done.body.profile.fields.dayCount.value,7);assert.equal(done.body.profile.fields.companions.value.count,2);assert.equal(done.body.profile.fields.budget.value.scope,'unknown');assert.deepEqual(done.body.profile.fields.diet.value.preferences,['清淡口味']);
  for(const fields of [{dayCount:{value:30,evidence:['一周']}},{crowdPreference:{value:'whatever',evidence:['都安排']}},{dayCount:{value:3,evidence:['没有说过这句话']}},{notAField:{value:1,evidence:['500']}}])assert.throws(()=>applyTravelInterviewSynthesis(body,{intent:'ready',fields}));
  const questionOnly={...body,profile:structuredClone(body.profile)};questionOnly.profile.interview.answers[0].question='例如去上海';assert.throws(()=>applyTravelInterviewSynthesis(questionOnly,{intent:'ready',fields:{destination:{value:'上海',evidence:['上海']}}}));
});

test('final interpretation failures preserve ready and every original answer for a one-call retry',async()=>{
  const {result}=await collect(),profile=result.profile,before=JSON.stringify(profile);let calls=0;
  for(const fetchImpl of [async()=>{calls++;throw Error('fixture unavailable');},async()=>{calls++;return model('{');},async()=>{calls++;return model({intent:'ready',fields:{destination:{value:'上海',evidence:['上海']}}});}])await assert.rejects(call(profile,'开始规划','plan',{}, {...noModel,fetchImpl}));
  assert.equal(calls,3);assert.equal(JSON.stringify(profile),before);assert.equal(profile.interview.status,'ready');
  const retried=await call(profile,'开始规划','plan',{}, {...noModel,fetchImpl:async()=>model({intent:'clarify',fields:{},followUp:{field:'dailyHours',question:'实际每天打算游览几小时？'}})});assert.equal(retried.profile.interview.status,'active');assert.deepEqual(retried.profile.interview.answers,profile.interview.answers);
});

test('a final clarification survives pause and reload even when that field already has a raw answer',async()=>{
  const {result}=await collect(),question='这500元是一个人的还是全团合计？';
  const clarified=applyTravelInterviewSynthesis({profile:result.profile,description:'开始规划'},{intent:'clarify',fields:{},followUp:{field:'budget',question}}).response;
  assert.equal(clarified.profile.interview.topic,'budget');assert.equal(clarified.profile.interview.answers.find(item=>item.field==='budget').answer,'500');
  const paused=await call(clarified.profile,'','pause'),resumed=await call(normalizeTravelProfile(JSON.parse(JSON.stringify(paused.profile))),'','resume');
  assert.equal(resumed.profile.interview.status,'active');assert.equal(resumed.profile.interview.topic,'budget');assert.equal(resumed.followUps[0].question,question);
  const answered=await call(resumed.profile,'每人全程');assert.equal(answered.profile.interview.status,'ready');assert.equal(answered.profile.interview.pendingQuestion,undefined);assert.deepEqual(answered.profile.interview.answers.slice(-1)[0],{field:'budget',question,answer:'每人全程'});assert.equal(answered.profile.interview.answers.find(item=>item.field==='budget').answer,'500');
});

test('final synthesis clears old-city requirements and reconciles newly opposed place choices',()=>{
  const profile=updateTravelProfile(emptyTravelProfile(),{text:'广州3天，每天4小时，必去粤博，不去广州塔，住在珠江新城，从体育西路出发'}).profile;
  profile.interview={status:'ready',topic:null,skipped:[],answers:[],additions:['目的地改成北京','不去广东省博物馆','只去广东省博物馆']};
  const moved=applyTravelInterviewSynthesis({profile,description:'开始规划'},{intent:'ready',fields:{destination:{value:'北京',evidence:['目的地改成北京']}}});
  assert.equal(moved.body.profile.fields.destination.value,'北京');for(const field of ['requiredPlaces','excludedPlaces','stayArea','startArea'])assert.deepEqual(moved.body.profile.fields[field],{value:null,status:'missing'});
  const removed=applyTravelInterviewSynthesis({profile,description:'开始规划'},{intent:'ready',fields:{excludedPlaces:{value:['广东省博物馆'],evidence:['不去广东省博物馆']}}});assert.deepEqual(removed.body.profile.fields.requiredPlaces.value,[]);assert.ok(removed.body.profile.fields.excludedPlaces.value.includes('广东省博物馆'));
  const contradictory=applyTravelInterviewSynthesis({profile,description:'开始规划'},{intent:'ready',fields:{requiredPlaces:{value:['粤博'],evidence:['广东省博物馆']},excludedPlaces:{value:['广东省博物馆'],evidence:['不去广东省博物馆']}}});assert.equal(contradictory.response.kind,'clarify');assert.match(contradictory.response.assistantReply,/保留|避开/);assert.equal(contradictory.response.stops,undefined);
});

test('approved synthesis hands new conditions to planning without a second dialogue or forced budget basis interview',async()=>{
  const plan=savedTrip(),profile=normalizeTravelProfile({...plan.profile,interview:{status:'ready',topic:null,skipped:[],answers:[{field:'budget',question:'预算多少？',answer:'500'}],additions:[]},followUps:[]});let calls=0;
  const result=await call(profile,'开始规划','plan',{currentPlan:plan}, {...noModel,fetchImpl:async()=>{calls++;return model({intent:'ready',fields:{budget:{value:{amount:500},evidence:['500']}}});}});
  assert.equal(calls,1);assert.equal(result.kind,'plan');assert.equal(result.profile.interview.status,'completed');assert.equal(result.profile.fields.budget.value.amount,500);assert.equal(result.profile.fields.budget.value.scope,'unknown');assert.deepEqual(result.stops.map(stop=>stop.id),plan.stops.map(stop=>stop.id));assert.deepEqual(result.guide.days,plan.guide.days);assert.equal(result.guide.summary,plan.guide.summary);
});

test('map edits and duration controls keep recorded answers, and record bounds fail without truncation',async()=>{
  const plan=savedTrip(),start=await call(plan.profile,'','start',{currentPlan:plan}),answered=await call(start.profile,'没想好');
  const changed=await call(answered.profile,'修改设置',undefined,{currentPlan:plan,tripSettings:{dailyHours:5}});assert.equal(changed.kind,'plan');assert.equal(changed.profile.interview.status,'active');assert.deepEqual(changed.profile.interview.answers,answered.profile.interview.answers);
  const added=await call(changed.profile,'修改地点',undefined,{currentPlan:changed,itineraryEdit:{action:'add',stopId:'gz-library',stopName:'广州图书馆',dayIndex:1}});assert.equal(added.kind,'plan');assert.deepEqual(added.profile.interview.answers,answered.profile.interview.answers);
  const profile=atTopic('budget'),item={field:'budget',question:'预算？',answer:'500'};
  assert.throws(()=>normalizeTravelProfile({...profile,interview:{...profile.interview,answers:Array(33).fill(item)}}));assert.throws(()=>normalizeTravelProfile({...profile,interview:{...profile.interview,answers:[{...item,answer:' '}]}}));assert.throws(()=>normalizeTravelProfile({...profile,interview:{...profile.interview,additions:Array(9).fill('补充')}}));
});
