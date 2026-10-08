import test from 'node:test';
import assert from 'node:assert/strict';
import {constrainGuideSize} from '../public/src/travel-guide-layout.js';

test('guide dimensions use canvas coordinates while limits use the visible viewport',()=>{
 const size=constrainGuideSize({width:1800,height:1200},{width:800,height:600,scale:.73});
 assert.ok(size.width*.73<=776.01);assert.ok(size.height*.73<=568.01);
 assert.ok(size.width>800,'Do not confuse scaled canvas units with physical screen pixels');
});
test('a card keeps usable minimum dimensions unless its viewport is smaller',()=>{
 assert.deepEqual(constrainGuideSize({width:-1,height:10},{width:1000,height:900}),{width:320,height:440});
 assert.deepEqual(constrainGuideSize({width:1200,height:1200},{width:250,height:220}),{width:226,height:188});
});
test('invalid stored dimensions recover to defaults inside viewport bounds',()=>{
 assert.deepEqual(constrainGuideSize({width:NaN,height:0},{width:1000,height:900,scale:NaN}),{width:320,height:644});
});
