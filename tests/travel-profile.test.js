import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyTravelProfile,normalizeTravelProfile,updateTravelProfile,travelFollowUps,travelProfileInput,travelProfileSummary} from '../public/src/travel-profile.js';
import {buildDailyPlan} from '../public/src/travel-schedule.js';
import {byId} from '../public/src/travel-catalog.js';

const update=(profile,text,patch={})=>updateTravelProfile(profile,{text,patch}).profile;
const basic=(text='广州三天，每天四小时')=>update(emptyTravelProfile(),text);
const point=(id,extra={})=>({...byId(id),transit:20,...extra});
const plan=(stops,input={})=>({city:'广州',input,stops,assumptions:[],warnings:[]});

test('only the changed budget is replaced',()=>{
  const first=updateTravelProfile(emptyTravelProfile(),{text:'广州三天，我们三个人，每人全程1000元，必去粤博，不去广州塔',patch:{destination:'广州',dayCount:3,companions:{count:3},budget:{amount:1000,scope:'per-person',period:'trip'},requiredPlaces:['粤博'],excludedPlaces:['广州塔']}}).profile;
  const next=updateTravelProfile(first,{text:'预算改为每人全程800元',patch:{budget:{amount:800,scope:'per-person',period:'trip'}}}).profile;
  assert.equal(next.fields.dayCount.value,3);
  assert.equal(next.fields.companions.value.count,3);
  assert.equal(next.fields.budget.value.amount,800);
  assert.deepEqual(next.fields.requiredPlaces.value,['粤博']);
  assert.deepEqual(next.fields.excludedPlaces.value,['广州塔']);
});

test('a bare budget amount changes only amount after its scope was confirmed',()=>{
  const first=basic('广州两天，每天四小时，每人全程800元');
  const next=update(first,'改为600元',{budget:{amount:600}});
  assert.deepEqual(next.fields.budget.value,{amount:600,currency:'CNY',scope:'per-person',period:'trip',includes:[]});
  assert.equal(travelFollowUps(next).length,0);
});

test('daily hours do not become the budget and requests to rearrange a route retain the city',()=>{
  const first=basic('广州三天，每天8小时，我们三个人，每人全程1000元，必去粤博');
  assert.equal(first.fields.budget.value.amount,1000);
  for(const text of ['帮我按保存条件安排路线','帮我重新安排路线','少走路，帮我安排路线']){
    const next=update(first,text);
    assert.equal(next.fields.destination.value,'广州');
    assert.deepEqual(next.fields.requiredPlaces.value,['粤博']);
  }
});

test('completing three days with dining details cannot turn itinerary placement into a destination change',()=>{
  const previous=basic('广州三天，每天四小时，必去粤博，不去广州塔，住在天河，从广州南站出发');
  const text='请补齐这三天的具体行程，沿用我已回答的条件，每天4小时，不要把后两天空成自由日，同一地点不要分到不同天。也请给每天推荐顺路的具体吃饭店铺、完整分店名、地址和点菜建议，并补充每站玩法。';
  const result=updateTravelProfile(previous,{text});
  assert.equal(result.profile.fields.destination.value,'广州');assert.equal(result.profile.fields.dayCount.value,3);assert.equal(result.profile.fields.dailyHours.value,4);
  for(const field of ['destination','requiredPlaces','excludedPlaces','stayArea','startArea'])assert.deepEqual(result.profile.fields[field],previous.fields[field],field);
  assert.ok(!result.changes.includes('destination'));
});

test('arrival substrings in scheduling and map commands are not travel destination declarations',()=>{
  const previous=basic('广州三天，每天四小时，必去粤博');
  for(const text of ['同一地点不要分到不同天','把景点放到第二天','地图缩放到详细级别','把出发时间改到下午','重新规划完整','帮我安排更丰富的路线']){
    const result=update(previous,text);assert.equal(result.fields.destination.value,'广州',text);assert.deepEqual(result.fields.requiredPlaces,previous.fields.requiredPlaces,text);
  }
});

