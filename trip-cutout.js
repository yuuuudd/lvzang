import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SIZE=960;
const imageBytes=value=>{
  const match=typeof value==='string'&&value.match(/^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if(!match||value.length>16_000_000)throw new Error('分割结果不是有效图片');
  return Buffer.from(match[1],'base64');
};
const webpData=bytes=>`data:image/webp;base64,${bytes.toString('base64')}`;

let modelPromise;
export async function segmentLocally({image,point}){
  modelPromise??=(async()=>{
    const {SamModel,AutoProcessor,RawImage,env}=await import('@huggingface/transformers');
    env.cacheDir=process.env.VERCEL==='1'?join(tmpdir(),'shiguang-model-cache'):fileURLToPath(new URL('./.superpowers/model-cache/',import.meta.url));
    await mkdir(env.cacheDir,{recursive:true});
    const [model,processor]=await Promise.all([
      SamModel.from_pretrained('Xenova/sam-vit-base',{dtype:'q8'}),
      AutoProcessor.from_pretrained('Xenova/sam-vit-base')
    ]);
    return {model,processor,RawImage};
  })().catch(error=>{modelPromise=null;throw error;});
  const {model,processor,RawImage}=await modelPromise;
  const raw=await RawImage.fromBlob(new Blob([imageBytes(image)],{type:'image/png'}));
  const inputs=await processor(raw,{input_points:[[[Math.round(point.x*raw.width),Math.round(point.y*raw.height)]]]});
  const outputs=await model(inputs);
  const masks=await processor.post_process_masks(outputs.pred_masks,inputs.original_sizes,inputs.reshaped_input_sizes);
  const tensor=masks[0],scores=outputs.iou_scores.data;
  let best=0;for(let i=1;i<scores.length;i++)if(scores[i]>scores[best])best=i;
  const height=tensor.dims.at(-2),width=tensor.dims.at(-1),size=width*height;
  const pixels=Buffer.alloc(size);
  for(let i=0;i<size;i++)pixels[i]=tensor.data[best*size+i]?255:0;
  const mask=await sharp(pixels,{raw:{width,height,channels:1}}).png().toBuffer();
  return `data:image/png;base64,${mask.toString('base64')}`;
}

async function paperPiece(source){
  const {data,info}=await sharp(source).resize(SIZE,SIZE,{fit:'inside'}).removeAlpha().png().toBuffer({resolveWithObject:true});
  const {width:w,height:h}=info,pad=Math.max(3,Math.round(Math.min(w,h)*.025));
  const points=[];for(let i=0;i<=12;i++)points.push(`${Math.round(pad+(w-2*pad)*i/12)},${Math.round(pad+(i%3-1)*pad*.45)}`);
  for(let i=1;i<=9;i++)points.push(`${Math.round(w-pad+(i%3-1)*pad*.45)},${Math.round(pad+(h-2*pad)*i/9)}`);
  for(let i=11;i>=0;i--)points.push(`${Math.round(pad+(w-2*pad)*i/12)},${Math.round(h-pad+(i%3-1)*pad*.45)}`);
  for(let i=8;i>0;i--)points.push(`${Math.round(pad+(i%3-1)*pad*.45)},${Math.round(pad+(h-2*pad)*i/9)}`);
  const svg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><polygon points="${points.join(' ')}" fill="white"/></svg>`);
  return {cutout:webpData(await sharp(data).ensureAlpha().composite([{input:svg,blend:'dest-in'}]).webp({quality:84,alphaQuality:90}).toBuffer()),kind:'paper'};
}

export async function makeCutout({image,prompt,kind,point},segmentImage=segmentLocally){
  const source=imageBytes(image);
  if(kind==='scene')return paperPiece(source);
  // ponytail: Vercel kills the SAM worker for memory; use paper pieces until segmentation runs in a larger service.
  if(process.env.VERCEL==='1')return {...await paperPiece(source),warning:'在线演示使用撕纸照片片段；仍可调整位置与大小。'};
  try{
    const {width:sourceWidth,height:sourceHeight}=await sharp(source).metadata();
    const scale=SIZE/Math.max(sourceWidth,sourceHeight);
    const squarePoint=point?{x:((SIZE-sourceWidth*scale)/2+point.x*sourceWidth*scale)/SIZE,y:((SIZE-sourceHeight*scale)/2+point.y*sourceHeight*scale)/SIZE}:undefined;
    const square=await sharp(source).resize(SIZE,SIZE,{fit:'contain',background:'#ffffff'}).png().toBuffer();
    const mask=imageBytes(await segmentImage({image:`data:image/png;base64,${square.toString('base64')}`,prompt,point:squarePoint}));
    const pixels=await sharp(mask).resize(SIZE,SIZE,{fit:'fill'}).greyscale().removeAlpha().raw().toBuffer();
    let filled=0;for(const value of pixels)if(value>127)filled++;
    const invert=filled/pixels.length>.85;
    if(invert)for(let i=0;i<pixels.length;i++)pixels[i]=255-pixels[i];
    let minX=SIZE,minY=SIZE,maxX=-1,maxY=-1;filled=0;
    for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++)if(pixels[y*SIZE+x]>127){filled++;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
    if(filled/pixels.length<.01||filled/pixels.length>.85)throw new Error('分割范围不可靠');
    const pad=16,left=Math.max(0,minX-pad),top=Math.max(0,minY-pad),width=Math.min(SIZE,maxX+pad+1)-left,height=Math.min(SIZE,maxY+pad+1)-top;
    const rgb=await sharp(square).removeAlpha().extract({left,top,width,height}).raw().toBuffer();
    const rgba=Buffer.alloc(width*height*4);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const src=(y*width+x)*3,dst=(y*width+x)*4;
      rgba[dst]=rgb[src];rgba[dst+1]=rgb[src+1];rgba[dst+2]=rgb[src+2];
      const opacity=pixels[(top+y)*SIZE+left+x];rgba[dst+3]=opacity<32?0:opacity>223?255:opacity;
    }
    const cutout=await sharp(rgba,{raw:{width,height,channels:4}}).webp({quality:84,alphaQuality:90}).toBuffer();
    return {cutout:webpData(cutout),kind:'subject'};
  }catch{return {...await paperPiece(source),warning:'本机分割模型未能完成抠图，已改用撕纸照片片段；可以稍后单块重试。'};}
}
