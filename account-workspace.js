import {mkdir,readFile,writeFile,rename,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID,randomBytes,scrypt as scryptCallback,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {createCommission,validateCommission,requireReviewed,requireProductAsset} from './public/src/operator-domain.js';
import {createModelPreview} from './model-preview.js';
import {validateProductType,validateBaseMode,productRulesVersion} from './public/src/product-rules.js';
const scrypt=promisify(scryptCallback),hash=v=>createHash('sha256').update(v).digest('hex');
const validId=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v);
const text=(v,max,name)=>{if(typeof v!=='string'||v.length>max)throw Error(name+'格式无效或过长');return v.trim();};
export const isOperator=u=>Boolean(u?.roles?.includes('operator')&&u.activeRole!=='user');
export const publicAccount=u=>({id:u.id,username:u.username,name:u.name,roles:u.roles,workspaceOwner:u.workspaceOwner===true,activeRole:u.activeRole||(u.roles.includes('operator')?'operator':'user')});

// ponytail: one Node process owns this atomic file; use database transactions for multi-worker deployment.
export async function createAccountWorkspace(dir){
 await mkdir(join(dir,'files'),{recursive:true});const path=join(dir,'workspace.json');
 let data;try{data=JSON.parse(await readFile(path,'utf8'));if(data.version!==1||!Array.isArray(data.users)||!Array.isArray(data.orders)||!Array.isArray(data.sessions)||!data.resources)throw Error('账号数据格式无效');}catch(e){if(e.code!=='ENOENT')throw e;data={version:1,users:[],sessions:[],orders:[],resources:{}};}
 let queue=Promise.resolve();
 async function mutate(fn){const run=queue.then(async()=>{const next=structuredClone(data),result=await fn(next);await writeFile(path+'.tmp',JSON.stringify(next));await rename(path+'.tmp',path);data=next;return result;});queue=run.catch(()=>{});return run;}
 const own=(u,o)=>{if(!u||(!isOperator(u)&&o.ownerId!==u.id))throw Error('订单不存在或无访问权限');};
 const view=(u,o)=>{own(u,o);if(isOperator(u))return structuredClone(o);const {id,title,raw,summary,deliveryType,status,revision,createdAt,updatedAt,photos,inputs,result,customerNote,returnReason,deliveredAt}=o;return {id,title,raw,summary,deliveryType,productType:o.commission.productType||null,baseMode:o.commission.baseMode||'none',status,revision,createdAt,updatedAt,photos,inputs,result:result?.published?{id:result.id,files:result.files,work:{id:result.work.id,title:result.work.title,revision:result.work.revision},report:result.report,published:true,createdAt:result.createdAt}:null,deliveryNote:result?.published?o.commission.deliveryNote:'',customerNote,returnReason,deliveredAt};};
 function decodeFile(f,kind){
  const match=typeof f?.image==='string'&&f.image.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
  let bytes,mime;if(match){bytes=Buffer.from(match[2],'base64');mime=match[1];if(bytes.toString('base64')!==match[2]||bytes.length>2800000||!(mime==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216:bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'))throw Error('图片格式或大小无效');}
  else if(kind==='model'&&typeof f?.base64==='string'&&/^[A-Za-z0-9+/]+={0,2}$/.test(f.base64)){bytes=Buffer.from(f.base64,'base64');mime='model/gltf-binary';if(bytes.length<20||bytes.length>40000000||bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length||bytes.toString('base64')!==f.base64)throw Error('模型格式或大小无效');}
  else throw Error('文件格式无效');return {bytes,mime};
 }
 async function file(orderId,f,kind){const {bytes,mime}=decodeFile(f,kind),id=randomUUID();if(kind==='model')await createModelPreview(bytes);await mkdir(join(dir,'files',orderId),{recursive:true});await writeFile(join(dir,'files',orderId,id),bytes);return {id,kind,mime,size:bytes.length,url:`/api/orders/${orderId}/files/${id}`};}
 const revision=(o,b)=>{if(!Number.isInteger(b.revision)||b.revision!==o.revision)throw Error('订单已更新，请刷新后再处理');};
 const touch=o=>{o.revision++;o.updatedAt=Date.now();o.commission.revision=o.revision;};
 return {
  setupNeeded:()=>!data.users.some(u=>u.roles.includes('operator')),
  async enterTestRole(role){
   if(!['user','operator'].includes(role))throw Error('请选择用户或经营者');
   const token=randomBytes(32).toString('base64url');
   return mutate(d=>{let u=d.users.find(u=>u.username==='local-demo-'+role);if(!u){u={id:randomUUID(),username:'local-demo-'+role,name:role==='user'?'体验用户':'体验经营者',roles:role==='user'?['user']:['user','operator'],workspaceOwner:role==='user',createdAt:Date.now()};d.users.push(u);}d.sessions=d.sessions.filter(s=>s.expires>Date.now());d.sessions.push({hash:hash(token),userId:u.id,role,expires:Date.now()+7*86400000});return {token,user:{...publicAccount(u),activeRole:role}};});
  },
  async register(body,{operator=false}={}){
   if(body.roles||body.role==='operator')throw Error('注册不能自行提升经营者权限');const username=text(body.username,40,'账号').toLowerCase(),name=text(body.name||body.username,60,'姓名');
   if(!/^[a-z0-9_@.\-]{3,40}$/.test(username)||typeof body.password!=='string'||body.password.length<8||body.password.length>128)throw Error('账号需3—40位字母数字，密码需8—128位');
   const salt=randomBytes(16).toString('hex'),passwordHash=(await scrypt(body.password,salt,64)).toString('hex');
   return mutate(d=>{if(d.users.some(u=>u.username===username))throw Error('该账号已存在');if(operator&&d.users.some(u=>u.roles.includes('operator')))throw Error('工作室已初始化');const u={id:randomUUID(),username,name,salt,passwordHash,roles:operator?['user','operator']:['user'],workspaceOwner:operator,createdAt:Date.now()};d.users.push(u);return publicAccount(u);});
  },
  async login(body){const username=text(body.username,40,'账号').toLowerCase(),u=data.users.find(u=>u.username===username);if(typeof body.password!=='string'||body.password.length>128)throw Error('账号或密码错误');const candidate=await scrypt(body.password,u?.salt||'invalid-account',64);if(!u?.passwordHash||!timingSafeEqual(candidate,Buffer.from(u.passwordHash,'hex')))throw Error('账号或密码错误');const role=body.role||'user';if(!u.roles.includes(role))throw Error('该账号没有此角色权限');const token=randomBytes(32).toString('base64url');await mutate(d=>{d.sessions=d.sessions.filter(s=>s.expires>Date.now());d.sessions.push({hash:hash(token),userId:u.id,role,expires:Date.now()+7*86400000});});return {token,user:{...publicAccount(u),activeRole:role}};},
  async session(token){if(typeof token!=='string'||token.length>200)return null;const s=data.sessions.find(s=>s.hash===hash(token)&&s.expires>Date.now()),u=s&&data.users.find(u=>u.id===s.userId);return u?{user:{...publicAccount(u),activeRole:s.role}}:null;},
  async logout(token){return mutate(d=>{d.sessions=d.sessions.filter(s=>s.hash!==hash(token||''));});},
  async switchRole(token,role){return mutate(d=>{const s=d.sessions.find(s=>s.hash===hash(token||'')&&s.expires>Date.now()),u=s&&d.users.find(u=>u.id===s.userId);if(!u||!u.roles.includes(role))throw Error('该账号没有此角色权限');s.role=role;return {...publicAccount(u),activeRole:role};});},
  async createOrder(u,b){if(!u)throw Error('请先登录');const productType=validateProductType(b.productType,{required:true}),baseMode=validateBaseMode(b.baseMode);const title=text(b.title,80,'作品名称'),raw=text(b.raw||'',3000,'需求'),summary=text(b.summary||raw,3000,'需求摘要');if(!title||!['image','digital3d','physical'].includes(b.deliveryType)||!Array.isArray(b.photos)||b.photos.length<1||b.photos.length>9)throw Error('请填写名称、交付类型并提交1—9张照片');const id=randomUUID();let photos,inputs=[];try{photos=await Promise.all(b.photos.map(f=>file(id,f,'photo')));if(b.inputReference)inputs.push(await file(id,b.inputReference,'reference'));if(b.inputModel)inputs.push(await file(id,b.inputModel,'model'));return await mutate(d=>{const now=Date.now(),commission=createCommission({id,title,raw,summary,source:'customer',customer:u.name,place:text(b.place||'',80,'地点'),date:text(b.date||'',30,'日期'),style:b.style||'clay',productType,baseMode,productRulesVersion,deliveryType:b.deliveryType,photoIds:photos.map(f=>f.id),serverOrderId:id});commission.revision=1;const o={id,ownerId:u.id,title,raw,summary,deliveryType:b.deliveryType,status:'submitted',revision:1,createdAt:now,updatedAt:now,photos,inputs,result:null,customerNote:'',returnReason:'',commission};d.orders.push(o);return view(u,o);});}catch(e){await rm(join(dir,'files',id),{recursive:true,force:true});throw e;}},
  async listOrders(u){if(!u)throw Error('请先登录');return data.orders.filter(o=>isOperator(u)||o.ownerId===u.id).sort((a,b)=>b.updatedAt-a.updatedAt).map(o=>view(u,o));},
  async getOrder(u,id){if(!validId(id))throw Error('订单编号无效');const o=data.orders.find(o=>o.id===id);if(!o)throw Error('订单不存在');return view(u,o);},
  async getFile(u,id,fileId){const o=data.orders.find(o=>o.id===id);if(!o)throw Error('订单不存在');own(u,o);const files=[...o.photos,...o.inputs,...(isOperator(u)||o.result?.published?o.result?.files||[]:[])],f=files.find(f=>f.id===fileId);if(!f||!validId(fileId))throw Error('文件不存在或无访问权限');return {meta:f,bytes:await readFile(join(dir,'files',id,fileId))};},
  async updateOrder(u,id,b){return mutate(d=>{const o=d.orders.find(o=>o.id===id);if(!o)throw Error('订单不存在');own(u,o);if(!(isOperator(u)?['accept','return']:['confirm','revise']).includes(b.action))throw Error('无权限或订单动作无效');revision(o,b);const c=o.commission;
   if(isOperator(u)&&b.action==='accept'){if(!['submitted','needs_info','needs_revision'].includes(o.status))throw Error('当前订单不能重复接单');validateProductType(c.productType,{required:true});o.status='making';c.confirmedVersion=c.briefVersion;c.status='make';c.customerNote=o.customerNote;if(b.internalNote!==undefined)c.internalNote=text(b.internalNote,2000,'内部备注');}
   else if(isOperator(u)&&b.action==='return'){o.returnReason=text(b.note||'',1000,'补充要求');if(!o.returnReason)throw Error('请说明需要补充的内容');o.status='needs_info';c.status='brief';}
   else if(!isOperator(u)&&b.action==='confirm'){if(o.status!=='awaiting_confirmation')throw Error('当前没有待确认作品');requireReviewed(c);o.status='confirmed';o.customerNote=text(b.note||'',1000,'用户反馈');o.confirmedResultId=o.result.id;o.confirmedBriefVersion=c.briefVersion;o.confirmedAssetRevision=c.assetRevision;}
   else if(!isOperator(u)&&b.action==='revise'){if(!['needs_info','awaiting_confirmation','confirmed'].includes(o.status))throw Error('当前状态不能提交修改');const note=text(b.note||'',1000,'修改要求');if(!note)throw Error('请填写补充或修改内容');o.customerNote=note;o.status='needs_revision';c.briefVersion++;c.confirmedVersion=0;c.review=null;c.status='brief';c.physicalVerified=false;c.physicalEvidence='';c.summary=('用户补充：'+note+'\n原需求：'+o.raw).slice(0,3000);}
   else throw Error('无权限或订单动作无效');touch(o);c.log.push({at:Date.now(),action:b.action==='accept'?'接受用户需求':b.action==='return'?'退回补充':'用户确认/修改',detail:b.note||'需求已进入制作'});return view(u,o);
  });},
  async putCommission(u,id,c){if(!isOperator(u))throw Error('需要经营者权限');validateCommission(c);return mutate(d=>{
   const o=d.orders.find(o=>o.id===id);if(!o)throw Error('订单不存在');if(c.id!==id||c.serverOrderId!==id)throw Error('委托编号不一致');revision(o,c);
   if(c.assetRevision!==o.commission.assetRevision)throw Error('作品版本不一致，请重新读取');
   const confirmed=o.confirmedResultId===o.result?.id&&o.confirmedBriefVersion===c.briefVersion&&o.confirmedAssetRevision===c.assetRevision;
   if(c.review?.accepted||c.status==='delivered'){
    requireReviewed(c);requireProductAsset(c,{report:o.result?.report});if(!o.result?.files?.length||c.selection?.id!==o.result.work.id||c.selection?.revision!==o.result.work.revision)throw Error('审核与选定作品版本不一致');
    if(c.deliveryType!=='image'&&!o.result.files.some(f=>f.kind==='model'))throw Error('三维模型尚未同步，不能审核交付');
    if(c.deliveryType==='physical'&&(!c.physicalVerified||!c.physicalEvidence?.trim()))throw Error('实体尚需实际打样记录');
   }
   if(c.status==='delivered'){if(!confirmed||!['confirmed','delivered'].includes(o.status))throw Error('请等待用户确认当前作品后记录交付');if(!c.exports.some(e=>e.version===`${c.briefVersion}.${c.assetRevision}`))throw Error('请先导出当前版本交付包');}
   o.commission=structuredClone(c);
   if(c.status==='delivered'){o.status='delivered';o.deliveredAt??=Date.now();}
   else if(c.review?.accepted){o.result.published=true;o.status=confirmed?'confirmed':'awaiting_confirmation';}
   else if(!['submitted','needs_info','needs_revision'].includes(o.status))o.status='making';
   touch(o);return structuredClone(o.commission);
  });},
  async putResult(u,id,b){if(!isOperator(u))throw Error('需要经营者权限');const original=data.orders.find(o=>o.id===id);if(!original)throw Error('订单不存在');revision(original,b);if(!b.work||!validId(b.work.id)||!Number.isInteger(b.work.revision)||!b.reference)throw Error('作品信息无效');let files=[];try{files.push(await file(id,b.reference,'reference'));if(b.model)files.push(await file(id,b.model,'model'));return await mutate(d=>{const o=d.orders.find(o=>o.id===id);revision(o,b);const resultId=randomUUID(),workId='shared-work-'+id+'-'+resultId;o.result={id:resultId,files,work:{id:workId,sourceId:b.work.id,revision:b.work.revision,title:text(b.work.title||'纪念作品',80,'作品标题')},report:b.report&&JSON.stringify(b.report).length<100000?b.report:null,published:false,createdAt:Date.now()};o.commission.selection={id:workId,revision:b.work.revision};o.commission.assetRevision++;o.commission.review=null;o.commission.physicalVerified=false;o.commission.physicalEvidence='';o.commission.status='review';o.status='making';touch(o);return structuredClone(o);});}catch(e){for(const f of files)await rm(join(dir,'files',id,f.id),{force:true});throw e;}},
  async claimResource(userId,id){if(!validId(id.split('.')[0]))throw Error('任务编号无效');return mutate(d=>{if(d.resources[id]&&d.resources[id]!==userId)throw Error('任务归属冲突');d.resources[id]=userId;});},
  ownsResource(u,id){return Boolean(u&&data.resources[id]===u.id);},
  resourceOwner(id){return data.resources[id]||null;}
 };
}
