import test from 'node:test';
import assert from 'node:assert/strict';
import {getExplorationLandmarks,getExplorationLandmark} from '../public/src/travel-map-exploration.js';
import {hasLandmarkModel,landmarkGeometry} from '../public/src/travel-map-landmarks.js';
import {selectAmapPlace} from '../public/src/travel-map-data.js';

const keys=['zhongshan-sun-residence','zhongshan-memorial-hall','zhongshan-zhan-garden','zhongshan-skywheel'];
test('Zhongshan exposes four city-scoped modeled identities without hardcoded map coordinates',()=>{
  const stops=getExplorationLandmarks('中山');assert.deepEqual(stops.map(stop=>stop.id),keys);
  assert.deepEqual(getExplorationLandmarks('中山市'),stops);
  assert.deepEqual(getExplorationLandmarks('中山',{density:'itinerary'}),[]);
  for(const stop of stops){
    assert.equal(stop.city,'中山');assert.equal(stop.modelKey,stop.id);assert.match(stop.source,/^https:\/\/www\.zs\.gov\.cn\//);
    for(const property of ['position','coords','minutes','cost','availability'])assert.equal(Object.hasOwn(stop,property),false);
    const generated={id:'suggested-random',city:'中山市',name:stop.name};assert.equal(hasLandmarkModel(generated),true);assert.equal(landmarkGeometry(generated).kind,stop.id);
    assert.equal(getExplorationLandmark('东莞',stop.name),null,'Nearby cities do not inherit Zhongshan buildings');
  }
  assert.equal(getExplorationLandmark('中山','中山纪念堂').id,'zhongshan-memorial-hall');
  assert.equal(getExplorationLandmark('广州','中山纪念堂').id,'gz-zhongshan-memorial');
  for(const name of ['孙中山故里旅游区','上海孙中山故居','孙中山纪念堂公园','兴中广场'])assert.equal(getExplorationLandmark('中山',name),null,'A larger complex or nearby attraction is not a building alias');
});

test('actual AMap names match Zhongshan landmarks while parking, park and other-city results stay separate',()=>{
  // Actual SDK query evidence, 2026-10-08. These coordinates are test snapshots;
  // the production catalog only provides names and the map queries AMap itself.
  const positions=[[113.528503,22.441955],[113.37585,22.522677],[113.331694,22.43488],[113.366754,22.526008]];
  const names=['孙中山故居纪念馆','孙中山纪念堂','中山詹园','缤纷幻彩摩天轮'];
  const region={name:'中山市',level:'city',adcode:'442000'};
  for(const [index,stop] of getExplorationLandmarks('中山').entries()){
    const poi={id:'fixture-'+index,name:names[index],cityname:'中山市',pname:'广东省',adcode:'442000',location:positions[index]};
    const selected=selectAmapPlace([{...poi,id:'parking-'+index,name:names[index]+'停车场'},poi,{...poi,id:'wrong-city',cityname:'广州市',adcode:'440100'}],{...stop,region});
    assert.equal(selected.status,'matched');assert.equal(selected.place.name,names[index]);assert.deepEqual(selected.place.position,positions[index]);
    const remaining=getExplorationLandmarks('中山',{acceptedStops:[{id:'accepted-random',city:'中山',name:names[index]}]});assert.equal(remaining.some(candidate=>candidate.id===stop.id),false,'Provider-named itinerary points deduplicate the modeled landmark');
  }
});
