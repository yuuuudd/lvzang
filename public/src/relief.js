// Artwork-driven, watertight 2.5D relief. This is an artistic height field, not recovered scene depth.
export function reliefFromImage(image,{widthMm=60,depthMm=1.6,smoothing=2,heightMap}={}){
  const {width:w,height:h,data}=image;
  if(!Number.isInteger(w)||!Number.isInteger(h)||w<3||h<3||w*h>400_000||data?.length!==w*h*4||!Number.isFinite(depthMm)||depthMm<.2||depthMm>4||!Number.isFinite(widthMm)||widthMm<20||widthMm>150)throw new Error('图像或浮雕尺寸无效');
  const n=w*h,mask=new Uint8Array(n),gray=new Float32Array(n);
  if(heightMap&&(heightMap.length!==n||Array.from(heightMap).some(v=>!Number.isFinite(v)||v<0||v>1)))throw new Error('高度图无效');
  let transparent=false;
  for(let i=0;i<n;i++){const j=i*4;mask[i]=data[j+3]>128?1:0;if(data[j+3]<32)transparent=true;gray[i]=(data[j]*.2126+data[j+1]*.7152+data[j+2]*.0722)/255;}
  const neighbors=(i)=>{const x=i%w,y=Math.floor(i/w);return [x?i-1:-1,x<w-1?i+1:-1,y?i-w:-1,y<h-1?i+w:-1].filter(v=>v>=0);};
  // Opaque generated images may use a white studio background: remove only boundary-connected white.
  if(!transparent){const seen=new Uint8Array(n),q=[];for(let i=0;i<n;i++)if(i<w||i>=n-w||i%w===0||i%w===w-1){seen[i]=1;q.push(i);}
    for(let k=0;k<q.length;k++){const i=q[k],j=i*4;if(data[j]<242||data[j+1]<242||data[j+2]<242)continue;mask[i]=0;for(const v of neighbors(i))if(!seen[v]){seen[v]=1;q.push(v);}}
  }
  // Keep one connected silhouette; fill interior holes for a durable, flat-backed souvenir.
  const seen=new Uint8Array(n);let largest=[];
  for(let start=0;start<n;start++)if(mask[start]&&!seen[start]){const q=[start];seen[start]=1;for(let k=0;k<q.length;k++)for(const v of neighbors(q[k]))if(mask[v]&&!seen[v]){seen[v]=1;q.push(v);}if(q.length>largest.length)largest=q;}
  if(largest.length<4)throw new Error('没有找到连续的图案主体，请换一张背景清楚的图片');
  mask.fill(0);for(const i of largest)mask[i]=1;
  const exterior=new Uint8Array(n),q=[];
  for(let i=0;i<n;i++)if(!mask[i]&&(i<w||i>=n-w||i%w===0||i%w===w-1)){exterior[i]=1;q.push(i);}
  for(let k=0;k<q.length;k++)for(const v of neighbors(q[k]))if(!mask[v]&&!exterior[v]){exterior[v]=1;q.push(v);}
  for(let i=0;i<n;i++)if(!exterior[i])mask[i]=1;
  // Resolve diagonal-only corner contacts so every edge and vertex belongs to a manifold surface.
  for(let y=0;y<h-1;y++)for(let x=0;x<w-1;x++){const a=y*w+x,b=a+1,c=a+w,d=c+1;if(mask[a]&&mask[d]&&!mask[b]&&!mask[c])mask[b]=1;else if(mask[b]&&mask[c]&&!mask[a]&&!mask[d])mask[a]=1;}
  let minX=w,minY=h,maxX=0,maxY=0;
  for(let i=0;i<n;i++)if(mask[i]){minX=Math.min(minX,i%w);maxX=Math.max(maxX,i%w);minY=Math.min(minY,Math.floor(i/w));maxY=Math.max(maxY,Math.floor(i/w));}
  let values=heightMap||gray;
  const passes=Math.max(1,Math.min(6,Math.round(smoothing)));
  for(let pass=0;pass<passes;pass++){const next=new Float32Array(n);for(let y=0;y<h;y++)for(let x=0;x<w;x++){let sum=0,count=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=Math.min(w-1,Math.max(0,x+dx)),yy=Math.min(h-1,Math.max(0,y+dy)),i=yy*w+xx;if(mask[i]){sum+=values[i];count++;}}next[y*w+x]=count?sum/count:0;}values=next;}
  const unit=widthMm/(maxX-minX+1),heightMm=(maxY-minY+1)*unit,heights=new Float32Array((w+1)*(h+1));
  const active=(x,y)=>x>=0&&y>=0&&x<w&&y<h&&mask[y*w+x];
  for(let y=0;y<=h;y++)for(let x=0;x<=w;x++){
    let sum=0,count=0;for(const [xx,yy] of [[x-1,y-1],[x,y-1],[x-1,y],[x,y]])if(active(xx,yy)){sum+=values[yy*w+xx];count++;}
    // Pale forms sit above dark ink; soft transitions replace the previous binary staircase.
    heights[y*(w+1)+x]=2+depthMm*(count===4?(.23+.77*sum/count):.1);
  }
  let count=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(active(x,y)){count+=4;for(const [xx,yy] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]])if(!active(xx,yy))count+=2;}
  const mesh=new Float32Array(count*9),uv=new Float32Array(count*6);let mi=0,ui=0;
  const vertex=(x,y,top)=>[(x-minX)*unit-widthMm/2,heightMm/2-(y-minY)*unit,top?heights[y*(w+1)+x]:0,x/w,1-y/h];
  const tri=(a,b,c)=>{for(const p of [a,b,c]){mesh.set(p.slice(0,3),mi);mi+=3;uv[ui++]=p[3];uv[ui++]=p[4];}};
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(active(x,y)){
    const a=vertex(x,y,true),b=vertex(x+1,y,true),c=vertex(x,y+1,true),d=vertex(x+1,y+1,true),aa=vertex(x,y,false),bb=vertex(x+1,y,false),cc=vertex(x,y+1,false),dd=vertex(x+1,y+1,false);
    tri(a,c,b);tri(b,c,d);tri(aa,bb,cc);tri(bb,dd,cc);
    const wall=(p,pp,r,rr)=>{tri(pp,rr,r);tri(pp,r,p);};
    if(!active(x-1,y))wall(a,aa,c,cc);
    if(!active(x,y+1))wall(c,cc,d,dd);
    if(!active(x+1,y))wall(d,dd,b,bb);
    if(!active(x,y-1))wall(b,bb,a,aa);
  }
  return {mesh,uv,widthMm,heightMm,depthMm,mask};
}
