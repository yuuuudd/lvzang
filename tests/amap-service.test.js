import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../server.js';
import { createAmapService } from '../amap-service.js';

const credentials={amapJsKey:'public-amap-fixture-key',amapSecurityJsCode:'private-amap-fixture-code'};
async function withApp(options,run){
  const server=createApp({key:'',tripoKey:'',amapJsKey:'',amapSecurityJsCode:'',...options});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{await run(`http://127.0.0.1:${server.address().port}`);}finally{await new Promise(resolve=>server.close(resolve));}
}
async function withService(options,run){
  const service=createAmapService({key:credentials.amapJsKey,securityJsCode:credentials.amapSecurityJsCode,...options});
  const server=http.createServer(async(req,res)=>{
    if(!await service.handleRequest(req,res,new URL(req.url,'http://localhost'))){res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{await run(`http://127.0.0.1:${server.address().port}`);}finally{await new Promise(resolve=>server.close(resolve));}
}

test('map config requires both credentials and never exposes a partial key or private security code',async()=>{
  for(const options of [{},{amapJsKey:credentials.amapJsKey},{amapSecurityJsCode:credentials.amapSecurityJsCode},{amapJsKey:' ',amapSecurityJsCode:' '}]){
    await withApp({...options,fetchImpl:async()=>{throw new Error('no upstream expected');}},async root=>{
      const response=await fetch(root+'/api/map/config');
      assert.equal(response.status,200);
      const value=await response.json();
      assert.equal(value.provider,'amap');assert.equal(value.enabled,false);assert.match(value.reason,/Key.*安全密钥/);
      assert.equal(Object.hasOwn(value,'key'),false);assert.equal(Object.hasOwn(value,'securityJsCode'),false);
      assert.doesNotMatch(JSON.stringify(value),/fixture/);
      assert.equal((await fetch(root+'/_AMapService/v3/place/text')).status,503);
    });
  }
});

test('configured map config contains only the public JS key and fixed service host',async()=>{
  await withApp({...credentials,amapJsKey:' '+credentials.amapJsKey+' '},async root=>{
    const response=await fetch(root+'/api/map/config');
    assert.deepEqual(await response.json(),{provider:'amap',enabled:true,key:credentials.amapJsKey,serviceHost:'/_AMapService'});
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal((await fetch(root+'/api/map/config',{method:'POST'})).status,405);
  });
});

test('proxy preserves service query parameters but replaces all supplied credential spellings',async()=>{
  let sent;
  await withApp({...credentials,fetchImpl:async(url,options)=>{sent={url:new URL(url),options};return Response.json({status:'1',pois:[{id:'p1',name:'沙面'}]});}},async root=>{
    const response=await fetch(root+'/_AMapService/v3/place/text?keywords=%E6%B2%99%E9%9D%A2&city=440100&key=caller&key=second&KEY=upper&jscode=caller-secret&jsCode=other&securityJsCode=extra');
    assert.equal(response.status,200);assert.deepEqual(await response.json(),{status:'1',pois:[{id:'p1',name:'沙面'}]});
    assert.equal(sent.url.origin,'https://restapi.amap.com');assert.equal(sent.url.pathname,'/v3/place/text');
    assert.equal(sent.url.searchParams.get('keywords'),'沙面');assert.equal(sent.url.searchParams.get('city'),'440100');
    assert.deepEqual(sent.url.searchParams.getAll('key'),[credentials.amapJsKey]);assert.deepEqual(sent.url.searchParams.getAll('jscode'),[credentials.amapSecurityJsCode]);
    assert.equal(sent.url.searchParams.has('KEY'),false);assert.equal(sent.url.searchParams.has('jsCode'),false);assert.equal(sent.url.searchParams.has('securityJsCode'),false);
    assert.equal(sent.options.method,'GET');assert.equal(sent.options.redirect,'error');assert.ok(sent.options.signal instanceof AbortSignal);
    assert.equal(response.headers.get('content-type'),'application/json; charset=utf-8');
  });
});

test('allowed SDK search, details, geocoding and walking/driving paths use the REST host',async()=>{
  const paths=['v3/place/text','v3/place/around','v3/place/polygon','v3/place/detail','v5/place/text','v5/place/around','v5/place/polygon','v5/place/detail','v3/geocode/geo','v3/geocode/regeo','v3/direction/walking','v3/direction/driving','v4/direction/walking','v5/direction/walking','v5/direction/driving'];
  let calls=0;
  await withApp({...credentials,fetchImpl:async url=>{assert.equal(new URL(url).origin,'https://restapi.amap.com');calls++;return Response.json({status:'1'});}},async root=>{
    for(const path of paths)assert.equal((await fetch(root+'/_AMapService/'+path)).status,200,path);
  });
  assert.equal(calls,paths.length);
});

test('only the exact official styles path uses the web API host',async()=>{
  let sent;
  await withApp({...credentials,fetchImpl:async url=>{sent=new URL(url);return Response.json({style:[]});}},async root=>{
    assert.equal((await fetch(root+'/_AMapService/v4/map/styles?id=normal')).status,200);
    assert.equal(sent.origin,'https://webapi.amap.com');assert.equal(sent.pathname,'/v4/map/styles');
    assert.equal(sent.searchParams.get('jscode'),credentials.amapSecurityJsCode);
    assert.equal((await fetch(root+'/_AMapService/v4/map/styles/extra')).status,404);
  });
});

test('valid SDK JSONP and JavaScript MIME type survive proxying',async()=>{
  await withApp({...credentials,fetchImpl:async()=>new Response('/**/ AMap._jsonp_42({"status":"1","routes":[]});',{headers:{'Content-Type':'application/javascript;charset=UTF-8'}})},async root=>{
    const response=await fetch(root+'/_AMapService/v3/direction/walking?callback=AMap._jsonp_42');
    assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/javascript; charset=utf-8');
    assert.equal(await response.text(),'AMap._jsonp_42({"status":"1","routes":[]});');
    assert.equal(response.headers.get('x-content-type-options'),'nosniff');
  });
});

test('observed SDK initialization octet-stream JSONP uses the exact REST path and JavaScript MIME',async()=>{
  const callback='jsonp_201357_1791302713814_';let sent,calls=0;
  await withApp({...credentials,fetchImpl:async url=>{sent=new URL(url);calls++;return new Response(`${callback}({"status":"1","info":"OK","infocode":"10000","version":"4.0.1"})`,{headers:{'Content-Type':'application/octet-stream'}});}},async root=>{
    const response=await fetch(root+'/_AMapService/v3/log/init?eventId=resource.load&s=rsv3&product=JsInit&platform=JS&key=caller&jscode=caller-secret&callback='+callback);
    assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/javascript; charset=utf-8');
    assert.equal(await response.text(),`${callback}({"status":"1","info":"OK","infocode":"10000","version":"4.0.1"});`);
    assert.equal(sent.origin,'https://restapi.amap.com');assert.equal(sent.pathname,'/v3/log/init');
    assert.equal(sent.searchParams.get('eventId'),'resource.load');assert.equal(sent.searchParams.get('product'),'JsInit');assert.equal(sent.searchParams.get('platform'),'JS');assert.equal(sent.searchParams.get('s'),'rsv3');
    assert.equal(sent.searchParams.get('key'),credentials.amapJsKey);assert.equal(sent.searchParams.get('jscode'),credentials.amapSecurityJsCode);
    for(const path of ['/_AMapService/v3/log','/_AMapService/v3/log/init/extra','/_AMapService/v3/log/other'])assert.equal((await fetch(root+path)).status,404,path);
    assert.equal((await fetch(root+'/_AMapService/v3/log/init',{method:'POST'})).status,405);
  });
  assert.equal(calls,1);
});

test('observed POI JSONP labelled as JSON is normalized to executable JavaScript MIME',async()=>{
  const callback='jsonp_789309_1791303116850_';
  await withApp({...credentials,fetchImpl:async()=>new Response(`${callback}({"status":"1","info":"OK","infocode":"10000","pois":[]})`,{headers:{'Content-Type':'application/json'}})},async root=>{
    const response=await fetch(root+'/_AMapService/v3/place/text?callback='+callback);
    assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/javascript; charset=utf-8');assert.equal(response.headers.get('x-content-type-options'),'nosniff');
    assert.equal(await response.text(),`${callback}({"status":"1","info":"OK","infocode":"10000","pois":[]});`);
  });
});

test('a valid callback request safely wraps strict JSON without copying executable response text',async()=>{
  await withApp({...credentials,fetchImpl:async()=>Response.json({status:'0',info:'INVALID_USER_KEY',key:credentials.amapJsKey,jscode:credentials.amapSecurityJsCode})},async root=>{
    const response=await fetch(root+'/_AMapService/v3/place/text?callback=_amap_cb');
    assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/javascript; charset=utf-8');
    assert.equal(await response.text(),'_amap_cb({"status":"0","info":"INVALID_USER_KEY","key":"[redacted]","jscode":"[redacted]"});');
  });
});

test('octet-stream acceptance requires an exact valid provider callback and strict JSON payload',async()=>{
  for(const body of ['{"status":"1"}','otherCallback({"status":"1"})','_amap_cb({});alert(1);','_amap_cb({"unfinished":)','<html>error</html>']){
    await withApp({...credentials,fetchImpl:async()=>new Response(body,{headers:{'Content-Type':'application/octet-stream'}})},async root=>{
      const response=await fetch(root+'/_AMapService/v3/log/init?callback=_amap_cb');
      assert.equal(response.status,502,body);assert.equal(response.headers.get('content-type'),'application/json; charset=utf-8');assert.match((await response.json()).error,/响应格式/);
    });
  }
  await withApp({...credentials,fetchImpl:async()=>new Response('_amap_cb({"status":"1"})',{headers:{'Content-Type':'application/octet-stream'}})},async root=>{
    assert.equal((await fetch(root+'/_AMapService/v3/log/init')).status,502);
  });
});

test('proxy rejects unsupported paths, non-GET methods and unsafe JSONP before upstream access',async()=>{
  let calls=0;
  await withApp({...credentials,fetchImpl:async()=>{calls++;return Response.json({});}},async root=>{
    for(const path of ['/_AMapService','/_AMapService/','/_AMapService/v3/weather/weatherInfo','/_AMapService/https://evil.example/a','/_AMapService//evil.example/v3/place/text','/_AMapService/v3%2Fplace%2Ftext','/_AMapService/v3/place/text/extra'])assert.equal((await fetch(root+path)).status,404,path);
    for(const method of ['POST','PUT','DELETE','HEAD']){
      const response=await fetch(root+'/_AMapService/v3/place/text',{method});assert.equal(response.status,405);assert.equal(response.headers.get('allow'),'GET');
    }
    for(const callback of ['alert(1)','x;alert(1)','x["danger"]','',credentials.amapSecurityJsCode])assert.equal((await fetch(root+'/_AMapService/v3/place/text?callback='+encodeURIComponent(callback))).status,400,callback);
    assert.equal((await fetch(root+'/_AMapService/v3/place/text?keywords='+'a'.repeat(8100))).status,400);
  });
  assert.equal(calls,0);
});

test('JSON and JSONP bodies redact credentials in nested objects, names, and encoded upstream echoes',async()=>{
  const key=credentials.amapJsKey,secret='private/fixture+secret';
  const payload={status:'0',key,jscode:secret,securityJsCode:secret,nested:[{message:`key=${key}&jscode=${encodeURIComponent(secret)}`,raw:secret,[secret]:'echo'}]};
  for(const jsonp of [false,true]){
    await withApp({...credentials,amapSecurityJsCode:secret,fetchImpl:async()=>new Response(jsonp?`_amap_cb(${JSON.stringify(payload)});`:JSON.stringify(payload),{headers:{'Content-Type':jsonp?'text/javascript':'application/json'}})},async root=>{
      const response=await fetch(root+'/_AMapService/v3/place/text'+(jsonp?'?callback=_amap_cb':''));
      assert.equal(response.status,200);
      const body=await response.text();assert.equal(body.includes(secret),false);assert.equal(body.includes(encodeURIComponent(secret)),false);assert.equal(body.includes(key),false);assert.match(body,/\[redacted\]/);
      const value=JSON.parse(jsonp?body.slice('_amap_cb('.length,-2):body);assert.equal(value.key,'[redacted]');assert.equal(value.status,'0');
    });
  }
});

test('upstream HTTP failures and thrown errors never return credentials or upstream error bodies',async()=>{
  for(const fetchImpl of [async()=>new Response(JSON.stringify(credentials),{status:401}),async()=>{throw new Error(JSON.stringify(credentials));}]){
    await withApp({...credentials,fetchImpl},async root=>{
      const response=await fetch(root+'/_AMapService/v3/place/text');assert.equal(response.status,502);
      const body=await response.text();assert.equal(body.includes(credentials.amapJsKey),false);assert.equal(body.includes(credentials.amapSecurityJsCode),false);assert.match(body,/高德/);
    });
  }
});

test('invalid JSON, mismatched callbacks, executable JavaScript and HTML responses fail closed',async()=>{
  for(const [body,type] of [['{"unfinished":','application/json'],['otherCallback({"status":"1"});','text/javascript'],['_amap_cb({});alert(1);','text/javascript'],['<html>upstream error</html>','text/html']]){
    await withApp({...credentials,fetchImpl:async()=>new Response(body,{headers:{'Content-Type':type}})},async root=>{
      const response=await fetch(root+'/_AMapService/v3/place/text?callback=_amap_cb');assert.equal(response.status,502);
      assert.equal(response.headers.get('content-type'),'application/json; charset=utf-8');
      assert.match((await response.json()).error,/响应格式/);
    });
  }
});

test('response size is bounded by advertised and streamed bytes',async()=>{
  for(const fetchImpl of [
    async()=>new Response('{"status":"1"}',{headers:{'Content-Type':'application/json','Content-Length':'1000'}}),
    async()=>new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{"message":"'));controller.enqueue(new TextEncoder().encode('x'.repeat(40)+'"}'));controller.close();}}),{headers:{'Content-Type':'application/json'}})
  ]){
    await withService({fetchImpl,maxResponseBytes:24},async root=>{
      const response=await fetch(root+'/_AMapService/v3/place/text');assert.equal(response.status,502);assert.match((await response.json()).error,/响应过大/);
    });
  }
});

test('deadline bounds upstream waiting and aborts the fetch request',async()=>{
  let signal;
  await withService({timeoutMs:30,fetchImpl:async(_url,options)=>{signal=options.signal;return new Promise(()=>{});}},async root=>{
    const response=await fetch(root+'/_AMapService/v3/place/text');assert.equal(response.status,504);assert.match((await response.json()).error,/超时/);assert.equal(signal.aborted,true);
  });
});

test('deadline includes slow body consumption after upstream headers arrive',async()=>{
  let cancelled=false;
  await withService({timeoutMs:30,fetchImpl:async()=>new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{'));},cancel(){cancelled=true;}}),{headers:{'Content-Type':'application/json'}})},async root=>{
    const response=await fetch(root+'/_AMapService/v3/place/text');assert.equal(response.status,504);assert.match((await response.json()).error,/超时/);assert.equal(cancelled,true);
  });
});

test('live official SDK eval and resource permissions are confined to travel.html',async()=>{
  await withApp({},async root=>{
    const travel=await fetch(root+'/travel.html'),home=await fetch(root+'/index.html');
    const policy=travel.headers.get('content-security-policy');
    assert.match(policy,/script-src 'self' 'unsafe-eval' https:\/\/webapi\.amap\.com https:\/\/jsapi-service\.amap\.com;/);assert.match(policy,/worker-src 'self' blob:/);
    assert.match(policy,/connect-src 'self' https:\/\/\*\.amap\.com https:\/\/\*\.autonavi\.com/);assert.match(policy,/style-src 'self' 'unsafe-inline'/);
    assert.doesNotMatch(home.headers.get('content-security-policy'),/amap|autonavi|unsafe-inline|unsafe-eval/);
    assert.equal((await fetch(root+'/amap-service.js')).status,404);
  });
});
