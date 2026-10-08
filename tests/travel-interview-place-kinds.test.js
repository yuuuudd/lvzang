import test from 'node:test';
import assert from 'node:assert/strict';
import {applyTravelInterviewSynthesis,handleTravelInterview} from '../travel-interview.js';
import {emptyTravelProfile} from '../public/src/travel-profile.js';
import {buildDailyPlan} from '../public/src/travel-schedule.js';
import {chatTravel} from '../travel-agent.js';

function interview(destinationAnswer='想去东方之门还有园林'){
  const answers={destination:destinationAnswer,dayCount:'3天',dailyHours:'6小时',interests:'美食',requiredPlaces:'没有',pace:'轻松'};
  let result=handleTravelInterview({profile:emptyTravelProfile(),destination:'苏州',description:'开始新旅行问答',interviewAction:'restart',mode:'ai'}).response;
  while(result.profile.interview.status==='active'){
    const topic=result.profile.interview.topic;
    result=handleTravelInterview({profile:result.profile,description:answers[topic]??'这题先跳过',...(!Object.hasOwn(answers,topic)?{interviewAction:'skip'}:{}),mode:'ai'}).response;
  }
  return {profile:result.profile,description:'开始规划',interviewAction:'plan',mode:'ai'};
}
function synthesis(body,requiredPlaces=['东方之门','园林']){
  // The whole earlier destination answer is valid evidence even when a later
  // required-places answer says there are no additional mandatory places.
  return applyTravelInterviewSynthesis(body,{intent:'ready',fields:{
    dayCount:{value:3,evidence:['3天']},dailyHours:{value:6,evidence:['6小时']},
    pace:{value:'easy',evidence:['轻松']},interests:{value:['美食'],evidence:['美食']},
    requiredPlaces:{value:requiredPlaces,evidence:[body.profile.interview.answers.find(item=>item.field==='destination').answer]},
  }});
}
function route(names=['东方之门','拙政园','留园']){
  return {city:'苏州',title:'苏州三天建筑与园林',input:{destination:'苏州'},stops:names.map((name,index)=>({id:`suggested-suzhou-${index}`,name,city:'苏州',dayIndex:index+1,minutes:90,transit:15}))};
}

test('interview synthesis keeps a concrete destination mandatory and moves a generic place kind into interests',()=>{
  const body=interview(),before=JSON.stringify(body),result=synthesis(body);
  assert.ok(result.body,'Known essential conditions should reach planning');
  const profile=result.body.profile;
  assert.deepEqual(profile.fields.requiredPlaces.value,['东方之门']);
  assert.ok(profile.fields.interests.value.includes('园林'),'The garden preference must remain available to route planning');
  assert.ok(profile.fields.interests.value.includes('美食'),'Existing interests must survive category normalization');
  assert.equal(profile.fields.dayCount.value,3);assert.equal(profile.fields.dailyHours.value,6);assert.equal(profile.fields.pace.value,'easy');
  for(const field of ['travelDates','companions','startTime','budget'])assert.deepEqual(profile.fields[field],{value:null,status:'missing'},`${field} must not be invented from a broad preference`);
  assert.deepEqual(profile.interview.answers,body.profile.interview.answers);
  assert.equal(profile.interview.status,'completed');assert.equal(JSON.stringify(body),before);
});

test('a real named garden satisfies the garden preference without inventing a stop literally named 园林',()=>{
  const result=synthesis(interview());
  const plan=buildDailyPlan(route(),result.body.profile);
  assert.deepEqual(plan.stops.map(stop=>stop.name),['东方之门','拙政园','留园']);
  assert.equal(plan.days.length,3);assert.ok(plan.days.every(day=>day.stops.length===1&&day.hours===6));
  assert.ok(plan.profile.fields.interests.value.includes('园林'));
});

