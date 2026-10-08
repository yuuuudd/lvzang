import {accountInfo,accountApi} from './account-client.js';
let pendingIdentity=null;
function enterSpace(role){
 const target=role==='operator'?'/operator.html':'/collection.html#world/canvas';
 if(location.pathname===target.split('#')[0]){history.replaceState(null,'',target);location.reload();}else location.href=target;
}
export function mountAccountMenu(){
 const header=document.querySelector('.public-header,.collection-header,.site-header,.operator-header,body>header');
 if(!header||header.querySelector('.identity-menu'))return;
 const details=document.createElement('details');details.className='identity-menu';
 const summary=document.createElement('summary');summary.textContent=accountInfo.user?(accountInfo.user.activeRole==='operator'?'经营者':'我的回忆'):'选择身份';summary.setAttribute('aria-label','选择体验身份');
 const panel=document.createElement('div');panel.className='identity-panel';
 const heading=document.createElement('strong');heading.textContent='选择体验身份';
 const hint=document.createElement('p');hint.textContent=accountInfo.testRoles?'测试阶段，无需账号密码':'选择要进入的工作空间';panel.append(heading,hint);
 for(const [role,label,note] of [['user','用户','体验模板与个人作品'],['operator','经营者','管理模板与定制需求']]){
  const b=document.createElement('button');b.type='button';b.dataset.identityRole=role;
  const title=document.createElement('strong'),small=document.createElement('span');title.textContent=label;small.textContent=note;b.append(title,small);
  b.addEventListener('click',async()=>{panel.querySelectorAll('button').forEach(b=>b.disabled=true);try{
   if(!accountInfo.enabled){enterSpace(role);return;}
   if(!accountInfo.testRoles&&!accountInfo.user){location.href='/portal.html';return;}
   const result=await accountApi(accountInfo.testRoles?'/api/auth/experience':'/api/auth/switch',{role});accountInfo.user=result.user;
   const callback=pendingIdentity;pendingIdentity=null;details.open=false;
   if(callback){summary.textContent=role==='operator'?'经营者':'我的回忆';callback(result.user);}
   else enterSpace(role);
  }catch(e){hint.textContent=e.message;}finally{panel.querySelectorAll('button').forEach(b=>b.disabled=false);}});panel.append(b);
 }
 if(accountInfo.user){for(const [href,text] of (accountInfo.user.activeRole==='operator'?[['/operator.html','经营者工作台']]:[['/collection.html#world/canvas','我的回忆'],['/orders.html','我的定制订单']])){const a=document.createElement('a');a.href=href;a.textContent=text;panel.append(a);}const logout=document.createElement('button');logout.type='button';logout.className='identity-exit';logout.textContent='退出体验';logout.addEventListener('click',async()=>{try{await accountApi('/api/auth/logout',{});location.href='/';}catch(e){hint.textContent=e.message;}});panel.append(logout);}
 details.append(summary,panel);header.append(details);
 details.addEventListener('toggle',()=>{if(!details.open&&pendingIdentity){const cb=pendingIdentity;pendingIdentity=null;cb(null);}});
 document.addEventListener('click',e=>{if(details.open&&!details.contains(e.target)&&!e.target.closest('[data-request-identity]'))details.open=false;});
 details.addEventListener('keydown',e=>{if(e.key==='Escape'){details.open=false;summary.focus();}});
}
export async function requestUserIdentity(){
 if(!accountInfo.enabled)return {id:'local',activeRole:'user'};
 if(!accountInfo.testRoles&&!accountInfo.user){location.href='/portal.html';return null;}
 if(accountInfo.user?.activeRole==='user')return accountInfo.user;
 mountAccountMenu();const menu=document.querySelector('.identity-menu');menu.open=true;menu.querySelector('[data-identity-role=user]').focus();
 return new Promise(resolve=>{pendingIdentity=resolve;});
}
mountAccountMenu();
