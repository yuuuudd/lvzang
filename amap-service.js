const servicePrefix='/_AMapService';
const allowedPaths=new Set([
  '/v3/place/text','/v3/place/around','/v3/place/polygon','/v3/place/detail',
  '/v5/place/text','/v5/place/around','/v5/place/polygon','/v5/place/detail',
  '/v3/geocode/geo','/v3/geocode/regeo',
  '/v3/config/district',
  '/v3/direction/walking','/v3/direction/driving',
  '/v4/direction/walking','/v5/direction/walking','/v5/direction/driving',
  '/v4/map/styles','/v3/log/init'
]);
const callbackPattern=/^[$A-Z_a-z][$\w]*(?:\.[$A-Z_a-z][$\w]*)*$/;
const responseTypes=new Set(['application/json','text/json','text/javascript','application/javascript','application/x-javascript','text/plain']);

class MapServiceError extends Error {
  constructor(status,message){super(message);this.status=status;}
}

async function readBoundedResponse(response,limit,signal){
  const length=Number(response.headers.get('content-length'));
  if(Number.isFinite(length)&&length>limit){response.body?.cancel().catch(()=>{});throw new MapServiceError(502,'高德服务响应过大，请缩小查询后重试。');}
  if(!response.body)return '';
  const reader=response.body.getReader(),chunks=[];let size=0;
  const cancel=()=>{reader.cancel().catch(()=>{});};
  signal.addEventListener('abort',cancel,{once:true});
  if(signal.aborted)cancel();
  try{
    while(true){
      const {done,value}=await reader.read();if(done)break;
      size+=value.byteLength;
      if(size>limit){reader.cancel().catch(()=>{});throw new MapServiceError(502,'高德服务响应过大，请缩小查询后重试。');}
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks,size).toString('utf8');
  }finally{signal.removeEventListener('abort',cancel);reader.releaseLock();}
}

function secretVariants(secrets){
  return [...new Set(secrets.filter(Boolean).flatMap(secret=>[
    secret,encodeURIComponent(secret),new URLSearchParams({value:secret}).toString().slice(6),
    [...secret].map(character=>'\\u'+character.charCodeAt(0).toString(16).padStart(4,'0')).join('')
  ]))].sort((a,b)=>b.length-a.length);
}

function sanitizeValue(value,variants){
  const redact=text=>variants.reduce((result,secret)=>result.split(secret).join('[redacted]'),text);
  if(typeof value==='string')return redact(value);
  if(Array.isArray(value))return value.map(item=>sanitizeValue(item,variants));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([name,item])=>[
    redact(name),/^(?:key|jscode|securityjscode)$/i.test(name)?'[redacted]':sanitizeValue(item,variants)
  ]));
  return value;
}

function sanitizeResponse(text,callback,variants){
  const source=text.trim().replace(/^\/\*\*\/\s*/,'');
  let payload=source,wrapper='';
  if(!source.startsWith('{')&&!source.startsWith('[')){
    const match=source.match(/^([$A-Z_a-z][$\w]*(?:\.[$A-Z_a-z][$\w]*)*)\s*\(([\s\S]*)\)\s*;?$/);
    if(!match||callback&&match[1]!==callback||variants.some(secret=>match[1].includes(secret)))throw new MapServiceError(502,'高德服务响应格式无效，请重试。');
    wrapper=match[1];payload=match[2];
  }
  let value;try{value=JSON.parse(payload);}catch{throw new MapServiceError(502,'高德服务响应格式无效，请重试。');}
  const body=JSON.stringify(sanitizeValue(value,variants)),outputCallback=wrapper||callback;
  return {body:outputCallback?`${outputCallback}(${body});`:body,jsonp:Boolean(outputCallback),providerJsonp:Boolean(wrapper)};
}

