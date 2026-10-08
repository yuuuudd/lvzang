import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';

const root=resolve(process.argv[2]||'/home/ubuntu/apps/lvzang'),check=process.argv.includes('--check');
const edits={
 'server.js':[["for(const name of ['src/library-wire.js','src/server-keepsake-store.js'])files.add(name);\nfiles.add('assets/chikan-style-sample.png');","for(const name of ['src/library-wire.js','src/server-keepsake-store.js'])files.add(name);"]],
 'server-library.js':[
  ["  // ponytail: one process serializes library transactions; use a shared DB for multiple workers.","  const metaList=db.prepare(\"SELECT value FROM records WHERE owner=? AND bucket='meta' AND substr(id,1,?)=?\");\n  // ponytail: one process serializes library transactions; use a shared DB for multiple workers."],
  ["      getMeta:async id=>(await one('meta',id))?.value??null,","      getMeta:async id=>(await one('meta',id))?.value??null,\n      listMeta:async prefix=>Promise.all(metaList.all(owner,requireId(prefix).length,prefix).map(r=>unpack(JSON.parse(r.value)))),"]
 ],
 'public/src/server-keepsake-store.js':[["'getMeta','setMeta'","'getMeta','listMeta','setMeta'"]],
 'public/src/travel-keepsake-store.js':[
  ["const all=name=>new Promise((resolve,reject)=>{const t=db.transaction(name),r=t.objectStore(name).getAll();","const all=(name,range)=>new Promise((resolve,reject)=>{const t=db.transaction(name),r=t.objectStore(name).getAll(range);"],
  ["    getMeta:async id=>(await one('meta',id))?.value??null,","    getMeta:async id=>(await one('meta',id))?.value??null,\n    listMeta:prefix=>all('meta',IDBKeyRange.bound(prefix,prefix+'\\uffff')),"]
 ],
 'public/src/operator-domain.js':[
  ["export async function listCommissions(store){return (await store.dump()).meta.filter(m=>m.id.startsWith('operator-commission:')).map(m=>validateCommission(m.value)).sort((a,b)=>b.updatedAt-a.updatedAt);}","export async function listCommissions(store){const meta=store.listMeta?await store.listMeta('operator-commission:'):(await store.dump()).meta;return meta.filter(m=>m.id.startsWith('operator-commission:')).map(m=>validateCommission(m.value)).sort((a,b)=>b.updatedAt-a.updatedAt);}"],
  ["  validateProductType(c?.productType);validateBaseMode(c?.baseMode);","  if(c.source==='demo'&&c.demoImage==='/assets/chikan-style-sample.png')c.demoImage='/assets/keepsakes/memory-1.webp';\n  if(c.source==='demo'&&c.demoImage==='/assets/keepsakes/hz.png')c.demoImage='/assets/keepsakes/memory-2.webp';\n  validateProductType(c?.productType);validateBaseMode(c?.baseMode);"],
  ["demoImage:'/assets/chikan-style-sample.png'","demoImage:'/assets/keepsakes/memory-1.webp'"],
  ["demoImage:'/assets/keepsakes/hz.png'","demoImage:'/assets/keepsakes/memory-2.webp'"]
 ],
 'public/src/order-client.js':[["  async dump(){","  async listMeta(prefix){const meta=await base.listMeta(prefix);await readOrders();const entries=orders.map(o=>({id:'operator-commission:'+o.id,value:o.commission})).filter(m=>m.id.startsWith(prefix));return [...meta.filter(m=>!entries.some(n=>n.id===m.id)),...entries];},\n  async dump(){"]]
};
const changed=[];
for(const [file,replacements] of Object.entries(edits)){
 const path=join(root,file),original=await readFile(path,'utf8');let source=original;
 for(const [before,after] of replacements){if(source.includes(after)&&(after.includes(before)||!source.includes(before)))continue;if(source.split(before).length!==2)throw Error('Unexpected source version: '+file);source=source.replace(before,after);}
 if(source!==original)changed.push({path,source,file});
}
if(!check)for(const {path,source} of changed)await writeFile(path,source);
console.log((check?'Checked':'Patched')+' operator list files: '+changed.map(v=>v.file).join(', '));
