import test from 'node:test';
import assert from 'node:assert/strict';
import {askTravelAdvisor,enrichTravelPlan,validateTravelGuide} from '../travel-advisor.js';
import {chatTravel} from '../travel-agent.js';
import {emptyTravelProfile} from '../public/src/travel-profile.js';

const routeSource={id:'web-route',title:'测试城旅行资料',url:'https://example.com/route',excerpt:'景点甲和景点乙提供游览体验。',accessStatus:'fetched',fetchedAt:'2026-10-08T00:00:00.000Z'};
const diningSource={id:'web-dining',title:'餐厅测试资料',url:'https://example.com/dining',excerpt:'榕景茶居（江边店）地址：江边路18号，特色菜：虾饺皇、干炒牛河。松风小馆（古街店）地址：古街路26号，特色菜：清蒸鱼、时蔬。',accessStatus:'fetched',fetchedAt:'2026-10-08T01:00:00.000Z'};
const research=sources=>({status:'ok',sources,queries:[],errors:[]});
const plan={city:'测试城',stops:[{id:'a',name:'景点甲',minutes:90,dayIndex:1},{id:'b',name:'景点乙',minutes:90,dayIndex:2}],days:[{dayIndex:1,stops:[{id:'a',name:'景点甲',minutes:90}]},{dayIndex:2,stops:[{id:'b',name:'景点乙',minutes:90}]}]};
const baseGuide=()=>({summary:'原游览攻略。',days:plan.days.map(day=>({dayIndex:day.dayIndex,overview:`原第${day.dayIndex}天概述。`,stops:day.stops.map(stop=>({stopId:stop.id,name:stop.name,howToPlay:`原${stop.name}玩法。`,highlights:['留意建筑细节。'],food:[{name:'粤式点心',note:'可按口味选择，具体店家待查。',sourceIds:['web-route']}],transport:'交通请按当天导航确认。',reservation:'预约要求待核实。',rainyAlternative:'下雨时可优先室内体验。',sourceIds:['web-route']}))}))});
const restaurant=(index=0)=>({kind:'restaurant',name:index?'松风小馆（古街店）':'榕景茶居（江边店）',note:'游览后顺路用餐，按忌口点菜。',address:index?'古街路26号':'江边路18号',dishes:index?['清蒸鱼']:['虾饺皇','干炒牛河'],mealTime:'建议游览后午餐',budgetNote:'人均消费待核实，以店内菜单为准。',sourceIds:['web-dining']});
const meals=()=>({days:plan.days.map((day,index)=>({dayIndex:day.dayIndex,meals:[{stopId:day.stops[0].id,...restaurant(index)}]}))});
const searchCall={tool_calls:[{id:'dining-search',type:'function',function:{name:'search_travel_web',arguments:JSON.stringify({query:'测试城 景点甲 景点乙 附近 餐厅 地址',city:'测试城'})}}],content:null};
function provider(outputs){
  const calls=[];return {calls,key:'fixture-not-a-secret',model:'fixture',fetchImpl:async(url,options)=>{
    assert.equal(url,'https://api.deepseek.com/chat/completions');const request=JSON.parse(options.body);calls.push(request);assert.ok(calls.length<=outputs.length,'unexpected model call');
    const output=outputs[calls.length-1],value=typeof output==='function'?output(request):output;
    return Response.json({choices:[{finish_reason:'stop',message:value.tool_calls?value:{content:typeof value==='string'?value:JSON.stringify(value)}}]});
  }};
}
const foodContext={profile:{fields:{interests:{value:['美食'],status:'confirmed'}}},description:'希望安排具体吃饭的地方。'};

const lookupBatch=(round,count)=>({tool_calls:Array.from({length:count},(_,index)=>({id:`lookup-${round}-${index}`,type:'function',function:{name:'search_travel_web',arguments:JSON.stringify({query:`测试城 餐厅 ${round}-${index}`,city:'测试城'})}})),content:null});

