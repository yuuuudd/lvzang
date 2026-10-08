import test from 'node:test';
import assert from 'node:assert/strict';
import {applyTravelInterviewSynthesis} from '../travel-interview.js';
import {emptyTravelProfile,normalizeTravelProfile,TRAVEL_INTERVIEW_TOPICS} from '../public/src/travel-profile.js';

function completedAnswers(){
  const raw={destination:'杭州',dayCount:'三天',dailyHours:'每天四小时',crowdPreference:'热闹的和安静的都安排',interests:'美食和建筑',requiredPlaces:'一定去雷峰塔',excludedPlaces:'没有不想去的',pace:'轻松一点',diet:'无'};
  const profile=normalizeTravelProfile({...emptyTravelProfile(),interview:{status:'ready',topic:null,answers:Object.entries(raw).map(([field,answer])=>({field,question:`请说说${field}的想法？`,answer})),additions:[],skipped:TRAVEL_INTERVIEW_TOPICS.filter(field=>!(field in raw))}});
  return {profile,currentPlan:{city:'杭州',stops:[{id:'saved-stop',name:'已接受的地点'}]},description:'开始规划'};
}
function synthesis(){
  return {intent:'ready',fields:{
    destination:{value:'杭州',evidence:['杭州']},
    dayCount:{value:3,evidence:['三天']},
    dailyHours:{value:4,evidence:['每天四小时']},
    crowdPreference:{value:'mixed',evidence:['热闹的和安静的都安排']},
    interests:{value:['美食','建筑'],evidence:['美食和建筑']},
    requiredPlaces:{value:['雷峰塔'],evidence:['一定去雷峰塔']},
    excludedPlaces:{value:[],evidence:['没有不想去的']},
    pace:{value:'easy',evidence:['轻松一点']},
    diet:{restrictions:[],evidence:['无']}
  }};
}

test('nine answers and seven skips accept an evidenced flattened diet without losing raw answers or the saved route',()=>{
  const body=completedAnswers(),decision=synthesis(),beforeBody=JSON.stringify(body),beforeDecision=JSON.stringify(decision);
  assert.equal(body.profile.interview.answers.length,9);assert.equal(body.profile.interview.skipped.length,7);
  const result=applyTravelInterviewSynthesis(body,decision);
  assert.equal(result.body.interviewAction,'plan');
  assert.equal(result.body.profile.fields.destination.value,'杭州');
  assert.equal(result.body.profile.fields.dayCount.value,3);
  assert.equal(result.body.profile.fields.dailyHours.value,4);
  assert.equal(result.body.profile.fields.diet.status,'confirmed');
  assert.deepEqual(result.body.profile.fields.diet.value.restrictions,[]);
  for(const field of body.profile.interview.skipped)assert.equal(result.body.profile.fields[field].status,'missing');
  assert.deepEqual(result.body.profile.interview.answers,body.profile.interview.answers);
  assert.deepEqual(result.body.profile.interview.skipped,body.profile.interview.skipped);
  assert.deepEqual(result.body.currentPlan,body.currentPlan);
  assert.equal(JSON.stringify(body),beforeBody);assert.equal(JSON.stringify(decision),beforeDecision);
});

function fieldBody(field,answer){
  const body=completedAnswers();
  for(const name of ['destination','dayCount','dailyHours'])body.profile.fields[name]={value:synthesis().fields[name].value,status:'confirmed'};
  body.profile.interview.answers=[{field,question:'请补充这项旅行条件？',answer}];
  body.profile.interview.skipped=TRAVEL_INTERVIEW_TOPICS.filter(name=>![field,'destination','dayCount','dailyHours'].includes(name));
  body.profile.interview.additions=[];
  return body;
}
const compoundCases=[
  ['budget','每人全程九百元，只计餐饮',{amount:900,currency:'CNY',scope:'per-person',period:'trip',includes:['餐饮']},{amount:900,currency:'CNY',scope:'per-person',period:'trip',includes:['餐饮']}],
  ['companions','两位成人同行',{count:2,adults:2,description:'两位成人'},{count:2,description:'两位成人',adults:2,children:null,seniors:null}],
  ['diet','喜欢清淡，不吃花生',{preferences:['清淡'],restrictions:['花生']},{preferences:['清淡'],restrictions:['花生']}],
  ['travelDates','2026-11-04出发，2026-11-06结束',{start:'2026-11-04',end:'2026-11-06'},{start:'2026-11-04',end:'2026-11-06'}]
];

