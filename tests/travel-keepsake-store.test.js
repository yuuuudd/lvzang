import test from 'node:test';
import * as keepsakeVersions from '../public/src/travel-keepsake-store.js';
import assert from 'node:assert/strict';

test('edits share one display position while versions and the chosen model remain independently selectable',()=>{
 assert.equal(typeof keepsakeVersions.groupPieceVersions,'function');
 const original={id:'original',generationId:'job-one',assetIndex:0,sourcePhotoId:'photo-one',label:'旅行作品',createdAt:1};
 const edited={id:'edited',versionOf:'original',generationId:'job-two',assetIndex:0,sourcePhotoId:'photo-one',label:'修改后的作品',createdAt:2};
 const legacyEdit={id:'legacy-edit',generationId:'job-three',assetIndex:0,sourcePhotoId:'photo-one',label:'第三版',createdAt:3};
 const separate={id:'separate',generationId:'job-four',assetIndex:0,sourcePhotoId:'photo-two',label:'另一件作品',createdAt:4};
 let pieces=keepsakeVersions.groupPieceVersions([legacyEdit,separate,edited,original]);
 assert.equal(pieces.length,2);let piece=pieces.find(p=>p.id==='original');
 assert.equal(piece.assetId,'legacy-edit');assert.equal(piece.generationId,'job-three');
 assert.deepEqual(piece.versions.map(v=>v.id),['original','edited','legacy-edit']);
 pieces=keepsakeVersions.groupPieceVersions([legacyEdit,separate,edited,{...original,displayVersionId:'original'}]);piece=pieces.find(p=>p.id==='original');
 assert.equal(piece.assetId,'original');assert.equal(piece.generationId,'job-one');
 assert.equal(keepsakeVersions.previewPieceVersion(piece,'edited').assetId,'edited');
 assert.equal(keepsakeVersions.previewPieceVersion(piece,'separate').assetId,'original');
 assert.equal(original.displayVersionId,undefined,'display grouping must not overwrite source records');
});
import {validateBundle,validateRequest,readLegacyKeepsakes} from '../public/src/travel-keepsake-store.js';
const bundle=(id='one')=>({keepsake:{id,schemaVersion:1,title:'广州回忆',city:'广州',kind:'magnet',scope:'personal',participants:[{id:'me',name:'我'}],modelRef:'gz',memoryIds:['m'],dateStart:'2026-06-18',dateEnd:'2026-06-20',createdAt:1,updatedAt:1,origin:'user'},memories:[{id:'m',keepsakeId:id,authorId:'me',date:'2026-06-18',placeName:'珠江',story:'记得晚风',photoIds:[]}],photos:[]});
test('independent same-city keepsakes and referential validation',()=>{assert.notEqual(validateBundle(bundle('a')).keepsake.id,validateBundle(bundle('b')).keepsake.id);const bad=bundle();bad.memories[0].authorId='other';assert.throws(()=>validateBundle(bad),/作者/);bad.memories[0].authorId='me';bad.keepsake.memoryIds=['missing'];assert.throws(()=>validateBundle(bad),/回忆/);});
test('request validates axis, quantity and Unicode text',()=>{const r={keepsakeId:'one',modelRef:'gz',modelVersion:1,sizeAxis:'height',sizeMm:70,colorMode:'ivory',quantity:1,text:'下一站，也一起'};assert.equal(validateRequest(r).sizeMm,70);assert.throws(()=>validateRequest({...r,quantity:0}),/数量/);assert.throws(()=>validateRequest({...r,text:'旅'.repeat(21)}),/20/);assert.throws(()=>validateRequest({...r,sizeMm:65}),/尺寸/);assert.throws(()=>validateRequest({...r,sizeAxis:'oops'}),/尺寸/);});
test('agent production request requires dimensions, material and structure',()=>{const r={source:'agent',keepsakeId:'one',modelRef:'generated:one',modelVersion:2,sizeAxis:'height',sizeMm:60,size:{width:70,height:60,depth:8},material:'resin',colorMode:'color',structure:['flat_back','magnet_slot'],quantity:1,text:'',purpose:'print'};assert.equal(validateRequest(r).material,'resin');assert.throws(()=>validateRequest({...r,size:{width:70,height:60}}),/宽高厚/);assert.throws(()=>validateRequest({...r,material:'gold'}),/材料/);assert.throws(()=>validateRequest({...r,structure:[]}),/结构/);});
test('legacy collection is read-only and retains miniature type',()=>{const state={collection:[{id:'gz-tower',date:'2026-06-18',story:'老故事'}]};const before=JSON.stringify(state);assert.equal(readLegacyKeepsakes(state)[0].kind,'miniature');assert.equal(JSON.stringify(state),before);});