test('explicit destination actions still accept named cities beyond the local catalog',()=>{
  const previous=basic();
  for(const [text,city]of [['改到北京','北京'],['去杭州三天','杭州'],['计划上海三天','上海'],['到成都玩两天','成都'],['我想去乌鲁木齐三天','乌鲁木齐'],['请帮我改到景德镇','景德镇'],['目的地改为六盘水市','六盘水'],['把目的地换成呼伦贝尔','呼伦贝尔'],['带父母去泉州两天','泉州'],['帮我规划伊宁市三天','伊宁']]){
    const result=update(previous,text);assert.equal(result.fields.destination.value,city,text);assert.equal(result.fields.destination.status,'confirmed',text);
  }
});

test('an unsupported model destination cannot overwrite the city or clear its saved local conditions',()=>{
  const previous=basic('广州三天，每天四小时，必去粤博，不去广州塔，住在天河，从广州南站出发');
  for(const [text,patch]of [['同一地点不要分到不同天',{destination:'不同天'}],['喜欢文化和建筑',{destination:'北京'}],['同一地点不要分到不同天',{destination:{value:'不同天',status:'tentative'}}]]){
    const result=updateTravelProfile(previous,{text,patch});
    for(const field of ['destination','requiredPlaces','excludedPlaces','stayArea','startArea'])assert.deepEqual(result.profile.fields[field],previous.fields[field],`${text}: ${field}`);
  }
});

test('half-day wording keeps the city exact and daily half-days preserve a multi-day trip',()=>{
  const single=update(emptyTravelProfile(),'帮我安排北京半天，每人全程预算300元',{destination:'北京'});
  assert.equal(single.fields.destination.value,'北京');
  assert.equal(single.fields.dayCount.value,1);
  assert.equal(single.fields.dailyHours.value,4);
  for(const text of ['每天改为半天','每天只玩半天']){
    const next=update(basic(),text);
    assert.equal(next.fields.dayCount.value,3);
    assert.equal(next.fields.dailyHours.value,4);
  }
});

test('pending short answers fill the number of travelers and both budget components',()=>{
  const first=basic('广州两天，每天四小时，预算1000元');
  assert.deepEqual(first.followUps.map(item=>item.field),['budget']);
  const next=update(first,'我们四个人，是全团全程');
  assert.equal(next.fields.companions.value.count,4);
  assert.equal(next.fields.budget.value.amount,1000);
  assert.equal(next.fields.budget.value.scope,'group');
  assert.equal(next.fields.budget.value.period,'trip');
  assert.deepEqual(next.followUps,[]);
});

test('daily visit hours and a total head count cannot declare a daily or group budget',()=>{
  for(const text of ['杭州三天，每天8小时，预算1000元，带父母','杭州三天，我们一共四个人，预算1000元','杭州三天，每天8小时预算1000元，我们一共四个人']){
    const profile=update(emptyTravelProfile(),text);
    assert.equal(profile.fields.budget.value.amount,1000);
    assert.equal(profile.fields.budget.value.scope,'unknown');
    assert.equal(profile.fields.budget.value.period,'unknown');
  }
  const daily=update(emptyTravelProfile(),'杭州三天，每天预算1000元');
  assert.equal(daily.fields.budget.value.period,'day');
  const individual=update(emptyTravelProfile(),'杭州三天，每人每天1000元');
  assert.equal(individual.fields.budget.value.scope,'per-person');
  assert.equal(individual.fields.budget.value.period,'day');
  const group=update(emptyTravelProfile(),'杭州三天，我们一共四个人，全团全程预算1000元，包含门票和交通');
  assert.equal(group.fields.budget.value.scope,'group');
  assert.equal(group.fields.budget.value.period,'trip');
  assert.deepEqual(group.fields.budget.value.includes,['门票','交通']);
});

test('negated budget categories are not included and remove only the named old inclusions',()=>{
  for(const modifier of ['不包括门票','不包含门票','不含门票']){
    const fresh=update(emptyTravelProfile(),`广州三天，每人全程1000元，${modifier}`);
    assert.deepEqual(fresh.fields.budget.value.includes,[]);
    const previous=update(emptyTravelProfile(),'广州三天，每人全程1000元，包含门票和交通');
    const revised=update(previous,modifier);
    assert.deepEqual(revised.fields.budget.value.includes,['交通']);
    assert.equal(revised.fields.budget.value.amount,1000);
    assert.equal(revised.fields.budget.value.scope,'per-person');
    assert.equal(revised.fields.budget.value.period,'trip');
  }
  const mixed=update(emptyTravelProfile(),'广州三天，每人全程1000元，包含交通，不含住宿');
  assert.deepEqual(mixed.fields.budget.value.includes,['交通']);
});

