export async function createModelPreview(blob){
  const bytes=new Uint8Array(await blob.arrayBuffer());let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));
  const response=await fetch('/api/operator-preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({glb:btoa(text)}),signal:AbortSignal.timeout(60000)});const result=await response.json();if(!response.ok)throw Error(result.error||'模型预览暂不可用');return result;
}
