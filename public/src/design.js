export const THEMES = { travel: '旅途留念', family: '亲情同行', friends: '好友同行', love: '心动同行' };
const motifs = ['paths','heart','star','waves'];
const layouts = ['arch','portrait','landscape'];

function text(value, limit, name, fallback = '') {
  if (value == null) return fallback;
  if (typeof value !== 'string') throw new Error(`${name}必须是文字`);
  const clean = value.trim();
  if (Array.from(clean).length > limit) throw new Error(`${name}最多 ${limit} 个字符`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(clean)) throw new Error(`${name}含有无效字符`);
  return clean;
}

export function validateInput(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('请输入有效的创作内容');
  const story = text(input.story, 300, '故事');
  const instruction = text(input.instruction, 200, '修改意见');
  const place = text(input.place, 12, '地点');
  const labelText = text(input.labelText, 4, '底部文字');
  if (!/^[\p{L}\p{N}]*$/u.test(labelText)) throw new Error('底部文字只能填写汉字、字母或数字');
  const landmark = text(input.landmark, 60, '地标');
  const date = text(input.date, 10, '日期');
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date)) throw new Error('请输入有效日期');
  const photoType = input.photoType ?? 'auto';
  if (!['auto','portrait','landscape'].includes(photoType)) throw new Error('请选择照片主体');
  return { story, instruction, place, labelText, date, photoType, ...(landmark?{landmark}:{}) };
}

export function validateCaption(caption) {
  try { return text(caption, 8, '纪念短句') ? '' : '请输入纪念短句'; }
  catch (error) { return error.message; }
}

export function createDesign(input = {}) {
  const { story, place } = validateInput(input);
  let theme = 'travel', caption = '把今天带回家', motif = 'star';
  if (/女朋友|男朋友|恋人|对象|爱人|情侣|纪念日|爱你/.test(story)) { theme='love'; caption='与你走过四季'; motif='heart'; }
  else if (/妈妈|母亲|爸爸|父亲|家人|父母|孩子|女儿|儿子/.test(story)) { theme='family'; caption='陪家人看世界'; motif='heart'; }
  else if (/朋友|同学|毕业|闺蜜|兄弟|我们三|我们两/.test(story)) { theme='friends'; caption='各赴远方仍同行'; motif='paths'; }
  else if (/海|水|河|江|湖/.test(story)) motif='waves';
  const count = story.match(/([一二两三四1234])个?人/);
  const numbers = { 一:1,二:2,两:2,三:3,四:4 };
  const subjectCount=count ? (numbers[count[1]] || Number(count[1])) : theme==='travel' ? 1 : 2;
  return { theme, caption, motif, layout: input.hasPhoto && ['portrait','landscape'].includes(input.photoType) ? input.photoType : 'arch', subjectCount, subjectScale:1, photoStyle:'blocks', threshold:0.52,
    reason: `${THEMES[theme]}：${place?`以${place}为背景，`:'根据故事与照片，'}保留这次同行的记忆。` };
}

export function validateDesign(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('生成结果不是有效设计');
  const caption=text(value.caption,8,'纪念短句');
  if (!caption) throw new Error('生成结果缺少纪念短句');
  const reason=text(value.reason,160,'设计说明');
  if (!Object.hasOwn(THEMES,value.theme) || !motifs.includes(value.motif) || !layouts.includes(value.layout) || !['blocks','contour'].includes(value.photoStyle)) throw new Error('生成结果含有不支持的设计参数');
  if (!Number.isInteger(value.subjectCount) || value.subjectCount<1 || value.subjectCount>4 || !Number.isFinite(value.subjectScale) || value.subjectScale<0.7 || value.subjectScale>1.3 || !Number.isFinite(value.threshold) || value.threshold<0.15 || value.threshold>0.85) throw new Error('生成结果的尺寸参数超出范围');
  return { theme:value.theme, caption, motif:value.motif, layout:value.layout, subjectCount:value.subjectCount, subjectScale:value.subjectScale, photoStyle:value.photoStyle, threshold:value.threshold, reason, ...(value.brief==null?{}:{brief:validateBrief(value.brief)}) };
}

