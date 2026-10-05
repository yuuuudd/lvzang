import {byId} from './travel-catalog.js';
// Predefined stylized meshes. Closed parts overlap; use a slicer to union/check before printing.
export function makeSouvenir(id){
  if(!byId(id))throw new Error('模型不存在');
  const triangles=[],pigments=[];
  const ink={cream:[240,230,203],jade:[92,151,132],roof:[46,79,78],coral:[201,113,84],gold:[210,168,88]};
  function tri(a,b,c,color){triangles.push(...a,...b,...c);pigments.push(...color,...color,...color);}
  function box(x,y,z,w,h,d,color){const v=[[x-w/2,y,z-d/2],[x+w/2,y,z-d/2],[x+w/2,y+h,z-d/2],[x-w/2,y+h,z-d/2],[x-w/2,y,z+d/2],[x+w/2,y,z+d/2],[x+w/2,y+h,z+d/2],[x-w/2,y+h,z+d/2]];for(const [a,b,c,d]of [[0,3,2,1],[4,5,6,7],[0,1,5,4],[3,7,6,2],[0,4,7,3],[1,2,6,5]]){tri(v[a],v[b],v[c],color);tri(v[a],v[c],v[d],color);}}
  function roof(x,y,z,w,h,d,color){const v=[[x-w/2,y,z-d/2],[x+w/2,y,z-d/2],[x,y+h,z-d/2],[x-w/2,y,z+d/2],[x+w/2,y,z+d/2],[x,y+h,z+d/2]];tri(v[0],v[2],v[1],color);tri(v[3],v[4],v[5],color);for(const [a,b,c,d]of [[0,1,4,3],[1,2,5,4],[2,0,3,5]]){tri(v[a],v[b],v[c],color);tri(v[a],v[c],v[d],color);}}
  box(0,0,0,64,4,40,ink.cream);box(0,3.8,0,59,1.4,35,ink.jade);
  if(id==='gz-tower'){
    const rings=12,sides=24,vertices=[];
    for(let r=0;r<=rings;r++){const t=r/rings,radius=2.7+13*(t-.42)**2;vertices.push(Array.from({length:sides},(_,i)=>{const a=i/sides*Math.PI*2+t*.7;return [Math.cos(a)*radius,5+t*48,Math.sin(a)*radius];}));}
    for(let r=0;r<rings;r++)for(let i=0;i<sides;i++){const j=(i+1)%sides,c=i%3===0?[139,117,200]:[107,179,207];tri(vertices[r][i],vertices[r+1][i],vertices[r+1][j],c);tri(vertices[r][i],vertices[r+1][j],vertices[r][j],c);}
    for(let i=0;i<sides;i++){const j=(i+1)%sides;tri([0,5,0],vertices[0][i],vertices[0][j],ink.roof);tri([0,53,0],vertices[rings][j],vertices[rings][i],ink.roof);}
    box(0,53,0,1,12,1,ink.roof);
  }else if(id==='gz-museum'){
    box(0,5,0,38,3,24,ink.gold);for(const x of [-13,13])box(x,8,0,5,8,14,ink.roof);
    box(0,16,0,48,22,28,[53,59,69]);
    for(const [x,y,z,w,h,d]of [[-18,22,14.5,10,12,3],[-4,17,14.5,9,14,3],[10,26,14.5,12,8,3],[20,19,-8,4,15,11]])box(x,y,z,w,h,d,[165,72,65]);
  }else if(id==='gz-square'){
    for(const [x,z,w,h]of [[-19,-5,7,28],[-7,-5,8,20],[7,-5,7,36],[19,-5,6,24]])box(x,5,z,w,h,10,[123,168,189]);
    box(0,5,10,48,1,8,ink.gold);for(const x of [-20,-10,0,10,20]){box(x,6,12,1.5,5,1.5,ink.roof);box(x,10,12,5,5,5,ink.jade);}
  }else if(id==='gz-opera'){
    for(const [x,z,w,h,d]of [[-14,0,24,15,24],[15,-3,25,19,20]]){box(x,5,z,w,h,d,[155,178,185]);roof(x,5+h,z,w+2,7,d+2,[104,144,163]);}
  }else if(id.includes('garden')||id.includes('westlake')||id.includes('longjing')){
    for(const x of [-10,10])for(const z of [-7,7])box(x,5,z,2.8,21,2.8,ink.coral);
    box(0,24,0,26,2,22,ink.cream);roof(0,26,0,35,10,29,ink.roof);box(0,35,0,10,1.5,8,ink.gold);
    box(22,5,-9,7,10,7,ink.jade);roof(22,15,-9,12,5,12,ink.jade);
  }else if(id.includes('shantang')){
    box(0,5,0,3,29,3,ink.roof);box(0,15,0,28,2.8,3.5,ink.roof);
    for(const x of [-10,10]){box(x,9,0,8,7,8,ink.coral);box(x,8.5,0,9,1,9,ink.gold);box(x,16,0,9,1,9,ink.gold);box(x,6,0,1.2,3,1.2,ink.gold);}
  }else{
    box(-12,5,0,21,18,18,ink.cream);roof(-12,23,0,26,9,23,ink.roof);
    box(12,5,-4,18,25,17,ink.cream);roof(12,30,-4,23,9,22,ink.roof);
    for(const x of [-17,-8,10,16])box(x,13,9.2,3,5,1,ink.coral);
    box(0,5,14,24,4,6,ink.gold);box(-10,5,14,3,7,6,ink.gold);box(11,5,14,3,7,6,ink.gold);
  }
  return {mesh:Float32Array.from(triangles),colors:Uint8Array.from(pigments),widthMm:70,heightMm:id==='gz-tower'?70:50};
}
export function souvenirSTL(id,width=60){
  if(!Number.isFinite(width)||width<40||width>120)throw new Error('导出尺寸需要在 40–120 mm 之间');
  const {mesh}=makeSouvenir(id),scale=width/64,count=mesh.length/9,buffer=new ArrayBuffer(84+count*50),view=new DataView(buffer);view.setUint32(80,count,true);
  for(let i=0;i<count;i++){const offset=84+i*50;for(let v=0;v<3;v++){const k=i*9+v*3;view.setFloat32(offset+12+v*12,mesh[k]*scale,true);view.setFloat32(offset+16+v*12,-mesh[k+2]*scale,true);view.setFloat32(offset+20+v*12,mesh[k+1]*scale,true);}}
  return buffer;
}
