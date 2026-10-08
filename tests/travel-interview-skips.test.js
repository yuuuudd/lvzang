import test from 'node:test';
import assert from 'node:assert/strict';
import {chatTravel} from '../travel-agent.js';
import {applyTravelInterviewSynthesis} from '../travel-interview.js';
import {emptyTravelProfile,normalizeTravelProfile,updateTravelProfile} from '../public/src/travel-profile.js';
import {buildDailyPlan} from '../public/src/travel-schedule.js';
import {normalizeRequest,planFromCatalog} from '../public/src/travel-domain.js';
import {validateTravelGuide} from '../travel-advisor.js';

const skipped=['travelDates','startTime','companions','budget','diet'];
const earlierRequest='广州3天，每天4小时，紧凑多玩';
const rawAnswers={
  crowdPreference:['热门和小众想怎么安排？','都安排'],
  interests:['这次主要想体验什么？','美食建筑'],
  requiredPlaces:['有什么一定要去的地方？','没什么必去'],
  excludedPlaces:['有什么不想去的地方？','没有不想去'],
  stayArea:['准备住在哪里？','天河区'],
  startArea:['从哪里出发？','体育西'],
  transport:['想采用什么交通方式？','地铁步行'],
};

function readyProfile(){
  const known=updateTravelProfile(emptyTravelProfile(),{text:earlierRequest}).profile;
  assert.equal(known.fields.destination.value,'广州');
  assert.equal(known.fields.dayCount.value,3);
  assert.equal(known.fields.dailyHours.value,4);
  assert.equal(known.fields.pace.value,'active');
  return normalizeTravelProfile({...known,followUps:[],interview:{
    status:'ready',topic:null,skipped,
    answers:Object.entries(rawAnswers).map(([field,[question,answer]])=>({field,question,answer})),
    additions:[],
  }});
}

function synthesize(profile,fields,extra={}){
  return applyTravelInterviewSynthesis({profile,description:'开始规划',interviewAction:'plan'},
    {intent:'ready',fields,...extra});
}

function assertUnknowns(profile){
  for(const field of skipped)assert.deepEqual(profile.fields[field],{value:null,status:'missing'},field);
}

function withGuide(profile){
  const plan=buildDailyPlan({...planFromCatalog(normalizeRequest({destination:'广州',hours:4}),undefined,
    {placeIds:['gz-museum','gz-square','gz-opera']}),mode:'ai',trace:[]},profile);
  plan.guide=validateTravelGuide({summary:'已保存攻略',days:plan.days.map(day=>({
    dayIndex:day.dayIndex,overview:'按既定顺序游玩。',stops:day.stops.map(stop=>({
      stopId:stop.id,name:stop.name,howToPlay:'结合现场展览自由参观。',highlights:[],food:[],
      transport:'交通待核实',reservation:'预约待核实',rainyAlternative:'下雨时缩短户外活动。',sourceIds:[],
    })),
  }))},plan,{status:'not-requested',sources:[],errors:[]});
  return plan;
}

for(const evidence of [undefined,[],[earlierRequest]]){
  test(`already confirmed conditions need no new interview quotation (${JSON.stringify(evidence)})`,()=>{
    const profile=readyProfile(),before=JSON.stringify(profile);
    const fields=Object.fromEntries(['destination','dayCount','dailyHours','pace'].map(field=>[
      field,{value:profile.fields[field].value,...(evidence===undefined?{}:{evidence})},
    ]));
    const result=synthesize(profile,fields);
    assert.ok(result.body);assert.equal(result.response,undefined);
    assert.deepEqual(result.body.profile.fields,profile.fields);
    assert.equal(result.body.profile.interview.status,'completed');
    assert.deepEqual(result.body.profile.interview.answers,profile.interview.answers);
    assert.equal(JSON.stringify(profile),before);
  });
}

test('skipped null and empty object placeholders remain unknown instead of becoming confirmed',()=>{
  const profile=readyProfile();
  for(const fields of [
    Object.fromEntries(skipped.map(field=>[field,{value:null}])),
    Object.fromEntries(skipped.map(field=>[field,{value:null,evidence:[]}])),
    {travelDates:{value:{start:null,end:null},evidence:[]},diet:{value:{preferences:[],restrictions:null},evidence:[]}},
  ]){
    const result=synthesize(profile,fields);
    assert.ok(result.body);assertUnknowns(result.body.profile);
    assert.deepEqual(result.body.profile.interview.skipped,skipped);
    assert.deepEqual(result.body.profile.interview.answers,profile.interview.answers);
  }
  assertUnknowns(profile);
});

