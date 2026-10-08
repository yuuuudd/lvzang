import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createApp} from '../server.js';
import {initialState} from '../public/src/travel-state.js';
import {emptyTravelProfile,updateTravelProfile} from '../public/src/travel-profile.js';
const questions=[
 {field:'companions',question:'这次几个人一起去？有小孩、老人，或者需要少走路的同行人吗？'},
 {field:'crowdPreference',question:'你想去大家常去的热门景点，还是人少的小众地方？两种都安排也可以。'},
 {field:'interests',question:'你最想玩什么？比如吃当地美食、看展和建筑、看自然风景，或者逛街拍照。'}
];
const profile=updateTravelProfile(emptyTravelProfile(),{text:'广州三天，每天4小时'}).profile;profile.followUps=questions;
const saved=JSON.stringify({...initialState(),profile}),history=JSON.stringify({version:1,messages:[{role:'user',content:'想去广州玩三天'},{role:'assistant',content:'我们接着聊。'}]});
const server=createApp({accountsEnabled:false,key:'fixture',amapJsKey:'',amapSecurityJsCode:'',fetchImpl:async()=>{throw Error('No external calls');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const root=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(root+'/travel.html');
 await page.evaluate(({saved,history})=>{localStorage.setItem('lvzang.v1',saved);localStorage.setItem('lvzang.chat.v1',history);},{saved,history});
 await page.reload();
 assert.equal(await page.locator('#follow-up-panel:visible').count(),0,'Questions must not live in the clipped requirements box');
 const restored=page.locator('#restored-follow-up-message');await restored.waitFor({state:'visible',timeout:5000});
 for(const {question}of questions)assert.ok((await restored.textContent()).includes(question),'Restored questions appear in normal assistant dialogue');
 assert.equal(await restored.count(),1);assert.equal(await page.evaluate(()=>localStorage.getItem('lvzang.chat.v1')),history);
 await page.reload();assert.equal(await restored.count(),1);assert.equal(await page.evaluate(()=>localStorage.getItem('lvzang.chat.v1')),history);
 await page.route('**/api/travel-chat/stream',route=>route.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({type:'result',response:{kind:'clarify',status:'needs-info',mode:'ai',profile,followUps:questions,assistantReply:'我们先聊这几件事。',trace:[]}})+'\n'}));
 const send=async()=>{await page.locator('#travel-brief').fill('继续问我');await page.locator('#travel-brief').press('Enter');await page.waitForFunction(()=>!document.getElementById('plan-button').disabled);};
 for(const width of [390,580,1440]){
  await page.setViewportSize({width,height:844});await send();
  const reply=page.locator('.chat-message.assistant[data-message-kind="clarify"]').last();
  for(const {question}of questions)assert.ok((await reply.textContent()).includes(question));
  const layout=await reply.evaluate(article=>{
   const body=article.querySelector('.message-content'),bubble=article.querySelector('.chat-bubble'),chat=document.querySelector('.chat-scroll'),input=document.querySelector('.composer');
   const r=article.getBoundingClientRect(),cr=chat.getBoundingClientRect(),ir=input.getBoundingClientRect();
   return {font:parseFloat(getComputedStyle(body).fontSize),bodyHeight:body.clientHeight,bodyScroll:body.scrollHeight,bubbleHeight:bubble.clientHeight,bubbleScroll:bubble.scrollHeight,overflow:getComputedStyle(chat).overflowY,chatHeight:chat.clientHeight,chatScroll:chat.scrollHeight,replyTop:r.top,replyBottom:r.bottom,chatTop:cr.top,chatBottom:cr.bottom,inputTop:ir.top,width:innerWidth,height:innerHeight};
  });
  assert.ok(layout.font>=16,'Questions use readable conversation text');
  assert.ok(layout.bodyScroll<=layout.bodyHeight+1&&layout.bubbleScroll<=layout.bubbleHeight+1,'Question text has no clipped inner scrollbar');
  if(width<768){assert.ok(layout.chatScroll<=layout.chatHeight+1,'Mobile conversation flows on the page');assert.ok(layout.inputTop>=layout.replyBottom-1,'Reply comes before the input');}
  else assert.ok(layout.replyTop>=layout.chatTop-2&&layout.replyTop<layout.chatBottom,'Final reply is brought into the conversation viewport');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: direct readable assistant questions, no detached clipped box, natural mobile dialogue before input, desktop reply reveal, restored questions without duplicate saved history.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
