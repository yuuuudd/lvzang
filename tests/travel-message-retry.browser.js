import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createApp} from '../server.js';
import {initialState} from '../public/src/travel-state.js';
import {emptyTravelProfile,TRAVEL_INTERVIEW_TOPICS} from '../public/src/travel-profile.js';

const server=createApp({accountsEnabled:false,key:'fixture',amapJsKey:'',amapSecurityJsCode:'',fetchImpl:async()=>{throw Error('No external calls');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const root=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),requests=[],errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(root+'/travel.html');
 const profile={...emptyTravelProfile(),interview:{status:'active',topic:'crowdPreference',skipped:TRAVEL_INTERVIEW_TOPICS.slice(0,7)},followUps:[{field:'crowdPreference',question:'你偏爱热门经典、小众人少，还是两种都安排？'}]};
 await page.evaluate(saved=>localStorage.setItem('lvzang.v1',saved),JSON.stringify({...initialState(),profile}));await page.reload();
 let heldRoute=null,hold=false;
 await page.route('**/api/travel-chat/stream',async route=>{requests.push(route.request().postDataJSON());if(hold){heldRoute=route;return;}return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'模拟连接暂时失败，请重试。'})});});
 const text='都安排，我还想少走一点';
 const stored=()=>page.evaluate(()=>({state:localStorage.getItem('lvzang.v1'),history:localStorage.getItem('lvzang.chat.v1')}));
 const before=await stored();
 await page.locator('#travel-brief').fill(text);
 await page.locator('#travel-brief').dispatchEvent('keydown',{key:'Enter',isComposing:true});
 assert.equal(requests.length,0,'IME confirmation does not send an incomplete answer');
 assert.equal(await page.locator('#travel-brief').inputValue(),text);
 const firstResponse=page.waitForResponse(response=>response.url().endsWith('/api/travel-chat/stream'));
 await page.locator('#travel-brief').press('Enter');await firstResponse;await page.waitForFunction(()=>!document.getElementById('plan-button').disabled);
 assert.equal(requests.length,1);assert.equal(requests[0].description,text);
 assert.equal(await page.locator('#travel-brief').inputValue(),text,'A failed request restores the submitted answer for retry');
 assert.deepEqual(await stored(),before,'A failed request preserves interview progress and accepted history');
 hold=true;await page.locator('#travel-brief').press('Enter');
 await page.waitForFunction(()=>document.getElementById('plan-button').disabled);
 while(!heldRoute)await new Promise(resolve=>setTimeout(resolve,5));
 await page.locator('#travel-brief').fill('还有新想法，先别覆盖这段');
 await heldRoute.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'模拟第二次失败'})});
 await page.waitForFunction(()=>!document.getElementById('plan-button').disabled);
 assert.equal(await page.locator('#travel-brief').inputValue(),'还有新想法，先别覆盖这段','Failure never overwrites a newer draft');
 assert.deepEqual(await stored(),before);assert.deepEqual(errors,[]);
 console.log('PASS: IME confirmation does not send, Enter submits once, failed answers remain editable for retry, new drafts and saved interview/history survive failure.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
