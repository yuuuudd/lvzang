import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createApp} from '../server.js';
import {initialState} from '../public/src/travel-state.js';
import {emptyTravelProfile,updateTravelProfile} from '../public/src/travel-profile.js';
import {normalizeRequest,planFromCatalog} from '../public/src/travel-domain.js';
import {buildDailyPlan} from '../public/src/travel-schedule.js';

const profile=updateTravelProfile(emptyTravelProfile(),{text:'广州一天，每天4小时，喜欢美食，必去广州塔'}).profile;
const plan={...buildDailyPlan({...planFromCatalog(normalizeRequest({destination:'广州',hours:4}),undefined,{placeIds:['gz-tower'],title:'原广州攻略'}),mode:'ai',trace:[]},profile),kind:'plan'};
plan.guide={status:'ready',summary:'沿用旅行偏好，参观后留出休息时间。',days:[{dayIndex:1,overview:'先看建筑外观，再按实际预约与天气决定游览方式。',stops:plan.stops.map(stop=>({stopId:stop.id,name:stop.name,howToPlay:'先在入口了解参观路线，再按个人兴趣慢慢游览。每个观景区域都可以停下来拍照和休息，不必赶着看完所有内容。留出弹性时间，遇到排队就先休息。',highlights:['建筑外观与城市天际线','不同角度的公共空间'],food:[{name:'附近粤菜或粥粉面',kind:'cuisine',note:'到店前核实营业状态和排队情况，按自己的预算选择，优先考虑步行可达、顺路的店铺。',sourceIds:[]}],transport:'使用地图核对实际步行入口和出行距离。若遇降雨，可以选择公共交通。',reservation:'出发前查看官方网站，确认预约、票价和开放时间。',rainyAlternative:'按天气调整室外部分，保留室内参观与休息时间。',sourceIds:[]}))}],sources:[],warnings:['费用和开放规则仍需临行核实。']};
const server=createApp({accountsEnabled:false,key:'test',amapJsKey:'',fetchImpl:async()=>{throw Error('No external calls in UI regression');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const checkCustomizationPrompt=async()=>{
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const prompt=page.locator('.chat-message.assistant:last-child .customization-prompt');
    assert.match(await prompt.textContent(),/在这里定制旅行攻略/);
    assert.match(await prompt.textContent(),/输入后发送/);
    const visible=await prompt.evaluate(element=>{
      const rect=element.getBoundingClientRect(),question=element.nextElementSibling.querySelector('p').getBoundingClientRect();
      const toolbar=document.querySelector('#route-refresh-slot').getBoundingClientRect(),chat=element.closest('.chat-scroll').getBoundingClientRect();
      return {ok:rect.top>=Math.max(toolbar.bottom,chat.top)&&rect.bottom<=Math.min(innerHeight,chat.bottom)&&question.bottom<=Math.min(innerHeight,chat.bottom),width:innerWidth,height:innerHeight,promptTop:rect.top,promptBottom:rect.bottom,questionBottom:question.bottom,toolbarBottom:toolbar.bottom,chatTop:chat.top,chatBottom:chat.bottom};
    });
    assert.ok(visible.ok,'The customization reminder and complete current question are visible together, below the toolbar and within the chat pane: '+JSON.stringify(visible));
    const savedProfile=await page.evaluate(()=>JSON.parse(localStorage.getItem('lvzang.v1')).profile);
    assert.equal(await page.locator('.chat-message.assistant:last-child .message-content').textContent(),savedProfile.followUps[0].question,'The visible message asks the current question directly, without a repeated introduction displacing it');
  };
  await page.goto(`http://127.0.0.1:${server.address().port}/travel.html`);
  await page.evaluate(raw=>localStorage.setItem('lvzang.v1',raw),JSON.stringify({...initialState(),profile,plan}));await page.reload();
  assert.equal(await page.locator('#route-refresh').count(),1,'A visible refresh action must exist in the shared toolbar');
  assert.equal(await page.locator('#route-destination').inputValue(),'广州');
  for(const width of [1146,1440,580,390]){
    await page.setViewportSize({width,height:900});await page.reload();await page.waitForSelector('.stop-guide',{state:'attached'});
    const initialVisibility=await page.locator('#route-refresh').evaluate(button=>{const r=button.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('#route-refresh')===button;});
    assert.ok(initialVisibility,`${width}px: global refresh is visible and actionable on the initial screen`);
    if(width<768)await page.getByRole('button',{name:'攻略',exact:true}).click();
    await page.locator('.canvas-panel').scrollIntoViewIfNeeded();
    const guideBox=await page.locator('#guide-pane').boundingBox();await page.mouse.move(guideBox.x+guideBox.width/2,Math.min(850,Math.max(guideBox.y+70,guideBox.y+guideBox.height/2)));await page.mouse.wheel(0,600);await page.waitForTimeout(120);
    const visibility=await page.locator('#route-refresh').evaluate(button=>{const r=button.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:innerHeight,guideScroll:document.getElementById('guide-pane').scrollTop,inView:r.top>=0&&r.bottom<=innerHeight&&document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('#route-refresh')===button};});
    assert.ok(visibility.guideScroll>100,`${width}px: the regression actually scrolls into the guide`);
    assert.ok(visibility.inView,`${width}px: refresh stays actionable after reading the middle of the guide: ${JSON.stringify(visibility)}`);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}px: toolbar does not overflow`);
  }
  assert.equal(await page.locator('#app-main #route-refresh-slot').count(),1);
  assert.equal(await page.locator('.workspace #route-refresh-slot').count(),0,'The refresh toolbar is shared outside chat and map/guide panes');
  assert.equal(await page.locator('#canvas-viewport #route-refresh-slot').count(),0,'The refresh toolbar lives outside the scrolling workspace');
  assert.equal(await page.locator('#route-refresh').textContent(),'刷新攻略');
  assert.match(await page.locator('label[for="route-destination"]').textContent(),/城市|地区|目的地/);
  assert.match(await page.locator('#route-destination').getAttribute('placeholder'),/地区/);assert.match(await page.locator('#route-destination').getAttribute('placeholder'),/西藏/);
  assert.match(await page.locator('#route-current-destination').textContent(),/广州/);
  await page.setViewportSize({width:1440,height:900});
  const requests=[];page.on('request',request=>{if(request.url().endsWith('/api/travel-chat/stream'))requests.push(request.postDataJSON());});
  await page.locator('#travel-brief').fill('尚未发送的新想法');
  await page.locator('#route-destination').fill('西藏');await page.locator('#route-refresh').click();
  await page.waitForFunction(()=>!document.querySelector('#route-refresh').disabled);
  let saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('lvzang.v1')));
  assert.equal(requests.at(-1).interviewAction,'restart');assert.equal(requests.at(-1).destination,'西藏');
  assert.equal(requests.at(-1).currentPlan,undefined);assert.equal(requests.at(-1).previous,undefined);assert.deepEqual(requests.at(-1).history,[]);
  assert.equal(saved.profile.interview.topic,'destination');assert.equal(saved.profile.interview.step,1);
  assert.equal(saved.profile.fields.destination.value,'西藏');assert.equal(saved.planningReset,true);assert.deepEqual(saved.plan,plan);
  assert.deepEqual(saved.previousPlanningContext.profile,profile,'The previous preferences remain recoverable without participating in the new interview');
  assert.match(await page.locator('#route-current-destination').textContent(),/上一份方案.*广州/);
  assert.equal(await page.locator('#travel-brief').inputValue(),'尚未发送的新想法');assert.equal(await page.locator('#route-refresh').textContent(),'继续问答');
  assert.match(await page.locator('#map-title').textContent(),/西藏/,'The map follows the selected destination while the previous Guangzhou guide remains');
  await checkCustomizationPrompt();
  assert.match(await page.locator('#route-refresh-note').textContent(),/左侧问答区/);
  const beforeFailure=JSON.stringify(saved);
  await page.route('**/api/travel-chat/stream',route=>route.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({type:'error',error:'测试问答启动失败'})+'\n'}));
  await page.locator('#route-destination').fill('杭州');await page.locator('#route-refresh').click();await page.waitForFunction(()=>!document.querySelector('#route-refresh').disabled);
  assert.equal(JSON.stringify(await page.evaluate(()=>JSON.parse(localStorage.getItem('lvzang.v1')))),beforeFailure,'Failed restart retains the prior interview and previous route');
  assert.match(await page.locator('#route-refresh-note').textContent(),/失败/);assert.equal(await page.locator('#travel-brief').inputValue(),'尚未发送的新想法');
  assert.equal(await page.locator('.chat-message.assistant:last-child .customization-prompt').count(),0,'A failed restart shows the failure instead of inviting answers to a question that did not load');
  await page.unroute('**/api/travel-chat/stream');
  await page.locator('#route-refresh').click();await page.waitForFunction(()=>!document.querySelector('#route-refresh').disabled);
  await checkCustomizationPrompt();
  assert.match(await page.locator('#route-refresh-note').textContent(),/左侧问答区/);
  saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('lvzang.v1')));assert.equal(saved.profile.fields.destination.value,'杭州');assert.equal(saved.profile.interview.step,1);assert.deepEqual(saved.profile.interview.answers,[]);
  await page.reload();assert.equal(await page.locator('#route-destination').inputValue(),'杭州');assert.match(await page.locator('#route-current-destination').textContent(),/上一份方案.*广州/);
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('#route-refresh').click();await page.waitForFunction(()=>!document.querySelector('#route-refresh').disabled);
  await checkCustomizationPrompt();
  assert.match(await page.locator('#route-refresh-note').textContent(),/下方问答区/);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const questionPosition=await page.evaluate(()=>({top:document.querySelector('.chat-message.assistant:last-child').getBoundingClientRect().top,toolbarBottom:document.querySelector('#route-refresh-slot').getBoundingClientRect().bottom}));
  assert.ok(questionPosition.top>=questionPosition.toolbarBottom,`The current question starts below the sticky destination toolbar: ${JSON.stringify(questionPosition)}`);
  await page.locator('#travel-brief').fill('尚未发送的新想法');
  for(const width of [1146,565]){
    await page.setViewportSize({width,height:704});
    await page.locator('.canvas-panel').scrollIntoViewIfNeeded();
    await page.locator('#route-refresh').click();await page.waitForFunction(()=>!document.querySelector('#route-refresh').disabled);
    await checkCustomizationPrompt();
    assert.equal(await page.locator('#travel-brief').inputValue(),'尚未发送的新想法','Revealing the left question does not overwrite an unsent draft');
    if(width===1146&&process.env.TRAVEL_REFRESH_SCREENSHOT){
      await page.screenshot({path:process.env.TRAVEL_REFRESH_SCREENSHOT});
      await page.locator('#planner').screenshot({path:process.env.TRAVEL_REFRESH_SCREENSHOT.replace(/\.png$/,'-left.png')});
    }
  }
  await page.locator('#travel-brief').fill('杭州，主要想去西湖');await page.locator('#travel-brief').press('Enter');
  await page.waitForFunction(()=>!document.querySelector('#plan-button').disabled);
  const answered=await page.evaluate(()=>JSON.parse(localStorage.getItem('lvzang.v1')).profile.interview);
  assert.equal(answered.step,2,'Answering after the reminder still advances to the next question');
  assert.equal(answered.answers[0].answer,'杭州，主要想去西湖');
  assert.equal(await page.locator('.chat-message.assistant:last-child .customization-prompt').count(),0,'Later replies use ordinary chat and do not repeat the refresh reminder');
  assert.deepEqual(errors,[]);console.log('PASS: refresh is visible at four widths, reveals customization instructions beside the current question on desktop and mobile, starts a fresh interview, labels the prior plan, isolates context, preserves drafts and recovers from restart failure.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
