import test from 'node:test';
import assert from 'node:assert/strict';
import * as operatorDomain from '../public/src/operator-domain.js';
const {createCommission,reviseCommission,confirmBrief,reviewCommission,customerView,exportCommission,saveCommission,listCommissions,attachSelection,recordExport,recordDelivery,costSummary}=operatorDomain;
import {unzipSync,strFromU8} from '../public/src/fflate.js';
const commission=()=>createCommission({productType:'magnet',title:'毕业旅行',source:'self-test',deliveryType:'digital3d',raw:'保留同学和校门',summary:'三人校门纪念',photoIds:['photo-1']});
test('order management persists deletion and restoration without changing assets or workflow',async()=>{
 const s=store(),c=await saveCommission(s,commission());
 const deleted=await saveCommission(s,reviseCommission(c,{deleted:true}));
 assert.equal((await listCommissions(s))[0].deleted,true);
 assert.deepEqual(deleted.photoIds,c.photoIds);assert.equal(deleted.briefVersion,c.briefVersion);
 await assert.rejects(saveCommission(s,reviseCommission(c,{deleted:true})),/更新/);
 const restored=await saveCommission(s,reviseCommission(deleted,{deleted:false,archived:false}));
 assert.equal(restored.deleted,false);
 assert.equal(reviseCommission(restored,{archived:true}).archived,true);
 assert.throws(()=>reviseCommission(restored,{deleted:'yes'}),/订单/);
});
const store=()=>{const meta=new Map();return {getMeta:async id=>structuredClone(meta.get(id)),setMeta:async(id,v)=>meta.set(id,structuredClone(v)),compareMeta:async(id,v,revision)=>{const old=meta.get(id);if((old?.revision||0)!==revision)throw Error('记录已更新');const saved={...v,revision:revision+1};meta.set(id,structuredClone(saved));return saved;},dump:async()=>({meta:[...meta].map(([id,value])=>({id,value}))}),get:async id=>id==='work-1'?{keepsake:{id,revision:1,title:'数字作品',generationId:'generated-fixture-0001',assetIndex:0},memories:[]}:null,getPhoto:async()=>new Blob(['source-photo'],{type:'image/png'})};};
function ready(){let c=confirmBrief(commission());c=attachSelection(c,{id:'work-1',revision:1});return reviewCommission(c,{accepted:true,note:'核对原图'});}
test('commission approval binds exact brief and selected asset; later changes require another review',()=>{let c=ready();assert.equal(c.status,'delivery');assert.equal(customerView(c).title,'毕业旅行');c=reviseCommission(c,{raw:'修改人物构图'});assert.equal(c.status,'brief');assert.throws(()=>customerView(c),/审核/);c=attachSelection(confirmBrief(c),{id:'work-1',revision:2});assert.equal(c.review,null);assert.equal(c.status,'review');});
test('export does not mark delivered and physical claims require independent evidence',()=>{const c=recordExport(ready(),'作品.zip');assert.equal(c.status,'delivery');assert.equal(c.exports.length,1);assert.equal(recordDelivery(c,{method:'本人交付数字文件'}).status,'delivered');assert.throws(()=>reviewCommission({...ready(),deliveryType:'physical',physicalVerified:false},{accepted:true,note:'ok'}),/实体/);});
test('customer package contains selected assets only and excludes costs, private notes and unselected source photos',async()=>{const s=store();await s.setMeta('generated-asset:generated-fixture-0001:0',{glb:new Blob(['glTF']),reference:new Blob(['image'],{type:'image/png'}),report:{productType:'magnet',checks:['topology','connected','flat-back'].map(name=>({name,status:'pass'}))}});const c={...ready(),internalNote:'private-secret',costs:[{label:'API',amount:9,kind:'actual'}]};const bytes=new Uint8Array(await (await exportCommission(c,s)).arrayBuffer());const files=unzipSync(bytes);assert.ok(files['model.glb']);assert.ok(files['artwork.png']);const text=strFromU8(files['manifest.json']);assert.ok(!text.includes('private-secret'));assert.ok(!text.includes('costs'));assert.equal(Object.keys(files).some(n=>n.startsWith('photos/')),false);});
test('missing assets prevent delivery package from being produced',async()=>{await assert.rejects(exportCommission(ready(),store()),/文件|模型/);});
test('atomic saves reject stale revisions; lists return self-tests without pretending they are business orders',async()=>{const s=store(),c=await saveCommission(s,commission()),stale=structuredClone(c);await saveCommission(s,{...c,title:'更新标题'});await assert.rejects(saveCommission(s,stale),/更新/);const all=await listCommissions(s);assert.equal(all.length,1);assert.equal(all[0].source,'self-test');assert.equal(all[0].title,'更新标题');});
test('unknown or estimated expenses never become actual cost; invalid money is rejected',()=>{assert.deepEqual(costSummary({costs:[{kind:'actual',amount:3},{kind:'estimate',amount:5},{kind:'unknown',amount:null}]}),{actual:3,estimate:5,unknown:1});assert.throws(()=>reviseCommission(commission(),{costs:[{kind:'actual',amount:-1,label:'fee'}]}),/费用/);});
test('legacy commissions default to assisted creation',()=>{const legacy=createCommission();delete legacy.serviceMode;delete legacy.productionStatus;const normalized=operatorDomain.validateCommission(legacy);assert.equal(normalized.serviceMode,'assisted');assert.equal(normalized.productionStatus,'conversation');});
test('demo commissions cover both paths without real metrics',()=>{assert.equal(typeof operatorDomain.createDemoCommissions,'function');const demos=operatorDomain.createDemoCommissions();assert.deepEqual(demos.map(c=>[c.title,c.source,c.serviceMode]),[['抖音创作者大会','demo','assisted'],['嘉兴夜游纪念摆件','demo','production']]);assert.ok(demos.every(c=>c.costs.length===0&&c.exports.length===0&&!c.deliveredAt));assert.deepEqual(operatorDomain.createDemoCommissions(demos),[]);});
test('assisted creation requires user confirmation before modeling',()=>{assert.equal(typeof operatorDomain.confirmReference,'function');assert.equal(typeof operatorDomain.requireModelingReady,'function');let c=createCommission({serviceMode:'assisted'});assert.throws(()=>operatorDomain.confirmReference(c),/参考方案/);c=attachSelection(c,{id:'work-1',revision:1});assert.throws(()=>operatorDomain.requireModelingReady(c),/用户确认/);c=operatorDomain.confirmReference(c);assert.ok(c.userConfirmedAt>0);assert.doesNotThrow(()=>operatorDomain.requireModelingReady(c));assert.doesNotThrow(()=>operatorDomain.requireModelingReady(createCommission({serviceMode:'production'})));});

