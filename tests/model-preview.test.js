import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Document,NodeIO} from '@gltf-transform/core';
import sharp from 'sharp';
import {createModelPreview} from '../model-preview.js';
import {createCollectionJobs} from '../collection-jobs.js';
import {createApp} from '../server.js';

async function fixture({open=false,nonmanifold=false,disconnected=false,textured=false}={}){
  const doc=new Document(),buffer=doc.createBuffer();
  const positions=doc.createAccessor().setBuffer(buffer).setType('VEC3').setArray(new Float32Array([0,0,0,1,0,0,1,1,0,0,1,0,0,0,1,1,0,1,1,1,1,0,1,1]));
  const faces=[0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,3,7,6,3,6,2,0,4,7,0,7,3,1,2,6,1,6,5];
  const indices=doc.createAccessor().setBuffer(buffer).setType('SCALAR').setArray(new Uint16Array(open?faces.slice(3):nonmanifold?[...faces,0,2,1]:faces));
  const primitive=doc.createPrimitive().setAttribute('POSITION',positions).setIndices(indices);
  if(textured){
    const png=await sharp(Buffer.from([255,0,0,0,0,255]),{raw:{width:2,height:1,channels:3}}).png().toBuffer();
    primitive.setMaterial(doc.createMaterial().setBaseColorTexture(doc.createTexture().setImage(png).setMimeType('image/png')));
    primitive.setAttribute('TEXCOORD_0',doc.createAccessor().setBuffer(buffer).setType('VEC2').setArray(new Float32Array([.25,.5,.25,.5,.25,.5,.25,.5,.75,.5,.75,.5,.75,.5,.75,.5])));
  }
  const mesh=doc.createMesh().addPrimitive(primitive),scene=doc.createScene();
  scene.addChild(doc.createNode().setMesh(mesh).setTranslation([10,20,30]).setScale([-2,3,2]));
  if(disconnected)scene.addChild(doc.createNode().setMesh(mesh).setTranslation([14,20,30]));
  doc.getRoot().setDefaultScene(scene);
  return Buffer.from(await new NodeIO().writeBinary(doc));
}

for(const [kind,options,triangles] of [['open',{open:true},11],['nonmanifold',{nonmanifold:true},13],['disconnected',{disconnected:true},24]]){
  test(`raw preview displays ${kind} GLB without requiring a printable solid`,async()=>{
    const preview=await createModelPreview(await fixture(options));
    assert.equal(preview.previewVersion,'raw-1');
    assert.equal(preview.mesh.length,triangles*9);
    assert.equal(preview.originalColors.length,preview.mesh.length);
    const axis=i=>preview.mesh.filter((_,index)=>index%3===i);
    assert.equal(Math.min(...axis(0)),-30);assert.equal(Math.max(...axis(0)),30);
    assert.equal(Math.min(...axis(1)),0);assert.equal(Math.min(...axis(2)),0);
    assert.equal(preview.widthMm,60);assert.equal(preview.centerY,preview.heightMm/2);assert.equal(preview.centerZ,preview.totalDepthMm/2);
    assert.ok(preview.mesh.every(Number.isFinite));assert.ok(preview.originalColors.every(v=>Number.isInteger(v)&&v>=0&&v<=255));
  });
}

test('raw preview samples original embedded texture colors and respects mirrored transforms',async()=>{
  const preview=await createModelPreview(await fixture({open:true,textured:true}));
  assert.deepEqual(preview.mesh.slice(0,9),[30,0,0,-30,90,0,30,90,0]);
  assert.ok(preview.originalColors.some((v,i)=>i%3===0&&v===255));
  assert.ok(preview.originalColors.some((v,i)=>i%3===2&&v===255));
  await assert.rejects(createModelPreview(Buffer.from('broken')),/GLB/);
});