for(const [field,answer,value,expected] of compoundCases)test(`evidenced flattened ${field} matches the canonical wrapped shape`,()=>{
  const body=fieldBody(field,`  ${answer}\n`),decision={intent:'ready',fields:{[field]:{...value,evidence:[answer]}}};
  const beforeBody=JSON.stringify(body),beforeDecision=JSON.stringify(decision);
  const flat=applyTravelInterviewSynthesis(body,decision),wrapped=applyTravelInterviewSynthesis(body,{intent:'ready',fields:{[field]:{value,evidence:[answer]}}});
  assert.deepEqual(flat,wrapped);assert.equal(flat.body.profile.fields[field].status,'confirmed');assert.deepEqual(flat.body.profile.fields[field].value,expected);
  assert.equal(flat.body.profile.interview.answers[0].answer,`  ${answer}\n`);
  assert.equal(JSON.stringify(body),beforeBody);assert.equal(JSON.stringify(decision),beforeDecision);
});

test('an unevidenced empty restriction list keeps an unknown diet missing instead of confirming no restrictions',()=>{
  for(const item of [{restrictions:[]},{restrictions:[],evidence:[]},{preferences:[],restrictions:null},{value:{restrictions:[]}}]){
    const body=fieldBody('diet','以后再说'),before=JSON.stringify(body);
    const result=applyTravelInterviewSynthesis(body,{intent:'ready',fields:{diet:item}});
    assert.deepEqual(result.body.profile.fields.diet,{value:null,status:'missing'});
    assert.equal(JSON.stringify(body),before);
  }
});

test('an unsupported quotation cannot turn an empty unknown diet into a confirmed fact or block skipped conditions',()=>{
  for(const item of [{restrictions:[],evidence:['明确没有任何忌口']},{value:{restrictions:[]},evidence:['明确没有任何忌口']}]){
    const body=fieldBody('diet','暂时不回答'),before=JSON.stringify(body);
    const result=applyTravelInterviewSynthesis(body,{intent:'ready',fields:{diet:item}});
    assert.equal(result.body.interviewAction,'plan');
    assert.deepEqual(result.body.profile.fields.diet,{value:null,status:'missing'});
    assert.deepEqual(result.body.profile.interview.answers,body.profile.interview.answers);
    assert.equal(JSON.stringify(body),before);
  }
});

test('flattening never invents evidence for changed known facts or a new nonempty compound value',()=>{
  for(const [field,answer,value] of compoundCases){
    const body=fieldBody(field,answer),before=JSON.stringify(body);
    for(const evidence of [undefined,[],['这句话从未出现过']]){
      const item={...value,...(evidence===undefined?{}:{evidence})};
      assert.throws(()=>applyTravelInterviewSynthesis(body,{intent:'ready',fields:{[field]:item}}),/问答|整理|原话/);
    }
    assert.equal(JSON.stringify(body),before);
  }
});

test('flattened fields still reject wrong types, unknown members and mixed value shapes',()=>{
  const cases=[
    ['diet',{restrictions:'花生'}],
    ['budget',{amount:'900'}],
    ['companions',{count:'2'}],
    ['travelDates',{start:'2026-02-30'}],
    ['diet',{restrictions:[],status:'confirmed'}],
    ['budget',{amount:900,unexpected:true}],
    ['companions',{count:2,unknown:1}],
    ['travelDates',{start:'2026-11-04',timezone:'Asia/Shanghai'}],
    ['diet',{value:{restrictions:['花生']},restrictions:[]}],
    ['budget',{value:{amount:800},amount:900}],
    ['companions',{value:{count:1},count:2}],
    ['travelDates',{value:{start:'2026-11-05'},start:'2026-11-04'}],
    ['dayCount',{count:3}],
    ['notAProfileField',{restrictions:[]}]
  ];
  for(const [field,item] of cases){
    const body=fieldBody('diet','清淡'),decision={intent:'ready',fields:{[field]:{...item,evidence:['清淡']}}},before=JSON.stringify({body,decision});
    assert.throws(()=>applyTravelInterviewSynthesis(body,decision),undefined,`must reject ${field}: ${JSON.stringify(item)}`);
    assert.equal(JSON.stringify({body,decision}),before);
  }
});

test('already accepted compound data remains intact when only an evidenced subfield is flattened',()=>{
  const body=fieldBody('diet','现在不吃花生');
  body.profile.fields.diet={value:{preferences:['清淡'],restrictions:null},status:'confirmed'};
  const before=JSON.stringify(body),result=applyTravelInterviewSynthesis(body,{intent:'ready',fields:{diet:{restrictions:['花生'],evidence:['不吃花生']}}});
  assert.deepEqual(result.body.profile.fields.diet,{value:{preferences:['清淡'],restrictions:['花生']},status:'confirmed'});
  assert.equal(JSON.stringify(body),before);
});

test('unsupported quotations cannot modify a previously confirmed compound field',()=>{
  const body=fieldBody('diet','行程保持原样');
  body.profile.fields.diet={value:{preferences:['清淡'],restrictions:['海鲜']},status:'confirmed'};
  const before=JSON.stringify(body);
  for(const restrictions of [[],['花生']]){
    assert.throws(()=>applyTravelInterviewSynthesis(body,{intent:'ready',fields:{diet:{restrictions,evidence:['改成没有忌口']}}}),/问答|整理|原话/);
    assert.equal(JSON.stringify(body),before);
  }
});
