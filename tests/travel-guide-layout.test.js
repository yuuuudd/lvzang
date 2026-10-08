import test from 'node:test';
import assert from 'node:assert/strict';
import {travelSplitLayout} from '../public/src/travel-guide-layout.js';

test('a normal split starts with 55% map and allocates all remaining width to the guide',()=>{
 const layout=travelSplitLayout(1000);
 assert.equal(layout.mapRatio,.55);assert.equal(layout.mapWidth,550);assert.equal(layout.guideWidth,450);
});
test('moving the divider changes opposite pane widths without changing their combined width',()=>{
 const left=travelSplitLayout(900,.4),right=travelSplitLayout(900,.65);
 assert.equal(left.mapWidth+left.guideWidth,900);assert.equal(right.mapWidth+right.guideWidth,900);
 assert.ok(left.mapWidth<right.mapWidth);assert.ok(left.guideWidth>right.guideWidth);
 assert.ok(left.fontSize>right.fontSize,'Widening the guide enlarges its text automatically');
});
test('desktop bounds keep both panes usable when dragged past either end',()=>{
 const left=travelSplitLayout(1000,-5),right=travelSplitLayout(1000,5);
 assert.equal(left.mapWidth,240);assert.equal(right.guideWidth,260);
});
test('390 and 580 pixel views still have two positive-width panes and sensible minimums',()=>{
 for(const available of [350,540]){
  const left=travelSplitLayout(available,0),right=travelSplitLayout(available,1);
  assert.ok(left.mapWidth>=120);assert.ok(right.guideWidth>=180-1e-9);
  for(const layout of [left,right,travelSplitLayout(available)])assert.ok(Math.abs(layout.mapWidth+layout.guideWidth-available)<1e-9);
 }
});
test('even an exceptionally narrow container cannot overflow because of conflicting minimums',()=>{
 for(const width of [0,90,220]){const layout=travelSplitLayout(width);assert.ok(layout.mapWidth>=0);assert.ok(layout.guideWidth>=0);assert.ok(layout.mapWidth+layout.guideWidth<=width+1e-9);}
});
test('reading type changes smoothly between 14 and 18px and invalid preferences use defaults',()=>{
 assert.equal(travelSplitLayout(350,.5).fontSize,14);
 assert.equal(travelSplitLayout(1600,.4).fontSize,18);
 assert.equal(travelSplitLayout(1000,NaN).mapRatio,.55);
 assert.equal(travelSplitLayout(Infinity).mapWidth,0);
 const small=travelSplitLayout(900,.55).fontSize,larger=travelSplitLayout(900,.54).fontSize;
 assert.ok(larger>small&&larger-small<.2);
});
