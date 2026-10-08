import {readFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const credentials=await readFile('artifacts/lvzang-login.txt','utf8'),base='https://lvzang.gzaibuilders.cn';
const username=credentials.match(/账号：([^\r\n]+)/)?.[1],password=credentials.match(/密码：([^\r\n]+)/)?.[1];
assert.ok(username&&password,'Missing saved login credentials');
const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[],methods=[];
let paid=0;const pending=new Set();page.on('request',r=>pending.add(r.url()));page.on('requestfinished',r=>pending.delete(r.url()));page.on('requestfailed',r=>pending.delete(r.url()));
page.on('pageerror',e=>errors.push(e.message));
page.on('request',r=>{if(r.url()===base+'/api/library'&&r.method()==='POST')methods.push(r.postDataJSON().method);if(r.method()==='POST'&&/\/api\/(artwork|model|collection-jobs|collection-cover)(?:$|\/)/.test(r.url()))paid++;});
try{
 const login=await context.request.post(base+'/api/auth/login',{headers:{Origin:base},data:{username,password,role:'operator'},timeout:60000});
 assert.ok(login.ok(),'Operator login failed: '+login.status());
 const start=Date.now();await page.goto(base+'/operator.html',{waitUntil:'domcontentloaded',timeout:60000});await page.locator('.workspace-grid').waitFor({timeout:60000});
 const loadMs=Date.now()-start;assert.ok(!methods.includes('dump'),'Workbench must not download the full library');assert.ok(methods.includes('listMeta'));
 await page.waitForFunction(()=>[...document.querySelectorAll('#operator-root img')].every(img=>img.complete&&img.naturalWidth>0),{},{timeout:15000});
 assert.ok(await page.locator('.list-row').count()>0);await page.locator('.work-action-bar').waitFor({timeout:60000});
 await mkdir('artifacts/operator-management',{recursive:true});await page.screenshot({path:'artifacts/operator-management/live-desktop.png'});
 assert.doesNotMatch(await page.locator('.commission-list').textContent(),/委托/);
 assert.equal(await page.locator('[data-action=new]').count(),1);
 assert.equal(await page.getByRole('button',{name:'新建订单'}).count(),1);
 assert.equal(await page.locator('.journey-steps button').count(),0);
 await page.getByText('管理订单',{exact:true}).click();
 assert.ok(await page.getByRole('button',{name:'删除订单',exact:true}).isVisible());
 assert.ok(await page.getByRole('button',{name:'归档订单',exact:true}).isVisible());
 await page.screenshot({path:'artifacts/operator-management/live-menu.png'});
 await page.getByText('管理订单',{exact:true}).click();
 await page.selectOption('[name=orderView]','deleted');
 assert.equal(await page.locator('[name=orderView]').inputValue(),'deleted');
 await page.selectOption('[name=orderView]','active');
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:'artifacts/operator-management/live-mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:900});
 await page.reload({waitUntil:'domcontentloaded'});await page.locator('.workspace-grid').waitFor({timeout:60000});
 assert.deepEqual(errors,[]);assert.equal(paid,0);assert.ok(!methods.includes('dump'));
 console.log(JSON.stringify({result:'PASS',loadMs,commissions:await page.locator('.list-row').count(),libraryMethods:[...new Set(methods)],paidRequests:paid}));
}catch(error){console.log(JSON.stringify({errors,pending:[...pending].map(url=>new URL(url).pathname)}));await mkdir('artifacts/operator-management',{recursive:true});await page.screenshot({path:'artifacts/operator-management/live-failure.png',fullPage:true});throw error;}finally{await context.request.post(base+'/api/auth/logout',{headers:{Origin:base},data:{},timeout:5000}).catch(()=>{});await browser.close();}
