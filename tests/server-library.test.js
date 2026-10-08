import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,rename,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServerLibrary} from '../server-library.js';
import {createApp} from '../server.js';
import {encodeLibrary,decodeLibrary} from '../public/src/library-wire.js';
import {createCommission,createDemoCommissions,listCommissions} from '../public/src/operator-domain.js';

const bundle=()=>({keepsake:{id:'trip',schemaVersion:1,title:'乌镇记忆',city:'乌镇',kind:'miniature',scope:'personal',participants:[{id:'me',name:'我'}],modelRef:'pending',memoryIds:['memory'],createdAt:1,updatedAt:1},memories:[{id:'memory',keepsakeId:'trip',authorId:'me',date:'',placeName:'乌镇',story:'早茶',photoIds:['photo']}],photos:[{id:'photo',blob:new Blob(['photo-bytes'],{type:'image/png'}),story:'早茶'}]});

test('commission list reads only matching records even when an unrelated model file is unavailable',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'lvzang-commission-list-')),library=await createServerLibrary(dir);
 try{
  const c=createCommission({title:'需要处理的委托'});
  await library.call('alice','setMeta',['operator-commission:'+c.id,c]);
  await library.call('alice','setMeta',['generated-asset:other:0',{glb:new Blob(['unrelated model'])}]);
  await rename(join(dir,'blobs'),join(dir,'unavailable-blobs'));await mkdir(join(dir,'blobs'));
  const store={dump:()=>library.call('alice','dump',[]),listMeta:prefix=>library.call('alice','listMeta',[prefix])};
  const commissions=await listCommissions(store);
  assert.equal(commissions.length,1);assert.equal(commissions[0].title,'需要处理的委托');
  assert.deepEqual(await library.call('bob','listMeta',['operator-commission:']),[]);
 }finally{await library.close();await rm(dir,{recursive:true,force:true});}
});

test('durable library isolates accounts, detects conflicting edits and rolls back incomplete imports',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'lvzang-library-'));let store=await createServerLibrary(dir);
 try{
  assert.equal(await store.call('alice','save',[bundle()]),1);
  assert.equal((await store.call('alice','list',[])).length,1);
  assert.deepEqual(await store.call('bob','list',[]),[]);
  assert.equal(await store.call('bob','getPhoto',['photo']),null);
  await store.close();store=await createServerLibrary(dir);
  assert.equal(await (await store.call('alice','getPhoto',['photo'])).text(),'photo-bytes');
  const a=await store.call('alice','get',['trip']),b=await store.call('alice','get',['trip']);a.keepsake.title='编辑后的作品';await store.call('alice','save',[a]);
  await assert.rejects(store.call('alice','save',[b]),/其他设备/);
  await store.call('alice','setMeta',['generation-jobs',['one']]);await store.call('alice','setMeta',['generation-jobs',['two']]);assert.deepEqual(await store.call('alice','getMeta',['generation-jobs']),['one','two']);
  await store.call('alice','setMeta',['generated-asset:1234567890123456:0',{glb:new Blob(['model']),reference:new Blob(['ref']),preview:{mesh:[1,2,3]}}]);
  const info=await store.call('alice','getAssetInfo',['generated-asset:1234567890123456:0']);assert.equal(info.hasModel,true);assert.equal(await info.reference.text(),'ref');assert.ok(!Object.hasOwn(info,'glb')&&!Object.hasOwn(info,'preview'),'list metadata must not transfer full models');assert.equal(await store.call('bob','getAssetInfo',['generated-asset:1234567890123456:0']),null);
  const dumped=await store.call('alice','dump',[]);const imported=await store.call('bob','restore',[decodeLibrary(await encodeLibrary(dumped))]);assert.equal(imported.imported,1);
  assert.equal(await store.call('bob','getMeta',['generation-jobs']),null,'import must never resume a paid job');
  assert.equal(await (await store.call('bob','getMeta',['generated-asset:1234567890123456:0'])).glb.text(),'model');
  assert.equal((await store.call('bob','restore',[dumped])).imported,0);
  const broken=structuredClone(dumped);broken.keepsakes[0].id='broken';broken.keepsakes[0].memoryIds=['broken-memory'];broken.memories=[{...broken.memories[0],id:'broken-memory',keepsakeId:'broken',photoIds:['absent']}];broken.photos=[];
  await assert.rejects(store.call('bob','restore',[broken]),/照片/);assert.equal(await store.call('bob','get',['broken']),null);
  await assert.rejects(store.call('alice','toString',[]),/操作无效/);
  assert.throws(()=>decodeLibrary({$libraryFile:'arbitrary'}),/引用/);
 }finally{await store.close();await rm(dir,{recursive:true,force:true});}
});

test('two independent login sessions share a server library, unauthenticated and cross-account access are rejected',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'lvzang-api-')),server=createApp({accountsEnabled:true,serverLibrary:true,accountDir:join(dir,'accounts'),libraryDir:join(dir,'library')});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const post=async(path,body,cookie='',origin=base)=>{const r=await fetch(base+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 try{
  const auth={username:'shared',password:'test-password-123'};
  const a=await post('/api/auth/register',auth);const b=await post('/api/auth/login',{...auth,role:'user'});assert.equal(a.status,200);assert.equal(b.status,200);assert.notEqual(a.cookie,b.cookie);
  assert.equal((await post('/api/library',{method:'save',args:await encodeLibrary([bundle()])},a.cookie)).status,200);
  const read=await post('/api/library',{method:'get',args:['trip']},b.cookie);assert.equal(read.data.value.keepsake.title,'乌镇记忆');
  assert.equal((await post('/api/library',{method:'list',args:[]})).status,401);
  assert.equal((await post('/api/library',{method:'list',args:[]},b.cookie,'https://other.example')).status,403);
  const other=await post('/api/auth/register',{username:'other',password:'test-password-456'});assert.deepEqual((await post('/api/library',{method:'list',args:[]},other.cookie)).data.value,[]);
  for(const file of ['server-keepsake-store','library-wire'])assert.equal((await fetch(base+'/src/'+file+'.js')).status,200);
  for(const demo of createDemoCommissions())assert.equal((await fetch(base+demo.demoImage)).status,200,'workbench sample image must be available');
 }finally{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});
