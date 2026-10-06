import { validateInput } from './public/src/design.js';

// One measured correction per run; no automatic paid regeneration.
export async function runDesignAgent(body,{build,decide,plan}={}){
  const input=validateInput(body.input),settings=body.settings||{},trace=[],versions=[];
  let scene=body.scene||(body.glb?{}:undefined);
  if(!scene){
    const planned=plan?await plan({input,settings,design:body.design}):{scene:{people:2,archCount:3,detail:'simple'},reason:'本地固定拱廊结构示例，未经 AI 规划。'};
    scene=planned.scene;trace.push({action:'plan',reason:planned.reason});
  }
  let result,decision;
  for(let round=0;round<2;round++){
    result=await build({glb:body.glb,settings,scene,productType:input.productType,baseMode:input.baseMode,mounts:input.productType?input.productType==='magnet':body.mounts??true});
    versions.push(body.glb?{report:result.report,label:round?'修正后':'初始模型'}:{...result,scene:{...scene},label:round?'修正后':'初始模型'});
    trace.push({action:'inspect',reason:`第 ${round+1} 次检查`,checks:result.report.checks});
    decision=decide?await decide({input,design:body.design,settings,scene,report:result.report,round}):{
      action:result.report.checks.some(c=>c.status==='fail')?'stop':result.report.source==='parametric'&&result.report.checks.some(c=>c.name==='min-feature'&&c.status==='warn')?'simplify':'accept',
      reason:'本地规则依据几何检查选择动作；未调用 AI。'
    };
    if(!['accept','simplify','strengthen','stop'].includes(decision.action))throw new Error('设计助手返回了不支持的动作');
    if(decision.action==='accept'&&result.report.checks.some(c=>c.status==='fail'))decision={action:'stop',reason:'几何检查存在失败项，不能标记为通过。'};
    if(['simplify','strengthen'].includes(decision.action)&&(round===1||body.glb))decision={action:'stop',reason:body.glb?'自由三维模型不支持可靠的局部自动修复，请调整设计后重新生成。':'已达到一次自动修正上限，需人工检查后继续。'};
    trace.push(decision);
    if(['accept','stop'].includes(decision.action))break;
    scene={...scene,...(decision.action==='simplify'?{detail:'simple'}:{strengthened:true})};
  }
  return {...result,settings,scene,trace,versions,exportable:decision.action==='accept',agentMode:decide?'ai':'rules'};
}