test('ordinary advisor calls retain six-tool and three-round defaults despite excess requested work',async()=>{
  for(const batches of [[8],[1,1,1]]){
    let calls=0;const stub=provider([...batches.map((count,index)=>lookupBatch(index,count)),request=>{assert.equal(request.tool_choice,'none');return {reply:'按已取得资料整理。'};}]);
    const result=await askTravelAdvisor({role:'旅行顾问',data:{}},{...stub,toolImplementations:{searchTravelWeb:async()=>{calls++;return research([diningSource]);}}});
    assert.equal(calls,batches.length===1?6:3);assert.ok(result.research.toolCalls<=6);assert.ok(result.research.rounds<=3);
  }
});

test('expanded advisor configuration is still capped at eighteen tools and five rounds',async()=>{
  for(const batches of [[7,7,7],[1,1,1,1,1]]){
    let calls=0;const stub=provider([...batches.map((count,index)=>lookupBatch(index,count)),request=>{assert.equal(request.tool_choice,'none');return {reply:'仅依据已经取得的资料。'};}]);
    const result=await askTravelAdvisor({role:'餐饮顾问',data:{}},{...stub,maxTools:999,maxRounds:999,toolImplementations:{searchTravelWeb:async()=>{calls++;return research([diningSource]);}}});
    assert.equal(calls,batches.length===3?18:5);assert.ok(result.research.toolCalls<=18);assert.ok(result.research.rounds<=5);
  }
});

test('three incomplete dining days can search beyond six calls but stop at their twelve-call budget',async()=>{
  const threePlan=structuredClone(plan),thirdStop={id:'c',name:'景点丙',minutes:90};threePlan.stops.push({...thirdStop,dayIndex:3});threePlan.days.push({dayIndex:3,stops:[thirdStop]});
  const draft=baseGuide(),thirdDay=structuredClone(draft.days[0]);thirdDay.dayIndex=3;thirdDay.stops[0].stopId='c';thirdDay.stops[0].name='景点丙';draft.days.push(thirdDay);
  for(const complete of [true,false]){
    let searches=0;const final=meals();if(complete)final.days.push({dayIndex:3,meals:[{stopId:'c',...restaurant()}]});
    const stub=provider([draft,lookupBatch(1,4),lookupBatch(2,4),lookupBatch(3,6),request=>{assert.equal(request.tool_choice,'none');return final;}]);
    const result=await enrichTravelPlan(threePlan,{...foodContext,description:'请给每天餐厅的完整分店名、地址和推荐菜。'},{...stub,researchContext:research([routeSource]),toolImplementations:{searchTravelWeb:async()=>{searches++;return research(searches>6?[diningSource]:[]);}}});
    assert.equal(searches,12);assert.equal(result.diningStatus,complete?'ready':'partial');assert.deepEqual(result.diningMissingDays,complete?[]:[3]);assert.deepEqual(result.diningRequiredFields,['address','dishes']);assert.deepEqual(result.days.map(day=>day.stops.map(stop=>stop.stopId)),[['a'],['b'],['c']]);
  }
});

test('a single-day dining update preserves older global gaps without imposing new details on other days',async()=>{
  const threePlan=structuredClone(plan),thirdStop={id:'c',name:'景点丙',minutes:90};threePlan.stops.push({...thirdStop,dayIndex:3});threePlan.days.push({dayIndex:3,stops:[thirdStop]});
  for(const priorDetails of [true,false]){
    const saved=baseGuide(),third=structuredClone(saved.days[0]);third.dayIndex=3;third.stops[0].stopId='c';third.stops[0].name='景点丙';saved.days.push(third);
    saved.days.forEach((day,index)=>{day.stops[0].food=[{...restaurant(index===1?1:0),address:index===1?restaurant(1).address:'',dishes:index===1?restaurant(1).dishes:[]}];});
    Object.assign(saved,{diningStatus:'partial',diningTargetDays:[1,2,3],diningRequiredFields:priorDetails?['address','dishes']:[]});
    const previous=validateTravelGuide(saved,threePlan,research([routeSource,diningSource]));
    const stub=provider([saved,request=>{const data=JSON.parse(request.messages.at(-1).content);assert.deepEqual(data.missingDays,[1]);assert.deepEqual(data.acceptedDays.map(day=>day.dayIndex),[1]);return searchCall;},{days:[meals().days[0]]}]);
    const result=await enrichTravelPlan(threePlan,{...foodContext,description:'只补第1天餐厅地址和推荐菜，保留第2、3天。',previousGuide:previous,revision:{focus:['food'],dayIndex:1}},{...stub,researchContext:research([routeSource,diningSource]),toolImplementations:{searchTravelWeb:async()=>research([diningSource])}});
    assert.equal(result.diningStatus,priorDetails?'partial':'ready');assert.deepEqual(result.diningMissingDays,priorDetails?[3]:[]);assert.deepEqual(result.diningTargetDays,[1,2,3]);assert.deepEqual(result.days.slice(1),previous.days.slice(1));
    assert.deepEqual(result.diningRequiredFieldsByDay[3],priorDetails?['address','dishes']:[]);
    const restored=validateTravelGuide(JSON.parse(JSON.stringify(result)),threePlan,research(result.sources));assert.equal(restored.diningStatus,result.diningStatus);assert.deepEqual(restored.diningMissingDays,result.diningMissingDays);
  }
});

