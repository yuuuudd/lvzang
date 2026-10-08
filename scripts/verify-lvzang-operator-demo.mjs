import {readFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const credentials=await readFile('artifacts/lvzang-login.txt','utf8'),base='https://lvzang.gzaibuilders.cn';
const username=credentials.match(/账号：([^\r\n]+)/)?.[1],password=credentials.match(/密码：([^\r\n]+)/)?.[1];
const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();page.setDefaultTimeout(60000);
const errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST'&&/\/api\/(orders\/|artwork|model|collection-jobs)/.test(r.url()))writes.push(new URL(r.url()).pathname);});
try{
 const login=await context.request.post(base+'/api/auth/login',{headers:{Origin:base},data:{username,password,role:'operator'},timeout:60000});assert.ok(login.ok());
 const orders=(await(await context.request.get(base+'/api/orders')).json()).orders;
 const order=orders.find(o=>o.commission?.serviceMode==='production'&&!o.commission.deleted&&!o.commission.archived);assert.ok(order);
 await page.goto(base+'/operator.html#commission/'+order.id+'/make',{waitUntil:'domcontentloaded',timeout:60000});
 await page.getByRole('button',{name:'演示后续流程',exact:true}).click();
 const demo=page.getByRole('dialog');await demo.getByRole('button',{name:'模拟导出，进入打印与验收'}).click();
 await demo.getByRole('heading',{name:'打印与验收',exact:true}).waitFor();
 await mkdir('artifacts/operator-demo',{recursive:true});await page.screenshot({path:'artifacts/operator-demo/live-review.png'});
 await demo.getByRole('button',{name:'模拟验收通过，进入交付'}).click();await demo.getByRole('heading',{name:'客户确认与交付',exact:true}).waitFor();
 await demo.getByRole('button',{name:'模拟客户确认并完成交付'}).click();await demo.getByRole('heading',{name:'交付完成',exact:true}).waitFor();
 await page.screenshot({path:'artifacts/operator-demo/live-delivered.png'});
 await page.setViewportSize({width:390,height:844});assert.ok(await demo.locator('.demo-footer').evaluate(el=>el.getBoundingClientRect().bottom<=innerHeight));
 await page.screenshot({path:'artifacts/operator-demo/live-mobile.png',fullPage:true});
 await demo.getByRole('button',{name:'重新演示'}).click();await demo.getByRole('heading',{name:'尺寸与报价',exact:true}).waitFor();await demo.getByRole('button',{name:'退出演示',exact:true}).click();
 const after=await(await context.request.get(base+'/api/orders/'+order.id)).json();assert.deepEqual(after,order);assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({result:'PASS',stages:[2,3,4,'completed'],reset:true,unchangedOrder:true,orderWrites:writes.length,mobileFooterVisible:true}));
}finally{await context.request.post(base+'/api/auth/logout',{headers:{Origin:base},data:{},timeout:5000}).catch(()=>{});await browser.close();}
