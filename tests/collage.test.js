import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultPiece, pieceBox, pickPiece, pickPaintingRegion } from '../public/src/collage.js';

test('layout keeps one stable placement per photo and hit testing respects overlap and transparency',()=>{
  for(const count of [2,9])assert.equal(new Set(Array.from({length:count},(_,index)=>JSON.stringify(defaultPiece(index,count,index===0)))).size,count);
  const image={naturalWidth:100,naturalHeight:100},images=new Map([['lower',image],['upper',image]]);
  const lower={id:'lower',piece:{...defaultPiece(0,2,true),cutout:'data:image/webp;base64,test',z:0}},upper={id:'upper',piece:{...lower.piece,z:1}};
  const {cx,cy}=pieceBox(lower,image);
  assert.equal(pickPiece([lower,upper],images,cx,cy,point=>point.id==='upper'?0:255)?.id,'lower');
  assert.equal(pickPiece([lower,upper],images,cx,cy,()=>255)?.id,'upper');
  assert.equal(pickPiece([lower,upper],images,0,0,()=>255),null);
});

test('painting hit testing ignores missing regions and prefers the smaller visible element',()=>{
  const regions=[{memoryId:'large',visible:true,shape:'box',center:{x:.5,y:.5},box:{x:.1,y:.1,w:.8,h:.8},scale:1},{memoryId:'small',visible:true,shape:'mask',center:{x:.5,y:.5},box:{x:.4,y:.4,w:.2,h:.2},scale:1},{memoryId:'missing',visible:false}];
  assert.equal(pickPaintingRegion(regions,.5,.5,()=>255)?.memoryId,'small');
  assert.equal(pickPaintingRegion(regions,.3,.3,()=>255)?.memoryId,'large');
  assert.equal(pickPaintingRegion(regions,.5,.5,()=>0)?.memoryId,'large');
  assert.equal(pickPaintingRegion(regions,.95,.95,()=>255),null);
  regions[1].scale=.5;
  assert.equal(pickPaintingRegion(regions,.48,.48,()=>255)?.memoryId,'small');
});