test('named gardens and museums remain exact required places rather than broad categories',()=>{
  const names=['东方之门','留园','拙政园','狮子林','苏州博物馆'];
  const result=synthesis(interview(`想去${names.join('、')}`),names);
  assert.deepEqual(result.body.profile.fields.requiredPlaces.value,names);
  assert.deepEqual(result.body.profile.fields.interests.value,['美食']);
  for(const name of names){
    const candidates=names.filter(item=>item!==name).map((item,index)=>({id:`suggested-specific-${index}`,name:item,city:'苏州',minutes:60,transit:10}));
    assert.throws(()=>buildDailyPlan({...route(),stops:candidates},result.body.profile),error=>error.message.includes(`必去地点“${name}”尚未安排`),`Missing ${name} must still fail exact-place validation`);
  }
});

test('visiting gardens cannot substitute for an explicitly required 东方之门',()=>{
  const result=synthesis(interview('想去东方之门'),['东方之门']);
  assert.throws(()=>buildDailyPlan(route(['拙政园','留园','狮子林']),result.body.profile),/必去地点“东方之门”尚未安排/);
});

function legacyBody(){
  const body=synthesis(interview()).body;
  body.profile.fields.requiredPlaces={value:['东方之门','园林'],status:'confirmed'};
  body.profile.interview.status='ready';
  return body;
}

test('retry repairs a previously confirmed generic requirement even when synthesis changes no fields',()=>{
  const body=legacyBody(),before=JSON.stringify(body);
  const result=applyTravelInterviewSynthesis(body,{intent:'ready',fields:{}});
  assert.ok(result.body);assert.deepEqual(result.body.profile.fields.requiredPlaces.value,['东方之门']);
  assert.deepEqual(result.body.profile.fields.interests.value,['美食','园林'],'Retry neither loses interests nor duplicates an existing category');
  assert.equal(result.body.profile.revision,body.profile.revision+1);
  assert.deepEqual(result.body.profile.interview.answers,body.profile.interview.answers);
  assert.deepEqual(result.body.profile.interview.skipped,body.profile.interview.skipped);
  assert.equal(JSON.stringify(body),before,'Repair leaves the submitted old state and original text untouched');
  assert.doesNotThrow(()=>buildDailyPlan(route(),result.body.profile));
});

test('a category-only answer leaves an empty exact-place list and retains every preference',()=>{
  const result=synthesis(interview('想去园林、博物馆和公园'),['园林','博物馆','公园']);
  assert.deepEqual(result.body.profile.fields.requiredPlaces,{value:[],status:'confirmed'});
  assert.deepEqual(result.body.profile.fields.interests.value,['美食','园林','博物馆','公园']);
  for(const field of ['travelDates','companions','startTime','budget'])assert.deepEqual(result.body.profile.fields[field],{value:null,status:'missing'});
  assert.doesNotThrow(()=>buildDailyPlan(route(['拙政园','苏州博物馆','人民公园']),result.body.profile));
});

test('人民公园 and an unfamiliar garden name never become optional category preferences',()=>{
  const names=['人民公园','松影园'];
  const result=synthesis(interview('想去人民公园和松影园'),names);
  assert.deepEqual(result.body.profile.fields.requiredPlaces.value,names);
  assert.deepEqual(result.body.profile.fields.interests.value,['美食']);
  for(const missing of names){
    assert.throws(()=>buildDailyPlan(route(names.filter(name=>name!==missing)),result.body.profile),error=>error.message.includes(`必去地点“${missing}”尚未安排`));
  }
});

test('a category simultaneously required and excluded remains a clarification rather than a silent preference',()=>{
  const body=legacyBody();
  body.profile.fields.requiredPlaces={value:['园林'],status:'confirmed'};
  body.profile.fields.excludedPlaces={value:['园林'],status:'confirmed'};
  body.profile.fields.interests={value:['美食'],status:'confirmed'};
  const before=JSON.stringify(body);
  const result=applyTravelInterviewSynthesis(body,{intent:'ready',fields:{}});
  assert.equal(result.body,undefined);assert.equal(result.response.kind,'clarify');
  assert.match(result.response.assistantReply,/园林.*同时.*必去.*避开/);
  assert.deepEqual(result.response.profile.fields.requiredPlaces.value,['园林']);
  assert.deepEqual(result.response.profile.fields.excludedPlaces.value,['园林']);
  assert.deepEqual(result.response.profile.fields.interests.value,['美食']);
  assert.equal(JSON.stringify(body),before);
});