export function validateBrief(value) {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('缺少故事扩写构思');
  const limits={summary:180,composition:240,imagePrompt:600},names={summary:'故事理解',composition:'画面构图',imagePrompt:'生图提示词'},brief={};
  for(const [key,limit] of Object.entries(limits)){
    brief[key]=text(value[key],limit,'故事扩写');
    if(!brief[key])throw new Error(`缺少${names[key]}`);
  }
  if(!Array.isArray(value.elements)||!value.elements.length||value.elements.length>8)throw new Error('关键要素应为 1 到 8 项');
  brief.elements=value.elements.map(item=>{const element=text(item,80,'关键要素');if(!element)throw new Error('关键要素不能为空');return element;});
  if(value.keyElements!=null){
    if(!Array.isArray(value.keyElements)||!value.keyElements.length||value.keyElements.length>11)throw new Error('关键要素来源无效');
    brief.keyElements=value.keyElements.map(item=>{
      const element={text:text(item?.text,80,'关键要素'),source:item?.source};
      if(!element.text||!['观众故事／照片','活动预设'].includes(element.source))throw new Error('关键要素来源无效');
      return element;
    });
  }
  if(value.label!=null){
    const label=typeof value.label==='string'?value.label.trim():'';
    if(/^[\p{L}\p{N}]{0,4}$/u.test(label))brief.label=label;
  }
  if(value.decisions!=null){
    if(!Array.isArray(value.decisions)||!value.decisions.length||value.decisions.length>4)throw new Error('记忆决策应为 1 到 4 项');
    const seen=new Set();
    brief.decisions=value.decisions.map(item=>{
      if(!item||!['framing','place','lettering','occlusion'].includes(item.topic)||seen.has(item.topic))throw new Error('记忆决策主题无效或重复');
      seen.add(item.topic);
      const decision={topic:item.topic,evidence:text(item.evidence,100,'决策依据'),action:text(item.action,140,'决策处理'),uncertainty:text(item.uncertainty,100,'决策不确定性')};
      if(!decision.evidence||!decision.action||!decision.uncertainty)throw new Error('记忆决策不完整');
      return decision;
    });
  }
  if(value.proposals!=null){
    if(!Array.isArray(value.proposals)||value.proposals.length!==2)throw new Error('需要两种构图方案');
    brief.proposals=value.proposals.map(item=>({
      id:text(item?.id,24,'方案编号'),title:text(item?.title,30,'方案标题'),focus:text(item?.focus,40,'方案重点'),
      evidence:text(item?.evidence,100,'方案依据'),tradeoff:text(item?.tradeoff,100,'方案取舍'),
      composition:text(item?.composition,240,'方案构图'),imagePrompt:text(item?.imagePrompt,600,'方案提示词')
    }));
    if(brief.proposals.some(item=>Object.values(item).some(value=>!value))||brief.proposals[0].id===brief.proposals[1].id||brief.proposals[0].imagePrompt===brief.proposals[1].imagePrompt)throw new Error('两种构图方案必须完整且不同');
  }
  if(value.selectedProposalId!=null){
    const chosen=brief.proposals?.find(item=>item.id===value.selectedProposalId);
    if(!chosen||brief.composition!==chosen.composition||brief.imagePrompt!==chosen.imagePrompt)throw new Error('所选构图方案与生图提示词不一致');
    brief.selectedProposalId=chosen.id;
  }
  return brief;
}

export function selectProposal(design,id){
  const valid=validateDesign(design),chosen=valid.brief?.proposals?.find(item=>item.id===id);
  if(!chosen)throw new Error('请选择有效的构图方案');
  return {...valid,brief:{...valid.brief,composition:chosen.composition,imagePrompt:chosen.imagePrompt,selectedProposalId:id}};
}

export function mergeTranscript(before, finalSegments) {
  const added=finalSegments.join('').trim();
  return [before.trim(),added].filter(Boolean).join(' ');
}

export function reviseOffline(design,instruction) {
  const next={...design};let changed=false;
  // ponytail: explicit offline vocabulary, not a substitute for natural-language AI.
  const target=instruction.split(/换成|改成|改为|换为/).at(-1);
  const match=target.match(/爱心|海浪|星星|路径/);
  if(match){next.motif={爱心:'heart',海浪:'waves',星星:'star',路径:'paths'}[match[0]];changed=true;}
  if(/放大|大一点/.test(instruction)){next.subjectScale=Math.min(1.3,next.subjectScale+.1);changed=true;}
  if(/缩小|小一点/.test(instruction)){next.subjectScale=Math.max(.7,next.subjectScale-.1);changed=true;}
  if(!changed)throw new Error('离线模式仅支持爱心、海浪、星星、路径及主体放大/缩小；其他修改请切换 DeepSeek。');
  next.reason='离线规则已调整装饰或主体尺寸。';return next;
}
