import test from 'node:test';
import assert from 'node:assert/strict';
import { runDesignAgent } from '../agent.js';

test('agent chooses a real correction, rebuilds once, and records measured before and after',async()=>{
  let builds=0,decisions=0;
  const result=await runDesignAgent({input:{story:'和妈妈旅行'},settings:{},scene:{people:2,archCount:3,detail:'detailed'},mode:'agent'},{
    build:async({scene})=>{builds++;return {mesh:[0,0,0],report:{source:'parametric',minFeatureMm:scene.detail==='detailed'?1:2,checks:[{name:'min-feature',status:scene.detail==='detailed'?'warn':'pass',detail:'measured'}]}};},
    decide:async({report,round})=>{decisions++;return {action:round===0?'simplify':'accept',reason:`最小细节 ${report.minFeatureMm} mm`};}
  });
  assert.equal(builds,2);assert.equal(decisions,2);
  assert.equal(result.scene.detail,'simple');assert.equal(result.versions.length,2);
  assert.equal(result.versions[0].report.minFeatureMm,1);assert.equal(result.report.minFeatureMm,2);
  assert.ok(result.trace.some(event=>event.action==='simplify'));
});
test('hard failure cannot be accepted and repeated repair is bounded',async()=>{
  let builds=0;
  const result=await runDesignAgent({input:{},settings:{},scene:{people:2,archCount:3,detail:'simple'},mode:'agent'},{
    build:async()=>{builds++;return {mesh:[],report:{checks:[{name:'connected',status:'fail',detail:'2 pieces'}]}};},
    decide:async()=>({action:'accept',reason:'looks good'})
  });
  assert.equal(result.exportable,false);assert.equal(builds,1);
  const bounded=await runDesignAgent({input:{},settings:{},scene:{people:2,archCount:3,detail:'simple'},mode:'agent'},{
    build:async()=>({mesh:[],report:{checks:[{name:'min-feature',status:'warn',detail:'thin'}]}}),
    decide:async()=>({action:'strengthen',reason:'thin'})
  });
  assert.equal(bounded.versions.length,2);assert.equal(bounded.exportable,false);
});
test('local settings recheck does not invent a repair for unknown imported mesh thickness',async()=>{
  const result=await runDesignAgent({input:{},settings:{},glb:Buffer.from('fixture')},{build:async()=>({mesh:[1,2,3],report:{source:'glb',checks:[{name:'min-feature',status:'warn',detail:'global thickness not measured'}]}})});
  assert.equal(result.exportable,true);assert.equal(result.versions.length,1);
  assert.equal(result.versions[0].mesh,undefined,'the only GLB mesh is already at the top level');
  assert.equal(result.report.checks[0].status,'warn');
});
