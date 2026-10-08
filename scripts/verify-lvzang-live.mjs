import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {encodeLibrary} from '../public/src/library-wire.js';
const base='https://lvzang.gzaibuilders.cn',credentials=await readFile('artifacts/lvzang-login.txt','utf8');
const username=credentials.match(/账号：([^\r\n]+)/)?.[1],password=credentials.match(/密码：([^\r\n]+)/)?.[1];
assert.ok(username&&password,'Credential file must exist');
const post=async(path,body,cookie='')=>{const r=await fetch(base+path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
const sessions=[],id='verification-'+randomUUID();let saved=false;
try{
 for(let i=0;i<2;i++){const result=await post('/api/auth/login',{username,password,role:'user'});assert.equal(result.status,200);assert.ok(result.cookie);sessions.push(result.cookie);}
 assert.ok(sessions[0]!==sessions[1],'Independent sessions required');
 const bundle={keepsake:{id,schemaVersion:1,title:'旅藏连接验证（自动清理）',city:'测试',kind:'miniature',scope:'personal',participants:[{id:'me',name:'我'}],modelRef:'pending',memoryIds:[id+'-memory'],createdAt:Date.now(),updatedAt:Date.now()},memories:[{id:id+'-memory',keepsakeId:id,authorId:'me',date:'',placeName:'测试',story:'服务器跨会话持久存储验证',photoIds:[id+'-photo']}],photos:[{id:id+'-photo',blob:new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE1kAAAAASUVORK5CYII=','base64')],{type:'image/png'})}]};
 const result=await post('/api/library',{method:'save',args:await encodeLibrary([bundle])},sessions[0]);assert.equal(result.status,200);saved=true;
 const other=await post('/api/library',{method:'get',args:[id]},sessions[1]);assert.equal(other.status,200);assert.equal(other.data.value.keepsake.id,id);
 const photo=await post('/api/library',{method:'getPhoto',args:[id+'-photo']},sessions[1]);assert.equal(photo.status,200);assert.equal(photo.data.value.$libraryBlob,true);
 assert.equal((await post('/api/library',{method:'get',args:[id]})).status,401);
 console.log('PASS: HTTPS, two independent shared-account sessions, saved work/photo visibility, unauthenticated denial. No generation request made.');
}finally{
 if(saved){const result=await post('/api/library',{method:'deleteKeepsake',args:[id]},sessions[0]);assert.equal(result.status,200);const remaining=await post('/api/library',{method:'get',args:[id]},sessions[0]);assert.equal(remaining.data.value,null);console.log('Temporary verification work removed.');}
 for(const cookie of sessions)await post('/api/auth/logout',{},cookie);
}
