import test from 'node:test';
import assert from 'node:assert/strict';
import {chatTravel} from '../travel-agent.js';
import {emptyTravelProfile} from '../public/src/travel-profile.js';

const source=(id,title,excerpt)=>({id,url:`https://www.suzhou.gov.cn/fixture/${id}`,title,excerpt,fetchedAt:'2026-10-08T00:00:00.000Z',accessStatus:'search-snippet',untrusted:true});
const gardens=source('web-gardens','苏州拙政园园林资料','苏州拙政园和留园均可游览；此条测试资料没有其他地点。');
const gate=source('web-gate','苏州东方之门','东方之门是苏州建筑游览的一个地点；营业与游览细节待核实。');
const response=value=>Response.json({choices:[{finish_reason:'stop',message:value.tool_calls?value:{content:JSON.stringify(value)}}]});

async function planWithEvidence({supplement=gate,initialComplete=false,initialEmpty=false,required='东方之门'}={}){
  const profile=emptyTravelProfile();
  for(const [field,value] of Object.entries({destination:'苏州',dayCount:3,dailyHours:6,startTime:'09:00',pace:'easy',interests:['园林','建筑'],requiredPlaces:[required]}))profile.fields[field]={value,status:'confirmed'};
  const before=JSON.stringify(profile),calls=[],searches=[],repairs=[];
  const draft=mandatoryId=>({title:'苏州三天园林建筑游',days:[required,'拙政园','留园'].map((name,index)=>({dayIndex:index+1,stops:[{name,minutes:90,transit:0,story:'按既定偏好游览，开放与交通待核实。',sourceIds:[index===0?mandatoryId:gardens.id]}]}))});
  let routeTurns=0;
  const result=await chatTravel({description:'请重新规划苏州三天完整行程，按已保存的条件先出方案',profile,mode:'ai',textRevision:true},{
    key:'fixture',model:'fixture',advisorEnabled:true,
    researchFetchImpl:async()=>new Response('',{status:503}),
    fetchImpl:async(url,options)=>{
      assert.equal(url,'https://api.deepseek.com/chat/completions');
      const request=JSON.parse(options.body),system=request.messages[0].content;calls.push(request);assert.ok(calls.length<=5,'No extra interview or unbounded repair');
      if(system.includes('你是旅行对话 Agent'))return response({intent:'plan',reply:'按现有条件重新规划。'});
      if(system.includes('你是城市旅行顾问')){
        if(routeTurns++===0)return response({content:null,tool_calls:[{id:'initial-garden-search',type:'function',function:{name:'search_travel_web',arguments:JSON.stringify({city:'苏州',query:'苏州 东方之门 园林'})}}]});
        return response(initialEmpty?{unavailable:true,reason:'首次广泛查询没有取得来源。'}:draft(initialComplete?gate.id:gardens.id));
      }
      if(system.includes('你是路线核对顾问')){
        const input=JSON.parse(request.messages.findLast(message=>message.role==='user').content);repairs.push(input);
        assert.equal(request.tools,undefined,'Repair reuses the newly collected evidence instead of opening another model search loop');
        return response(draft(supplement?.id||gardens.id));
      }
      assert.match(system,/你是旅行攻略顾问/);
      const input=JSON.parse(request.messages.findLast(message=>message.role==='user').content);
      return response({summary:'按已接受的三天地点顺序游览。',days:input.acceptedDays.map(day=>({dayIndex:day.dayIndex,overview:'按自己的节奏参观，出发前核实开放。',stops:day.stops.map(stop=>({stopId:stop.id,name:stop.name,howToPlay:'沿着现场开放区域慢慢参观，结合自己的兴趣观察建筑和园林细节。',highlights:[],food:[],transport:'实际交通以当天地图导航为准。',reservation:'预约要求待核实。',rainyAlternative:'下雨时先在允许停留的遮蔽区域休息。',sourceIds:[stop.name===required?gate.id:gardens.id]}))}))});
    },
    toolImplementations:{searchTravelWeb:async(args,options)=>{
      searches.push(args);assert.ok(options.signal,'Every research attempt remains cancellable');
      if(searches.length===1){const sources=initialEmpty?[]:initialComplete?[gardens,gate]:[gardens];return {status:initialEmpty?'unavailable':'ok',sources,queries:[{query:args.query,sourceIds:sources.map(item=>item.id)}],...(initialEmpty?{error:'首次查询暂未取得来源'}:{})};}
      assert.equal(searches.length,2,'Only one precise search is needed for this one missing required place');
      assert.equal(args.city,'苏州');assert.equal(args.query,`苏州 ${required}`,'Supplement must search the exact missing place, not repeat generic interests');
      const sources=supplement?initialEmpty?[supplement,gardens]:[supplement]:[];
      return {status:supplement?'ok':'unavailable',sources,queries:[{query:args.query,sourceIds:sources.map(item=>item.id)}],...(!supplement?{error:'隔离测试未找到必去地点资料'}:{})};
    }},
  });
  assert.equal(JSON.stringify(profile),before,'Research failure or success never mutates the submitted requirements');
  return {result,calls,searches,repairs};
}

