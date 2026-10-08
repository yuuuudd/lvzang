import test from 'node:test';
import assert from 'node:assert/strict';
import {travelTimeDisplay} from '../public/src/travel-workspace.js';
import {emptyTravelProfile,updateTravelProfile} from '../public/src/travel-profile.js';

const oldInput={hours:4,startTime:'13:00'},oldDay={dayIndex:1,startTime:'13:00',hours:4};
test('accepted clarification displays its complete time requirements rather than mixing in the demo',()=>{
  const profile=updateTravelProfile(emptyTravelProfile(),{text:'广州三天，每天六小时，预算1000元'}).profile;
  const display=travelTimeDisplay(oldInput,profile,oldDay,true);
  assert.equal(display.value,'每天6小时');assert.match(display.detail,/共3天.*每日6小时.*尚待排入路线/);assert.equal(display.status,'待补充条件');assert.ok(!display.detail.includes('4小时'));assert.ok(!display.detail.includes('13:00'));
  assert.deepEqual(oldInput,{hours:4,startTime:'13:00'});assert.deepEqual(oldDay,{dayIndex:1,startTime:'13:00',hours:4});
});
test('missing daily time during clarification stays missing rather than inheriting four demo hours',()=>{
  const profile=updateTravelProfile(emptyTravelProfile(),{text:'广州三天，预算1000元'}).profile;
  const display=travelTimeDisplay(oldInput,profile,oldDay,true);
  assert.equal(display.value,'每日时间待补充');assert.match(display.detail,/共3天.*尚待排入路线/);assert.ok(!display.detail.includes('4小时'));
});
test('a ready daily itinerary displays its selected day and clock again',()=>{
  const profile=updateTravelProfile(emptyTravelProfile(),{text:'广州三天，每天六小时'}).profile;
  const display=travelTimeDisplay(oldInput,profile,{dayIndex:2,hours:6,startTime:'09:00'});
  assert.equal(display.value,'09:00 — 15:00');assert.match(display.detail,/第2天 \/ 共3天.*6小时/);assert.equal(display.status,null);
});
