export const MODEL = Object.freeze({ widthMm:60, heightMm:45, baseHeight:2, reliefHeight:1.2 });

export function imageHeights(image, { baseHeight=2, reliefHeight=1.2 } = {}) {
  const { width, height, data }=image;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width<1 || height<1 || width*height>1_000_000 || data.length!==width*height*4) throw new Error('高度图无效');
  const heights=new Array(width*height);
  for (let i=0;i<heights.length;i++) {
    const j=i*4, darkness=1-(data[j]*0.2126+data[j+1]*0.7152+data[j+2]*0.0722)/255;
    heights[i]=baseHeight + reliefHeight*darkness*data[j+3]/255;
  }
  return { width,height,heights };
}

export function buildMesh(map, { widthMm=60, heightMm=45 } = {}) {
  const { width:w, height:h, heights }=map;
  if (!Number.isInteger(w) || !Number.isInteger(h) || w<2 || h<2 || w*h>1_000_000 || heights?.length!==w*h || !Array.from(heights).every(z=>Number.isFinite(z)&&z>0&&z<=10) || !Number.isFinite(widthMm) || !Number.isFinite(heightMm) || widthMm<=0 || heightMm<=0) throw new Error('高度图无效，无法制作模型');
  const boundary=[];
  for(let y=0;y<h;y++) boundary.push([0,y]);
  for(let x=1;x<w;x++) boundary.push([x,h-1]);
  for(let y=h-2;y>=0;y--) boundary.push([w-1,y]);
  for(let x=w-2;x>0;x--) boundary.push([x,0]);
  const out=new Float32Array(((w-1)*(h-1)*2+boundary.length*3)*9); let offset=0;
  const point=(x,y,z=heights[y*w+x])=>[x/(w-1)*widthMm-widthMm/2, heightMm/2-y/(h-1)*heightMm,z];
  const triangle=(a,b,c)=>{ out.set(a,offset);out.set(b,offset+3);out.set(c,offset+6);offset+=9; };
  for(let y=0;y<h-1;y++) for(let x=0;x<w-1;x++) {
    const a=point(x,y), b=point(x+1,y), c=point(x,y+1), d=point(x+1,y+1);
    triangle(a,c,b); triangle(b,c,d);
  }
  for(let i=0;i<boundary.length;i++) {
    const [x,y]=boundary[i], [xx,yy]=boundary[(i+1)%boundary.length];
    const p=point(x,y), q=point(xx,yy), pb=point(x,y,0), qb=point(xx,yy,0);
    triangle(pb,qb,q); triangle(pb,q,p); triangle([0,0,0],qb,pb);
  }
  return out;
}

export function normalAt(mesh,i) {
  const ux=mesh[i+3]-mesh[i], uy=mesh[i+4]-mesh[i+1], uz=mesh[i+5]-mesh[i+2];
  const vx=mesh[i+6]-mesh[i], vy=mesh[i+7]-mesh[i+1], vz=mesh[i+8]-mesh[i+2];
  const n=[uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx], length=Math.hypot(...n)||1;
  return n.map(x=>x/length);
}

export function binaryStl(mesh) {
  if (!(mesh instanceof Float32Array || Array.isArray(mesh)) || !mesh.length || mesh.length%9 || mesh.some(value=>typeof value!=='number'||!Number.isFinite(Math.fround(value)))) throw new Error('模型无效');
  const buffer=new ArrayBuffer(84+mesh.length/9*50), view=new DataView(buffer);
  new Uint8Array(buffer,0,80).set(new TextEncoder().encode('SHIGUANG travel memory | mm | 3D geometry'));
  view.setUint32(80,mesh.length/9,true);
  for(let i=0,offset=84;i<mesh.length;i+=9,offset+=50) {
    const n=normalAt(mesh,i);
    n.forEach((v,j)=>view.setFloat32(offset+j*4,v,true));
    for(let j=0;j<9;j++) view.setFloat32(offset+12+j*4,mesh[i+j],true);
  }
  return buffer;
}