test('only two targeted questions are asked and known fields are not asked again',()=>{
  const first=emptyTravelProfile();first.followUps=travelFollowUps(first);
  assert.equal(first.followUps.length,2);
  const city=update(first,'广州');
  assert.equal(city.fields.destination.value,'广州');
  assert.equal(city.followUps[0].field,'dayCount');
  const days=update(city,'三');
  assert.equal(days.fields.dayCount.value,3);
  assert.equal(days.followUps[0].field,'dailyHours');
  const hours=update(days,'六');
  assert.equal(hours.fields.dailyHours.value,6);
  assert.deepEqual(hours.followUps,[]);
});

test('drafting with assumptions does not require companion counts or budget scope',()=>{
  const first=update(emptyTravelProfile(),'广州三天，预算1000元');
  const next=update(first,'先给方案');
  assert.equal(next.fields.dailyHours.value,8);
  assert.equal(next.fields.dailyHours.status,'tentative');
  assert.equal(next.fields.startTime.value,'09:00');
  assert.equal(next.fields.companions.value,null);
  assert.equal(next.fields.budget.value.scope,'unknown');
  assert.deepEqual(next.followUps,[]);
  assert.deepEqual(travelFollowUps(next,{allowDefaults:true}),[]);
});

test('parents do not imply a party count or senior count despite an incorrect model patch',()=>{
  const profile=update(emptyTravelProfile(),'带父母去广州三天',{companions:{count:3,seniors:2,description:'带父母'}});
  assert.equal(profile.fields.companions.value.count,null);
  assert.equal(profile.fields.companions.value.seniors,null);
  assert.match(profile.fields.companions.value.description,/父母/);
});

test('senior descriptions may overlap adults and a half-hour clock is preserved',()=>{
  const profile=update(emptyTravelProfile(),'广州三天，我们三个人，三位成人，其中一位老人，每天九点半开始');
  assert.equal(profile.fields.companions.value.count,3);
  assert.equal(profile.fields.companions.value.adults,3);
  assert.equal(profile.fields.companions.value.seniors,1);
  assert.equal(profile.fields.startTime.value,'09:30');
});

test('explicit text wins over conflicting model fields and tentative patches cannot overwrite facts',()=>{
  const first=update(emptyTravelProfile(),'广州三天，每天四小时，每人全程1000元',{destination:'苏州',dayCount:2,dailyHours:8,budget:{amount:600,scope:'group',period:'day'}});
  assert.equal(first.fields.destination.value,'广州');
  assert.equal(first.fields.dayCount.value,3);
  assert.equal(first.fields.dailyHours.value,4);
  assert.equal(first.fields.budget.value.amount,1000);
  const next=update(first,'喜欢文化',{dailyHours:{value:8,status:'tentative'}});
  assert.equal(next.fields.dailyHours.value,4);
});

test('unsupported model facts are not recorded as confirmed user facts',()=>{
  const profile=update(emptyTravelProfile(),'帮我推荐一个旅行方向',{destination:'广州',dayCount:3,dailyHours:8,companions:{count:3,seniors:2}});
  assert.equal(profile.fields.destination.status,'tentative');
  assert.equal(profile.fields.dayCount.status,'tentative');
  assert.equal(profile.fields.dailyHours.status,'tentative');
  assert.equal(profile.fields.companions.value,null);
});

test('unresolved wording cannot confirm model-invented numeric facts or mandatory locations',()=>{
  const profile=update(emptyTravelProfile(),'预算有限，天数还没确定，帮我选开始时间',{dayCount:3,dailyHours:8,startTime:'09:00',budget:{amount:1000,scope:'per-person',period:'trip'},requiredPlaces:['白云山']});
  for(const field of ['dayCount','dailyHours','startTime','budget'])assert.equal(profile.fields[field].status,'tentative');
  assert.equal(profile.fields.requiredPlaces.value,null);
});

