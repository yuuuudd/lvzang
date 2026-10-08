import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {landmarkModelKeys,buildLandmarkGeometry} from '../public/src/travel-landmark-geometry.js';
import {landmarkGeometry,hasLandmarkModel} from '../public/src/travel-map-landmarks.js';

test('all new architectural meshes are finite, bounded, nondegenerate and distinct',()=>{
  const hashes=new Set();assert.equal(landmarkModelKeys.length,39);
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
  assert.equal(hashes.size,39);assert.equal(buildLandmarkGeometry('unknown'),null);
});

test('Shenzhen skyline resolves six independent silhouettes including shopping-area itinerary ids',()=>{
  const cases=[['平安金融中心','shenzhen-pingan-finance'],['京基100','shenzhen-kk100'],['地王大厦','shenzhen-diwang'],['深圳市民中心','shenzhen-civic-center'],['春笋','shenzhen-china-resources-tower'],['深圳湾文化广场','shenzhen-bay-culture']];
  for(const [name,key]of cases){
    assert.ok(landmarkModelKeys.includes(key),`${name}: dedicated geometry is registered`);
    assert.equal(landmarkGeometry({id:'ai-itinerary-stop',city:'深圳',name}).kind,key);
    assert.equal(landmarkGeometry({id:'search-poi-id',city:'深圳市',name:'地标',aliases:[name]}).kind,key);
  }
  const size=key=>{const vertices=buildLandmarkGeometry(key).flatMap(t=>t.points);return [0,1,2].map(axis=>Math.max(...vertices.map(p=>p[axis]))-Math.min(...vertices.map(p=>p[axis])));};
  for(const key of ['shenzhen-pingan-finance','shenzhen-kk100','shenzhen-diwang','shenzhen-china-resources-tower']){const [width,height]=size(key);assert.ok(height>width*2,`${key}: high-rise silhouette`);}
  const [civicWidth,civicHeight]=size('shenzhen-civic-center');assert.ok(civicWidth>civicHeight*2,'Civic Center keeps its broad wing-like silhouette');
  const [cultureWidth,cultureHeight]=size('shenzhen-bay-culture');assert.ok(cultureWidth>cultureHeight*1.5,'Culture Plaza reads as a low paired sculptural complex');
  assert.equal(landmarkGeometry({id:'unknown-poi',city:'深圳',name:'春茧'}).kind,'place','A different nearby venue must not inherit the Culture Plaza model');
});

test('city-scoped catalog identities resolve arbitrary itinerary/search ids and aliases',()=>{
  const cases=[['杭州','雷峰塔','hz-leifeng-tower'],['苏州','苏州博物馆','sz-museum'],['北京','天坛祈年殿','bj-temple-heaven'],['上海','东方明珠','sh-oriental-pearl'],['成都','望江楼','cd-wangjiang-tower'],['西藏','布达拉宫','xz-potala-palace'],['西藏自治区','扎什伦布寺','xz-tashilhunpo'],['拉萨','布达拉宫','xz-potala-palace'],['日喀则','扎什伦布寺','xz-tashilhunpo']];
  for(const [city,name,expected]of cases){
    assert.equal(landmarkGeometry({id:'suggested-random',city,name}).kind,expected,`${city} ${name}`);
    assert.equal(landmarkGeometry({id:'amap-provider-id',city,name:'不同显示名',aliases:[name]}).kind,expected,`${city} alias`);
  }
});

test('Zhongshan models resolve local provider aliases without leaking to other cities',()=>{
  const cases=[['孙中山故居','zhongshan-sun-residence'],['孙中山纪念堂','zhongshan-memorial-hall'],['中山詹园','zhongshan-zhan-garden'],['缤纷幻彩摩天轮','zhongshan-skywheel']];
  for(const [name,key]of cases){
    assert.equal(landmarkGeometry({id:'provider-id',city:'中山市',name}).kind,key,name);
    assert.equal(landmarkGeometry({id:'ai-random',city:'中山',name:'另一个显示名',aliases:[name]}).kind,key,name);
    assert.deepEqual(landmarkGeometry({id:key,city:'东莞',name}),{kind:'place',triangles:null},name);
  }
});

