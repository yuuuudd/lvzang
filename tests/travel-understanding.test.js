import test from 'node:test';
import assert from 'node:assert/strict';
import {chatTravel} from '../travel-agent.js';
import {emptyTravelProfile,normalizeTravelProfile} from '../public/src/travel-profile.js';

const jsonResponse=value=>Response.json({choices:[{message:{content:JSON.stringify(value)}}]});
function modelStub(responses){
  const calls=[];
  return {calls,key:'unit-test',fetchImpl:async(_url,options)=>{
    const request=JSON.parse(options.body);calls.push(request);
    assert.ok(calls.length<=responses.length,'unexpected additional model call');
    const value=responses[calls.length-1];
    return jsonResponse(typeof value==='function'?value(request):value);
  }};
}
function providerStub(outputs){
  const calls=[];
  return {calls,key:'unit-test',fetchImpl:async(_url,options)=>{
    const request=JSON.parse(options.body);calls.push(request);assert.ok(calls.length<=outputs.length,'unexpected retry');
    const output=outputs[calls.length-1];return output instanceof Response?output:Response.json({choices:[{finish_reason:output.finish_reason??'stop',message:{content:output.content}}]});
  }};
}
function savedProfile(values={}){
  const profile=emptyTravelProfile();
  for(const [field,value]of Object.entries({destination:'广州',dayCount:3,dailyHours:8,startTime:'09:00',pace:'active',companions:{count:3},budget:{amount:1000,currency:'CNY',scope:'per-person',period:'trip',includes:[]},requiredPlaces:['粤博'],excludedPlaces:['广州塔'],...values}))profile.fields[field]={value,status:'confirmed'};
  return normalizeTravelProfile(profile);
}
const catalogResponses=decision=>[decision,{summary:'仅参考三城策划目录'}, {placeIds:['gz-square','gz-opera'],reason:'保留文化建筑地点'}, {placeIds:['gz-opera','gz-square'],title:'花城文化行',reason:'按候选顺序安排'}];
const body=(description,profile,extra={})=>({description,profile,mode:'ai',textRevision:true,...extra});

test('the first dialogue merges explicit facts without turning three days into total hours',async()=>{
  const stub=modelStub(catalogResponses({intent:'plan',reply:'先确认你的要求。',destination:'广州',profilePatch:{dayCount:3,dailyHours:24,companions:{count:99},budget:{amount:50000,scope:'group',period:'day'},requiredPlaces:['粤博'],excludedPlaces:['广州塔']}}));
  const result=await chatTravel(body('广州三天，每天8小时，我们三个人，每人全程1000元，必去粤博，不去广州塔',emptyTravelProfile(),{destination:'苏州',hours:4}),stub);
  assert.equal(stub.calls.length,4);assert.equal(result.status,'ready');
  assert.equal(result.profile.fields.destination.value,'广州');assert.equal(result.input.hours,8);assert.equal(result.input.dailyHours,8);assert.equal(result.input.dayCount,3);
  assert.equal(result.profile.fields.companions.value.count,3);assert.equal(result.profile.fields.budget.value.amount,1000);assert.equal(result.profile.fields.budget.value.scope,'per-person');
  assert.equal(result.days.length,3);assert.ok(result.days.every(day=>day.hours===8&&day.stops[0]?.transit===0));
  assert.ok(result.stops.some(stop=>stop.id==='gz-museum'));assert.ok(result.stops.every(stop=>stop.id!=='gz-tower'));
  assert.equal(new Set(result.stops.map(stop=>stop.id)).size,result.stops.length);assert.ok(result.assumptions.some(line=>/空余/.test(line)));
});

