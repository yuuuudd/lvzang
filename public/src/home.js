import {templates,templateById} from './template-catalog.js';
import {accountInfo,accountApi} from './account-client.js';
import {mountAccountMenu,requestUserIdentity} from './account-ui.js';
import {openKeepsakeStore} from './travel-keepsake-store.js';
import {makeMiniature} from './travel-miniature.js';
import {createPreview} from './preview.js';
import {makeLocalCover,coverKey} from './travel-cover.js';
import {initCollectionGeneration} from './collection-generation.js';

const root=document.getElementById('public-root'),drafts=new Map();
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let coverDisplay='asset',current=null,mode='asset',preview=null,zoom=1,uploadToken=0,saving=false,photoBusy=false;
mountAccountMenu();
function toast(text){const el=document.getElementById('public-status');el.textContent=text;el.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.hidden=true,5000);}
function draft(){return drafts.get(current.id);}
function render(){
 preview?.destroy();preview=null;
 current=templateById(location.hash.split('/')[1]);
 if(!current){
  root.innerHTML=`<section class="home-hero"><div class="hero-inner"><div class="hero-copy"><h1>把你和风景，<br>收藏成 3D 纪念品</h1><p>把人物与地标组合，让旅行回忆变成专属作品。</p><div class="hero-actions"><a class="public-primary" href="#templates">免登录体验模板 <span aria-hidden="true">→</span></a><a href="/travel.html">先规划一次旅行 →</a></div><small>无需账号即可体验，上传照片即可创作，也可使用模板示例</small></div><figure class="hero-asset"><img src="/assets/people-garden.png" alt="两位旅人与江南园林组合的3D纪念品效果示意" width="1200" height="900"><figcaption>人物与地标组合 · 模板效果示意</figcaption></figure></div></section><section id="templates" class="template-section"><div class="template-heading"><h2>选择一个模板，开始体验</h2><div class="cover-toggle" role="group" aria-label="模板封面展示方式"><button data-cover="asset" aria-pressed="${coverDisplay==='asset'}">3D 资产</button><button data-cover="collage" aria-pressed="${coverDisplay==='collage'}">合集图</button></div></div><div class="template-grid">${templates.map(t=>`<article class="template-card"><a class="template-picture" href="#template/${t.id}" aria-label="体验${esc(t.title)}"><img src="${coverDisplay==='asset'?t.image:t.collage}" alt="${esc(t.title)}${coverDisplay==='asset'?'效果示意':'合集图示例'}" loading="lazy"></a><h3>${esc(t.title)}</h3><p>${t.people?'人物与地标组合模板':'3D 纪念品模板'}</p><a href="#template/${t.id}">立即体验 →</a></article>`).join('')}</div><div class="how-it-works"><div><strong>挑一个喜欢的模板</strong>园林、城市地标或旅行浮雕</div><div><strong>放入你的人物与故事</strong>让作品成为自己的旅行记忆</div><div><strong>收藏到我的回忆</strong>整理照片与故事，也可以申请定制</div></div></section>`;
  if(location.hash==='#templates')requestAnimationFrame(()=>document.getElementById('templates').scrollIntoView());return;
 }
 if(!drafts.has(current.id))drafts.set(current.id,{title:current.title,story:'',photos:[],urls:[]});
 const d=draft();mode='asset';
 root.innerHTML=`<section class="template-experience"><div class="experience-heading"><div><a class="experience-back" href="#templates">← 返回模板</a><h1>${esc(current.title)} · 模板体验</h1><span class="visitor-label">${accountInfo.user?'身份已选择':'游客模式'}</span></div><button class="public-secondary" data-save-template data-request-identity>保存草稿</button></div><div class="experience-layout"><section class="template-form"><h2>创作内容</h2><label for="template-title">作品名称</label><input id="template-title" type="text" maxlength="60" value="${esc(d.title)}"><label for="template-story">旅行故事</label><textarea id="template-story" maxlength="1000" placeholder="记录这次旅行的地点、同行的人与回忆">${esc(d.story)}</textarea><label for="template-photos">${current.people?'添加人物照片':'添加旅行照片'}（选填）</label><input id="template-photos" type="file" multiple accept="image/jpeg,image/png,image/webp"><div class="person-photos">${photoMarkup(d)}</div><button class="public-primary" data-apply-template>生成我的纪念品 →</button><p>上传照片生成你的作品；未上传时使用模板示例。点击后开始 AI 设计与 3D 生成，结果自动保存到我的回忆。</p><p class="template-inline-status" role="status" aria-live="polite"></p></section><section class="template-viewer" aria-label="模板作品预览"><div class="template-view-tabs" role="group" aria-label="模板预览方式"><button data-preview="asset" aria-pressed="true">效果示例</button><button data-preview="collage" aria-pressed="false">合集图</button><button data-preview="model" aria-pressed="false">旋转示例模型</button></div><div class="template-preview"></div><div class="viewer-bottom"><span id="preview-hint">模板效果示意</span><div class="viewer-tools" hidden><button data-zoom="out" aria-label="缩小模型">−</button><button data-zoom="in" aria-label="放大模型">＋</button><button data-reset-model>复位</button></div></div></section></div></section>`;
 drawPreview();
}
const photoMarkup=d=>d.urls.map((src,i)=>`<img src="${src}" alt="已添加的照片${i+1}">`).join('');
function drawPreview(){
 preview?.destroy();preview=null;zoom=1;
 const container=root.querySelector('.template-preview'),hint=root.querySelector('#preview-hint');if(!container)return;
 root.querySelectorAll('[data-preview]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.preview===mode)));
 root.querySelector('.viewer-tools').hidden=mode!=='model';
 if(mode==='asset'){container.innerHTML=`<img src="${current.image}" alt="${esc(current.title)}的模板效果示意">`;hint.textContent='模板效果示意 · 点击生成制作新作品';}
 else if(mode==='collage'){const d=draft();container.innerHTML=d.photos.length?`<div class="template-collage">${photoMarkup(d)}<p>${esc(d.story||current.description)}</p></div>`:`<img src="${current.collage}" alt="${esc(current.title)}合集示例">`;hint.textContent=d.photos.length?'你的照片与故事':'合集图示例 · 添加照片后可预览自己的合集';}
 else{container.innerHTML='<canvas tabindex="0" role="img" aria-label="示例3D模型，拖动或使用方向键旋转"></canvas>';preview=createPreview(container.querySelector('canvas'));if(preview){const m=makeMiniature(current.model);preview.setMesh(m.mesh,{...m,originalColors:m.colors});preview.setColor(true);preview.view(false);hint.textContent='拖动旋转 · 示例模型，人物定制需点击生成';}else{container.innerHTML='<p>当前设备无法旋转3D模型，请切换到效果示意。</p>';hint.textContent='静态效果与合集图仍可查看';}}
}
function syncDraft(){if(!current)return;const d=draft();d.title=root.querySelector('#template-title').value.trim()||current.title;d.story=root.querySelector('#template-story').value.trim();}
root.addEventListener('input',syncDraft);
root.addEventListener('change',async e=>{
 if(e.target.id!=='template-photos')return;
 const t=current,token=++uploadToken,d=draft(),status=root.querySelector('.template-inline-status');photoBusy=true;root.querySelector('[data-save-template]').disabled=true;root.querySelector('[data-apply-template]').disabled=true;
 try{const files=[...e.target.files];if(files.length>4)throw Error('最多选择4张照片');const photos=[];
  for(const file of files){if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024)throw Error('请选择10MB以内的JPEG、PNG或WebP照片');const bitmap=await createImageBitmap(file);try{if(bitmap.width*bitmap.height>24000000)throw Error('照片像素过大，请先缩小');const scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.88));if(!blob)throw Error('照片无法读取');photos.push({id:crypto.randomUUID(),blob});}finally{bitmap.close();}}
  if(token!==uploadToken||current?.id!==t.id)return;d.urls.forEach(URL.revokeObjectURL);d.photos=photos;d.urls=photos.map(p=>URL.createObjectURL(p.blob));root.querySelector('.person-photos').innerHTML=photoMarkup(d);status.textContent=photos.length?'照片已准备好，点击生成制作你的纪念品。':'';if(mode==='collage')drawPreview();
 }catch(error){status.textContent=error.message;}finally{if(token===uploadToken){photoBusy=false;if(current?.id===t.id){root.querySelector('[data-save-template]').disabled=false;root.querySelector('[data-apply-template]').disabled=false;}}}
});
async function generateTemplate(){
 if(saving||photoBusy||!current)return;
 syncDraft();const t=current,d={...draft()},button=root.querySelector('[data-apply-template]'),status=root.querySelector('.template-inline-status');
 saving=true;button.disabled=true;root.querySelector('[data-save-template]').disabled=true;button.textContent='正在准备生成…';
 let store,generation,host;
 try{
  const config=await accountApi('/api/config');
  if(!config.collectionGeneration)throw Error('生成服务尚未就绪，请检查服务端生成配置。照片和故事仍保留在当前草稿中。');
  if(accountInfo.enabled&&accountInfo.user?.activeRole!=='user'){
   if(accountInfo.testRoles){accountInfo.user=(await accountApi('/api/auth/experience',{role:'user'})).user;}
   else{const user=await requestUserIdentity();if(!user)return;if(user.activeRole!=='user')throw Error('请选择用户身份体验生成。');}
  }
  let photos=d.photos;
  if(!photos.length){
   const response=await fetch(t.image);if(!response.ok)throw Error('模板示例无法读取，请上传照片后重试。');
   const bitmap=await createImageBitmap(await response.blob());
   try{const scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.88));if(!blob)throw Error('模板示例无法读取');photos=[{id:crypto.randomUUID(),blob}];}finally{bitmap.close();}
  }
  store=await openKeepsakeStore();
  host=document.createElement('div');host.id='studio-progress';host.hidden=true;document.body.append(host);
  generation=await initCollectionGeneration(store,async()=>{});
  if(status.isConnected)status.textContent='正在提交制作任务，完成后可旋转查看和下载 3D 模型。';
  const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date());
  const result=await generation.start({name:d.title,place:t.city,date,story:[`模板方向：${t.title}。${t.description}`,d.photos.length?'请依据上传照片中的可见主体创作。':'使用模板示例体验生成，非个人照片定制。',d.story].filter(Boolean).join('\n').slice(0,1000),style:'clay',memoryMode:t.people?'personal':'city',photos,generateCover:false});
  await store.setMeta('world-show-mine',true);
  location.href='/collection.html#world/trip/'+encodeURIComponent(result.id);
 }catch(error){if(status.isConnected)status.textContent=error.message;else toast(error.message);}
 finally{generation?.destroy();host?.remove();store?.close();saving=false;if(button.isConnected){button.disabled=false;button.textContent='生成我的纪念品 →';root.querySelector('[data-save-template]').disabled=false;}}
}
async function save(){
 if(saving||photoBusy)return;syncDraft();saving=true;const t=current,d=draft(),button=root.querySelector('[data-save-template]');button.disabled=true;
 try{const user=await requestUserIdentity();if(!user)return;if(user.activeRole!=='user'){toast('保存到我的回忆，请选择用户身份。');return;}
  const store=await openKeepsakeStore();try{const id=crypto.randomUUID(),mid=crypto.randomUUID(),now=Date.now(),date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date());
   await store.save({keepsake:{id,schemaVersion:1,title:d.title,city:t.city,kind:'miniature',scope:'personal',participants:[{id:'me',name:'我'}],modelRef:t.model,templateId:t.id,memoryIds:[mid],dateStart:date,dateEnd:date,createdAt:now,updatedAt:now,origin:'template'},memories:[{id:mid,keepsakeId:id,authorId:'me',date,placeName:t.city,story:d.story,photoIds:d.photos.map(p=>p.id)}],photos:d.photos});
   const blob=d.photos.length?await makeLocalCover(d.photos,d.title):await (await fetch(t.collage)).blob();await store.setMeta(coverKey(id),{blob,kind:d.photos.length?'photo-collage':'sample'});await store.setMeta('world-show-mine',true);
  }finally{store.close();}location.href='/collection.html#world/canvas';
 }catch(error){toast('保存未完成：'+error.message);}finally{saving=false;if(button.isConnected)button.disabled=false;}
}
root.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
 if(b.dataset.cover){coverDisplay=b.dataset.cover;render();}
 if(b.dataset.preview){syncDraft();mode=b.dataset.preview;drawPreview();}
 if(b.hasAttribute('data-apply-template'))generateTemplate();
 if(b.hasAttribute('data-save-template'))save();
 if(b.dataset.zoom){zoom=Math.max(.6,Math.min(1.6,zoom+(b.dataset.zoom==='in'?.2:-.2)));preview?.setZoom(zoom);}
 if(b.hasAttribute('data-reset-model')){zoom=1;preview?.view(false);}
});
window.addEventListener('hashchange',()=>{syncDraft();render();});
window.addEventListener('pagehide',()=>{preview?.destroy();for(const d of drafts.values())d.urls.forEach(URL.revokeObjectURL);});
render();