test('Chinese budget amounts are parsed and a scope without an amount is not unlimited',()=>{
  const chinese=basic('广州两天，每天四小时，每人全程一千元');
  assert.equal(chinese.fields.budget.value.amount,1000);
  const scopeOnly=basic('广州一天，每天四小时，预算每人全程');
  assert.equal(scopeOnly.fields.budget.value.amount,null);
  assert.match(travelProfileInput(scopeOnly).budget,/金额待确认/);
  assert.doesNotMatch(travelProfileInput(scopeOnly).budget,/不限/);
  assert.equal(scopeOnly.followUps[0].field,'budget');
});

test('a museum duration question leaves the travel duration unchanged',()=>{
  const previous=basic();
  const result=updateTravelProfile(previous,{text:'粤博要玩两小时吗',patch:{dailyHours:2,dayCount:1}});
  assert.equal(result.profile.fields.dailyHours.value,4);
  assert.equal(result.profile.fields.dayCount.value,3);
  assert.equal(result.changed,false);
});

test('a city change clears place constraints while keeping companions and budget',()=>{
  const first=update(emptyTravelProfile(),'广州三天，每天四小时，我们四个人，每人全程800元，必去粤博，不去广州塔');
  const next=update(first,'换成北京');
  assert.equal(next.fields.destination.value,'北京');
  assert.equal(next.fields.dayCount.value,3);
  assert.equal(next.fields.companions.value.count,4);
  assert.equal(next.fields.budget.value.amount,800);
  assert.equal(next.fields.requiredPlaces.value,null);
  assert.equal(next.fields.excludedPlaces.value,null);
});

test('POI additions and excluded other-city names cannot change the destination',()=>{
  const first=update(emptyTravelProfile(),'从上海出发，去广州三天，不去上海迪士尼');
  assert.equal(first.fields.destination.value,'广州');
  const second=update(first,'加上广州塔');
  assert.equal(second.fields.destination.value,'广州');
  const third=update(second,'不想去上海');
  assert.equal(third.fields.destination.value,'广州');
});

test('incremental required and excluded patches retain existing names',()=>{
  const first=update(emptyTravelProfile(),'广州三天，必去粤博，不去广州塔');
  const second=update(first,'加上花城广场',{requiredPlaces:['花城广场']});
  assert.deepEqual(second.fields.requiredPlaces.value,['粤博','花城广场']);
  const third=update(second,'避开广州大剧院',{excludedPlaces:['广州大剧院']});
  assert.deepEqual(third.fields.excludedPlaces.value,['广州塔','广州大剧院']);
});

test('aliases within one constraint list keep the first accepted name',()=>{
  const first=update(emptyTravelProfile(),'广州三天，必去粤博，不去小蛮腰',{requiredPlaces:['广东省博物馆'],excludedPlaces:['广州塔']});
  assert.deepEqual(first.fields.requiredPlaces.value,['广东省博物馆']);
  assert.deepEqual(first.fields.excludedPlaces.value,['广州塔']);
  const previous=update(emptyTravelProfile(),'广州三天，必去粤博');
  const revised=update(previous,'加上广东省博物馆',{requiredPlaces:['广东省博物馆']});
  assert.deepEqual(revised.fields.requiredPlaces.value,['粤博']);
  const unknown=update(emptyTravelProfile(),'北京三天，必去故宫和颐和园',{requiredPlaces:['故宫','颐和园']});
  assert.deepEqual(unknown.fields.requiredPlaces.value,['故宫','颐和园']);
});

test('text-only proper names retain internal conjunctions and explicit place lists still split',()=>{
  const bare=update(emptyTravelProfile(),'北京三天，必去颐和园，不去雍和宫');
  assert.deepEqual(bare.fields.requiredPlaces.value,['颐和园']);
  assert.deepEqual(bare.fields.excludedPlaces.value,['雍和宫']);
  const listed=update(emptyTravelProfile(),'北京三天，必去颐和园、故宫，不去雍和宫，天坛');
  assert.deepEqual(listed.fields.requiredPlaces.value,['颐和园','故宫']);
  assert.deepEqual(listed.fields.excludedPlaces.value,['雍和宫','天坛']);
});

