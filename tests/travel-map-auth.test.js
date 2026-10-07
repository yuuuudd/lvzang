import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {request} from 'node:http';
import {createApp} from '../server.js';

const publicKey='map-auth-public-fixture',securityCode='map-auth-private-fixture';
async function withAccounts(options,run){
  const accountDir=await mkdtemp(join(tmpdir(),'lvzang-map-auth-'));
  const server=createApp({key:'',tripoKey:'',accountsEnabled:true,testRoles:true,accountDir,amapJsKey:publicKey,amapSecurityJsCode:securityCode,fetchImpl:async()=>{throw Error('Unexpected provider request');},...options});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{await run(`http://127.0.0.1:${server.address().port}`);}finally{await new Promise(resolve=>server.close(resolve));await rm(accountDir,{recursive:true,force:true});}
}

test('anonymous map config and exact proxy routes work with accounts enabled without exposing the security code',async()=>{
  const calls=[];
  await withAccounts({fetchImpl:async url=>{calls.push(new URL(url));return Response.json({status:'1',pois:[],key:publicKey,jscode:securityCode,info:`echo ${securityCode}`});}},async root=>{
    const config=await fetch(root+'/api/map/config');
    assert.equal(config.status,200);
    assert.deepEqual(await config.json(),{provider:'amap',enabled:true,key:publicKey,serviceHost:'/_AMapService'});
    for(const path of ['/v3/log/init','/v3/place/text','/v3/direction/walking','/v3/direction/driving','/v4/map/styles']){
      const response=await fetch(root+'/_AMapService'+path+'?key=caller&jscode=caller-secret');
      assert.equal(response.status,200,path);
      const body=await response.text();
      assert.equal(body.includes(securityCode),false);assert.equal(body.includes(publicKey),false);
      assert.match(body,/\[redacted\]/);
    }
    assert.equal(calls.length,5);
    for(const url of calls){assert.equal(url.searchParams.get('key'),publicKey);assert.equal(url.searchParams.get('jscode'),securityCode);assert.equal(url.origin,url.pathname==='/v4/map/styles'?'https://webapi.amap.com':'https://restapi.amap.com');}
  });
});

test('public map handling retains its method, callback and exact path restrictions before account authentication',async()=>{
  let calls=0;
  await withAccounts({fetchImpl:async()=>{calls++;return Response.json({status:'1'});}},async root=>{
    for(const path of ['/_AMapService','/_AMapService/','/_AMapService/v3/place/text/extra','/_AMapService/v3/weather/weatherInfo','/_AMapService/https://evil.example','/_AMapService/v4/map/styles/extra'])assert.equal((await fetch(root+path)).status,404,path);
    for(const path of ['/api/map/config','/_AMapService/v3/place/text']){
      const response=await fetch(root+path,{method:'POST'});assert.equal(response.status,405,path);assert.equal(response.headers.get('allow'),'GET');
    }
    assert.equal((await fetch(root+'/_AMapService/v3/place/text?callback=alert%281%29')).status,400);
    assert.equal((await fetch(root+'/api/map/other')).status,401,'no general map API authentication exemption');
    assert.equal(calls,0);
  });
});

test('anonymous account access does not bypass an existing Vercel event entrance restriction',async()=>{
  let calls=0;
  await withAccounts({vercel:true,eventCode:'event-fixture',fetchImpl:async()=>{calls++;return Response.json({status:'1'});}},async root=>{
    const host={Host:'map-fixture.vercel.app'};
    const call=(path,headers)=>new Promise((resolve,reject)=>{const req=request(root+path,{headers},response=>{response.resume();response.on('end',()=>resolve(response.statusCode));});req.on('error',reject);req.end();});
    for(const path of ['/api/map/config','/_AMapService/v3/place/text'])assert.equal(await call(path,host),403,path);
    assert.equal(calls,0);
    const headers={...host,Cookie:'shiguang_event=event-fixture'};
    assert.equal(await call('/api/map/config',headers),200);
    assert.equal(await call('/_AMapService/v3/place/text',headers),200);
    assert.equal(calls,1);
  });
});

test('map browsing does not grant anonymous travel AI, orders, collection or operator access',async()=>{
  await withAccounts({},async root=>{
    await fetch(root+'/api/map/config');
    const anonymous=[['POST','/api/travel-plan'],['POST','/api/travel-plan/stream'],['POST','/api/travel-chat/stream'],['POST','/api/travel-import'],['GET','/api/orders'],['POST','/api/orders'],['POST','/api/collection-jobs'],['POST','/api/operator-summary'],['GET','/api/model/unowned']];
    for(const [method,path]of anonymous){
      const response=await fetch(root+path,{method,headers:{Origin:root,'Content-Type':'application/json','X-Lvzang-Internal':'not-the-server-token'},...(method==='POST'?{body:'{}'}:{})});
      assert.equal(response.status,401,path);assert.deepEqual(await response.json(),{error:'请先登录'});
    }
    const me=await fetch(root+'/api/auth/me');assert.equal(me.status,200);assert.equal((await me.json()).testRoles,true);
    assert.equal((await fetch(root+'/orders.html',{redirect:'manual'})).status,302);
    const entered=await fetch(root+'/api/auth/experience',{method:'POST',headers:{Origin:root,'Content-Type':'application/json'},body:JSON.stringify({role:'user'})});
    assert.equal(entered.status,200);const cookie=entered.headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(root+'/api/orders',{headers:{Cookie:cookie}})).status,200);
    assert.equal((await fetch(root+'/api/operator-summary',{method:'POST',headers:{Cookie:cookie,Origin:root,'Content-Type':'application/json'},body:'{}'})).status,403);
    assert.equal((await fetch(root+'/api/model/unowned',{headers:{Cookie:cookie}})).status,403,'existing resource ownership remains enforced');
  });
});

test('travel map CSP and account UI coexist while all new public surfaces and map modules remain served',async()=>{
  await withAccounts({},async root=>{
    const travel=await fetch(root+'/travel.html'),csp=travel.headers.get('content-security-policy'),html=await travel.text();
    assert.equal(travel.status,200);assert.match(csp,/script-src 'self' 'unsafe-eval' https:\/\/webapi\.amap\.com/);assert.match(csp,/style-src 'self' 'unsafe-inline'/);
    assert.match(html,/src="\/src\/account-ui\.js"/);assert.match(html,/href="\/accounts\.css"/);assert.equal(html.includes(securityCode),false);
    const home=await fetch(root+'/');assert.equal(home.status,200);assert.doesNotMatch(home.headers.get('content-security-policy'),/unsafe-eval|unsafe-inline|amap\.com/);
    for(const path of ['/home.html','/collection.html','/portal.html','/src/account-client.js','/src/order-client.js','/src/operator.js','/src/collection-generation.js','/src/travel-profile.js','/src/travel-schedule.js','/src/travel-map.js','/src/travel-map-query.js','/src/travel-map-exploration.js','/travel-map-explorer.css'])assert.equal((await fetch(root+path)).status,200,path);
    for(const path of ['/server.js','/.env','/amap-service.js'])assert.equal((await fetch(root+path)).status,404,path);
  });
});