// AMap requires this fixed prefix. Credentials stay on the server; redirects and
// arbitrary upstream paths are never followed, including caller-supplied URLs.
export function createAmapService({key='',securityJsCode='',fetchImpl=fetch,timeoutMs=15_000,maxResponseBytes=2_000_000}={}){
  key=typeof key==='string'?key.trim():'';
  securityJsCode=typeof securityJsCode==='string'?securityJsCode.trim():'';
  const enabled=Boolean(key&&securityJsCode),variants=secretVariants([key,securityJsCode]);
  const getConfig=()=>enabled?{provider:'amap',enabled:true,key,serviceHost:servicePrefix}:{provider:'amap',enabled:false,reason:'高德地图尚未配置，请填写 JS API Key 和安全密钥后重启服务。'};
  const handleRequest=async(req,res,url)=>{
    const configRequest=url.pathname==='/api/map/config';
    if(!configRequest&&url.pathname!==servicePrefix&&!url.pathname.startsWith(servicePrefix+'/'))return false;
    const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
    if(req.method!=='GET'){res.setHeader('Allow','GET');json(405,{error:'地图接口只支持 GET 请求。'});return true;}
    if(configRequest){json(200,getConfig());return true;}
    const path=url.pathname.slice(servicePrefix.length);
    if(!allowedPaths.has(path)){json(404,{error:'不支持此地图服务路径。'});return true;}
    if(!enabled){json(503,{error:getConfig().reason});return true;}
    const callback=url.searchParams.get('callback');
    if(url.search.length>8000||callback!==null&&(!callbackPattern.test(callback)||callback.length>128||variants.some(secret=>callback.includes(secret)))){
      json(400,{error:'地图查询参数无效。'});return true;
    }
    const upstream=new URL(path,path==='/v4/map/styles'?'https://webapi.amap.com':'https://restapi.amap.com');
    upstream.search=url.search;
    for(const name of [...upstream.searchParams.keys()])if(/^(?:key|jscode|securityjscode)$/i.test(name))upstream.searchParams.delete(name);
    upstream.searchParams.set('key',key);upstream.searchParams.set('jscode',securityJsCode);
    const controller=new AbortController(),cancel=()=>controller.abort();res.once('close',cancel);
    let timer;
    try{
      const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new MapServiceError(504,'高德服务请求超时，请重试。'));},timeoutMs);});
      const request=async()=>{
        const response=await fetchImpl(upstream.href,{method:'GET',redirect:'error',headers:{Accept:'application/json, text/javascript'},signal:controller.signal});
        if(!response.ok){response.body?.cancel().catch(()=>{});throw new MapServiceError(502,'高德服务暂时不可用，请稍后重试。');}
        const contentType=(response.headers.get('content-type')||'application/json').split(';')[0].trim().toLowerCase();
        const opaqueJsonp=contentType==='application/octet-stream'&&callback!==null;
        if(!responseTypes.has(contentType)&&!opaqueJsonp){response.body?.cancel().catch(()=>{});throw new MapServiceError(502,'高德服务响应格式无效，请重试。');}
        const parsed=sanitizeResponse(await readBoundedResponse(response,maxResponseBytes,controller.signal),callback,variants);
        // The observed SDK log response is octet-stream, while POI JSONP may be
        // labelled JSON. Validate the callback and JSON first, then assign MIME.
        if(opaqueJsonp&&!parsed.providerJsonp)throw new MapServiceError(502,'高德服务响应格式无效，请重试。');
        return {body:parsed.body,contentType:parsed.jsonp?'application/javascript':'application/json'};
      };
      const {body,contentType}=await Promise.race([request(),deadline]);
      if(!res.destroyed){res.writeHead(200,{'Content-Type':contentType+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(body);}
    }catch(error){
      if(!res.destroyed)json(error instanceof MapServiceError?error.status:502,{error:error instanceof MapServiceError?error.message:'无法连接高德服务，请稍后重试。'});
    }finally{clearTimeout(timer);res.off('close',cancel);}
    return true;
  };
  return {getConfig,handleRequest};
}
