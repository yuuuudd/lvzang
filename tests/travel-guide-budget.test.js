import test from 'node:test';
import assert from 'node:assert/strict';
import {enrichTravelPlan} from '../travel-advisor.js';

const stops=Array.from({length:6},(_,index)=>({id:`place-${index}`,name:`测试景点${index+1}`,minutes:80}));
const plan={city:'测试城',stops,days:[1,2,3].map(dayIndex=>({dayIndex,stops:stops.slice((dayIndex-1)*2,dayIndex*2)}))};
const source={id:'web-route',title:'测试游览资料',url:'https://example.com/route',excerpt:stops.map(stop=>stop.name).join('、'),accessStatus:'fetched',fetchedAt:'2026-10-08T00:00:00.000Z'};
const research={status:'ok',sources:[source],queries:[],errors:[]};
const guide={summary:'沿用已取得的地点资料。',days:plan.days.map(day=>({dayIndex:day.dayIndex,overview:'每一天安排具体游览。',stops:day.stops.map(stop=>({stopId:stop.id,name:stop.name,howToPlay:'沿步道观景，按兴趣停留。',highlights:['观察建筑。'],food:[],transport:'交通以地图为准。',reservation:'预约信息待核实。',rainyAlternative:'雨天优先有遮挡区域。',sourceIds:[source.id]}))}))};

test('six-stop guide reuses route evidence before the dedicated restaurant search',async()=>{
  let requests=0,searches=0;
  const result=await enrichTravelPlan(plan,{description:'请详细补充三天玩法和具体餐厅。',profile:{fields:{interests:{value:['美食']}}}},{key:'fixture',researchContext:research,
    fetchImpl:async(url,options)=>{
      const request=JSON.parse(options.body);requests++;
      let message;
      if(requests===1){
        assert.equal(request.tools,undefined,'Known route evidence should not trigger another whole-city research loop before writing six stops');
        message={content:JSON.stringify(guide)};
      }else if(requests===2){
        assert.equal(request.tool_choice,'required','Concrete dining still performs a real fresh tool call');
        message={content:null,tool_calls:[{id:'dining',type:'function',function:{name:'search_travel_web',arguments:JSON.stringify({query:'测试城 顺路餐厅'})}}]};
      }else{
        assert.equal(requests,3);
        message={content:JSON.stringify({unavailable:true,reason:'本次未找到具体分店。'})};
      }
      return Response.json({choices:[{finish_reason:'stop',message}]});
    },toolImplementations:{searchTravelWeb:async()=>{searches++;return {status:'unavailable',sources:[],error:'没有具体餐饮来源'};}}});
  assert.equal(result.status,'ready');assert.equal(result.days.length,3);assert.equal(result.days.flatMap(day=>day.stops).length,6);
  assert.equal(result.diningStatus,'partial');assert.deepEqual(result.diningMissingDays,[1,2,3]);
  assert.equal(requests,3);assert.equal(searches,1);
});

test('a request to update current reservation information can still query fresh sources',async()=>{
  let request;
  const result=await enrichTravelPlan(plan,{description:'查询最新的预约规则',revision:{focus:['reservation']}},{key:'fixture',researchContext:research,fetchImpl:async(url,options)=>{
    request=JSON.parse(options.body);return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(guide)}}]});
  }});
  assert.ok(request.tools?.length);assert.equal(result.status,'ready');
});
