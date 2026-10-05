import test from 'node:test';
import assert from 'node:assert/strict';
import { createDesign, validateInput, validateDesign, selectProposal, mergeTranscript, reviseOffline } from '../public/src/design.js';
import { buildMesh, binaryStl, imageHeights } from '../public/src/model.js';

test('offline replacement uses the requested target rather than the source motif',()=>{
  const original=createDesign({story:'看海'});
  assert.equal(reviseOffline(original,'把海浪换成爱心').motif,'heart');
  assert.equal(reviseOffline(original,'把爱心换成海浪').motif,'waves');
  assert.equal(reviseOffline(original,'把星星改成路径，主体放大一点').subjectScale,1.1);
  assert.throws(()=>reviseOffline(original,'让它有梵高的感觉'),/离线模式/);
  assert.equal(original.motif,'waves');
});

test('different travel stories affect composition, with romance taking priority over the word friend', () => {
  assert.equal(createDesign({ story: '和女朋友一起过纪念日' }).theme, 'love');
  assert.equal(createDesign({ story: '和妈妈第一次来赤坎' }).theme, 'family');
  const friends = createDesign({ story: '我们三个人毕业之后去不同城市' });
  assert.equal(friends.motif, 'paths');
  assert.equal(friends.subjectCount, 3);
  assert.equal(createDesign({ story: '   ' }).caption, '把今天带回家');
});

test('invalid date, oversized story, non-string inputs and model-injected geometry are rejected', () => {
  assert.throws(() => validateInput({ story: '旅行', date: '2026-02-30' }), /日期/);
  assert.throws(() => validateInput({ story: '字'.repeat(301) }), /300/);
  assert.throws(() => validateInput({ story: { a: 1 } }), /文字/);
  assert.throws(() => validateDesign({ ...createDesign({}), subjectScale: 300 }), /参数/);
  assert.throws(() => validateDesign({ ...createDesign({}), caption: '字'.repeat(9) }), /8/);
  assert.equal(validateInput({ story: '你好', date: '2024-02-29' }).date, '2024-02-29');
  assert.equal(validateInput({ story: '一个人在深圳啤酒小镇参加黑客松' }).place, '', 'a story must not silently inherit 赤坎');
});

test('photo subject defaults to auto while historical explicit choices remain valid',()=>{
  assert.equal(validateInput({}).photoType,'auto');
  assert.equal(validateInput({photoType:'auto'}).photoType,'auto');
  assert.equal(validateInput({photoType:'portrait'}).photoType,'portrait');
  assert.equal(validateInput({photoType:'landscape'}).photoType,'landscape');
  assert.throws(()=>validateInput({photoType:'unknown'}),/照片主体/);
  assert.equal(createDesign({story:'海边',hasPhoto:true,photoType:'auto'}).layout,'arch');
});

test('bottom lettering is optional and accepts only short printable user text',()=>{
  assert.equal(validateInput({}).labelText,'');
  assert.equal(validateInput({place:'嘉兴',labelText:'  嘉兴  '}).labelText,'嘉兴');
  assert.equal(validateInput({labelText:'2026'}).labelText,'2026');
  assert.throws(()=>validateInput({labelText:'生日快乐呀'}),/4/);
  assert.throws(()=>validateInput({labelText:'嘉兴!'}),/底部文字/);
});

test('speech final results append exactly once and preserve pre-existing typed text', () => {
  assert.equal(mergeTranscript('已有故事', ['我和妈妈', '来了赤坎']), '已有故事 我和妈妈来了赤坎');
  assert.equal(mergeTranscript('已有故事', ['']), '已有故事');
});

test('memory decisions survive validation while historical briefs stay compatible',()=>{
  const brief={summary:'海边合照',elements:['半身人物'],composition:'保留半身构图',imagePrompt:'半身人物与海浪相连'};
  const design={...createDesign({}),brief};
  assert.deepEqual(validateDesign(design).brief,brief);
  const decisions=[{topic:'framing',evidence:'照片仅见上半身',action:'保持半身，不补画腿脚',uncertainty:'下半身不可见'}];
  assert.deepEqual(validateDesign({...design,brief:{...brief,decisions}}).brief.decisions,decisions);
  assert.deepEqual(validateDesign({...design,brief:{...brief,label:'纯正标志底贴'}}).brief,brief,'an invalid optional label falls back without discarding the story');
  assert.equal(validateDesign({...design,brief:{...brief,label:'2026'}}).brief.label,'2026');
  assert.equal(validateDesign({...design,brief:{...brief,label:''}}).brief.label,'');
  for(const bad of [[],[...decisions,...decisions],[{...decisions[0],topic:'made-up'}],[{...decisions[0],action:''}],[{...decisions[0],evidence:'字'.repeat(101)}]]){
    assert.throws(()=>validateDesign({...design,brief:{...brief,decisions:bad}}),/决策|依据/);
  }
  assert.equal(validateInput({landmark:'  赤坎古镇骑楼  '}).landmark,'赤坎古镇骑楼');
  assert.throws(()=>validateInput({landmark:'字'.repeat(61)}),/60/);
});

