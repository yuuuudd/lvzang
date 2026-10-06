import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.js';

test('public entry and local identity sessions preserve permissions and role-specific identities',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'public-home-'));
 const server=createApp({accountsEnabled:true,testRoles:true,accountDir:dir});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 const choose=async role=>fetch(base+'/api/auth/experience',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({role})});
 try{
  assert.equal((await fetch(base+'/',{redirect:'manual'})).status,200,'homepage must be public');
  assert.equal((await fetch(base+'/collection.html',{redirect:'manual'})).status,200,'visitor must be able to preview');
  assert.equal((await choose('admin')).status,400,'only user/operator accepted');
  const user=await choose('user'),u=(await user.json()).user;
  assert.equal(user.status,200);assert.equal(u.activeRole,'user');
  const cookie=user.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(base+'/api/orders',{headers:{Cookie:cookie}})).status,200);
  const operator=await choose('operator'),o=(await operator.json()).user;
  assert.equal(o.activeRole,'operator');assert.notEqual(o.id,u.id);
  assert.equal((await (await choose('user')).json()).user.id,u.id,'test user survives reselection');
  assert.equal((await fetch(base+'/api/orders')).status,401,'orders stay private');
 }finally{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
 const secure=createApp({accountsEnabled:true,accountDir:dir});
 await new Promise(r=>secure.listen(0,'127.0.0.1',r));
 try{const b='http://127.0.0.1:'+secure.address().port;assert.equal((await fetch(b+'/api/auth/experience',{method:'POST',headers:{Origin:b,'Content-Type':'application/json'},body:'{"role":"operator"}'})).status,404);}finally{await new Promise(r=>secure.close(r));await rm(dir,{recursive:true,force:true});}
});
