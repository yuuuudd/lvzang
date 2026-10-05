import sharp from 'sharp';

const unit=value=>Number.isFinite(value)&&value>=0&&value<=1;
export function paintingMemories(value){
  if(!Array.isArray(value)||value.length<2||value.length>9)throw new Error('请选择 2–9 个照片记忆元素');
  const ids=new Set(),photos=new Set();
  for(const memory of value){
    if(!/^m?[\w-]{1,80}$/.test(memory?.id||'')||!/^p[1-9]$/.test(memory?.photoId||'')||ids.has(memory.id)||photos.has(memory.photoId)||!['subject','scene'].includes(memory.kind)||typeof memory.title!=='string'||!memory.title.trim()||memory.title.length>40||typeof memory.evidence!=='string'||memory.evidence.length>180||typeof memory.target!=='string'||!memory.target.trim()||memory.target.length>80)throw new Error('记忆元素格式或来源照片无效');
    ids.add(memory.id);photos.add(memory.photoId);
  }
  for(let index=1;index<=value.length;index++)if(!photos.has(`p${index}`))throw new Error('每张来源照片需要一个记忆元素');
  return value.map(memory=>({id:memory.id,photoId:memory.photoId,title:memory.title.trim(),evidence:memory.evidence.trim(),target:memory.target.trim(),kind:memory.kind}));
}
export function validPoint(value){return unit(value?.x)&&unit(value?.y);}
export function validBox(value){return unit(value?.x)&&unit(value?.y)&&Number.isFinite(value.w)&&Number.isFinite(value.h)&&value.w>0&&value.h>0&&value.x+value.w<=1&&value.y+value.h<=1;}
const around=point=>({x:Math.max(0,point.x-.12),y:Math.max(0,point.y-.12),w:Math.min(.24,1-Math.max(0,point.x-.12)),h:Math.min(.24,1-Math.max(0,point.y-.12))});

export async function paintingRegion({image,center,box,kind},segmentImage){
  if(!validPoint(center))throw new Error('画中位置无效');
  const reliableBox=validBox(box)&&center.x>=box.x&&center.x<=box.x+box.w&&center.y>=box.y&&center.y<=box.y+box.h;
  const bounds=reliableBox?box:around(center);
  const fallback={visible:true,center,box:bounds,shape:'box',needsReview:kind==='subject'||!reliableBox};
  // ponytail: Vercel lacks the memory for SAM; keep an editable box until segmentation moves to a larger service.
  if(kind==='scene'||process.env.VERCEL==='1')return fallback;
  try{
    const result=await segmentImage({image,point:center});
    const bytes=Buffer.from(result.split(',')[1]||'','base64');
    const {data,info}=await sharp(bytes).resize(384,256,{fit:'fill',kernel:'nearest'}).greyscale().raw().toBuffer({resolveWithObject:true});
    const cx=Math.min(info.width-1,Math.floor(center.x*info.width)),cy=Math.min(info.height-1,Math.floor(center.y*info.height));
    let filled=0;
    for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
      const index=y*info.width+x;
      if(x/info.width<bounds.x-.03||x/info.width>bounds.x+bounds.w+.03||y/info.height<bounds.y-.03||y/info.height>bounds.y+bounds.h+.03)data[index]=0;
      else data[index]=data[index]>127?255:0;
      if(data[index])filled++;
    }
    if(!data[cy*info.width+cx]||filled/data.length<.001||filled/data.length>.5)return fallback;
    const mask=await sharp(data,{raw:{width:info.width,height:info.height,channels:1}}).png().toBuffer();
    return {visible:true,center,box:bounds,shape:'mask',mask:`data:image/png;base64,${mask.toString('base64')}`,needsReview:false};
  }catch{return fallback;}
}