test('missing mandatory place gets precise supplementary research before source repair and completes Suzhou planning',async()=>{
  const {result,searches,repairs}=await planWithEvidence();
  assert.equal(result.kind,'plan',result.assistantReply);assert.equal(result.status,'ready');assert.equal(result.city,'苏州');
  assert.deepEqual(result.stops.map(stop=>stop.name),['东方之门','拙政园','留园']);assert.equal(result.days.length,3);
  assert.deepEqual(result.stops[0].sourceIds,[gate.id]);assert.equal(searches.length,2);assert.equal(repairs.length,1);
  assert.ok(repairs[0].availableResearch.sources.some(item=>item.id===gate.id),'The repair sees the new, actually obtained source');
});

test('a precise search with no supporting result remains partial and cannot publish the mismatched draft',async()=>{
  const {result,searches}=await planWithEvidence({supplement:null});
  assert.equal(searches.length,2);assert.equal(result.kind,'clarify');assert.equal(result.status,'partial');assert.equal(result.stops,undefined);
  assert.match(result.assistantReply,/东方之门.*没有出现在|缺少.*资料/);assert.deepEqual(result.profile.fields.requiredPlaces.value,['东方之门']);
});

test('supplementary research cannot substitute another branch for an explicitly required branch',async()=>{
  const required='测试茶楼（东方之门店）',other=source('web-other-branch','苏州测试茶楼（拙政园店）','苏州测试茶楼（拙政园店）提供茶点，尚未取得其他分店资料。');
  const {result,searches}=await planWithEvidence({required,supplement:other});
  assert.equal(searches.length,2);assert.equal(result.kind,'clarify');assert.equal(result.status,'partial');assert.equal(result.stops,undefined);
  assert.ok(result.assistantReply.includes(required));assert.deepEqual(result.profile.fields.requiredPlaces.value,[required]);
});

test('existing evidence for every required place does not trigger redundant supplementary searches',async()=>{
  const {result,searches,repairs}=await planWithEvidence({initialComplete:true});
  assert.equal(result.kind,'plan',result.assistantReply);assert.equal(result.status,'ready');assert.equal(searches.length,1);assert.equal(repairs.length,0);
  assert.deepEqual(result.stops[0].sourceIds,[gate.id]);
});

test('zero initial sources still receive precise required-place research before deciding planning is unavailable',async()=>{
  const {result,searches,repairs}=await planWithEvidence({initialEmpty:true});
  assert.equal(searches.length,2,'An empty broad result must not bypass precise required-place research');
  assert.equal(repairs.length,1,'Newly obtained sources should support a bounded route correction');
  assert.equal(result.kind,'plan',result.assistantReply);assert.equal(result.status,'ready');
  assert.equal(result.city,'苏州');assert.equal(result.days.length,3);assert.ok(result.days.every(day=>day.stops.length));
  assert.deepEqual(result.stops.map(stop=>stop.name),['东方之门','拙政园','留园']);
  assert.deepEqual(result.stops[0].sourceIds,[gate.id]);
  assert.ok(repairs[0].availableResearch.sources.some(item=>item.id===gate.id));
  assert.ok(repairs[0].availableResearch.sources.some(item=>item.id===gardens.id));
  assert.ok(result.research.sources.filter(item=>['fetched','search-snippet'].includes(item.accessStatus)).every(item=>[gate.id,gardens.id].includes(item.id)),'Failed fallback pages cannot become usable route evidence');
});
