export const productLabels={magnet:'冰箱贴',figurine:'摆件'};
export const productRulesVersion=1;
export function validateProductType(value,{required=false}={}){
  if(value==null||value===''){if(required)throw Error('请先选择产品：冰箱贴或摆件');return null;}
  if(!Object.hasOwn(productLabels,value))throw Error('产品类型无效，请选择冰箱贴或摆件');
  return value;
}
export function validateBaseMode(value='none'){
  if(!['none','round'].includes(value))throw Error('摆件底座选项无效');return value;
}
export function productPrompt(type,widthMm=60,baseMode='none'){
  validateProductType(type,{required:true});validateBaseMode(baseMode);
  return type==='magnet'
    ?`产品固定为${widthMm}毫米宽立体冰箱贴，以正面为主略带侧视；主体紧凑厚实相连，背部预留平背加工空间，禁止独立薄背景墙和悬空细枝。磁铁孔由程序加工，不在参考图绘制。`
    :`产品固定为${widthMm}毫米宽摆件，三分之四视角，完整立体造型，背面和四周完整合理，保留主体厚度。${baseMode==='round'?'底部使用圆形底座，与主体可靠相连。':'保留主体自然接地，不另加底座；接地不足时需客户确认底座。'}不设置磁铁孔或冰箱贴背板，不把背部压成平面；薄小附件必须加粗或连接支撑。`;
}
