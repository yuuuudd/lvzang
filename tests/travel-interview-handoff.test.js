import test from 'node:test';
import assert from 'node:assert/strict';
import {chatTravel} from '../travel-agent.js';
import {handleTravelInterview} from '../travel-interview.js';
import {emptyTravelProfile} from '../public/src/travel-profile.js';

const answers={destination:'拉萨',travelDates:'5天',dayCount:'5天',dailyHours:'8小时',startTime:'10点',crowdPreference:'热门',interests:'美食、自然',pace:'适中',diet:'无'};
function readyInterview(){
  let result=handleTravelInterview({profile:emptyTravelProfile(),description:'开始这次旅行问答',destination:'西藏',interviewAction:'restart',mode:'ai'}).response;
  while(result.profile.interview.status==='active'){
    const topic=result.profile.interview.topic;
    result=handleTravelInterview({profile:result.profile,description:answers[topic]??'这题先跳过',...(!Object.hasOwn(answers,topic)?{interviewAction:'skip'}:{}),mode:'ai'}).response;
  }
  return result.profile;
}
const normalizedFields={destination:{value:'拉萨',evidence:['拉萨']},dayCount:{value:5,evidence:['5天']},dailyHours:{value:8,evidence:['8小时']},startTime:{value:'10:00',evidence:['10点']},crowdPreference:{value:'popular',evidence:['热门']},interests:{value:['美食','自然'],evidence:['美食、自然']},pace:{value:'normal',evidence:['适中']},diet:{restrictions:[],evidence:['无']}};
const model=message=>Response.json({choices:[{finish_reason:'stop',message:typeof message==='string'?{content:message}:message.tool_calls?message:{content:JSON.stringify(message)}}]});

test('a nine-answer Tibet interview reaches sourced route generation with structured constraints and no optional re-interview',async()=>{
  for(const requestSkippedBudget of [false,true]){
    const profile=readyInterview(),before=JSON.stringify(profile),calls=[],events=[],searches=[];
    assert.equal(profile.interview.answers.length,9);assert.equal(profile.interview.skipped.length,7);assert.equal(profile.fields.travelDates.value,null);
    const result=await chatTravel({description:'按这些条件规划',mode:'ai',profile,interviewAction:'plan',textRevision:true,history:[]},{key:'fixture',model:'fixture',advisorEnabled:true,onProgress:event=>events.push(event),fetchImpl:async(url,init)=>{
      assert.equal(url,'https://api.deepseek.com/chat/completions');
      const request=JSON.parse(init.body),prompt=request.messages[0].content;calls.push(request);assert.ok(calls.length<=3,'Unexpected dialogue, retry or detail-interview call');
      if(prompt.includes('你是旅行问答归纳')){
        const data=JSON.parse(request.messages.at(-1).content);assert.deepEqual(data.answers,profile.interview.answers);assert.deepEqual(data.skipped,profile.interview.skipped);assert.equal(data.answers.find(answer=>answer.field==='travelDates').answer,'5天');
        return model({intent:requestSkippedBudget?'clarify':'ready',fields:normalizedFields,...(requestSkippedBudget?{followUp:{field:'budget',question:'这次预算是多少？'}}:{})});
      }
      assert.match(prompt,/城市旅行顾问/,'Final interview approval bypasses another conversational intent classifier');
      const data=JSON.parse(request.messages.find(message=>message.role==='user').content);
      assert.equal(data.input.destination,'拉萨');assert.equal(data.input.dayCount,5);assert.equal(data.input.hours,8);assert.equal(data.input.startTime,'10:00');assert.equal(data.input.crowdPreference,'popular');assert.deepEqual(data.input.interests,['美食','自然']);assert.deepEqual(data.input.diet.restrictions,[]);assert.equal(data.profile.fields.pace.value,'normal');assert.equal(data.profile.interview.status,'completed');assert.deepEqual(data.dailyLimits,{minutes:480,maxStops:3});assert.deepEqual(data.freeDays,[]);
      for(const field of [...profile.interview.skipped,'travelDates'])assert.deepEqual(data.profile.fields[field],{value:null,status:'missing'},`${field} stays unknown without preventing route generation`);
      assert.equal(data.currentPlan,null);assert.deepEqual(data.profile.interview.answers,profile.interview.answers);
      if(!request.messages.some(message=>message.role==='tool'))return model({content:null,tool_calls:[{id:'lookup-lhasa',type:'function',function:{name:'search_travel_web',arguments:JSON.stringify({query:'拉萨 热门 美食 自然 五天',city:'拉萨'})}}]});
      return model({unavailable:true,reason:'隔离测试主动不提供旅行资料；此用例只验证问答归纳到真实规划入口的交接。'});
    },toolImplementations:{searchTravelWeb:async args=>{searches.push(args);return {status:'unavailable',sources:[],error:'Fixture: no research sources provided'};}}});
    assert.equal(calls.length,3);assert.equal(searches.length,1);assert.equal(searches[0].city,'拉萨');
    const constraints=events.find(event=>event.type==='constraints')?.input;assert.ok(constraints,'The streaming frontend receives the same structured planning requirements');assert.equal(constraints.destination,'拉萨');assert.equal(constraints.dayCount,5);assert.equal(constraints.dailyHours,8);assert.equal(constraints.startTime,'10:00');assert.deepEqual(constraints.diet,{preferences:[],restrictions:[]});
    assert.ok(events.some(event=>event.type==='stage'&&event.role==='路线 Agent'&&event.status==='working'));
    assert.equal(result.kind,'clarify');assert.equal(result.status,'partial');assert.deepEqual(result.followUps,[],'A research failure is not a request to repeat optional questions');assert.equal(result.stops,undefined);
    assert.deepEqual(result.profile.interview.answers,profile.interview.answers);assert.deepEqual(result.profile.interview.skipped,profile.interview.skipped);assert.equal(result.profile.interview.status,'ready','The collected interview remains available for a generation retry');assert.equal(JSON.stringify(profile),before,'Planning never rewrites the submitted original answers');
  }
});