test('ordinary budget and museum questions preserve the profile and pending questions',async()=>{
  const profile=savedProfile();profile.followUps=[{field:'budget',question:'预算是每人还是全团？'}];
  for(const text of ['预算包含门票和交通吗？','粤博玩两小时够吗？','介绍一下粤博']){
    const events=[],stub=modelStub([{intent:'plan',reply:'参观与消费需要进一步确认。',profilePatch:{dailyHours:2,budget:{amount:1},destination:'苏州'}}]);
    const result=await chatTravel(body(text,profile,{hours:2}),{...stub,onProgress:event=>events.push(event)});
    assert.equal(stub.calls.length,1);assert.equal(result.kind,'answer');assert.deepEqual(result.profile,profile);
    assert.equal(result.input,undefined);assert.equal(result.stops,undefined);assert.ok(!events.some(event=>['constraints','profile'].includes(event.type)));
  }
});

test('an ordinary acknowledgement does not repeat pending travel questions',async()=>{
  const profile=savedProfile();profile.followUps=[{field:'budget',question:'预算是每人还是全团？'}];
  const stub=modelStub([{intent:'answer',reply:'不客气，有需要可以继续问我。'}]);
  const result=await chatTravel(body('谢谢',profile),stub);
  assert.equal(result.kind,'answer');assert.deepEqual(result.profile,profile);assert.equal(result.input,undefined);assert.equal(stub.calls.length,1);
});

test('missing facts return at most two follow-ups with no new itinerary',async()=>{
  const events=[],stub=modelStub([{intent:'clarify',reply:'我记下预算。',profilePatch:{budget:{amount:1000,scope:'per-person',period:'trip'},companions:{count:5}}}]);
  const result=await chatTravel(body('预算1000元',emptyTravelProfile()),{...stub,onProgress:event=>events.push(event)});
  assert.equal(stub.calls.length,1);assert.equal(result.kind,'clarify');assert.equal(result.status,'needs-info');assert.equal(result.input,undefined);assert.equal(result.stops,undefined);
  assert.deepEqual(result.followUps.map(question=>question.field),['destination','dayCount']);
  assert.equal(result.profile.fields.budget.value.amount,1000);assert.equal(result.profile.fields.budget.value.scope,'unknown');assert.equal(result.profile.fields.budget.value.period,'unknown');
  assert.equal(result.profile.fields.companions.value,null);assert.ok(!events.some(event=>event.type==='constraints'));
});

test('a short answer fills the pending day count without another extraction call',async()=>{
  const profile=savedProfile();profile.fields.dayCount={value:null,status:'missing'};profile.followUps=[{field:'dayCount',question:'准备玩几天？'}];
  const stub=modelStub(catalogResponses({intent:'plan',reply:'三天，继续沿用其他条件。',profilePatch:{dayCount:3,destination:'苏州',dailyHours:24}}));
  const result=await chatTravel(body('3',profile),stub);
  assert.equal(stub.calls.length,4);assert.equal(result.profile.fields.dayCount.value,3);assert.equal(result.input.destination,'广州');assert.equal(result.input.hours,8);assert.equal(result.kind,'plan');
});

test('short budget scope answers preserve the amount and resolve its missing scope',async()=>{
  const profile=savedProfile();profile.fields.budget.value.scope='unknown';profile.fields.budget.value.period='unknown';profile.followUps=[{field:'budget',question:'每人还是全团，全程还是每天？'}];
  const stub=modelStub(catalogResponses({intent:'plan',reply:'了解，沿用1000元的金额。',profilePatch:{budget:{scope:'per-person',period:'trip'}}}));
  const result=await chatTravel(body('每人全程',profile),stub);
  assert.equal(result.profile.fields.budget.value.amount,1000);assert.equal(result.profile.fields.budget.value.scope,'per-person');assert.equal(result.profile.fields.budget.value.period,'trip');assert.equal(stub.calls.length,4);
});

