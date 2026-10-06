import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import createManifold from 'manifold-3d';
import {validateInput,createDesign} from '../public/src/design.js';
import {artPrompt} from '../tripo.js';
import {createCommission,reviseCommission,confirmBrief,attachSelection,reviewCommission,requireProductAsset} from '../public/src/operator-domain.js';
import {createAccountWorkspace} from '../account-workspace.js';
import {runDesignAgent} from '../agent.js';
import {buildMagnetModel} from '../manufacturing.js';
import {glbFromPreview} from '../public/src/mesh-glb-export.js';

const design={...createDesign({}),brief:{summary:'照片中的人',elements:['人物'],composition:'人物坐在地面',imagePrompt:'照片中的人物坐在地面，保留衣服和姿势。'}};
test('product selection is validated and figurine prompts survive reference revisions',()=>{
  assert.throws(()=>validateInput({productType:'unknown'}),/产品/);
  assert.equal(validateInput({productType:'figurine',baseMode:'round'}).productType,'figurine');
  for(const reference of [undefined,'previous']){
    const p=artPrompt({productType:'figurine',baseMode:'round',style:'clay',sculpture:true,design,reference,instruction:'手臂放大'});
    assert.match(p,/摆件/);assert.match(p,/完整.*立体|四周/);assert.doesNotMatch(p,/冰箱贴正面参考图|背面沿主体轮廓收拢/);
  }
});
test('changing product invalidates brief and physical evidence without deleting old work',()=>{
  const c=createCommission({productType:'magnet',summary:'按照片制作',photoIds:['photo'],physicalVerified:true,physicalEvidence:'旧冰箱贴试打'});
  const next=reviseCommission({...confirmBrief(c),selection:{id:'old-work',revision:1}},{productType:'figurine'});
  assert.equal(next.productType,'figurine');assert.equal(next.confirmedVersion,0);assert.equal(next.physicalVerified,false);assert.equal(next.physicalEvidence,'');assert.equal(next.selection.id,'old-work');
});
test('selected product controls fabrication even when legacy mounts conflicts',async()=>{
  for(const productType of ['magnet','figurine']){
    let received;await runDesignAgent({input:{productType},settings:{},glb:new Uint8Array(),mounts:productType!=='magnet'},{build:async b=>{received=b;return {report:{source:'glb',checks:[]}};}});
    assert.equal(received.productType,productType);assert.equal(received.mounts,productType==='magnet');
  }
});
test('new customer orders require a selected product and retain it in both role views',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'product-order-'));
  try{const w=await createAccountWorkspace(dir),op=await w.register({username:'studio',password:'safe-password'},{operator:true}),u=await w.register({username:'visitor',password:'safe-password'}),body={title:'定制',raw:'按照片制作',deliveryType:'digital3d',photos:[{image:'data:image/png;base64,iVBORw0KGgo='}]};
    await assert.rejects(w.createOrder(u,body),/产品|冰箱贴|摆件/);
    const o=await w.createOrder(u,{...body,productType:'figurine',baseMode:'round'});
    assert.equal(o.productType,'figurine');assert.equal((await w.getOrder(op,o.id)).commission.productType,'figurine');
    assert.equal((await w.getOrder(op,o.id)).commission.baseMode,'round');
  }finally{await rm(dir,{recursive:true,force:true});}
});
async function solidGlb(){const module=await createManifold();module.setup();const s=module.Manifold.cube([40,60,35]),m=s.getMesh();const out=new Float32Array(m.triVerts.length*3);m.triVerts.forEach((v,i)=>out.set(m.vertProperties.subarray(v*m.numProp,v*m.numProp+3),i*3));s.delete();return new Uint8Array(await glbFromPreview({mesh:out}).arrayBuffer());}
test('figurine keeps full depth, has no magnet pockets and checks its contact stability',async()=>{
  const r=await buildMagnetModel({glb:await solidGlb(),productType:'figurine',settings:{widthMm:60}});
  assert.deepEqual(r.report.magnetHoles,[]);assert.ok(Math.abs(r.totalDepthMm-52.5)<.01);
  assert.equal(r.report.productType,'figurine');assert.equal(r.report.checks.find(c=>c.name==='standing-stability').status,'pass');
  assert.equal(r.report.checks.find(c=>c.name==='slicing').status,'warn');
});
test('magnet fabrication measures a planar installation face and makes blind pockets',async()=>{
  const r=await buildMagnetModel({glb:await solidGlb(),productType:'magnet',settings:{widthMm:60}});
  assert.equal(r.report.productType,'magnet');assert.equal(r.report.magnetHoles.length,2);
  assert.ok(r.report.backFlatnessMm<=.01);assert.ok(r.report.pocketRayChecks.every(c=>c.remainingFloorMm>=1.2));
});

test('old printing evidence is invalidated when a different model is selected',()=>{
  const c=confirmBrief(createCommission({productType:'magnet',summary:'照片',photoIds:['photo'],deliveryType:'physical',physicalVerified:true,physicalEvidence:'旧版本试打'}));
  const next=attachSelection(c,{id:'new-model',revision:1});assert.equal(next.physicalVerified,false);assert.equal(next.physicalEvidence,'');assert.throws(()=>reviewCommission(next,{accepted:true,note:'新版本'}),/实体/);
});
test('production delivery rejects missing, wrong-product and failed fabrication checks',()=>{
  const c={productType:'magnet',deliveryType:'digital3d'},report={productType:'magnet',checks:['topology','connected','flat-back'].map(name=>({name,status:'pass'}))};
  requireProductAsset(c,{report});
  for(const r of [null,{...report,productType:'figurine'},{...report,checks:report.checks.map(v=>({...v,status:'fail'}))}])assert.throws(()=>requireProductAsset(c,{report:r}),/产品|检查|制作/);
});