test('requested restaurant addresses and dishes trigger research even when every day already has a sourced name',async()=>{
  const draft=baseGuide();draft.days.forEach((day,index)=>{day.stops[0].food=[{...restaurant(index),address:'',dishes:[]}];});let searches=0;
  const stub=provider([draft,request=>{const data=JSON.parse(request.messages.at(-1).content);assert.equal(request.tool_choice,'required');assert.deepEqual(data.requiredFields,['address','dishes']);assert.deepEqual(data.missingDays,[1,2]);assert.equal(data.acceptedDays[0].stops[0].restaurants[0].name,restaurant().name);return searchCall;},meals()]);
  const result=await enrichTravelPlan(plan,{...foodContext,description:'请给每天推荐具体餐厅的完整分店名、地址和点菜建议。'},{...stub,researchContext:research([routeSource,diningSource]),toolImplementations:{searchTravelWeb:async()=>{searches++;return research([diningSource]);}}});
  assert.equal(searches,1);assert.equal(result.diningStatus,'ready');assert.deepEqual(result.diningRequiredFields,['address','dishes']);assert.deepEqual(result.diningMissingDays,[]);
  for(const [index,day]of result.days.entries()){assert.equal(day.stops[0].food[0].name,restaurant(index).name);assert.equal(day.stops[0].food[0].address,restaurant(index).address);assert.deepEqual(day.stops[0].food[0].dishes,restaurant(index).dishes);}
});

test('name-only dining requests do not require address or dishes and address-only requests do not require dishes',async()=>{
  for(const [description,requiredFields,address]of [['给每天推荐顺路的餐厅店名。',[],''],['请推荐餐厅并给出分店位置。',['address'],'kept']]){
    const draft=baseGuide();draft.days.forEach((day,index)=>{day.stops[0].food=[{...restaurant(index),address:address?restaurant(index).address:'',dishes:[]}];});
    const stub=provider([draft]),result=await enrichTravelPlan(plan,{...foodContext,description},{...stub,researchContext:research([routeSource,diningSource])});
    assert.equal(stub.calls.length,1);assert.equal(result.diningStatus,'ready');assert.deepEqual(result.diningRequiredFields,requiredFields);
  }
});

