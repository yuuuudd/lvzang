import {accountApi,imageData} from './account-client.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const drafts=new Map();
const draft=id=>{if(!drafts.has(id))drafts.set(id,{text:'',image:null,name:'',clientId:crypto.randomUUID()});return drafts.get(id);};
const stamp=at=>new Date(at).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});

function messagesHtml(order,role){
 return (order.messages||[]).map(m=>m.type==='event'
  ?`<div class="chat-event"><time>${stamp(m.at)}</time><p>${esc(m.text)}</p></div>`
  :`<article class="chat-message ${m.role===role?'outgoing':'incoming'}"><div class="chat-meta"><strong>${m.role===role?'我':esc(m.author|| (m.role==='operator'?'经营者':'用户'))}</strong><time>${stamp(m.at)}</time></div><div class="chat-bubble">${m.text?`<p>${esc(m.text)}</p>`:''}${m.file?`<a href="${m.file.url}" target="_blank" rel="noopener"><img src="${m.file.url}" alt="${esc(m.author)}发送的图片" loading="lazy"></a>`:''}</div></article>`).join('')||'<div class="chat-empty"><strong>从这条消息开始沟通</strong><p>发送需求、修改意见或图片，对方可在同一订单中查看。</p></div>';
}

export function conversationHtml(order,role='operator'){
 if(!order)return '<section class="conversation-panel"><header><h2>与用户沟通</h2></header><div class="chat-empty"><strong>这是一份本机订单</strong><p>用户从「我的订单」提交后，即可在这里双向沟通。本机代录请在线下联系客户。</p></div></section>';
 const d=draft(order.id);
 return `<section class="conversation-panel" data-conversation="${order.id}" data-role="${role}"><header><div><h2>${role==='operator'?'与用户沟通':'与经营者沟通'}</h2><p>${esc(role==='operator'?order.commission?.customer||'订单用户':'工作室')}<span>消息自动同步</span></p></div></header><div class="chat-messages" role="log" aria-label="订单沟通记录" aria-live="polite">${messagesHtml(order,role)}</div><form class="chat-composer"><label class="sr-only" for="chat-text">输入消息</label><textarea id="chat-text" name="chatText" maxlength="2000" rows="3" placeholder="输入消息，沟通需求或修改意见…">${esc(d.text)}</textarea><div class="chat-attachment" ${d.image?'':'hidden'}><span>${esc(d.name)}</span><button type="button" data-chat-remove aria-label="移除待发送图片">移除</button></div><p class="chat-error" role="status"></p><div class="chat-tools"><label class="chat-upload">添加图片<input type="file" name="chatImage" accept="image/png,image/jpeg,image/webp" class="sr-only"></label><span>Enter 发送</span><button class="chat-send" type="submit">发送</button></div></form></section>`;
}

export function refreshConversation(root,order){
 const panel=root.querySelector('[data-conversation]');if(!panel||panel.dataset.conversation!==order.id)return;
 const log=panel.querySelector('.chat-messages'),nearBottom=log.scrollHeight-log.scrollTop-log.clientHeight<60;
 const signature=(order.messages||[]).map(m=>m.id).join('|');
 if(log.dataset.signature!==signature){log.innerHTML=messagesHtml(order,panel.dataset.role);log.dataset.signature=signature;if(nearBottom)log.scrollTop=log.scrollHeight;}
}

export function mountConversation(root,onSent=()=>{}){
 const panel=root.querySelector('[data-conversation]');if(!panel)return;
 const id=panel.dataset.conversation,d=draft(id),form=panel.querySelector('form'),input=form.elements.chatText,error=form.querySelector('.chat-error'),log=panel.querySelector('.chat-messages');
 log.scrollTop=log.scrollHeight;
 const attachment=()=>{const el=form.querySelector('.chat-attachment');el.hidden=!d.image;el.querySelector('span').textContent=d.name;};
 input.addEventListener('input',()=>{d.text=input.value;d.clientId=crypto.randomUUID();});
 input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();form.requestSubmit();}});
 form.querySelector('[data-chat-remove]').addEventListener('click',()=>{d.image=null;d.name='';d.clientId=crypto.randomUUID();attachment();});
 form.elements.chatImage.addEventListener('change',async e=>{
  const file=e.target.files[0];if(!file)return;
  form.inert=true;error.textContent='正在处理图片…';
  try{if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>20*1024*1024)throw Error('请选择 20MB 以内的 JPG、PNG 或 WebP 图片');
   const image=await createImageBitmap(file);try{if(image.width*image.height>48000000)throw Error('图片像素过大，请缩小后重试');const canvas=document.createElement('canvas'),scale=Math.min(1,1400/Math.max(image.width,image.height));canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.85));if(!blob)throw Error('图片读取失败，请重试');d.image={image:await imageData(blob)};d.name=file.name;d.clientId=crypto.randomUUID();attachment();error.textContent='';}finally{image.close();}
  }catch(e){error.textContent=e.message;}finally{form.inert=false;form.elements.chatImage.value='';}
 });
 form.addEventListener('submit',async e=>{
  e.preventDefault();e.stopPropagation();if(form.dataset.sending)return;
  d.text=input.value;if(!d.text.trim()&&!d.image){error.textContent='请输入消息或添加图片';input.focus();return;}
  const requestId=d.clientId;let sent=false;form.dataset.sending='true';form.inert=true;error.textContent='正在发送…';
  try{const order=await accountApi('/api/orders/'+id+'/messages',{clientId:requestId,text:d.text,...(d.image?{image:d.image}:{})});sent=true;if(d.clientId===requestId){d.text='';d.image=null;d.name='';d.clientId=crypto.randomUUID();input.value='';attachment();}error.textContent='';refreshConversation(root,order);log.scrollTop=log.scrollHeight;await onSent(order);}
  catch(e){error.textContent=sent?'消息已发送，页面暂时未刷新，请重新打开订单。':e.message+'；内容已保留，可重试。';}
  finally{delete form.dataset.sending;form.inert=false;if(input.isConnected)input.focus();}
 });
}

export const conversationBusy=root=>Boolean(root.querySelector('.chat-composer[data-sending],.chat-composer[inert]'));
