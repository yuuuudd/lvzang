import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createApp} from '../server.js';
import {initialState} from '../public/src/travel-state.js';
import {emptyTravelProfile,TRAVEL_INTERVIEW_TOPICS} from '../public/src/travel-profile.js';

const rawAnswers=['广州','日期还没定','三天','每天四小时','早上九点','两位成年人','每人全程六百元','热门小众都安排','看展、建筑和美食','广东省博物馆','不去游乐园','少走一点','不吃辣\n其他都可以','住珠江新城','从酒店出发','步行加地铁'];
const markup='<img src=x onerror="window.__interviewRecordExecuted=true">';
const answers=TRAVEL_INTERVIEW_TOPICS.map((field,index)=>({field,question:`第${index+1}题：请说说你对这项旅行安排的想法。`,answer:rawAnswers[index]}));
answers[8].answer+='\n这段原文也要保留：'+markup;
const additions=['后来想到：午饭想吃粤菜，下午留一点自由时间。','保留原样：<script>window.__interviewRecordExecuted=true</script>'];
const profile={...emptyTravelProfile(),interview:{status:'ready',topic:null,skipped:[],step:16,total:16,answers,additions}};
const saved=JSON.stringify({...initialState(),profile});
const chat=JSON.stringify({version:1,messages:Array.from({length:12},(_,index)=>({role:index%2?'assistant':'user',content:`之前的第${index+1}条对话。`}))});
let externalCalls=0;
const server=createApp({accountsEnabled:false,key:'',amapJsKey:'',amapSecurityJsCode:'',fetchImpl:async()=>{externalCalls++;throw Error('This UI regression forbids external calls');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/travel.html`);
  assert.equal(await page.locator('#interview-records-disclosure').isVisible(),false,'No archive is shown before there are records');
  await page.evaluate(({saved,chat})=>{localStorage.setItem('lvzang.v1',saved);localStorage.setItem('lvzang.chat.v1',chat);},{saved,chat});
  const assertRecords=async()=>{
    assert.deepEqual(await page.locator('.interview-record-question').allTextContents(),answers.map(item=>item.question));
    assert.deepEqual(await page.locator('.interview-record-answer').allTextContents(),answers.map(item=>item.answer));
    assert.deepEqual(await page.locator('#interview-additions-list>li').allTextContents(),additions);
    assert.equal(await page.locator('.interview-records-body img,.interview-records-body script').count(),0,'Markup remains literal text');
    assert.equal(await page.evaluate(()=>window.__interviewRecordExecuted),undefined);
  };
  for(const width of [390,580,1440]){
    await page.setViewportSize({width,height:844});await page.reload();
    assert.equal(await page.locator('#interview-records-disclosure').getAttribute('open'),null,'The archive starts folded on refresh');
    await page.locator('#interview-records-disclosure>summary').click();
    await assertRecords();
    await page.locator('#interview-additions-list>li').last().scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Raw records do not overflow any supported viewport');
    const draft='这条补充还没发：想留一点自由时间';await page.locator('#travel-brief').fill(draft);
    await page.locator('#planner-tools-toggle').click();
    for(const selector of ['#workspace-title','#advisor-preferences','#requirements-panel'])assert.equal(await page.locator(selector).isVisible(),false,'The complete tool area folds away');
    assert.ok((await page.locator('#planner-tools').boundingBox()).height<=60,'The folded tools occupy one compact row');
    await page.locator('#travel-brief').focus();
    assert.equal(await page.locator('#travel-brief').evaluate(node=>node===document.activeElement),true);
    assert.equal(await page.locator('#travel-brief').inputValue(),draft,'Reviewing and folding records never consumes an unsent draft');
    await page.locator('#planner-tools-toggle').focus();await page.keyboard.press('Enter');
    assert.equal(await page.locator('#interview-records-list').isVisible(),true,'Keyboard users can reopen the entire archive');
  }
  await page.locator('#planner-tools-toggle').click();await page.reload();
  assert.equal(await page.locator('#planner-tools-content').isVisible(),false,'Manual folding preference survives refresh');
  await page.locator('#planner-tools-toggle').click();await page.locator('#interview-records-disclosure>summary').click();await assertRecords();
  assert.deepEqual(await page.evaluate(()=>({state:localStorage.getItem('lvzang.v1'),chat:localStorage.getItem('lvzang.chat.v1')})),{state:saved,chat},'Viewing all 16 answers does not rewrite or truncate either saved records or the 12-message chat');
  assert.equal(externalCalls,0);assert.deepEqual(errors,[]);
  console.log('PASS: all 16 verbatim answers and additions survive refresh independently of 12-message chat, literal markup stays safe, 390/580/1440 layouts fit, complete header folds and keyboard/input remain usable.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