async function savedJob(t,{status='completed',inspected=true,previewVersion}={}){
  const dir=await mkdtemp(join(tmpdir(),'raw-preview-')),id='preview-request-0001';
  t.after(()=>rm(dir,{recursive:true,force:true}));
  await mkdir(join(dir,id));const glb=await fixture({open:true});
  const state={id,status,input:{name:'旅行',place:'广州',story:'',photos:[{id:'p1',image:'data:image/jpeg;base64,/9j/'}]},curation:{story:'旅行',points:[]},items:[{photoId:'p1',title:'江边',status:status==='completed'?'completed':'pending',saved:true,inspected,previewVersion,design:{caption:'江边',brief:{summary:'江边',elements:[]}},reference:'data:image/jpeg;base64,/9j/',printReport:{checks:[{name:'import',status:'warn'}]},exportable:false}],steps:Array.from({length:8},()=>({status:'pending'})),counts:{photos:1,subjects:1,elements:0},createdAt:1,updatedAt:1};
  await writeFile(join(dir,id,'state.json'),JSON.stringify(state));await writeFile(join(dir,id,'0.glb'),glb);await writeFile(join(dir,id,'0.jpg'),Buffer.from([255,216,255]));
  return {dir,id,glb};
}

test('old saved model repairs raw preview lazily and atomically without a paid submission',async t=>{
  const {dir,id,glb}=await savedJob(t,{previewVersion:'manufactured'});let previews=0;
  const jobs=await createCollectionJobs({dir,services:{preview:async data=>{previews++;return createModelPreview(data);},startModel:()=>{throw Error('paid submission must not run');}}});
  t.after(()=>jobs.close());
  const before=await jobs.get(id);assert.match(before.assets[0].preview,/0\.json$/);
  const [a,b]=await Promise.all([jobs.asset(id,'0.json'),jobs.asset(id,'0.json')]);
  assert.deepEqual(a,b);assert.equal(previews,1);assert.equal(JSON.parse(a).previewVersion,'raw-1');
  assert.deepEqual(await jobs.asset(id,'0.glb'),glb);
  const state=JSON.parse(await readFile(join(dir,id,'state.json'),'utf8'));assert.equal(state.items[0].previewVersion,'raw-1');assert.equal(state.status,'completed');assert.equal(state.items[0].exportable,false);
  await jobs.asset(id,'0.json');assert.equal(previews,1);assert.equal((await jobs.get(id)).assets[0].previewVersion,'raw-1');
});

test('inspection failure keeps an independently supplied display preview',async t=>{
  const {dir,id}=await savedJob(t,{status:'queued',inspected:false});
  const jobs=await createCollectionJobs({dir,services:{inspect:async()=>{throw Error('模型不封闭');},preview:createModelPreview}});t.after(()=>jobs.close());
  for(let i=0;i<100&&(await jobs.get(id)).status!=='completed';i++)await new Promise(r=>setTimeout(r,5));
  const job=await jobs.get(id);assert.equal(job.status,'completed');assert.equal(job.assets[0].exportable,false);assert.match(job.assets[0].printReport.checks[0].detail,/不封闭/);
  assert.equal(JSON.parse(await jobs.asset(id,'0.json')).mesh.length,99);
});

test('default collection inspection preserves raw preview when manufacture throws',async t=>{
  const {dir,id}=await savedJob(t,{status:'queued',inspected:false});let builds=0;
  const app=createApp({key:'',tripoKey:'',collectionDir:dir,build:async()=>{builds++;throw Error('模型不封闭');}});
  const jobs=await app.resumeCollections();t.after(()=>jobs.close());
  for(let i=0;i<100&&(await jobs.get(id)).status!=='completed';i++)await new Promise(r=>setTimeout(r,5));
  const job=await jobs.get(id);assert.equal(job.status,'completed');assert.equal(builds,1);assert.equal(job.assets[0].exportable,false);
  assert.equal(job.assets[0].printReport.checks[0].status,'fail');assert.equal(JSON.parse(await jobs.asset(id,'0.json')).mesh.length,99);
});