test('missing requested dishes stay partial after insufficient research and after guide validation without discarding names',async()=>{
  const draft=baseGuide();draft.days.forEach((day,index)=>{day.stops[0].food=[{...restaurant(index),address:'',dishes:[]}];});
  const response=meals();response.days.forEach(day=>{day.meals[0].dishes=['无来源菜名'];});
  const stub=provider([draft,searchCall,response]);
  const result=await enrichTravelPlan(plan,{...foodContext,description:'餐厅请补充地址和推荐菜。'},{...stub,researchContext:research([routeSource,diningSource]),toolImplementations:{searchTravelWeb:async()=>research([diningSource])}});
  assert.equal(result.diningStatus,'partial');assert.deepEqual(result.diningMissingDays,[1,2]);assert.deepEqual(result.diningRequiredFields,['address','dishes']);assert.ok(result.warnings.some(warning=>/推荐菜.*待补充/.test(warning)));assert.ok(!result.warnings.some(warning=>warning.includes('还没有取得具体餐厅建议')));
  for(const [index,day]of result.days.entries()){assert.equal(day.stops[0].food[0].name,restaurant(index).name);assert.equal(day.stops[0].food[0].address,restaurant(index).address);assert.deepEqual(day.stops[0].food[0].dishes,[]);}
  const restored=validateTravelGuide(JSON.parse(JSON.stringify(result)),plan,research(result.sources));assert.equal(restored.diningStatus,'partial');assert.deepEqual(restored.diningRequiredFields,['address','dishes']);assert.deepEqual(restored.diningMissingDays,[1,2]);
});

test('dining detail research targets only days missing requested fields and preserves accepted complementary fields',async()=>{
  const draft=baseGuide();draft.days.forEach((day,index)=>{day.stops[0].food=[restaurant(index)];});draft.days[0].stops[0].food[0].dishes=[];
  const stub=provider([draft,request=>{const data=JSON.parse(request.messages.at(-1).content);assert.deepEqual(data.missingDays,[1]);return searchCall;},{days:[{dayIndex:1,meals:[{stopId:'a',...restaurant(),address:''}]}]}]);
  const result=await enrichTravelPlan(plan,{...foodContext,description:'请补齐餐厅地址和推荐菜。'},{...stub,researchContext:research([routeSource,diningSource]),toolImplementations:{searchTravelWeb:async()=>research([diningSource])}});
  assert.equal(result.diningStatus,'ready');assert.deepEqual(result.days[0].stops[0].food,[restaurant()]);assert.deepEqual(result.days[1],draft.days[1]);
});

test('food-focused enrichment researches a concrete restaurant for each active day without changing the accepted route',async()=>{
  const before=JSON.stringify(plan);let searches=0;
  const stub=provider([baseGuide(),request=>{assert.equal(request.tool_choice,'required');const data=JSON.parse(request.messages.at(-1).content);assert.deepEqual(data.missingDays,[1,2]);return searchCall;},meals()]);
  const result=await enrichTravelPlan(plan,foodContext,{...stub,researchContext:research([routeSource]),toolImplementations:{searchTravelWeb:async()=>{searches++;return research([diningSource]);}}});
  assert.equal(result.status,'ready');assert.equal(result.diningStatus,'ready');assert.deepEqual(result.diningMissingDays,[]);assert.equal(searches,1);assert.equal(stub.calls.length,3);
  assert.deepEqual(result.days.map(day=>day.stops.map(stop=>stop.stopId)),[['a'],['b']]);assert.equal(JSON.stringify(plan),before);
  for(const [index,day]of result.days.entries()){const food=day.stops[0].food.find(item=>item.kind==='restaurant');assert.equal(food.name,restaurant(index).name);assert.equal(food.address,restaurant(index).address);assert.deepEqual(food.dishes,restaurant(index).dishes);assert.ok(food.mealTime.includes('午餐'));assert.deepEqual(food.sourceIds,['web-dining']);}
});

test('food validation rejects an invented branch and removes unsupported address, dishes and price claims',()=>{
  const guide=baseGuide();guide.days[0].stops[0].food=[{...restaurant(),address:'不存在的路999号',dishes:['虾饺皇','没有出处的菜'],budgetNote:'人均80元即可吃饱。'}];guide.days[1].stops[0].food=[{...restaurant(),name:'榕景茶居（北城店）'}];
  const result=validateTravelGuide(guide,plan,research([routeSource,diningSource]));
  assert.equal(result.days[0].stops[0].food[0].address,'');assert.deepEqual(result.days[0].stops[0].food[0].dishes,['虾饺皇']);assert.match(result.days[0].stops[0].food[0].budgetNote,/待核实|尚未核实/);assert.ok(!result.days[0].stops[0].food[0].budgetNote.includes('80'));
  assert.deepEqual(result.days[1].stops[0].food,[]);assert.ok(result.warnings.some(line=>line.includes('北城店')));assert.ok(result.warnings.some(line=>line.includes('地址')));
});

