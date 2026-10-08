import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createApp} from '../server.js';
import {initialState} from '../public/src/travel-state.js';
import {emptyTravelProfile,updateTravelProfile} from '../public/src/travel-profile.js';
import {normalizeRequest,planFromCatalog} from '../public/src/travel-domain.js';
import {buildDailyPlan} from '../public/src/travel-schedule.js';

// Deliberately fictional fixture facts; this test performs no restaurant research.
const profile=updateTravelProfile(emptyTravelProfile(),{text:'广州两天，每天6小时'}).profile;profile.followUps=[];
const plan=buildDailyPlan({...planFromCatalog(normalizeRequest({destination:'广州',hours:6}),undefined,{placeIds:['gz-museum','gz-square']}),mode:'ai',trace:[]},profile);
const markup='<img src=x onerror="window.__foodExecuted=true">';
const restaurant={kind:'restaurant',name:'示例餐馆（珠江新城分店）',address:'测试街 1 号二层',dishes:['测试点心',markup],mealTime:'看展结束后安排午餐',budgetNote:'仅为预算提示，菜单和实际价格待核实。',note:'请提前确认是否能少辣。',sourceIds:['restaurant-a']};
const cuisine={kind:'cuisine',name:'当地粥粉面',note:'具体店家暂未取得可靠资料。',sourceIds:[]};
const legacy={name:'旧记录中的粤菜建议',note:'保持旧版餐饮内容可读。',sourceIds:['legacy-food']};
const sources=[{id:'restaurant-a',title:'示例分店资料',url:'https://example.com/restaurant-a',accessStatus:'fetched'},{id:'venue',title:'示例场馆资料',url:'https://example.com/venue',accessStatus:'fetched'},{id:'legacy-food',title:'旧餐饮资料',url:'https://example.com/legacy-food',accessStatus:'search-snippet'}];
plan.guide={status:'partial',diningStatus:'partial',diningMissingDays:[2],summary:'已有玩法仍然保留。',days:plan.days.map(day=>({dayIndex:day.dayIndex,overview:'先游览再根据饥饿程度就餐。',stops:day.stops.map(stop=>({stopId:stop.id,name:stop.name,howToPlay:'按兴趣看展与散步。',highlights:[],food:day.dayIndex===1?[restaurant,cuisine,legacy]:[cuisine],transport:'交通以导航为准。',reservation:'预约要求待核实。',rainyAlternative:'雨天可优先室内。',sourceIds:['venue']}))})),sources,warnings:[]};
const saved=JSON.stringify({...initialState(),profile,plan});
let externalCalls=0;const server=createApp({accountsEnabled:false,key:'',amapJsKey:'',amapSecurityJsCode:'',fetchImpl:async()=>{externalCalls++;throw Error('No external requests');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/travel.html`);await page.evaluate(raw=>localStorage.setItem('lvzang.v1',raw),saved);
 for(const width of [390,580,1440]){
  await page.setViewportSize({width,height:844});await page.reload();
  assert.equal(await page.locator('#route-state').textContent(),'餐饮待补充');
  assert.match(await page.locator('.dining-status').textContent(),/第2天尚未取得.*具体餐厅/);
  const card=page.locator('.food-card[data-food-kind="restaurant"]');
  assert.equal(await card.locator('.food-name').textContent(),restaurant.name);
  for(const value of [restaurant.address,...restaurant.dishes,restaurant.mealTime,restaurant.budgetNote,restaurant.note])assert.ok((await card.textContent()).includes(value));
  assert.deepEqual(await card.locator('.research-sources a').allTextContents(),['示例分店资料'],'A restaurant displays only its own supporting sources');
  assert.deepEqual(await page.locator('.stop-guide>.research-sources a').allTextContents(),['示例场馆资料']);
  const link=card.locator('.food-map-link'),url=new URL(await link.getAttribute('href'));
  assert.equal(url.origin,'https://uri.amap.com');assert.equal(url.pathname,'/search');assert.equal(url.searchParams.get('keyword'),'广州 '+restaurant.name);
  assert.equal(await link.getAttribute('target'),'_blank');assert.match(await link.getAttribute('rel'),/noopener/);
  assert.equal(await page.locator('.food-card[data-food-kind="cuisine"] .food-map-link,.food-card[data-food-kind="legacy"] .food-map-link').count(),0,'Cuisine and legacy suggestions are not presented as mapped restaurants');
  assert.ok((await page.locator('.food-card[data-food-kind="legacy"]').textContent()).includes(legacy.note));
  assert.equal(await page.locator('.food-card img,.food-card script').count(),0);assert.equal(await page.evaluate(()=>window.__foodExecuted),undefined);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 }
 await page.locator('[data-day="1"]').click();assert.equal(await page.locator('.food-map-link').count(),0);assert.match(await page.locator('.stop-guide').textContent(),/按兴趣看展与散步/,'A partial dining result keeps the usable guide visible');
 assert.equal(await page.evaluate(()=>localStorage.getItem('lvzang.v1')),saved,'Displaying dining details never edits the saved route or facts');
 const ready=structuredClone(plan);ready.guide.status='ready';ready.guide.diningStatus='ready';ready.guide.diningMissingDays=[];ready.guide.days[1].stops[0].food=[{...restaurant,name:'示例餐馆（第二分店）',address:''}];
 await page.evaluate(raw=>localStorage.setItem('lvzang.v1',raw),JSON.stringify({...initialState(),profile,plan:ready}));await page.reload();await page.locator('[data-day="1"]').click();
 assert.equal(await page.locator('#route-state').textContent(),'已生成');assert.equal(await page.locator('.dining-status').count(),0);assert.match(await page.locator('.food-address').textContent(),/地址待核对/);
  assert.equal(new URL(await page.locator('.food-map-link').getAttribute('href')).searchParams.get('keyword'),'广州 示例餐馆（第二分店）');
 const retained=structuredClone(ready);retained.guide.diningStatus='partial';retained.guide.diningRetainedDays=[2];
 await page.evaluate(raw=>localStorage.setItem('lvzang.v1',raw),JSON.stringify({...initialState(),profile,plan:retained}));await page.reload();await page.locator('[data-day="1"]').click();
 assert.equal(await page.locator('#route-state').textContent(),'餐饮待更新');assert.match(await page.locator('.dining-status').textContent(),/第2天.*保留上一版店家/);
 assert.ok(!(await page.locator('.dining-status').textContent()).includes('尚未取得'));assert.equal(await page.locator('.food-name').textContent(),'示例餐馆（第二分店）');
 const detailPending=structuredClone(ready);detailPending.guide.diningStatus='partial';detailPending.guide.diningRequiredFields=['address','dishes'];detailPending.guide.diningMissingDays=[2];
 await page.evaluate(raw=>localStorage.setItem('lvzang.v1',raw),JSON.stringify({...initialState(),profile,plan:detailPending}));await page.reload();await page.locator('[data-day="1"]').click();
 assert.equal(await page.locator('#route-state').textContent(),'餐饮待补充');assert.match(await page.locator('.dining-status').textContent(),/第2天.*所需餐饮信息还未补齐/);assert.equal(await page.locator('.food-name').textContent(),'示例餐馆（第二分店）');
  assert.equal(externalCalls,0);assert.deepEqual(errors,[]);
 console.log('PASS: concrete branch/address/dishes/meal/budget fields and per-restaurant sources, exact AMap search keywords, safe literal markup, legacy cuisine compatibility, partial dining day status with readable guides, refresh and responsive widths.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