test('budget and companion-only revisions preserve existing stop IDs, dates and timings',async()=>{
  const firstStub=modelStub(catalogResponses({intent:'plan',reply:'按保存的条件安排。'}));
  let result=await chatTravel(body('帮我按保存条件安排路线',savedProfile()),firstStub);
  // Nonzero later transit exercises preservation rather than only first-stop resets.
  result={...result,stops:[{...result.stops[0],dayIndex:1,minutes:75,transit:0},{...result.stops[1],dayIndex:1,minutes:35,transit:12},{...result.stops[2],dayIndex:2,minutes:40,transit:0}],days:undefined};
  const previous=structuredClone(result),expected=result.stops.map(({id,dayIndex,minutes,transit})=>({id,dayIndex,minutes,transit}));
  for(const [text,patch]of [['预算改为每人全程800元',{budget:{amount:800,scope:'per-person',period:'trip'}}],['同行改为四个人',{companions:{count:4}}]]){
    const stub=modelStub([{intent:'plan',reply:'只调整这个条件。',profilePatch:patch},{summary:'沿用资料'},{placeIds:['gz-tower'],reason:'不应重选'}, {placeIds:['gz-tower'],title:'不应换标题',reason:'不应重排'}]);
    const next=await chatTravel(body(text,result.profile,{currentPlan:result,previous:result.input,hours:2}),stub);
    assert.equal(stub.calls.length,1);assert.equal(next.kind,'plan');assert.deepEqual(next.stops.map(({id,dayIndex,minutes,transit})=>({id,dayIndex,minutes,transit})),expected);
    assert.equal(next.input.hours,8);assert.equal(next.input.startTime,'09:00');assert.deepEqual(next.profile.fields.requiredPlaces.value,['粤博']);assert.deepEqual(next.profile.fields.excludedPlaces.value,['广州塔']);result=next;
  }
  assert.equal(result.profile.fields.budget.value.amount,800);assert.equal(result.profile.fields.companions.value.count,4);assert.equal(previous.input.hours,8);
});

test('an impossible mandatory visit returns clarification and preserves the old plan',async()=>{
  const first=await chatTravel(body('帮我按保存条件安排路线',savedProfile()),modelStub(catalogResponses({intent:'plan',reply:'按保存需求安排。'})));
  const before=JSON.stringify(first),stub=modelStub(catalogResponses({intent:'plan',reply:'每日改为一小时。',constraints:{hours:1}}));
  const result=await chatTravel(body('每天改为1小时',first.profile,{currentPlan:first,previous:first.input}),stub);
  assert.equal(stub.calls.length,4);assert.equal(result.kind,'clarify');assert.equal(result.profile.fields.dailyHours.value,1);assert.equal(result.input,undefined);assert.equal(result.stops,undefined);
  assert.match(result.assistantReply,/必去.*无法|无法.*必去/);assert.match(result.assistantReply,/延长天数|减少必去/);assert.equal(JSON.stringify(first),before);
});

test('a mandatory name absent from the catalog is never silently dropped',async()=>{
  const profile=savedProfile({requiredPlaces:['陈家祠']});
  const result=await chatTravel(body('帮我按保存条件安排路线',profile),modelStub(catalogResponses({intent:'plan',reply:'检查目录覆盖。'})));
  assert.equal(result.kind,'clarify');assert.match(result.assistantReply,/陈家祠.*尚未安排/);assert.equal(result.stops,undefined);
});

test('other-city daily plans use two calls and receive the updated profile',async()=>{
  const initial=savedProfile({destination:'北京',dayCount:2,requiredPlaces:['故宫'],excludedPlaces:['天坛']});
  const stub=modelStub([{intent:'plan',reply:'将预算更新后整理两天路线。',profilePatch:{budget:{amount:800}}},request=>{
    const payload=JSON.parse(request.messages.at(-1).content);assert.equal(payload.profile.fields.budget.value.amount,800);assert.equal(payload.input.hours,8);assert.ok(request.max_tokens>1600);
    return {title:'北京文化两日',days:[{dayIndex:1,stops:[{name:'故宫博物院',minutes:150,transit:0,story:'传统建筑'}]},{dayIndex:2,stops:[{name:'景山公园',minutes:50,transit:0},{name:'北海公园',minutes:60,transit:20}]}]};
  }]);
  const result=await chatTravel(body('预算改为每人全程800元',initial),stub);
  assert.equal(stub.calls.length,2);assert.equal(result.days.length,2);assert.equal(result.stops.length,3);
  assert.ok(result.stops.every(stop=>stop.kind==='suggested'&&stop.coords===null&&stop.source===''&&stop.id.startsWith('suggested-')&&stop.city==='北京'));
  assert.match(result.assistantReply,/尚未核实|需要.*确认/);
});