test('failed restaurant research preserves the already generated sightseeing guide and marks dining gaps',async()=>{
  const stub=provider([baseGuide(),searchCall,{unavailable:true,reason:'没有取得餐厅资料。'}]);
  const result=await enrichTravelPlan(plan,foodContext,{...stub,researchContext:research([routeSource]),toolImplementations:{searchTravelWeb:async()=>({status:'unavailable',sources:[],error:'搜索暂不可用'})}});
  assert.equal(result.status,'ready');assert.equal(result.diningStatus,'partial');assert.deepEqual(result.diningMissingDays,[1,2]);assert.deepEqual(result.days.map(day=>day.stops[0].howToPlay),['原景点甲玩法。','原景点乙玩法。']);assert.equal(result.days[0].stops[0].food[0].name,'粤式点心');assert.ok(result.warnings.some(line=>/餐饮|餐厅/.test(line)));assert.equal(stub.calls.length,3);
});

test('successful dining supplementation clears obsolete missing-restaurant notices',async()=>{
  const draft=baseGuide();draft.days[0].stops[0].food=[{kind:'restaurant',name:'待核实的餐厅',note:'具体店尚未取得。',sourceIds:['web-route']}];
  const stub=provider([draft,searchCall,meals()]);
  const result=await enrichTravelPlan(plan,foodContext,{...stub,researchContext:research([routeSource]),toolImplementations:{searchTravelWeb:async()=>research([diningSource])}});
  assert.equal(result.diningStatus,'ready');assert.ok(!result.warnings.some(line=>line.includes('仍需补充')));
});

test('a food-only revision changes only the requested day food and retains every other guide detail',async()=>{
  const previous=validateTravelGuide(baseGuide(),plan,research([routeSource]));previous.days[0].stops[0].food=[restaurant()];previous.sources.push(diningSource);
  const draft=baseGuide();draft.summary='模型试图重写总述';draft.days[0].overview='模型改第一天';draft.days[1].stops[0].howToPlay='模型改第二天玩法';
  const stub=provider([draft,request=>{assert.deepEqual(JSON.parse(request.messages.at(-1).content).missingDays,[2]);return searchCall;},{days:[meals().days[1]]}]);
  const result=await enrichTravelPlan(plan,{...foodContext,previousGuide:previous,revision:{focus:['food'],dayIndex:2}},{...stub,researchContext:research([routeSource,diningSource]),toolImplementations:{searchTravelWeb:async()=>research([diningSource])}});
  assert.equal(result.diningStatus,'ready');assert.equal(result.summary,previous.summary);assert.deepEqual(result.days[0],previous.days[0]);assert.equal(result.days[1].stops[0].howToPlay,previous.days[1].stops[0].howToPlay);assert.equal(result.days[1].stops[0].food.find(food=>food.kind==='restaurant').name,'松风小馆（古街店）');
});

test('fresh-research option requires one new tool call despite existing readable route sources',async()=>{
  const stub=provider([request=>{assert.equal(request.tool_choice,'required');return searchCall;},request=>{assert.equal(request.tool_choice,'auto');return {reply:'餐厅来源已取得。',sourceIds:['web-dining']};}]);
  const result=await askTravelAdvisor({role:'餐饮顾问',prompt:'',data:{}},{...stub,requireFreshResearch:true,researchContext:research([routeSource]),toolImplementations:{searchTravelWeb:async()=>research([diningSource])}});
  assert.equal(result.research.toolCalls,1);assert.deepEqual(result.research.sources.map(source=>source.id),['web-route','web-dining']);
});

