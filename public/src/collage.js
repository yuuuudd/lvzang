export const COLLAGE_WIDTH=1600, COLLAGE_HEIGHT=1000;
const slots=[[.55,.57],[.2,.56],[.83,.38],[.18,.8],[.81,.79],[.43,.82],[.6,.8],[.08,.4],[.94,.55]];
export function defaultPiece(index,count,cover=false){
  const slot=slots[index]||slots[0];
  return {x:slot[0],y:slot[1],scale:1,rotation:(index%2?-1:1)*[0,.075,.09,.055,.07,.04,.06,.03,.08][index],z:cover?count:index,baseSize:cover?630:count>6?330:count>3?390:460};
}
export function pieceBox(point,image){
  const piece=point.piece,max=Math.max(image.naturalWidth,image.naturalHeight),size=piece.baseSize*piece.scale;
  return {w:size*image.naturalWidth/max,h:size*image.naturalHeight/max,cx:piece.x*COLLAGE_WIDTH,cy:piece.y*COLLAGE_HEIGHT,angle:piece.rotation||0};
}
export function pickPiece(points,images,x,y,alphaAt){
  for(const point of [...points].filter(item=>item.piece?.cutout&&images.has(item.id)).sort((a,b)=>(b.piece.z||0)-(a.piece.z||0))){
    const image=images.get(point.id),box=pieceBox(point,image),dx=x-box.cx,dy=y-box.cy,c=Math.cos(box.angle),s=Math.sin(box.angle);
    const u=(dx*c+dy*s)/box.w+.5,v=(-dx*s+dy*c)/box.h+.5;
    if(u>=0&&u<=1&&v>=0&&v<=1&&alphaAt(point,image,u,v)>32)return point;
  }
  return null;
}
export function pickPaintingRegion(regions,x,y,maskAt){
  const area=region=>region.box?.w*region.box?.h||1;
  for(const region of [...regions].filter(item=>item.visible).sort((a,b)=>Number(Boolean(b.manual))-Number(Boolean(a.manual))||area(a)-area(b))){
    const scale=region.scale||1,c=region.center,b=region.box;
    if(!c||!b)continue;
    const u=c.x+(x-c.x)/scale,v=c.y+(y-c.y)/scale;
    if(u<b.x||u>b.x+b.w||v<b.y||v>b.y+b.h)continue;
    if(region.shape!=='mask'||maskAt(region,u,v)>127)return region;
  }
  return null;
}
export function drawPaintingGuide(canvas,trip,images){
  const ctx=canvas.getContext('2d'),sx=canvas.width/COLLAGE_WIDTH,sy=canvas.height/COLLAGE_HEIGHT;
  ctx.fillStyle='#f4ead8';ctx.fillRect(0,0,canvas.width,canvas.height);
  for(const [index,point] of trip.photos.map(photo=>trip.memories.find(item=>item.photoId===photo.id&&item.piece?.cutout&&images.has(item.id))).filter(Boolean).entries()){
    const image=images.get(point.id),box=pieceBox(point,image);
    ctx.save();ctx.translate(box.cx*sx,box.cy*sy);ctx.rotate(box.angle);
    ctx.drawImage(image,-box.w*sx/2,-box.h*sy/2,box.w*sx,box.h*sy);
    ctx.restore();
    ctx.fillStyle='#533c30';ctx.beginPath();ctx.arc((box.cx-box.w/2)*sx,(box.cy-box.h/2)*sy,22,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='white';ctx.font='bold 26px sans-serif';ctx.textAlign='center';ctx.fillText(String(index+1),(box.cx-box.w/2)*sx,(box.cy-box.h/2)*sy+9);
  }
}
export function drawCollage(canvas,trip,images){
  const ctx=canvas.getContext('2d');ctx.clearRect(0,0,COLLAGE_WIDTH,COLLAGE_HEIGHT);
  ctx.fillStyle='#f3e7d3';ctx.fillRect(0,0,COLLAGE_WIDTH,COLLAGE_HEIGHT);
  ctx.fillStyle='#e9d5b6';ctx.fillRect(24,24,1552,952);
  ctx.fillStyle='#f8eddc';ctx.fillRect(39,39,1522,922);
  ctx.strokeStyle='#bd6e53';ctx.lineWidth=2;ctx.strokeRect(58,58,1484,884);
  ctx.fillStyle='#4a5548';ctx.font='24px Georgia,serif';ctx.fillText('SHI GUANG  /  MEMORY COLLAGE',90,103);
  ctx.fillStyle='#9d4e37';ctx.font='bold 75px "STSong","Songti SC",serif';ctx.fillText((trip.name||'我的旅行').slice(0,12),90,190);
  ctx.fillStyle='#555d4f';ctx.font='26px "STSong","Songti SC",serif';ctx.fillText([trip.place,trip.date].filter(Boolean).join('  ·  '),94,232);
  ctx.fillStyle='#b8674d';ctx.fillRect(91,253,150,6);
  ctx.strokeStyle='#c9a17d';ctx.lineWidth=3;ctx.setLineDash([6,13]);ctx.beginPath();ctx.moveTo(90,310);ctx.bezierCurveTo(360,270,460,800,830,570);ctx.bezierCurveTo(1150,360,1300,780,1510,700);ctx.stroke();ctx.setLineDash([]);
  ctx.fillStyle='#576455';ctx.font='21px Georgia,serif';ctx.fillText(`${trip.photos.length} PHOTOS  ·  ${trip.memories.filter(point=>point.piece?.cutout).length} MOMENTS`,1120,916);
  for(const point of [...trip.memories].filter(item=>item.piece?.cutout&&images.has(item.id)).sort((a,b)=>(a.piece.z||0)-(b.piece.z||0))){
    const image=images.get(point.id),box=pieceBox(point,image);
    ctx.save();ctx.translate(box.cx,box.cy);ctx.rotate(box.angle);
    ctx.shadowColor='#52392580';ctx.shadowBlur=25;ctx.shadowOffsetX=12;ctx.shadowOffsetY=16;
    ctx.drawImage(image,-box.w/2,-box.h/2,box.w,box.h);
    ctx.shadowColor='transparent';ctx.fillStyle='#e6d0a9bf';ctx.translate(0,-box.h/2);ctx.rotate(-.08);ctx.fillRect(-48,-15,96,30);
    ctx.restore();
    ctx.save();ctx.translate(box.cx,box.cy+box.h/2+18);ctx.rotate(box.angle);
    ctx.fillStyle='#413d33';ctx.font='24px "STSong","Songti SC",serif';ctx.textAlign='center';ctx.fillText(point.title||`照片 ${point.photoId.slice(1)}`,0,0,box.w+55);ctx.restore();
  }
}