test('a comma-separated mobility condition is not appended to required places',()=>{
  const profile=update(emptyTravelProfile(),'苏州下午4小时，每人全程预算300元，保留苏博，少走路',{destination:'苏州',requiredPlaces:['苏博','少走路']});
  assert.deepEqual(profile.fields.requiredPlaces.value,['苏博']);
  assert.equal(profile.fields.pace.value,'easy');
  assert.equal(profile.fields.dailyHours.value,4);
});

test('a day-count route phrase is not a city and genuine unknown-city text is retained',()=>{
  const generic=update(emptyTravelProfile(),'帮我安排三天路线');
  assert.equal(generic.fields.destination.status,'missing');
  assert.equal(generic.fields.destination.value,null);
  assert.equal(generic.fields.dayCount.value,3);
  const unknown=update(emptyTravelProfile(),'去乌鲁木齐三天');
  assert.equal(unknown.fields.destination.value,'乌鲁木齐');
  assert.equal(unknown.fields.destination.status,'confirmed');
});

test('opposite constraints are removed by aliases and explicit replacements can clear lists',()=>{
  const first=update(emptyTravelProfile(),'广州两天，必去粤博，不去广州塔');
  const second=update(first,'不去广东省博物馆了，加上小蛮腰');
  assert.deepEqual(second.fields.requiredPlaces.value,['小蛮腰']);
  assert.deepEqual(second.fields.excludedPlaces.value,['广东省博物馆']);
  const third=update(second,'必去改成花城广场',{requiredPlaces:['花城广场']});
  assert.deepEqual(third.fields.requiredPlaces.value,['花城广场']);
  const cleared=update(third,'取消全部必去');
  assert.deepEqual(cleared.fields.requiredPlaces.value,[]);
  assert.equal(cleared.fields.requiredPlaces.status,'confirmed');
  const removed=update(cleared,'清空排除');
  assert.deepEqual(removed.fields.excludedPlaces.value,[]);
});

test('omitted fields retain facts, null explicitly clears, and repeated facts do not increment revision',()=>{
  const first=basic('广州三天，每天四小时，每人全程800元');
  const repeated=updateTravelProfile(first,{text:'预算改为每人全程800元',patch:{budget:{amount:800}}});
  assert.equal(repeated.changed,false);
  assert.equal(repeated.profile.revision,first.revision);
  assert.deepEqual(repeated.changes,[]);
  const cleared=updateTravelProfile(first,{patch:{budget:null}});
  assert.equal(cleared.profile.fields.budget.value,null);
  assert.equal(cleared.profile.fields.dayCount.value,3);
  assert.equal(cleared.profile.revision,first.revision+1);
  assert.deepEqual(cleared.changes,['budget']);
});

test('normalization rejects malformed persisted profile values and bounds',()=>{
  for(const [field,value] of [['dayCount',0],['dayCount',8],['dayCount',1.5],['dailyHours',13],['dailyHours','4'],['startTime','25:00'],['companions',{count:0}],['companions',{count:2,children:3}],['budget',{amount:NaN}],['budget',{scope:'individual'}],['interests',[null]],['pace','fast']]){
    const profile=emptyTravelProfile();profile.fields[field]={value,status:'confirmed'};
    assert.throws(()=>normalizeTravelProfile(profile));
  }
  const missing=emptyTravelProfile();missing.fields.dayCount={value:3,status:'missing'};
  assert.throws(()=>normalizeTravelProfile(missing));
  const unknown=emptyTravelProfile();unknown.fields.secret={value:'x',status:'confirmed'};
  assert.throws(()=>normalizeTravelProfile(unknown));
  assert.deepEqual(normalizeTravelProfile(JSON.parse(JSON.stringify(basic()))),basic());
});