test('other-city budget revisions keep existing suggested IDs and day assignments',async()=>{
  const profile=savedProfile({destination:'北京',dayCount:2,requiredPlaces:['故宫'],excludedPlaces:['天坛']});
  const currentPlan={city:'北京',title:'北京旧路线',input:{hours:8,startTime:'09:00'},stops:[{id:'suggested-1',name:'故宫博物院',city:'北京',minutes:150,transit:0,dayIndex:1},{id:'suggested-3',name:'北海公园',city:'北京',minutes:60,transit:0,dayIndex:2}]};
  const stub=modelStub([{intent:'plan',reply:'只改预算。',profilePatch:{budget:{amount:800}}},{stops:[{name:'不应采用的随机推荐',minutes:30,transit:0}]}]);
  const result=await chatTravel(body('预算改为每人全程800元',profile,{currentPlan}),stub);
  assert.equal(stub.calls.length,1);assert.deepEqual(result.stops.map(stop=>[stop.id,stop.name,stop.dayIndex]),currentPlan.stops.map(stop=>[stop.id,stop.name,stop.dayIndex]));
});

test('other-city routes reject known landmarks from a different city and excluded places',async()=>{
  const profile=savedProfile({destination:'北京',requiredPlaces:[],excludedPlaces:['天坛']});
  for(const name of ['广州塔','天坛公园']){
    const stub=modelStub([{intent:'plan',reply:'重新安排北京路线。'},{stops:[{name,minutes:60,transit:0}]}]);
    await assert.rejects(()=>chatTravel(body('帮我重新安排路线',profile),stub),/其他城市|排除/);
    assert.equal(stub.calls.length,2);
  }
});

test('an explicit draft request can keep ambiguous budget scope without inventing it',async()=>{
  const profile=savedProfile();profile.fields.budget.value.scope='unknown';profile.fields.budget.value.period='unknown';profile.followUps=[{field:'budget',question:'这笔预算是每人还是全团？'}];
  const stub=modelStub(catalogResponses({intent:'plan',reply:'先保留未确认的预算口径。'}));
  const result=await chatTravel(body('先给方案',profile),stub);
  assert.equal(result.kind,'plan');assert.equal(stub.calls.length,4);assert.equal(result.profile.fields.budget.value.scope,'unknown');assert.equal(result.profile.fields.budget.value.period,'unknown');assert.match(result.input.budget,/待确认/);
});

test('requested defaults are marked tentative and every later catalog transfer is an estimate',async()=>{
  const stub=modelStub(catalogResponses({intent:'plan',reply:'先按默认时间起草。',destination:'广州'}));
  const result=await chatTravel(body('广州，直接安排',emptyTravelProfile(),{hours:4,destination:'苏州'}),stub);
  assert.equal(result.kind,'plan');assert.equal(result.profile.revision,1);assert.equal(result.profile.fields.dayCount.value,1);assert.equal(result.profile.fields.dayCount.status,'tentative');
  assert.equal(result.profile.fields.dailyHours.value,8);assert.equal(result.profile.fields.dailyHours.status,'tentative');assert.equal(result.profile.fields.destination.value,'广州');
  assert.ok(result.stops.length>1);assert.equal(result.stops[0].transit,0);assert.ok(result.stops.slice(1).every(stop=>stop.transit>=10));assert.ok(result.assumptions.some(line=>/转场.*估算/.test(line)));
});

