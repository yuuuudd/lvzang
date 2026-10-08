export async function accountApi(path,body){const response=await fetch(path,{credentials:'same-origin',...(body!==undefined?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(60000)});let data;try{data=await response.json();}catch{throw Error('服务响应异常，请确认本地服务已启动');}if(!response.ok){const error=new Error(data.error||'操作失败');error.status=response.status;throw error;}return data;}
export const accountInfo=typeof window==='undefined'?{enabled:false,user:null}:await accountApi('/api/auth/me');
export function storageKey(name){if(!accountInfo.enabled)return name;return name+':'+(accountInfo.user?.id||'guest');}
export async function imageData(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('文件无法读取'));r.readAsDataURL(blob);});}
export async function base64Data(blob){return (await imageData(blob)).split(',')[1];}
export const orderStatus={submitted:'待审核需求',needs_info:'待用户补充',needs_revision:'用户要求修改',making:'正在制作',awaiting_proposal:'待确认方案',awaiting_confirmation:'待用户确认',confirmed:'用户已确认',delivered:'已交付'};
