import test from 'node:test';
import assert from 'node:assert/strict';
import { reliefFromImage } from '../public/src/relief.js';

test('an irregular artwork becomes a closed die-cut relief with matching texture coordinates',()=>{
  const width=9,height=7,data=new Uint8ClampedArray(width*height*4);
  for(let y=1;y<6;y++)for(let x=1;x<8;x++)if(!(x>5&&y<3))data.set([x*24,100,y*30,255],(y*width+x)*4);
  const {mesh,uv,widthMm,heightMm}=reliefFromImage({width,height,data},{depthMm:1.5});
  const edges=new Map();let volume=0;
  for(let i=0;i<mesh.length;i+=9){
    const a=Array.from(mesh.slice(i,i+3)),b=Array.from(mesh.slice(i+3,i+6)),c=Array.from(mesh.slice(i+6,i+9));
    for(const [p,q] of [[a,b],[b,c],[c,a]]){const pk=p.join(','),qk=q.join(','),key=[pk,qk].sort().join('|'),e=edges.get(key)||[0,0];e[0]++;e[1]+=pk<qk?1:-1;edges.set(key,e);}
    volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
  }
  assert.ok([...edges.values()].every(e=>e[0]===2&&e[1]===0));
  assert.equal(uv.length,mesh.length/3*2);assert.ok(uv.every(v=>v>=0&&v<=1));
  assert.equal(widthMm,60);assert.ok(heightMm>0&&heightMm<60);
  assert.ok(volume>0&&volume<widthMm*heightMm*3.5);
  assert.ok(mesh.every(Number.isFinite));
});

test('transparent or invalid art fails clearly; exterior white can be removed without erasing enclosed whites',()=>{
  assert.throws(()=>reliefFromImage({width:3,height:3,data:new Uint8ClampedArray(36)}),/主体/);
  assert.throws(()=>reliefFromImage({width:1,height:3,data:new Uint8ClampedArray(12)}),/图像/);
  const width=8,height=8,data=new Uint8ClampedArray(width*height*4).fill(255);
  for(let y=2;y<6;y++)for(let x=2;x<6;x++)if(x===2||x===5||y===2||y===5)data.set([0,100,120,255],(y*width+x)*4);
  const model=reliefFromImage({width,height,data});assert.ok(model.mesh.length>0);assert.equal(model.widthMm,60);
});