test('a seven-day unknown-city route accepts 28 bounded suggestions with daily grouping',async()=>{
  const profile=savedProfile({destination:'北京',dayCount:7,requiredPlaces:[],excludedPlaces:[]});
  const names=['故宫博物院','景山公园','北海公园','什刹海','天坛公园','颐和园','圆明园','奥林匹克森林公园','中国国家博物馆','首都博物馆','中国美术馆','中国科学技术馆','恭王府','雍和宫','国子监','孔庙','鼓楼','钟楼','王府井','前门大街','北京动物园','北京植物园','八达岭长城','慕田峪长城','香山公园','陶然亭公园','北京石刻艺术博物馆','中国铁道博物馆'];
  const stub=modelStub([{intent:'plan',reply:'整理七天建议。'},request=>{
    assert.ok(request.max_tokens>=5000);return {days:Array.from({length:7},(_,index)=>({dayIndex:index+1,stops:names.slice(index*4,index*4+4).map((name,stopIndex)=>({name,minutes:30,transit:stopIndex?10:0}))}))};
  }]);
  const result=await chatTravel(body('帮我重新安排北京七天路线',profile),stub);
  assert.equal(stub.calls.length,2);assert.equal(result.days.length,7);assert.equal(result.stops.length,28);assert.equal(result.stops.at(-1).id,'suggested-28');assert.ok(result.days.every(day=>day.stops.length===4&&day.stops[0].transit===0));
});

test('legacy dialogue constraints still map easy mode to the profile enum',async()=>{
  const profile=savedProfile();const stub=modelStub(catalogResponses({intent:'plan',reply:'轻松安排。',constraints:{easy:true}}));
  const result=await chatTravel(body('少走路，帮我安排路线',profile),stub);
  assert.equal(result.profile.fields.pace.value,'easy');assert.equal(result.input.easy,true);assert.equal(result.kind,'plan');
});

test('malformed profiles fail before a model call',async()=>{
  const stub=modelStub([]);await assert.rejects(()=>chatTravel(body('你好',{version:1}),stub),/档案/);assert.equal(stub.calls.length,0);
});

test('a touched city selector confirms its city without asking the same question again',async()=>{
  const result=await chatTravel(body('三天，每天8小时',emptyTravelProfile(),{mode:'demo',destination:'杭州',textRevision:false}));
  assert.equal(result.kind,'plan');assert.equal(result.city,'杭州');assert.deepEqual(result.profile.fields.destination,{value:'杭州',status:'confirmed'});assert.equal(result.profile.fields.dayCount.value,3);assert.ok(!result.profile.followUps.some(question=>question.field==='destination'));
});

test('a touched selector changes a saved city and clears that city’s named place constraints',async()=>{
  const previous=savedProfile(),before=JSON.stringify(previous);
  const result=await chatTravel(body('三天，每天8小时',previous,{mode:'demo',destination:'杭州',textRevision:false}));
  assert.equal(result.kind,'plan');assert.equal(result.city,'杭州');assert.equal(result.profile.fields.destination.status,'confirmed');assert.equal(result.profile.fields.requiredPlaces.value,null);assert.equal(result.profile.fields.excludedPlaces.value,null);
  assert.equal(result.profile.fields.budget.value.amount,1000);assert.equal(result.profile.fields.companions.value.count,3);assert.equal(result.profile.revision,previous.revision+1);assert.equal(JSON.stringify(previous),before);assert.ok(result.stops.every(stop=>stop.city==='杭州'));
});