test('Foshan and Zhuhai models retain exact local identities and lighthouse branch matching',()=>{
  const cases=[['佛山','佛山祖庙','foshan-ancestral-temple'],['佛山','南风古灶','foshan-nanfeng-kiln'],['佛山','清晖园','foshan-qinghui-garden'],['珠海','珠海大剧院','zhuhai-grand-theatre'],['珠海','圆明新园','zhuhai-new-yuanming-palace'],['珠海','海滨泳场灯塔','zhuhai-love-post-lighthouse']];
  for(const [city,name,key]of cases){
    assert.equal(landmarkGeometry({id:'provider-id',city:city+'市',name}).kind,key,name);
    assert.deepEqual(landmarkGeometry({id:key,city:'东莞',name}),{kind:'place',triangles:null},name);
  }
  assert.equal(landmarkGeometry({id:'random-search-id',city:'珠海',name:'爱情邮局灯塔'}).kind,'zhuhai-love-post-lighthouse');
  assert.deepEqual(landmarkGeometry({id:'random-search-id',city:'珠海',name:'爱情邮局'}),{kind:'place',triangles:null},'The neighboring post office must not inherit the lighthouse model');
});

test('wrong-city and untrusted model keys remain generic, while Guangzhou models stay intact',()=>{
  for(const stop of [{id:'random',city:'北京',name:'雷峰塔'},{id:'hz-leifeng-tower',city:'北京',name:'未收录地点'},{id:'random',city:'未知',name:'任意地点',modelKey:'xz-potala-palace'}])assert.equal(landmarkGeometry(stop).kind,'place');
  for(const id of ['gz-museum','gz-tower','gz-square','gz-opera','gz-library','gz-ifc','gz-ctf','gz-youth-palace'])assert.equal(landmarkGeometry({id,city:'广州'}).kind,id);
});

test('unrecognized and wrong-city places use pins without generating substitute geometry',()=>{
  for(const stop of [
    {id:'dongguan-keyuan',city:'东莞',name:'可园'},
    {id:'search-songshan',city:'东莞市',name:'松山湖'},
    {id:'gz-museum',city:'东莞',name:'广东省博物馆'},
    {id:'gz-parc-central',city:'东莞',name:'天环广场'},
    {id:'sz-garden',city:'东莞',name:'拙政园'},
    {id:'random',city:'广州',name:'广东省博物馆旁边的咖啡店'},
  ]){
    assert.equal(hasLandmarkModel(stop),false,stop.name);
    assert.deepEqual(landmarkGeometry(stop),{kind:'place',triangles:null},stop.name);
  }
  for(const stop of [{id:'random',city:'广州市',name:'广州塔'},{id:'search-library',city:'广州',name:'另一个名称',aliases:['广州图书馆新馆']},{id:'random',city:'深圳',name:'春笋'}]){
    assert.equal(hasLandmarkModel(stop),true,stop.name);
    assert.ok(landmarkGeometry(stop).triangles.length>0,stop.name);
  }
});

test('trusted shops, streets, parks and legacy planning places retain bounded ground models',()=>{
  const rows=[['广州','太古汇','commercial'],['广州','正佳广场','commercial'],['广州市','永庆坊','ground-street'],['广州','越秀公园','ground-park'],['广州','陈家祠','ground-hall'],['广州','广州艺术博物院','ground-culture'],['广州','海心桥','ground-bridge'],['苏州市','拙政园','sz-garden'],['苏州','平江历史街区','sz-pingjiang'],['杭州','西湖','hz-westlake']];
  const hashes=new Set();
  for(const [city,name,expected]of rows){
    const stop={id:'random-itinerary-id',city,name},model=landmarkGeometry(stop);
    assert.equal(hasLandmarkModel(stop),true,name);assert.equal(model.kind,expected,name);assert.ok(model.triangles.length>50&&model.triangles.length<4000,name);
    assert.ok(model.triangles.every(triangle=>triangle.points.every(point=>point.every(value=>Number.isFinite(value)&&Math.abs(value)<150))),name);
    if(expected==='commercial'||expected.startsWith('ground-'))hashes.add(createHash('sha256').update(JSON.stringify(model.triangles)).digest('hex'));
  }
  assert.equal(hashes.size,6,'shopping, street, park, hall, culture and bridge ground forms remain distinguishable');
});
