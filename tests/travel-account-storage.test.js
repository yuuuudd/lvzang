import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {accountInfo} from '../public/src/account-client.js';
import {initialState,readState,writeState,readTravelChat,writeTravelChat,travelStorageKeys,readRawTravelState} from '../public/src/travel-state.js';

const originalAccount={...accountInfo};
afterEach(()=>Object.assign(accountInfo,originalAccount));
function storage(entries=[]){const values=new Map(entries);return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};}
const record=title=>JSON.stringify({...initialState(),title,planningReset:true,upgradeMetadata:{preserved:true}});
const messages=text=>[{role:'user',content:text}];
const conversation=text=>JSON.stringify({version:1,messages:messages(text)});
function identity(user,enabled=true){accountInfo.enabled=enabled;accountInfo.user=user;}

test('non-account deployments keep the existing plan and chat storage contract',()=>{
  identity(null,false);const s=storage([['lvzang.v1',record('原始旅行')],['lvzang.chat.v1',conversation('原始对话')]]);
  assert.equal(readState(s).title,'原始旅行');assert.deepEqual(readTravelChat(s),messages('原始对话'));
  writeState(s,{...initialState(),title:'修订旅行'});writeTravelChat(s,messages('修订对话'));
  assert.equal(readRawTravelState(s),s.getItem('lvzang.v1'));
  assert.equal(readState(s).title,'修订旅行');assert.deepEqual(readTravelChat(s),messages('修订对话'));
  assert.equal(s.values.size,2);
});

test('a guest can restore legacy plan and chat without modifying their original bytes',()=>{
  identity(null);const state=record('交接旅行'),chat=conversation('博物馆必须去');
  const s=storage([['lvzang.v1',state],['lvzang.chat.v1',chat],['lvzang.v1:another-user',record('其他账号')]]);
  assert.equal(readRawTravelState(s),state);assert.equal(s.values.size,3,'backup does not trigger migration writes');
  const restored=readState(s);assert.equal(restored.title,'交接旅行');assert.equal(restored.planningReset,true);
  assert.deepEqual(restored.upgradeMetadata,{preserved:true});assert.deepEqual(readTravelChat(s),messages('博物馆必须去'));
  const keys=travelStorageKeys();assert.equal(s.getItem(keys.state),state);assert.equal(s.getItem(keys.chat),chat);
  writeState(s,{...restored,title:'游客修订'});writeTravelChat(s,messages('现在改成五天'));
  assert.equal(s.getItem('lvzang.v1'),state);assert.equal(s.getItem('lvzang.chat.v1'),chat);
});

test('the local workspace owner adopts the latest guest revision once and retains later account edits',()=>{
  identity(null);const legacy=record('旧方案'),s=storage([['lvzang.v1',legacy],['lvzang.chat.v1',conversation('旧对话')]]);
  const guest=readState(s);writeState(s,{...guest,title:'游客最新方案'});writeTravelChat(s,messages('游客最新条件'));
  const guestKeys=travelStorageKeys(),guestBytes=s.getItem(guestKeys.state),guestChat=s.getItem(guestKeys.chat);
  identity({id:'local-demo-user',workspaceOwner:true,activeRole:'user'});
  assert.equal(readState(s).title,'游客最新方案');assert.deepEqual(readTravelChat(s),messages('游客最新条件'));
  assert.equal(readRawTravelState(s),guestBytes);
  writeState(s,{...readState(s),title:'账号自己的修订'});writeTravelChat(s,messages('账号自己的条件'));
  identity(null);writeState(s,{...initialState(),title:'后来游客的方案'});writeTravelChat(s,messages('后来游客的条件'));
  identity({id:'local-demo-user',workspaceOwner:true,activeRole:'user'});
  assert.equal(readState(s).title,'账号自己的修订');assert.deepEqual(readTravelChat(s),messages('账号自己的条件'));
  assert.equal(s.getItem('lvzang.v1'),legacy);assert.ok(guestBytes&&guestChat);
});

test('an owner visiting before a guest still restores legacy data without overwriting an existing account',()=>{
  identity({id:'studio-owner',workspaceOwner:true,activeRole:'user'});
  const s=storage([['lvzang.v1',record('未迁移旅行')],['lvzang.chat.v1',conversation('未迁移条件')]]);
  assert.equal(readState(s).title,'未迁移旅行');assert.deepEqual(readTravelChat(s),messages('未迁移条件'));
  writeState(s,initialState());writeTravelChat(s,[]);
  assert.equal(readState(s).plan,null);assert.equal(readState(s).title,initialState().title);assert.deepEqual(readTravelChat(s),[]);
  assert.match(s.getItem('lvzang.v1'),/未迁移旅行/);
});

test('ordinary users and the separate operator never inherit guest, legacy, or another account data',()=>{
  const s=storage([['lvzang.v1',record('交接私人旅行')],['lvzang.chat.v1',conversation('交接私人对话')],['lvzang.v1:guest',record('游客方案')],['lvzang.chat.v1:guest',conversation('游客条件')]]);
  for(const user of [{id:'alice',activeRole:'user'},{id:'bob',activeRole:'user'},{id:'local-demo-operator',workspaceOwner:false,activeRole:'operator'}]){
    identity(user);assert.equal(readRawTravelState(s),'');assert.deepEqual(readState(s),initialState());assert.deepEqual(readTravelChat(s),[]);
    writeState(s,{...initialState(),title:user.id+'的方案'});writeTravelChat(s,messages(user.id+'的对话'));
  }
  for(const id of ['alice','bob','local-demo-operator']){
    identity({id});assert.equal(readState(s).title,id+'的方案');assert.deepEqual(readTravelChat(s),messages(id+'的对话'));
    assert.equal(JSON.parse(readRawTravelState(s)).title,id+'的方案');
  }
  identity({id:'bob'});writeState(s,initialState());writeTravelChat(s,[]);
  identity({id:'alice'});assert.equal(readState(s).title,'alice的方案');assert.deepEqual(readTravelChat(s),messages('alice的对话'));
  identity(null);assert.equal(readState(s).title,'游客方案');assert.deepEqual(readTravelChat(s),messages('游客条件'));
});

test('damaged scoped records remain recoverable and are not replaced with legacy data',()=>{
  identity({id:'owner',workspaceOwner:true});
  const s=storage([['lvzang.v1',record('有效旧方案')],['lvzang.chat.v1',conversation('有效旧对话')],['lvzang.v1:owner','{broken plan'],['lvzang.chat.v1:owner','{broken chat']]);
  assert.equal(readRawTravelState(s),'{broken plan');assert.throws(()=>readState(s),/记录/);assert.throws(()=>readTravelChat(s),/对话/);
  assert.equal(s.getItem('lvzang.v1:owner'),'{broken plan');assert.equal(s.getItem('lvzang.chat.v1:owner'),'{broken chat');
  identity(null);const bad=storage([['lvzang.v1','{legacy damaged']]);
  assert.throws(()=>readState(bad),/记录/);assert.equal(readRawTravelState(bad),'{legacy damaged');assert.equal(bad.getItem('lvzang.v1'),'{legacy damaged');
});

test('raw backup still reads the correct source when migration cannot write storage',()=>{
  identity(null);const raw=record('待恢复旅行'),s=storage([['lvzang.v1',raw]]);
  s.setItem=()=>{throw new Error('quota');};
  assert.throws(()=>readState(s),/迁移尚未保存/);assert.equal(readRawTravelState(s),raw);assert.equal(s.getItem('lvzang.v1'),raw);
  identity({id:'other-user'});assert.equal(readRawTravelState(s),'');
});