test('an explicit city in this turn outranks the selected city even if the model follows the selector',async()=>{
  const stub=modelStub([{intent:'plan',reply:'理解本轮请求。',destination:'杭州',profilePatch:{destination:'杭州'}},{stops:[{name:'景山公园',minutes:50,transit:0}]}]);
  const result=await chatTravel(body('换成北京两天，每天8小时',savedProfile(),{destination:'杭州',textRevision:false}),stub);
  assert.equal(stub.calls.length,2);assert.equal(result.city,'北京');assert.equal(result.profile.fields.destination.status,'confirmed');assert.equal(result.profile.fields.requiredPlaces.value,null);assert.equal(result.profile.fields.excludedPlaces.value,null);
});

test('a city explicitly repeated in the text keeps its required places despite another selected city',async()=>{
  const result=await chatTravel(body('广州三天，每天8小时',savedProfile(),{mode:'demo',destination:'杭州',textRevision:false}));
  assert.equal(result.city,'广州');assert.deepEqual(result.profile.fields.requiredPlaces.value,['粤博']);assert.deepEqual(result.profile.fields.excludedPlaces.value,['广州塔']);
});

test('an untouched default selector never becomes a confirmed city',async()=>{
  const result=await chatTravel(body('三天，每天8小时',emptyTravelProfile(),{mode:'demo',destination:'杭州',textRevision:true}));
  assert.equal(result.kind,'clarify');assert.deepEqual(result.profile.fields.destination,{value:null,status:'missing'});assert.equal(result.followUps[0].field,'destination');
});

test('manual city values cannot inject another travel condition into the confirmed merge',async()=>{
  await assert.rejects(()=>chatTravel(body('三天，每天8小时',emptyTravelProfile(),{mode:'demo',destination:'杭州。预算9999元',textRevision:false})),/手动选择的目的地/);
});

test('complete JSON inside a fence or harmless surrounding text is accepted on the first call',async()=>{
  const answer={intent:'answer',reply:'宝盒里的 {展品} 与 "建筑" 都可以慢慢看。'};
  for(const content of [`\`\`\`json\n${JSON.stringify(answer)}\n\`\`\``,`以下是回答：\n${JSON.stringify(answer)}\n以上。`]){
    const stub=providerStub([{content}]);const result=await chatTravel(body('介绍一下粤博',savedProfile()),stub);
    assert.equal(stub.calls.length,1);assert.equal(result.assistantReply,answer.reply);assert.ok(stub.calls[0].messages[0].content.includes('最多120字'));
  }
});

test('length-limited responses retry once even if the partial result happens to be valid JSON',async()=>{
  const stub=providerStub([{finish_reason:'length',content:JSON.stringify({intent:'answer',reply:'这次被截断，不能接受。'})},{content:JSON.stringify({intent:'answer',reply:'完整回答。'})}]);
  const result=await chatTravel(body('介绍一下粤博',savedProfile()),stub);
  assert.equal(result.assistantReply,'完整回答。');assert.equal(stub.calls.length,2);assert.equal(stub.calls[0].max_tokens,1600);assert.ok(stub.calls[1].max_tokens>=3200);assert.match(stub.calls[1].messages[0].content,/仅返回一个完整有效的 JSON 对象/);
});

test('empty and incomplete JSON responses each receive only one recovery attempt',async()=>{
  for(const content of ['',null,'   ','```json\n{"intent":"answer","reply":"unfinished"']){
    const stub=providerStub([{content},{content:JSON.stringify({intent:'answer',reply:'恢复后的完整回答。'})}]);
    const result=await chatTravel(body('介绍一下粤博',savedProfile()),stub);assert.equal(result.assistantReply,'恢复后的完整回答。');assert.equal(stub.calls.length,2);
  }
});

