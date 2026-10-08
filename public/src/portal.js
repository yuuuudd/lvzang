import {mountAccountMenu} from './account-ui.js';
import {accountInfo,accountApi} from './account-client.js';
mountAccountMenu();
if(accountInfo.testRoles)document.querySelector('.identity-menu').open=true;
else {
 const root=document.querySelector('main');
 root.innerHTML='<h1>登录旅藏</h1><p>同一账号在不同设备登录，可查看同一份照片、合集和作品。</p><form id="login"><label>账号<input name="username" autocomplete="username" minlength="3" maxlength="40" required pattern="[a-zA-Z0-9_@.\\-]+"></label><label>密码<input name="password" type="password" autocomplete="current-password" minlength="8" maxlength="128" required></label><label>进入空间<select name="role"><option value="user">我的作品</option><option value="operator">经营者工作台</option></select></label><button type="submit" class="primary">登录</button> <button type="submit" name="register" class="secondary">创建账号</button><p role="status" id="login-status"></p></form><p>已有账号可直接登录。新账号默认只有个人创作权限。</p>';
 if(accountInfo.registrationOpen===false){root.querySelector('[name=register]').remove();root.lastElementChild.textContent='使用你的旅藏账号登录，队友使用同一账号可查看共享作品。';}
 root.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();const form=e.target,status=root.querySelector('#login-status'),register=e.submitter?.name==='register';form.querySelectorAll('button').forEach(b=>b.disabled=true);status.textContent=register?'正在创建账号…':'正在登录…';try{const body={username:form.elements.username.value.trim(),password:form.elements.password.value,...(!register?{role:form.elements.role.value}:{})};await accountApi(register?'/api/auth/register':'/api/auth/login',body);location.href=!register&&body.role==='operator'?'/operator.html':'/collection.html#world/canvas';}catch(error){status.textContent=error.message;}finally{form.querySelectorAll('button').forEach(b=>b.disabled=false);}});
}