test('a restaurant cannot borrow its address or dishes from a different cited restaurant',()=>{
  const named={...diningSource,excerpt:'榕景茶居（江边店）提供餐饮。'},other={...diningSource,id:'web-other-shop',url:'https://example.com/other-shop',excerpt:'松风小馆（古街店）地址：古街路26号，特色菜：清蒸鱼。'};
  const guide=baseGuide();guide.days[0].stops[0].food=[{...restaurant(),address:'古街路26号',dishes:['清蒸鱼'],sourceIds:['web-dining','web-other-shop']}];
  const result=validateTravelGuide(guide,plan,research([routeSource,named,other]));
  const food=result.days[0].stops[0].food[0];assert.equal(food.name,restaurant().name);assert.equal(food.address,'');assert.deepEqual(food.dishes,[]);
});

test('a multi-branch source cannot lend a different branch address, dishes or prices',()=>{
  const listing={...diningSource,excerpt:'榕景茶居（江边店）地址：江边路18号，特色菜：虾饺皇、干炒牛河，人均90元。榕景茶居（古街店）地址：古街路26号，特色菜：清蒸鱼，人均120元。'};
  const guide=baseGuide();guide.days[0].stops[0].food=[{...restaurant(),address:'古街路26号',dishes:['虾饺皇','清蒸鱼'],budgetNote:'参考人均120元。'}];
  const result=validateTravelGuide(guide,plan,research([routeSource,listing]));
  const food=result.days[0].stops[0].food[0];assert.equal(food.name,restaurant().name);assert.equal(food.address,'');assert.deepEqual(food.dishes,['虾饺皇']);assert.ok(!food.budgetNote.includes('120'));
});

test('a fetched single-branch detail address label repairs an omitted or model-expanded address with the source text',()=>{
  const name='蔡澜点心·粤菜（正佳广场店）',address='天河路228号正佳广场6楼中庭601号(西北门11-12号电梯直达门店)';
  for(const proposed of [undefined,'',`广东省广州市天河区${address}`]){
    const detail={...diningSource,title:'蔡澜点心·粤菜(正佳广场店)',excerpt:`地 址： ${address} … 本店特色美食：虾饺皇。`};
    const food={...restaurant(),name,address:proposed,dishes:['虾饺皇']};if(proposed===undefined)delete food.address;
    const guide=baseGuide();guide.days[0].stops[0].food=[food];const result=validateTravelGuide(guide,plan,research([routeSource,detail]));
    assert.equal(result.days[0].stops[0].food[0].address,address);assert.deepEqual(result.days[0].stops[0].food[0].dishes,['虾饺皇']);assert.ok(!result.warnings.some(warning=>warning.includes('地址未找到')));
  }
});

test('address label extraction ends at line and next-field boundaries without copying contact or menu text',()=>{
  const name=restaurant().name;
  for(const ending of ['\n电话：020-12345678',' 电话：020-12345678',' … 本店特色美食：虾饺皇']){
    const detail={...diningSource,title:name,excerpt:`地 址： 江边路18号${ending}`};
    const guide=baseGuide();guide.days[0].stops[0].food=[{...restaurant(),address:'',dishes:[]}];
    assert.equal(validateTravelGuide(guide,plan,research([routeSource,detail])).days[0].stops[0].food[0].address,'江边路18号');
  }
});

test('conflicting, list-page, snippet or other-branch address labels cannot fill an unsupported restaurant address',()=>{
  const name=restaurant().name,entry='地址：江边路18号';
  const cases=[
    [{...diningSource,title:name,excerpt:`${entry}\n地址：江边路28号`}],
    [{...diningSource,title:`${name}等热门餐厅推荐`,excerpt:`${name} ${entry}`}],
    [{...diningSource,title:name,accessStatus:'search-snippet',excerpt:entry}],
    [{...diningSource,title:name,excerpt:`${name}介绍。附近餐馆：松风小馆（古街店） 地址：古街路26号`}],
    [{...diningSource,title:'榕景茶居（北城店）',excerpt:`${name}附近另有分店。地址：北城路99号`}],
    [{...diningSource,title:name,excerpt:entry},{...diningSource,id:'web-other-address',url:'https://example.com/address-2',title:name,excerpt:'地址：江边路28号'}]
  ];
  for(const sources of cases){
    const guide=baseGuide();guide.days[0].stops[0].food=[{...restaurant(),address:'',dishes:[],sourceIds:sources.map(source=>source.id)}];
    const food=validateTravelGuide(guide,plan,research([routeSource,...sources])).days[0].stops[0].food[0];assert.equal(food.address,'',sources[0].excerpt);
  }
});