test('legacy input expresses day count separately and preserves budget scope',()=>{
  const profile=basic('广州三天，每天四小时，每人全程800元，轻松一点');
  const input=travelProfileInput(profile,{hours:24,startTime:'10:00'});
  assert.equal(input.dayCount,3);
  assert.equal(input.hours,4);
  assert.equal(input.dailyHours,4);
  assert.equal(input.easy,true);
  assert.match(input.budget,/每人全程 800 元/);
  const summary=travelProfileSummary(profile);
  assert.equal(summary.find(row=>row.label==='旅行天数').value,'3 天');
});

test('daily allocation balances sparse candidates and starts transit and clocks afresh',()=>{
  const profile=basic('广州三天，每天四小时，每天九点开始');
  const result=buildDailyPlan(plan(['gz-museum','gz-square','gz-tower','gz-opera'].map(id=>point(id))),profile);
  assert.equal(result.days.length,3);
  assert.equal(result.stops.length,4);
  assert.equal(new Set(result.stops.map(stop=>stop.id)).size,4);
  for(const day of result.days){assert.equal(day.stops[0].transit,0);assert.equal(day.stops[0].estimatedStart,0);assert.equal(day.stops[0].clockStart,'09:00');assert.ok(day.totalMinutes<=240);assert.equal(day.freeMinutes,240-day.totalMinutes);}
  assert.ok(result.days.every(day=>day.stops.length<=2));
  assert.ok(result.stops.every(stop=>stop.dayIndex>=1&&stop.dayIndex<=3));
});

test('seven days disclose unassigned time instead of repeating the four catalog points',()=>{
  const result=buildDailyPlan(plan(['gz-museum','gz-square','gz-tower','gz-opera'].map(id=>point(id))),basic('广州七天，每天四小时'));
  assert.equal(result.days.length,7);
  assert.equal(result.days.filter(day=>!day.stops.length).length,3);
  assert.equal(result.stops.length,4);
  assert.match(result.warnings.join('\n'),/资料有限/);
});

test('required aliases must be present and infeasible mandatory stops cause a descriptive error',()=>{
  const mandatory=basic('广州一天，每天一小时，必去粤博');
  assert.throws(()=>buildDailyPlan(plan([point('gz-museum')]),mandatory),/必去.*无法放入/);
  assert.throws(()=>buildDailyPlan(plan([point('gz-square')]),mandatory),/必去.*尚未安排/);
  const twoDays=basic('广州两天，每天两小时，必去粤博和广州塔');
  const result=buildDailyPlan(plan([point('gz-museum'),point('gz-tower')]),twoDays);
  assert.equal(result.stops.length,2);
});

test('excluded aliases and cross-city points are rejected rather than declared valid',()=>{
  assert.throws(()=>buildDailyPlan(plan([point('gz-tower')]),basic('广州一天，每天四小时，不去小蛮腰')),/避开/);
  assert.throws(()=>buildDailyPlan(plan([point('sz-museum')]),basic('广州一天，每天四小时')),/不属于/);
});

test('explicit day assignments are honored and invalid day indexes are rejected',()=>{
  const profile=basic('广州两天，每天两小时');
  const source=plan([point('gz-museum',{dayIndex:2}),point('gz-square',{dayIndex:1})]);
  const result=buildDailyPlan(source,profile);
  assert.equal(result.days[0].stops[0].id,'gz-square');
  assert.equal(result.days[1].stops[0].id,'gz-museum');
  assert.throws(()=>buildDailyPlan(plan([point('gz-square',{dayIndex:3})]),profile),/日序号/);
});

test('unknown cities retain null coordinates and blank sources through daily grouping',()=>{
  const profile=basic('北京两天，每天四小时，必去故宫');
  const source={city:'北京',input:{destination:'北京'},stops:[{id:'suggested-1',kind:'suggested',city:'北京',name:'故宫',minutes:120,transit:0,coords:null,source:''},{id:'suggested-2',kind:'suggested',city:'北京',name:'颐和园',minutes:120,transit:60,coords:null,source:''}]};
  const result=buildDailyPlan(source,profile);
  assert.equal(result.stops.length,2);
  assert.ok(result.stops.every(stop=>stop.coords===null&&stop.source===''));
  assert.ok(result.days.every(day=>day.stops.length===1));
});