test('two distinct director proposals survive validation and selection changes the image prompt',()=>{
  const brief={summary:'朋友在场地合作',elements:['朋友','电脑','场地入口'],composition:'旧构图',imagePrompt:'旧提示词',proposals:[
    {id:'people',title:'把朋友放在中心',focus:'同行的人',evidence:'合照里有朋友',tradeoff:'场地退到后景',composition:'朋友围着电脑，入口在后',imagePrompt:'朋友围着电脑，入口在后，机器人作陪衬'},
    {id:'place',title:'让场地成为舞台',focus:'活动场地',evidence:'预设提供入口',tradeoff:'人物缩小',composition:'入口占画面主体，朋友在前',imagePrompt:'入口占画面主体，朋友在前，机器人作陪衬'}
  ]};
  const design=validateDesign({...createDesign({}),brief});
  assert.equal(design.brief.proposals.length,2);
  assert.notEqual(design.brief.proposals[0].imagePrompt,design.brief.proposals[1].imagePrompt);
  const chosen=selectProposal(design,'place');
  assert.equal(chosen.brief.imagePrompt,'入口占画面主体，朋友在前，机器人作陪衬');
  assert.equal(chosen.brief.selectedProposalId,'place');
  assert.equal(design.brief.imagePrompt,'旧提示词');
  assert.throws(()=>selectProposal(design,'missing'),/方案/);
  assert.throws(()=>validateDesign({...design,brief:{...brief,proposals:[brief.proposals[0],brief.proposals[0]]}}),/方案/);
});

test('luminance and alpha both contribute to relief; opaque dark and white pixels differ', () => {
  const map = imageHeights({ width: 2, height: 2, data: new Uint8ClampedArray([
    0,0,0,255, 255,255,255,255, 0,0,0,0, 0,0,0,255
  ]) });
  assert.ok(map.heights[0] > map.heights[1]);
  assert.equal(map.heights[1], 2);
  assert.equal(map.heights[2], 2);
});

test('export is a closed outward-oriented solid of the specified physical size', () => {
  const mesh = buildMesh({ width: 3, height: 3, heights: [2,2,2,2,3.2,2,2,2,2] });
  const edges = new Map(); let volume = 0;
  const key = (v) => v.map(x => x.toFixed(5)).join(',');
  const points = [];
  for (let i = 0; i < mesh.length; i += 9) {
    const a = Array.from(mesh.slice(i,i+3)), b = Array.from(mesh.slice(i+3,i+6)), c = Array.from(mesh.slice(i+6,i+9));
    points.push(a,b,c);
    for (const [p,q] of [[a,b],[b,c],[c,a]]) {
      const pKey=key(p), qKey=key(q), e=[pKey,qKey].sort().join('|');
      const entry=edges.get(e) || { count:0, direction:0 };
      entry.count++; entry.direction += pKey < qKey ? 1 : -1; edges.set(e,entry);
    }
    volume += (a[0]*(b[1]*c[2]-b[2]*c[1]) + a[1]*(b[2]*c[0]-b[0]*c[2]) + a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
  }
  assert.ok([...edges.values()].every(e => e.count === 2 && e.direction === 0), 'every edge must have exactly two opposite faces');
  assert.ok(volume > 60*45*2 && volume < 60*45*3.2);
  assert.deepEqual([0,1,2].map(j => Math.min(...points.map(p=>p[j]))), [-30,-22.5,0]);
  assert.deepEqual([0,1].map(j => Math.max(...points.map(p=>p[j]))), [30,22.5]);
  const stl=binaryStl(mesh), view=new DataView(stl);
  assert.equal(view.getUint32(80,true), mesh.length/9);
  assert.equal(stl.byteLength, 84 + mesh.length/9*50);
  assert.deepEqual(new Uint8Array(stl), new Uint8Array(binaryStl(mesh)));
  const restored=JSON.parse(JSON.stringify(Array.from(mesh)));
  assert.deepEqual(new Uint8Array(stl),new Uint8Array(binaryStl(restored)),'API/history meshes must export the same geometry');
  assert.throws(()=>binaryStl([0,0,0,1,0,0,0,NaN,0]),/模型/);
});

test('invalid or nonfinite height maps cannot produce a corrupt mesh', () => {
  for (const map of [ {width:0,height:0,heights:[]}, {width:2,height:2,heights:[2,2,NaN,2]}, {width:2,height:2,heights:[2]} ]) {
    assert.throws(()=>buildMesh(map), /高度图/);
  }
});
