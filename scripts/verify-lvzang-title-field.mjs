import {readFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const credentials=await readFile('artifacts/lvzang-login.txt','utf8'),username=credentials.match(/账号：([^\r\n]+)/)[1],password=credentials.match(/密码：([^\r\n]+)/)[1],base='https://lvzang.gzaibuilders.cn';
const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext(),page=await context.newPage({viewport:{width:1440,height:1000}});let paid=0;
page.on('request',r=>{if(r.method()==='POST'&&/\/api\/(artwork|model|collection-jobs|collection-cover)(?:$|\/)/.test(r.url()))paid++;});
try{
 const login=await context.request.post(base+'/api/auth/login',{headers:{Origin:base},data:{username,password,role:'user'}});assert.ok(login.ok());await page.goto(base+'/collection.html#world/canvas');await page.getByRole('button',{name:'添加旅行回忆',exact:true}).click();await page.locator('.create-view').waitFor();
 const input=page.locator('[name=trip-name]');assert.ok(await input.isVisible());assert.equal(await input.getAttribute('required'),'');assert.equal(await page.locator('.studio-extra [name=trip-name]').count(),0);assert.equal(await page.locator('.gallery-sidebar .gallery-task-panel').count(),0);assert.equal(paid,0);
 await mkdir('artifacts/lvzang-display',{recursive:true});await page.screenshot({path:'artifacts/lvzang-display/title-before-generation.png',fullPage:true});console.log('PASS: first-generation title input is visible and required outside collapsed options; no generation submitted.');
}catch(error){throw Error('Title-field verification failed: '+error.message.split('\n')[0]);}finally{await context.request.post(base+'/api/auth/logout',{headers:{Origin:base},data:{},timeout:5000}).catch(()=>{});await browser.close();}
