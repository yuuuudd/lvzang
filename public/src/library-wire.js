// JSON transport for the Blob values used by the existing collection store.
export async function encodeLibrary(value){
  if(value instanceof Blob){const bytes=new Uint8Array(await value.arrayBuffer());let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));return {$libraryBlob:true,type:value.type,data:btoa(text)};}
  if(ArrayBuffer.isView(value))return Array.from(value);
  if(Array.isArray(value))return value.every(v=>v===null||typeof v!=='object')?value:Promise.all(value.map(encodeLibrary));
  if(value&&typeof value==='object')return Object.fromEntries(await Promise.all(Object.entries(value).map(async([k,v])=>[k,await encodeLibrary(v)])));
  return value;
}
export function decodeLibrary(value,depth=0){
  if(depth>40)throw Error('数据层级过深');
  if(Array.isArray(value))return value.every(v=>v===null||typeof v!=='object')?value:value.map(v=>decodeLibrary(v,depth+1));
  if(value&&typeof value==='object'){
    if(Object.hasOwn(value,'$libraryFile'))throw Error('文件引用无效');
    if(Object.hasOwn(value,'$libraryBlob')){
      if(value.$libraryBlob!==true||typeof value.data!=='string'||value.data.length>56000000||!/^[A-Za-z0-9+/]*={0,2}$/.test(value.data)||typeof value.type!=='string'||value.type.length>100)throw Error('文件格式或大小无效');
      const raw=atob(value.data);if(btoa(raw)!==value.data)throw Error('文件编码无效');
      return new Blob([Uint8Array.from(raw,c=>c.charCodeAt(0))],{type:value.type});
    }
    if(Object.keys(value).some(k=>['__proto__','constructor','prototype'].includes(k)))throw Error('数据字段无效');
    return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,decodeLibrary(v,depth+1)]));
  }
  return value;
}
