import {readFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const credentials=await readFile('artifacts/lvzang-login.txt','utf8'),base='https://lvzang.gzaibuilders.cn';
const username=credentials.match(/账号：([^\r\n]+)/)?.[1],password=credentials.match(/密码：([^\r\n]+)/)?.[1];
assert.ok(username&&password,'Missing saved login credentials');
const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[],methods=[];
let paid=0;
page.on('pageerror',e=>errors.push(e.message));
page.on('request',r=>{if(r.url()===base+'/api/library'&&r.method()==='POST')methods.push(r.postDataJSON().method);if(r.method()==='POST'&&/\/api\/(artwork|model|collection-jobs|collection-cover)(?:$|\/)/.test(r.url()))paid++;});
try{
 const login=await context.request.post(base+'/api/auth/login',{headers:{Origin:base},data:{username,password,role:'operator'},timeout:30000});
 assert.ok(login.ok(),'Operator login failed: '+login.status());
 const start=Date.now();await page.goto(base+'/operator.html',{waitUntil:'domcontentloaded',timeout:30000});await page.locator('.workspace-grid').waitFor({timeout:30000});
 const loadMs=Date.now()-start;assert.ok(!methods.includes('dump'),'Workbench must not download the full library');assert.ok(methods.includes('listMeta'));
 await page.waitForFunction(()=>[...document.querySelectorAll('#operator-root img')].every(img=>img.complete&&img.naturalWidth>0),{},{timeout:15000});
 assert.ok(await page.locator('.list-row').count()>0);assert.ok(await page.locator('.work-action-bar').isVisible());
 await mkdir('artifacts/operator-timeout',{recursive:true});await page.screenshot({path:'artifacts/operator-timeout/live-desktop.png'});
 await page.reload({waitUntil:'domcontentloaded'});await page.locator('.workspace-grid').waitFor({timeout:30000});
 assert.deepEqual(errors,[]);assert.equal(paid,0);assert.ok(!methods.includes('dump'));
 console.log(JSON.stringify({result:'PASS',loadMs,commissions:await page.locator('.list-row').count(),libraryMethods:[...new Set(methods)],paidRequests:paid}));
}finally{await context.request.post(base+'/api/auth/logout',{headers:{Origin:base},data:{},timeout:5000}).catch(()=>{});await browser.close();}
