import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {groupPieceVersions,isOrderOnlyKeepsake} from '../public/src/travel-keepsake-store.js';

const credentials=await readFile('artifacts/lvzang-login.txt','utf8'),base='https://lvzang.gzaibuilders.cn';
const username=credentials.match(/账号：([^\r\n]+)/)?.[1],password=credentials.match(/密码：([^\r\n]+)/)?.[1];
assert.ok(username&&password,'Missing saved login credentials');
const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage(),errors=[];
let paid=0;
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST'&&/\/api\/(artwork|model|collection-jobs|collection-cover)(?:$|\/)/.test(r.url()))paid++;});
try{
 const login=await context.request.post(base+'/api/auth/login',{headers:{Origin:base},data:{username,password,role:'user'},timeout:30000});assert.ok(login.ok());
 const response=await context.request.post(base+'/api/library',{headers:{Origin:base},data:{method:'list',args:[]},timeout:30000});assert.ok(response.ok());
 const works=(await response.json()).value.filter(k=>!k.collectionShell&&!isOrderOnlyKeepsake(k)),trips=new Map();for(const k of works){const id=k.tripId||k.id;if(!trips.has(id))trips.set(id,[]);trips.get(id).push({...k,label:k.title});}
 const candidate=[...trips].map(([id,raw])=>({id,raw,pieces:groupPieceVersions(raw)})).find(g=>g.pieces.some(p=>p.versions.length>1));assert.ok(candidate,'No completed version family to verify');
 const piece=candidate.pieces.find(p=>p.versions.length>1);
 await page.goto(base+'/collection.html#world/trip/'+encodeURIComponent(candidate.id),{waitUntil:'domcontentloaded',timeout:30000});await page.locator('.exhibit-piece').first().waitFor({timeout:60000});
 assert.equal(await page.locator('.exhibit-piece').count(),candidate.pieces.length,'revisions must share a gallery position');
 await page.locator('[data-piece="'+piece.id+'"]').click();await page.locator('[name=piece-version]').waitFor({timeout:60000});
 assert.equal(await page.locator('[name=piece-version] option').count(),piece.versions.length);
 await page.locator('[name=piece-version]').selectOption(piece.versions.at(-1).id);await page.waitForFunction(()=>document.querySelector('.piece-main-model')?.dataset.previewMode==='3d',{},{timeout:60000});
 const latestFrame=await page.locator('.piece-main-model canvas').evaluate(canvas=>canvas.toDataURL());
 await page.locator('[name=piece-version]').selectOption(piece.versions[0].id);await page.waitForFunction(()=>document.querySelector('.piece-main-model')?.dataset.previewMode==='3d',{},{timeout:60000});
 const originalFrame=await page.locator('.piece-main-model canvas').evaluate(canvas=>canvas.toDataURL());assert.notEqual(latestFrame,originalFrame,'real version selection must change the visible model');
 await page.getByRole('button',{name:'对比版本',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.comparison-preview[data-preview-mode="3d"]').length===2,{},{timeout:60000});
 await mkdir('artifacts/asset-versions',{recursive:true});await page.screenshot({path:'artifacts/asset-versions/live-model-compare.png'});
 await page.getByRole('button',{name:'设计参考图',exact:true}).click();assert.equal(await page.locator('.comparison-preview>img').count(),2);await page.screenshot({path:'artifacts/asset-versions/live-reference-compare.png'});
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'artifacts/asset-versions/live-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);assert.equal(paid,0);
 const result={result:'PASS',savedModels:candidate.raw.length,displayPositions:candidate.pieces.length,versions:piece.versions.length,actualModelSwitched:true,paidRequests:paid,adoptedLiveVersion:false};await writeFile('artifacts/asset-versions/live-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await context.request.post(base+'/api/auth/logout',{headers:{Origin:base},data:{},timeout:5000}).catch(()=>{});await browser.close();}
