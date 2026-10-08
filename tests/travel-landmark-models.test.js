import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {landmarkModelKeys,buildLandmarkGeometry} from '../public/src/travel-landmark-geometry.js';
import {landmarkGeometry} from '../public/src/travel-map-landmarks.js';

test('all new architectural meshes are finite, bounded, nondegenerate and distinct',()=>{
  const hashes=new Set();assert.equal(landmarkModelKeys.length,23);
  for(const key of landmarkModelKeys){
    const triangles=buildLandmarkGeometry(key);assert.ok(triangles.length>=150&&triangles.length<4000,`${key}: bounded detail budget`);
    const points=[];
    for(const {points:vertices,color}of triangles){
      assert.equal(vertices.length,3);assert.equal(color.length,3);assert.ok(color.every(value=>Number.isFinite(value)&&value>=0&&value<=255));
      for(const vertex of vertices){assert.equal(vertex.length,3);assert.ok(vertex.every(value=>Number.isFinite(value)&&Math.abs(value)<150),key);points.push(vertex);}
      const [a,b,c]=vertices,u=b.map((v,i)=>v-a[i]),v=c.map((value,i)=>value-a[i]);assert.ok(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])>1e-8,`${key}: zero-area face`);
    }
    for(let axis=0;axis<3;axis++)assert.ok(Math.max(...points.map(p=>p[axis]))-Math.min(...points.map(p=>p[axis]))>10,`${key}: non-flat silhouette`);
    hashes.add(createHash('sha256').update(JSON.stringify(triangles)).digest('hex'));
  }
  assert.equal(hashes.size,23);assert.equal(buildLandmarkGeometry('unknown'),null);
});

test('city-scoped catalog identities resolve arbitrary itinerary/search ids and aliases',()=>{
  const cases=[['杭州','雷峰塔','hz-leifeng-tower'],['苏州','苏州博物馆','sz-museum'],['北京','天坛祈年殿','bj-temple-heaven'],['上海','东方明珠','sh-oriental-pearl'],['成都','望江楼','cd-wangjiang-tower'],['西藏','布达拉宫','xz-potala-palace'],['西藏自治区','扎什伦布寺','xz-tashilhunpo'],['拉萨','布达拉宫','xz-potala-palace'],['日喀则','扎什伦布寺','xz-tashilhunpo']];
  for(const [city,name,expected]of cases){
    assert.equal(landmarkGeometry({id:'suggested-random',city,name}).kind,expected,`${city} ${name}`);
    assert.equal(landmarkGeometry({id:'amap-provider-id',city,name:'不同显示名',aliases:[name]}).kind,expected,`${city} alias`);
  }
});

test('wrong-city and untrusted model keys remain generic, while Guangzhou models stay intact',()=>{
  for(const stop of [{id:'random',city:'北京',name:'雷峰塔'},{id:'hz-leifeng-tower',city:'北京',name:'未收录地点'},{id:'random',city:'未知',name:'任意地点',modelKey:'xz-potala-palace'}])assert.equal(landmarkGeometry(stop).kind,'place');
  for(const id of ['gz-museum','gz-tower','gz-square','gz-opera','gz-library','gz-ifc','gz-ctf','gz-youth-palace'])assert.equal(landmarkGeometry({id,city:'广州'}).kind,id);
});