test('restaurant detail title binds its own preceding fields but excludes nearby restaurant listings',()=>{
  const detail={...diningSource,title:'榕景茶居（江边店）餐厅攻略',excerpt:'地址：江边路18号。特色菜：虾饺皇、干炒牛河。榕景茶居（江边店）介绍：江边用餐。附近餐馆：松风小馆（古街店）地址：古街路26号，特色菜：清蒸鱼。'};
  const guide=baseGuide();guide.days[0].stops[0].food=[{...restaurant(),dishes:['虾饺皇','清蒸鱼']}];
  const food=validateTravelGuide(guide,plan,research([routeSource,detail])).days[0].stops[0].food[0];
  assert.equal(food.address,restaurant().address);assert.deepEqual(food.dishes,['虾饺皇']);
});

test('a title mentioning both shops does not make the first shop record belong to the later shop',()=>{
  const listing={...diningSource,title:'松风小馆（古街店）与榕景茶居（江边店）',excerpt:'松风小馆（古街店）地址：古街路26号，特色菜：清蒸鱼。榕景茶居（江边店）地址：江边路18号，特色菜：虾饺皇。'};
  const guide=baseGuide();guide.days[0].stops[0].food=[{...restaurant(),address:'古街路26号',dishes:['虾饺皇','清蒸鱼']}];
  const food=validateTravelGuide(guide,plan,research([routeSource,listing])).days[0].stops[0].food[0];
  assert.equal(food.address,'');assert.deepEqual(food.dishes,['虾饺皇']);
});

test('address entry boundaries also protect restaurants without branch parentheses',()=>{
  const listing={...diningSource,excerpt:'榕景茶居地址：江边路18号，特色菜：虾饺皇。松风小馆地址：古街路26号，特色菜：清蒸鱼。'};
  const guide=baseGuide();guide.days[0].stops[0].food=[{...restaurant(),name:'榕景茶居',address:'古街路26号',dishes:['虾饺皇','清蒸鱼']}];
  const food=validateTravelGuide(guide,plan,research([routeSource,listing])).days[0].stops[0].food[0];
  assert.equal(food.address,'');assert.deepEqual(food.dishes,['虾饺皇']);
});

test('failed restaurant refresh retains validated previous food and its sources without claiming a successful update',async()=>{
  const saved=baseGuide();saved.days.forEach((day,index)=>{day.stops[0].food=[restaurant(index)];});
  const previous=validateTravelGuide(saved,plan,research([routeSource,diningSource]));
  const draft=baseGuide();draft.days[1].stops[0].food=[];
  const stub=provider([draft,searchCall,{unavailable:true,reason:'餐厅补查超时。'}]);
  const result=await enrichTravelPlan(plan,{...foodContext,previousGuide:previous,revision:{focus:['food'],dayIndex:2}},{...stub,researchContext:research([routeSource,diningSource]),toolImplementations:{searchTravelWeb:async()=>({status:'unavailable',sources:[],error:'搜索暂不可用'})}});
  assert.equal(result.diningStatus,'partial');assert.deepEqual(result.days,previous.days);assert.deepEqual(result.diningMissingDays,[]);assert.deepEqual(result.diningRetainedDays,[2]);
  assert.ok(result.sources.some(source=>source.id==='web-dining'));assert.ok(result.warnings.some(line=>/保留上一版/.test(line)));assert.ok(!result.warnings.some(line=>/第2天还没有取得具体餐厅/.test(line)));
});

