import {createAccountWorkspace} from '../account-workspace.js';
import {randomBytes} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
const accounts=await createAccountWorkspace(new URL('../output/accounts/',import.meta.url).pathname);
if(accounts.setupNeeded()){
  const password=randomBytes(18).toString('base64url');
  await accounts.register({username:'lvzang',password,name:'旅藏工作室'},{operator:true});
  await writeFile(new URL('../.first-login.txt',import.meta.url),`旅藏网址：https://lvzang.gzaibuilders.cn/portal.html\n账号：lvzang\n密码：${password}\n\n请仅通过私密渠道与队友共享此账号。\n`,{mode:0o600});
}
console.log('旅藏独立账号已就绪');
