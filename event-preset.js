import { readFile } from 'node:fs/promises';

const preset=JSON.parse(await readFile(new URL('./presets/shenzhen-hackathon.json',import.meta.url),'utf8'));
export const availablePresets=[{id:preset.id,name:preset.name}];

export function selectPreset(id='none'){
  if(id==null||id==='none')return null;
  if(id!==preset.id)throw new Error('主题预设无效');
  return preset;
}

export async function readEventImages(selected){
  const images={};
  for(const [key,file] of [['venueImage',selected.venueImage],['characterImage',selected.characterImage]]){
    if(!/^[a-z0-9-]+\.(png|jpg|jpeg)$/i.test(file))throw new Error('活动预设参考图文件名无效');
    let bytes;
    try{bytes=await readFile(new URL(`./presets/assets/${file}`,import.meta.url));}
    catch{throw new Error(`活动预设缺少${key==='venueImage'?'建筑':'塔奇克马'}参考图`);}
    const type=file.endsWith('.png')?'png':'jpeg';
    const valid=type==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    if(!valid||bytes.length>2_000_000)throw new Error('活动预设参考图格式或大小无效');
    images[key]=`data:image/${type};base64,${bytes.toString('base64')}`;
  }
  return images;
}
