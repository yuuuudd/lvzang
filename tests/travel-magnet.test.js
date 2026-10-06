import test from 'node:test';
import assert from 'node:assert/strict';
import {reliefFromImage} from '../public/src/relief.js';
import {magnetDepthMap,scaleMagnet} from '../public/src/travel-magnet.js';
const image={width:8,height:8,data:Uint8ClampedArray.from({length:8*8*4},(_,i)=>i%4===3?255:180)};
test('explicit depth is independent of artwork brightness',()=>{const heights=new Float32Array(64).fill(.8);const a=reliefFromImage(image,{heightMap:heights});const dark={...image,data:Uint8ClampedArray.from(image.data,(v,i)=>i%4===3?255:40)};const b=reliefFromImage(dark,{heightMap:heights});assert.deepEqual(a.mesh,b.mesh);assert.throws(()=>reliefFromImage(image,{heightMap:new Float32Array(3)}),/高度图/);});
test('magnet has closed backing and selected physical height',()=>{const heightMap=magnetDepthMap('gz',8,8);assert.ok(new Set(heightMap).size>1);const m=scaleMagnet(reliefFromImage(image,{heightMap}),70);const ys=[];for(let i=1;i<m.mesh.length;i+=3)ys.push(m.mesh[i]);assert.ok(Math.abs(Math.max(...ys)-Math.min(...ys)-70)<.001);assert.ok(m.mesh.every(Number.isFinite));assert.ok(m.mesh.some((v,i)=>i%3===2&&v===0));});