test('an optional skipped-budget follow-up cannot block planning with known essential conditions',()=>{
  const profile=readyProfile();
  const result=synthesize(profile,{}, {intent:'clarify',followUp:{field:'budget',question:'你的预算是多少？'}});
  assert.ok(result.body);assert.equal(result.response,undefined);
  assert.equal(result.body.profile.interview.status,'completed');
  assertUnknowns(result.body.profile);
});

test('a missing destination remains a necessary clarification even when optional questions were skipped',()=>{
  const profile=readyProfile();profile.fields.destination={value:null,status:'missing'};
  profile.interview.skipped.push('destination');
  const result=synthesize(profile,{});
  assert.equal(result.body,undefined);assert.equal(result.response.kind,'clarify');
  assert.equal(result.response.profile.interview.topic,'destination');
  assert.equal(result.response.profile.fields.destination.status,'missing');
  assert.deepEqual(result.response.profile.interview.answers,profile.interview.answers);
});

test('a real required-versus-excluded place conflict still needs an answer before planning',()=>{
  const profile=readyProfile(),quote='我想去广州塔，但是也想排除广州塔';
  profile.interview.additions.push(quote);
  const result=synthesize(profile,{
    requiredPlaces:{value:['广州塔'],evidence:[quote]},
    excludedPlaces:{value:['广州塔'],evidence:[quote]},
  },{intent:'clarify',followUp:{field:'budget',question:'预算多少？'}});
  assert.equal(result.body,undefined);assert.equal(result.response.kind,'clarify');
  assert.equal(result.response.profile.interview.topic,'excludedPlaces');
  assert.match(result.response.assistantReply,/广州塔/);
  assert.equal(result.response.stops,undefined);
});

test('changed duration and invented budget still require actual new raw evidence',()=>{
  const profile=readyProfile(),before=JSON.stringify(profile);
  for(const [field,value] of [['dayCount',2],['budget',{amount:999}]]){
    for(const evidence of [undefined,[],['没有提供过的依据']]){
      const item={value,...(evidence===undefined?{}:{evidence})};
      assert.throws(()=>synthesize(profile,{[field]:item}),/原回答和原行程.*保留/);
      assert.equal(JSON.stringify(profile),before);
    }
  }
});

test('seven answers and five skips reach a plan through chatTravel while retaining a valid guide',async()=>{
  const profile=readyProfile(),plan=withGuide(profile),before=JSON.stringify(plan);let calls=0;
  const fields={
    destination:{value:'广州'},dayCount:{value:3,evidence:[]},dailyHours:{value:4,evidence:[earlierRequest]},
    pace:{value:'active'},travelDates:{value:{start:null,end:null}},startTime:{value:null},
    companions:{value:null},budget:{value:null,evidence:[]},diet:{value:{preferences:[],restrictions:null}},
  };
  const result=await chatTravel({profile,description:'开始规划',mode:'ai',textRevision:true,
    interviewAction:'plan',currentPlan:plan,previous:plan.input}, {
    advisorEnabled:true,key:'fixture',fetchImpl:async(url,init)=>{
      calls++;assert.equal(calls,1,'only final answer synthesis is needed with a retained valid guide');
      const request=JSON.parse(init.body),data=JSON.parse(request.messages.at(-1).content);
      assert.match(request.messages[0].content,/旅行问答归纳/);assert.equal(request.tools,undefined);
      assert.deepEqual(data.answers,profile.interview.answers);assert.equal(data.answers.length,7);
      assert.deepEqual(data.skipped,skipped);
      return Response.json({choices:[{message:{content:JSON.stringify({intent:'clarify',fields,
        followUp:{field:'budget',question:'可以再告诉我预算吗？'}})}}]});
    },
  });
  assert.equal(calls,1);assert.equal(result.kind,'plan');assert.equal(result.profile.interview.status,'completed');
  assert.equal(result.days.length,3);assert.equal(result.profile.fields.dailyHours.value,4);
  assert.equal(result.profile.fields.pace.value,'active');assertUnknowns(result.profile);
  assert.deepEqual(result.profile.interview.answers,profile.interview.answers);
  assert.deepEqual(result.profile.interview.skipped,skipped);
  assert.deepEqual(result.stops.map(stop=>stop.id),plan.stops.map(stop=>stop.id));
  assert.deepEqual(result.guide.days,plan.guide.days);assert.equal(result.guide.summary,plan.guide.summary);
  assert.match(JSON.stringify(result.assumptions),/09:00.*待.*确认|暂.*09:00/);
  assert.equal(JSON.stringify(plan),before);
});