test('existing models export proportional STL at the chosen size before slicing or proofing',()=>{
 const c=attachSelection(confirmBrief(createCommission({serviceMode:'production',deliveryType:'physical',productType:'figurine',summary:'直接打印',photoIds:['photo'],sizeCm:12})),{id:'work-1',revision:1});
 const mesh=[0,0,0,2,0,0,0,1,0,0,0,0,0,1,0,0,0,3];
 assert.equal(typeof operatorDomain.productionStl,'function');
 const view=new DataView(operatorDomain.productionStl(c,{mesh}));assert.equal(view.getUint32(80,true),2);
 const coords=[];for(let i=0;i<2;i++)for(let j=0;j<9;j++)coords.push(view.getFloat32(84+i*50+12+j*4,true));
 const axes=[0,1,2].map(axis=>coords.filter((v,i)=>i%3===axis));
 assert.deepEqual(axes.map(values=>Math.max(...values)-Math.min(...values)),[80,120,40],'preserve proportions, set the longest side to 120 mm and rotate Y-up to STL Z-up');
 assert.equal(Math.min(...axes[2]),0,'the printable model rests on Z=0');
 assert.deepEqual(mesh,[0,0,0,2,0,0,0,1,0,0,0,0,0,1,0,0,0,3],'export does not change the original geometry');
 assert.throws(()=>operatorDomain.productionStl({...c,sizeCm:0},{mesh}),/生产|尺寸/);
 assert.throws(()=>operatorDomain.productionStl(c,{mesh:[]}),/模型/);
 assert.throws(()=>operatorDomain.requireProductAsset(c,{report:null}),/实体|切片|打样/);
 const printed={...c,physicalVerified:true,physicalEvidence:'按本版本尺寸切片与试打，记录已核对'};
 assert.doesNotThrow(()=>operatorDomain.requireProductAsset(printed,{report:null}),'existing assets use recorded physical checks without rebuilding their geometry');
 const changed=reviseCommission(printed,{sizeCm:18});assert.equal(changed.physicalVerified,false,'a different print size cannot inherit old proofing evidence');
});

test('legacy default order titles use the current order wording',()=>{assert.equal(createCommission({title:'新的文创委托'}).title,'新订单');assert.equal(createCommission({title:'客户自定名称'}).title,'客户自定名称');});
