import {reliefFromImage} from './relief.js';
export const magnetModels={gz:{city:'广州',name:'广州塔与骑楼'},hz:{city:'杭州',name:'西湖小亭'},sz:{city:'苏州',name:'水巷与小桥'}};
// Independent authored relief zones; pigment brightness never determines depth.
export function magnetDepthMap(ref,w,h){
  if(!magnetModels[ref])throw new Error('模型不存在');
  const out=new Float32Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const u=x/(w-1),v=y/(h-1);let d=.12;
    if(ref==='gz'){if(v>.78)d=.2;if(v>.49&&v<.8&&((u>.16&&u<.43)||(u>.56&&u<.84)))d=.72;if(v>.06&&v<.8&&Math.abs(u-.5)<(.025+.045*Math.abs(v-.42)/.4))d=.96;}
    else if(ref==='hz'){if(v>.72)d=.2;if(v>.27&&v<.71&&u>.35&&u<.66)d=.82;if(v>.15&&v<.35&&Math.abs(u-.5)<.1+(v-.15)*.7)d=.95;}
    else{if(v>.2&&v<.61&&u>.12&&u<.89)d=.65;if(v>.48&&v<.75&&u>.23&&u<.79)d=.94;if(v>.8)d=.2;}
    out[y*w+x]=d;
  }return out;
}
export function scaleMagnet(model,heightMm){
  if(![50,70,90].includes(heightMm))throw new Error('尺寸无效');
  const scale=heightMm/model.heightMm;return {...model,mesh:Float32Array.from(model.mesh,v=>v*scale),widthMm:model.widthMm*scale,heightMm,totalDepthMm:(2+model.depthMm)*scale};
}
const cache=new Map();
export async function loadMagnet(ref,{heightMm=70,colorMode='color'}={}){
  if(!magnetModels[ref])throw new Error('模型不存在');
  if(!cache.has(ref))cache.set(ref,(async()=>{const image=new Image();image.src=`/assets/magnets/${ref}.png`;await image.decode();const canvas=document.createElement('canvas');canvas.width=150;canvas.height=Math.round(image.height/image.width*150);const c=canvas.getContext('2d',{willReadFrequently:true});c.drawImage(image,0,0,canvas.width,canvas.height);const pixels=c.getImageData(0,0,canvas.width,canvas.height);return {...reliefFromImage(pixels,{depthMm:3.6,heightMap:magnetDepthMap(ref,pixels.width,pixels.height)}),texture:image};})().catch(e=>{cache.delete(ref);throw e;}));
  const base=await cache.get(ref);return {...scaleMagnet(base,heightMm),colorMode};
}
