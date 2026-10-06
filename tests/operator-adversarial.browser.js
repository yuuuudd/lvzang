import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createApp} from '../server.js';

const server=createApp();await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const context=await browser.newContext(),a=await context.newPage(),b=await context.newPage();
 await Promise.all([a.goto(base+'/operator.html'),b.goto(base+'/operator.html')]);
 await Promise.all([a.getByRole('heading',{name:'经营者工作台'}).waitFor(),b.getByRole('heading',{name:'经营者工作台'}).waitFor()]);
 assert.equal(await a.locator('.list-row').filter({hasText:'抖音创作者大会'}).count(),1);assert.equal(await b.locator('.list-row').filter({hasText:'嘉兴夜游纪念摆件'}).count(),1);
 const id=await a.evaluate(async()=>{const {openKeepsakeStore}=await import('/src/travel-keepsake-store.js'),{createCommission,saveCommission}=await import('/src/operator-domain.js');const s=await openKeepsakeStore(),c=await saveCommission(s,createCommission({title:'并发生产检查',source:'self-test',serviceMode:'production',storySynced:true,raw:'同一份用户故事',summary:'用户提交模型',productionStatus:'checking',material:'树脂'}));s.close();return c.id;});
 await Promise.all([a.goto(base+'/operator.html#commission/'+id+'/brief'),b.goto(base+'/operator.html#commission/'+id+'/brief')]);
 await Promise.all([a.getByRole('heading',{name:'生产检查',exact:true}).waitFor(),b.getByRole('heading',{name:'生产检查',exact:true}).waitFor()]);
 await a.locator('[name=material]').fill('尼龙');await a.getByRole('button',{name:'记录检查结果'}).click();await a.getByText('生产检查结果已保存。',{exact:true}).waitFor();
 await b.locator('[name=material]').fill('陶瓷');await b.getByRole('button',{name:'记录检查结果'}).click();await b.waitForTimeout(250);assert.match(await b.locator('#operator-status').textContent(),/记录已在其他页面更新/);
 const saved=await a.evaluate(async id=>{const {openKeepsakeStore}=await import('/src/travel-keepsake-store.js');const s=await openKeepsakeStore(),c=await s.getMeta('operator-commission:'+id);s.close();return c;},id);
 assert.equal(saved.material,'尼龙');assert.equal(saved.productionStatus,'checking');
 await a.goto(base+'/operator.html#commission/demo-assisted-douyin/brief');await b.goto(base+'/operator.html#commission/demo-production-jiaxing/brief');
 assert.ok(await a.getByRole('heading',{name:'用户的故事'}).isVisible());assert.ok(await b.getByRole('heading',{name:'用户提交的 3D 资产'}).isVisible());
 assert.equal(await a.getByText('生产检查',{exact:true}).count(),0);assert.equal(await b.getByText('发送给用户确认',{exact:true}).count(),0);
 console.log('PASS operator adversarial: concurrent demo seed, stale-write rejection, per-tab workflow ownership; no paid calls.');await context.close();
}finally{await browser.close();await new Promise(r=>server.close(r));}