test('ordinary planning also repairs legacy categories before sending requirements to the route model',async()=>{
  const profile=legacyBody().profile;delete profile.interview;
  const before=JSON.stringify(profile),calls=[];
  const result=await chatTravel({description:'请重新规划苏州3天完整行程，按已保存的偏好先出方案',profile,mode:'ai',textRevision:true},{
    key:'fixture',model:'fixture',advisorEnabled:true,
    researchFetchImpl:async()=>new Response('',{status:503}),
    fetchImpl:async(url,options)=>{
      assert.equal(url,'https://api.deepseek.com/chat/completions');
      const request=JSON.parse(options.body);calls.push(request);assert.ok(calls.length<=3,'No additional interview or synthesis is expected');
      if(calls.length===1)return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({intent:'plan',reply:'按已保存的偏好重新规划。'})}}]});
      assert.match(request.messages[0].content,/城市旅行顾问/);
      const data=JSON.parse(request.messages.find(message=>message.role==='user').content);
      assert.deepEqual(data.profile.fields.requiredPlaces.value,['东方之门']);
      assert.ok(data.profile.fields.interests.value.includes('园林'));assert.equal(data.input.destination,'苏州');
      const message=calls.length===2?{content:null,tool_calls:[{id:'suzhou-search',type:'function',function:{name:'search_travel_web',arguments:JSON.stringify({query:'苏州 东方之门 园林',city:'苏州'})}}]}:{content:JSON.stringify({unavailable:true,reason:'隔离测试不提供外部旅行资料。'})};
      return Response.json({choices:[{finish_reason:'stop',message}]});
    },
    toolImplementations:{searchTravelWeb:async()=>({status:'unavailable',sources:[],error:'No live research in this fixture'})},
  });
  assert.equal(calls.length,3);assert.equal(result.status,'partial','Only the deliberate absence of research prevents a finished route');
  assert.deepEqual(result.profile.fields.requiredPlaces.value,['东方之门']);assert.ok(result.profile.fields.interests.value.includes('园林'));
  assert.equal(JSON.stringify(profile),before);
});

test('a later choice of a previously excluded category becomes an interest after resolving the old exclusion',()=>{
  const body=legacyBody();
  body.profile.fields.requiredPlaces={value:['东方之门'],status:'confirmed'};
  body.profile.fields.excludedPlaces={value:['园林'],status:'confirmed'};
  body.profile.fields.interests={value:['美食'],status:'confirmed'};
  body.profile.interview.additions.push('现在想去园林和东方之门');
  const before=JSON.stringify(body);
  const result=applyTravelInterviewSynthesis(body,{intent:'ready',fields:{requiredPlaces:{value:['园林','东方之门'],evidence:['现在想去园林和东方之门']}}});
  assert.ok(result.body,'The newest explicit preference should resolve the old exclusion without another interview');
  assert.deepEqual(result.body.profile.fields.requiredPlaces.value,['东方之门']);
  assert.deepEqual(result.body.profile.fields.excludedPlaces.value,[]);
  assert.deepEqual(result.body.profile.fields.interests.value,['美食','园林']);
  assert.deepEqual(result.body.profile.interview.additions,body.profile.interview.additions);
  assert.doesNotThrow(()=>buildDailyPlan(route(),result.body.profile));
  assert.throws(()=>buildDailyPlan(route(['拙政园','留园','狮子林']),result.body.profile),/必去地点“东方之门”尚未安排/);
  assert.equal(JSON.stringify(body),before);
});
