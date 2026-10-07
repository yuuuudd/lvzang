import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import createManifold from 'manifold-3d';
import {createApp} from '../server.js';
import {mkdtemp,rm,readFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {glbFromPreview} from '../public/src/mesh-glb-export.js';
import {readGlbMeshes} from '../mesh-glb.js';

const dir=await mkdtemp(join(tmpdir(),'product-flow-')),photo=await readFile('public/assets/keepsakes/memory-1.webp');
const module=await createManifold();module.setup();const solid=module.Manifold.cube([40,60,35]),m=solid.getMesh(),positions=new Float32Array(m.triVerts.length*3);m.triVerts.forEach((v,i)=>positions.set(m.vertProperties.subarray(v*m.numProp,v*m.numProp+3),i*3));solid.delete();
const glb=new Uint8Array(await glbFromPreview({mesh:positions}).arrayBuffer()),prompts=[];let models=0;
const task=data=>Response.json({code:0,data});
const fetchImpl=async(url,o)=>{
  if(url.includes('deepseek.com'))return Response.json({choices:[{message:{content:JSON.stringify({caption:'旅行记忆',reason:'依据来源照片',brief:{summary:'照片中的主体',elements:['主体'],composition:'主体厚实相连',imagePrompt:'保留照片中的主体与衣服，按所选产品制作。',decisions:['framing','place','lettering','occlusion'].map(topic=>({topic,evidence:'来源照片',action:'保留可见主体',uncertainty:'隐藏细节需确认'}))}})}}]});
  if(url.endsWith('/files'))return task({file_token:'input'});
  if(url.includes('/generation/')){prompts.push(JSON.parse(o.body).prompt);return task({task_id:'product-art-'+prompts.length});}
  if(url.includes('/tasks/'))return task({status:'success',output:{generated_image_url:'https://cdn.tripo3d.ai/photo.webp'}});
  if(url.endsWith('photo.webp'))return new Response(photo);
  if(url.endsWith('/upload/sts'))return task({image_token:'input'});
  if(url.endsWith('/task'))return task({task_id:'product-model-'+(++models)});
  if(url.includes('/task/'))return task({status:'success',output:{model:'https://cdn.tripo3d.ai/result.glb'}});
  if(url.endsWith('result.glb'))return new Response(glb);
  throw Error('Unexpected mock URL '+url);
};
const server=createApp({accountsEnabled:true,accountDir:dir,key:'test',tripoKey:'test',fetchImpl});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true});await mkdir('artifacts/product-rules',{recursive:true});
try{
  const opContext=await browser.newContext(),userContext=await browser.newContext(),op=await opContext.newPage({viewport:{width:1440,height:1000}}),user=await userContext.newPage({viewport:{width:1440,height:1000}}),errors=[];
  op.on('pageerror',e=>errors.push(e.message));user.on('pageerror',e=>errors.push(e.message));
  await opContext.request.post(base+'/api/auth/setup',{headers:{Origin:base},data:{username:'studio',password:'safe-password'}});
  await userContext.request.post(base+'/api/auth/register',{headers:{Origin:base},data:{username:'visitor',password:'safe-password'}});
  for(const productType of ['magnet','figurine']){
    await user.goto(base+'/orders.html#new');await user.locator('[name=productType][value='+productType+']').check();if(productType==='figurine')await user.locator('[name=baseMode]').selectOption('round');
    await user.locator('[name=title]').fill('验证-'+productType);await user.locator('[name=raw]').fill('保留来源照片中的主体');await user.locator('[name=photos]').setInputFiles('public/assets/keepsakes/memory-1.webp');await user.waitForFunction(()=>document.querySelectorAll('#order-photo-preview img').length===1);
    await user.screenshot({path:'artifacts/product-rules/'+productType+'-choice.png',fullPage:true});
    await user.getByRole('button',{name:'提交给经营者审核',exact:true}).click();await user.getByText('需求已提交，经营者可以收到并审核。',{exact:true}).waitFor();const id=new URL(user.url()).hash.slice(1);
    await op.goto(base+'/operator.html#commission/'+id+'/brief');await op.getByRole('button',{name:'接受需求，开始制作',exact:true}).click();await op.getByRole('button',{name:'打开单件创作',exact:true}).click();await op.waitForFunction(()=>document.getElementById('photo-status')?.textContent.includes('来源照片'));
    assert.equal(await op.locator('#product-type').inputValue(),productType);assert.equal(await op.locator('#product-type').isDisabled(),true);
    if(productType==='magnet'){await op.locator('.print-settings summary').click();await op.locator('#magnet-diameter').fill('8');await op.locator('#magnet-depth').fill('3');await op.locator('#magnet-clearance').fill('0.3');}
    const before=prompts.length;await op.locator('#generate').click();await op.locator('#build-reference').waitFor({state:'visible'});await op.waitForFunction(()=>!document.getElementById('generate').disabled);
    await op.locator('#revision').fill('让主体更圆润');await op.locator('#revise').click();await op.waitForFunction(()=>!document.getElementById('generate').disabled);assert.equal(prompts.length,before+2);
    for(const prompt of prompts.slice(before)){assert.match(prompt,productType==='magnet'?/冰箱贴/:/摆件/);if(productType==='figurine')assert.doesNotMatch(prompt,/冰箱贴正面参考图|背面沿主体轮廓收拢/);}
    await op.reload();await op.locator('#build-reference').waitFor({state:'visible'});await op.waitForFunction(()=>!document.getElementById('generate').disabled);assert.equal(await op.locator('#product-type').inputValue(),productType);assert.equal(prompts.length,before+2,'reload must not submit another reference');
    await op.locator('#build-reference').click();await op.waitForFunction(()=>document.getElementById('trail-model')?.textContent.includes('已完成几何检查'),{},{timeout:30000});await op.waitForFunction(()=>!document.getElementById('generate').disabled);
    await op.screenshot({path:'artifacts/product-rules/'+productType+'-model.png',fullPage:true});
    await op.getByRole('link',{name:'返回委托工作台',exact:true}).click();await op.getByRole('button',{name:'提交审核',exact:true}).click();await op.locator('[name=reviewNote]').fill('核对数字模型，实体仍需切片与试打');await op.getByRole('button',{name:'审核通过，去交付',exact:true}).click();
    await user.reload();await user.getByRole('button',{name:'确认这版作品',exact:true}).waitFor();const order=await (await userContext.request.get(base+'/api/orders/'+id)).json();assert.equal(order.productType,productType);assert.equal(order.result.report.productType,productType);
    assert.equal(order.result.report.magnetHoles.length,productType==='magnet'?2:0);assert.equal(order.result.report.checks.find(c=>c.name===(productType==='magnet'?'flat-back':'standing-stability')).status,'pass');assert.equal(order.result.report.printabilityVerified,false);if(productType==='magnet'){assert.equal(order.result.report.magnetHoles[0].diameter,8.3);assert.equal(order.result.report.magnetHoles[0].depth,3);}
    const file=order.result.files.find(f=>f.kind==='model'),delivered=new Uint8Array(await (await userContext.request.get(base+file.url)).body()),meshes=await readGlbMeshes(delivered);assert.ok(meshes.length);assert.notDeepEqual(delivered,glb,'delivery uses processed geometry');
    await user.setViewportSize({width:390,height:844});assert.ok(await user.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await user.screenshot({path:'artifacts/product-rules/'+productType+'-mobile.png',fullPage:true});await user.setViewportSize({width:1440,height:1000});
  }

  const reused=await (await userContext.request.post(base+'/api/orders',{headers:{Origin:base},data:{title:'旧模型重新制作',raw:'采用已有主体，做成摆件',productType:'figurine',baseMode:'round',deliveryType:'digital3d',photos:[{image:'data:image/webp;base64,'+photo.toString('base64')}],inputReference:{image:'data:image/webp;base64,'+photo.toString('base64')},inputModel:{base64:Buffer.from(glb).toString('base64')}}})).json();
  await op.goto(base+'/operator.html#commission/'+reused.id+'/brief');await op.getByRole('button',{name:'接受需求，开始制作',exact:true}).click();await op.getByRole('button',{name:'采用用户提交的作品',exact:true}).click();await op.getByRole('button',{name:'提交审核',exact:true}).click();await op.waitForFunction(()=>!document.getElementById('operator-root').inert);if(!new URL(op.url()).hash.endsWith('/review'))throw Error('Reuse review failed: '+await op.locator('#operator-status').textContent());await op.locator('[name=reviewNote]').fill('旧模型已按摆件规格重新处理');await op.getByRole('button',{name:'审核通过，去交付',exact:true}).click();
  await op.waitForFunction(()=>!document.getElementById('operator-root').inert);if(!new URL(op.url()).hash.endsWith('/delivery'))throw Error('Reuse approval failed: '+await op.locator('#operator-status').textContent());
  const processed=await (await userContext.request.get(base+'/api/orders/'+reused.id)).json();assert.equal(processed.result.report.productType,'figurine');assert.equal(processed.result.report.baseMode,'round');assert.equal(processed.result.report.checks.find(c=>c.name==='standing-stability').status,'pass');
  assert.equal(models,2);assert.deepEqual(errors,[]);console.log('PASS: both product choices, split initial/revision prompts, reference reload without resubmission, real product geometry, processed GLB customer delivery, desktop/mobile, no page errors or paid calls.');
}finally{await browser.close();await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