test('partial dining refresh keeps fresh verified meals and restores only the still unfilled previous day',async()=>{
  const saved=baseGuide();saved.days.forEach((day,index)=>{day.stops[0].food=[restaurant(index)];});
  const previous=validateTravelGuide(saved,plan,research([routeSource,diningSource]));
  const draft=baseGuide();draft.days.forEach(day=>{day.stops[0].food=[];});
  const fresh={...restaurant(),note:'本轮补查后建议提前用餐。'};
  const stub=provider([draft,searchCall,{days:[{dayIndex:1,meals:[{stopId:'a',...fresh}]}]}]);
  const result=await enrichTravelPlan(plan,{...foodContext,previousGuide:previous,revision:{focus:['food']}},{...stub,researchContext:research([routeSource,diningSource]),toolImplementations:{searchTravelWeb:async()=>research([diningSource])}});
  assert.equal(result.diningStatus,'partial');assert.deepEqual(result.diningRetainedDays,[2]);assert.deepEqual(result.diningMissingDays,[]);assert.deepEqual(result.days[0].stops[0].food,[fresh]);assert.deepEqual(result.days[1],previous.days[1]);
});

test('guide and dining timeouts return a readable Chinese explanation',async()=>{
  for(const baseCompletes of [false,true]){
    let calls=0;
    const options={key:'fixture-not-a-secret',timeoutMs:5,researchContext:research([routeSource]),fetchImpl:async()=>{
      calls++;
      if(baseCompletes&&calls===1)return Response.json({choices:[{message:{content:JSON.stringify(baseGuide())}}]});
      await new Promise(resolve=>setTimeout(resolve,30));return Response.json({});
    }};
    const result=await enrichTravelPlan(plan,foodContext,options);
    assert.equal(result.status,baseCompletes?'ready':'unavailable');assert.ok(result.warnings.some(warning=>warning.includes('超时')));assert.ok(result.warnings.every(warning=>!warning.includes('The operation was aborted')));
  }
});

test('new restaurant sources survive a full saved ledger while current guide citations remain pinned for follow-up',async()=>{
  for(const count of [18,64]){
    const priorSources=[routeSource,...Array.from({length:count-1},(_,index)=>({...routeSource,id:`web-old-${index}`,url:`https://example.com/old-${index}`,excerpt:`候选资料 ${index}。`}))];
    const stub=provider([baseGuide(),searchCall,meals()]);
    const guide=await enrichTravelPlan(plan,foodContext,{...stub,researchContext:research(priorSources),toolImplementations:{searchTravelWeb:async()=>research([diningSource])}});
    assert.equal(guide.diningStatus,'ready');assert.ok(guide.sources.some(source=>source.id==='web-route'));assert.ok(guide.sources.some(source=>source.id==='web-dining'));assert.ok(guide.sources.length<=64);
    const followup=provider([request=>{const context=JSON.parse(request.messages.at(-1).content),saved=context.availableResearch.sources;assert.deepEqual(context.currentGuide.days.map(day=>day.stops[0].food[0]),[restaurant(),restaurant(1)]);assert.ok(saved.some(source=>source.id==='web-dining'&&source.fetchedAt===diningSource.fetchedAt));return {intent:'answer',reply:'此前餐厅资料记有地址，出发前再确认营业情况。',sourceIds:['web-dining']};}]);
    const answer=await chatTravel({description:'刚才推荐餐厅的地址是什么？',profile:emptyTravelProfile(),currentPlan:{...plan,guide},mode:'ai',textRevision:true},{...followup,advisorEnabled:true});
    assert.equal(answer.kind,'answer');assert.deepEqual(answer.sourceIds,['web-dining']);assert.equal(followup.calls.length,1);
  }
});

test('invalid dining output cannot replace a valid sightseeing guide or add a route member',async()=>{
  const invalid={days:[{dayIndex:1,meals:[{stopId:'invented-stop',...restaurant()}]}]};
  const stub=provider([baseGuide(),searchCall,invalid]);
  const result=await enrichTravelPlan(plan,foodContext,{...stub,researchContext:research([routeSource]),toolImplementations:{searchTravelWeb:async()=>research([diningSource])}});
  assert.equal(result.status,'ready');assert.equal(result.diningStatus,'partial');assert.deepEqual(result.days.map(day=>day.stops.map(stop=>stop.stopId)),[['a'],['b']]);assert.equal(result.days[0].stops[0].howToPlay,'原景点甲玩法。');assert.ok(result.warnings.some(line=>line.includes('不能添加')));
});
