const text=(value,max)=>typeof value==='string'&&Array.from(value).length<=max;
const cleanList=(value,max=8)=>Array.isArray(value)?[...new Set(value.filter(item=>text(item,80)&&item.trim()).map(item=>item.trim()))].slice(0,max):[];

function parse(content){
  try{return JSON.parse(content);}catch{throw Error('定制 Agent 返回格式无效');}
}

function normalize(value,body){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('定制 Agent 返回格式无效');
  const previous=body.draft?.requirements||{},current=body.current||{},raw={...previous,...value.requirements};
  const purpose=['generate','print','submit'].includes(raw.purpose)?raw.purpose:'generate';
  const productType=['magnet','figurine'].includes(raw.productType)?raw.productType:(current.productType||'figurine');
  const size=raw.sizeMm&&typeof raw.sizeMm==='object'?raw.sizeMm:{};
  const sizeMm={};for(const key of ['width','height','depth'])if(Number.isFinite(size[key])&&size[key]>=2&&size[key]<=500)sizeMm[key]=size[key];
  const requirements={purpose,productType,sizeMm,material:['pla','resin','other'].includes(raw.material)?raw.material:undefined,colorMode:['color','ivory','custom'].includes(raw.colorMode)?raw.colorMode:undefined,structure:cleanList(raw.structure),engraving:text(raw.engraving??'',20)?raw.engraving??'':'',quantity:Number.isInteger(raw.quantity)&&raw.quantity>=1&&raw.quantity<=20?raw.quantity:1,keep:cleanList(raw.keep),change:cleanList(raw.change)};
  const missingFields=[];
  if(!requirements.change.length)missingFields.push('change');
  if(purpose!=='generate'){
    if(!['width','height','depth'].every(key=>requirements.sizeMm[key]))missingFields.push('sizeMm');
    if(!requirements.material)missingFields.push('material');
    if(!requirements.colorMode)missingFields.push('colorMode');
    if(!requirements.structure.length)missingFields.push('structure');
  }
  return {intent:'revise_model',summary:text(value.summary,300)?value.summary:'',reply:text(value.reply,600)&&value.reply.trim()?value.reply:'请继续说明想修改的地方。',requirements,missingFields,readyForGeneration:missingFields.length===0,needsManufacturingReview:purpose!=='generate'};
}

export async function customizeAsset(body,{key='',model='deepseek-flash',fetchImpl=fetch}={}){
  if(!body||!text(body.message,1200)||!body.message.trim())throw Error('请输入修改内容');
  if(!Array.isArray(body.history)||body.history.length>12||body.history.some(item=>!item||!['user','assistant'].includes(item.role)||!text(item.content,1200)))throw Error('对话记录格式无效');
  if(!key.trim())throw Error('定制 Agent 尚未配置');
  const response=await fetchImpl('https://api.deepseek.com/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${key.trim()}`,'Content-Type':'application/json'},body:JSON.stringify({model,messages:[{role:'system',content:'你是专门为3D文旅纪念品定制而生的 Agent。理解用户修改要求，读取 current 与 draft，只追问缺失的关键项，不一次抛出长表单。区分仅生成新模型 generate、准备打印 print、提交定制 submit。实体制作必须确认宽高厚mm、材料 pla/resin/other、颜色 color/ivory/custom、结构、数量；仅生成模型不强迫确认生产参数。保留用户指定元素，明确无法自动保证的工艺。只输出 JSON：{intent:"revise_model",summary:string,reply:string,requirements:{purpose:"generate"|"print"|"submit",productType:"magnet"|"figurine",sizeMm?:{width:number,height:number,depth:number},material?:"pla"|"resin"|"other",colorMode?:"color"|"ivory"|"custom",structure?:string[],engraving?:string,quantity?:number,keep?:string[],change:string[]}}。不要声称修改已经完成。'},...body.history.map(item=>({role:item.role,content:item.content})),{role:'user',content:JSON.stringify({message:body.message,current:body.current||{},draft:body.draft||null})}],thinking:{type:'disabled'},response_format:{type:'json_object'},max_tokens:1400}),signal:AbortSignal.timeout(35_000)});
  if(!response.ok)throw Error(`定制 Agent 请求失败（HTTP ${response.status}）`);
  return normalize(parse((await response.json()).choices?.[0]?.message?.content),body);
}