test('two malformed responses fail with a specific reason without returning raw model text',async()=>{
  const profile=savedProfile(),before=JSON.stringify(profile),raw='PRIVATE_RAW_FIXTURE_MUST_NOT_APPEAR';
  for(const output of [{content:raw},{content:''},{finish_reason:'length',content:raw}]){
    const stub=providerStub([output,output]);
    await assert.rejects(()=>chatTravel(body('介绍一下粤博',profile),stub),error=>{
      assert.match(error.message,/无效或不完整的 JSON|空回复|长度限制被截断/);assert.match(error.message,/已重试一次.*原方案和需求仍保留/);assert.ok(!error.message.includes(raw));return true;
    });
    assert.equal(stub.calls.length,2);assert.equal(JSON.stringify(profile),before);
  }
});

test('a failed planning stage after two output attempts leaves original plan and profile untouched',async()=>{
  const profile=savedProfile(),currentPlan={city:'广州',title:'已保存路线',stops:[{id:'gz-museum',name:'广东省博物馆',minutes:75,transit:0,dayIndex:1}]},original=JSON.stringify({profile,currentPlan}),events=[];
  const stub=providerStub([{content:JSON.stringify({intent:'plan',reply:'每日改为6小时。',profilePatch:{dailyHours:6}})},{content:''},{content:'{"summary":"broken'}]);
  await assert.rejects(()=>chatTravel(body('每天改为6小时',profile,{currentPlan}),{...stub,onProgress:event=>events.push(event)}),/资料分析 Agent.*JSON.*已重试一次/);
  assert.equal(stub.calls.length,3);assert.equal(JSON.stringify({profile,currentPlan}),original);assert.ok(events.some(event=>event.type==='profile'&&event.profile.fields.dailyHours.value===6));
});

test('HTTP errors do not trigger an output recovery request',async()=>{
  const stub=providerStub([Response.json({error:'provider failure'},{status:503})]);
  await assert.rejects(()=>chatTravel(body('介绍一下粤博',savedProfile()),stub),/调用失败/);assert.equal(stub.calls.length,1);
});

test('plan replies stay brief and multi-day titles describe the complete trip',async()=>{
  const responses=catalogResponses({intent:'plan',reply:'第一天：先去这里，第二天：再去那里。'.repeat(20)});responses[3].title='广州首日：粤博与珠江新城建筑漫游';
  const stub=modelStub(responses),first=await chatTravel(body('广州三天，每天8小时',savedProfile()),stub);
  assert.equal(stub.calls.length,4);assert.equal(first.title,'广州3天定制行程');assert.ok(stub.calls[3].messages[0].content.includes('整趟旅行'));
  const revision=modelStub([{intent:'plan',reply:'只改预算。',profilePatch:{budget:{amount:800}}}]);
  const next=await chatTravel(body('预算改为每人全程800元',first.profile,{currentPlan:first}),revision);assert.equal(revision.calls.length,1);assert.equal(next.title,first.title);
  const legacyTitlePlan={...first,title:'广州首日：粤博与珠江新城建筑漫游'},migration=modelStub([{intent:'plan',reply:'只改预算。',profilePatch:{budget:{amount:800}}}]);
  const migrated=await chatTravel(body('预算改为每人全程800元',first.profile,{currentPlan:legacyTitlePlan}),migration);
  assert.equal(migration.calls.length,1);assert.equal(migrated.title,'广州3天定制行程');assert.deepEqual(migrated.stops.map(stop=>[stop.id,stop.dayIndex]),first.stops.map(stop=>[stop.id,stop.dayIndex]));
});

test('an overlong dialogue plan is replaced by a confirmation before the final route is written',async()=>{
  const stub=modelStub([{intent:'plan',destination:'北京',reply:'第一天：模型预先写了冗长的路线和预算。'.repeat(30)},{stops:[{name:'景山公园',minutes:50,transit:0}]}]);
  const result=await chatTravel({description:'帮我安排北京两天',mode:'ai'},stub);
  assert.equal(stub.calls.length,2);assert.ok(result.assistantReply.startsWith('我已收到本轮需求'));assert.ok(!result.assistantReply.includes('冗长的路线'));assert.match(result.assistantReply,/景山公园/);
});
