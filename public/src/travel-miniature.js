// Authored miniature geometry. Separate overlapping closed solids need slicer union before printing.
export function makeMiniature(ref,widthMm=160){
  if(!['gz','hz','sz'].includes(ref))throw new Error('模型不存在');
  const out=[],col=[],cream=[236,220,186],stone=[204,186,147],roof=[53,65,62],jade=[101,135,85],water=[94,161,165];
  const tri=(a,b,c,ink)=>{out.push(...a,...b,...c);col.push(...ink,...ink,...ink);};
  const quad=(a,b,c,d,ink)=>{tri(a,b,c,ink);tri(a,c,d,ink);};
  function box(x,y,z,w,h,d,ink=cream){const a=[x-w/2,y,z-d/2],b=[x+w/2,y,z-d/2],c=[x+w/2,y+h,z-d/2],e=[x-w/2,y+h,z-d/2],f=[x-w/2,y,z+d/2],g=[x+w/2,y,z+d/2],j=[x+w/2,y+h,z+d/2],k=[x-w/2,y+h,z+d/2];quad(a,e,c,b,ink);quad(f,g,j,k,ink);quad(a,b,g,f,ink);quad(e,k,j,c,ink);quad(a,f,k,e,ink);quad(b,c,j,g,ink);}
  function ellipse(x,y,z,rx,rz,h,ink=cream){for(let i=0;i<48;i++){const a=i/48*Math.PI*2,b=(i+1)/48*Math.PI*2,p=[x+Math.cos(a)*rx,y,z+Math.sin(a)*rz],q=[x+Math.cos(b)*rx,y,z+Math.sin(b)*rz],r=[q[0],y+h,q[2]],s=[p[0],y+h,p[2]];quad(p,s,r,q,ink);tri([x,y,z],p,q,ink);tri([x,y+h,z],r,s,ink);}}
  function beam(a,b,r,ink=cream){const norm=v=>{const n=Math.hypot(...v);return v.map(x=>x/n);},cross=(u,v)=>[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],axis=norm(b.map((v,i)=>v-a[i])),u=norm(cross(axis,Math.abs(axis[1])>.9?[1,0,0]:[0,1,0])),v=cross(axis,u),at=(c,t)=>c.map((n,i)=>n+r*(u[i]*Math.cos(t)+v[i]*Math.sin(t)));for(let i=0;i<6;i++){const p=i/6*Math.PI*2,q=(i+1)/6*Math.PI*2;quad(at(a,p),at(b,p),at(b,q),at(a,q),ink);tri(a,at(a,q),at(a,p),ink);tri(b,at(b,p),at(b,q),ink);}}
  function tree(x,z,h=12){ellipse(x,5,z,1,1,h*.65,stone);for(const [dx,dy,dz,s]of [[0,0,0,1],[-3,-2,0,.7],[3,-1,1,.75],[0,-2,-3,.65]]){const levels=10,n=14,cy=5+h+dy;for(let l=0;l<levels;l++){const a=-Math.PI/2+l/levels*Math.PI,b=-Math.PI/2+(l+1)/levels*Math.PI;for(let i=0;i<n;i++){const p=i/n*Math.PI*2,q=(i+1)/n*Math.PI*2;const pt=(v,u)=>[x+dx+Math.cos(v)*Math.cos(u)*4*s,cy+Math.sin(v)*4*s,z+dz+Math.cos(v)*Math.sin(u)*4*s];quad(pt(a,p),pt(a,q),pt(b,q),pt(b,p),jade);}}}}
  function building(x,z,w=22,h=22){box(x,5,z,w,h,15);box(x,5+h,z,w+2,1.8,17,stone);box(x,5+h+2,z,w+.8,1.2,16);for(let floor=0;floor<3;floor++){for(let wx=x-w/2+3;wx<x+w/2;wx+=5){box(wx,8+floor*6,z+7.6,2.4,3.9,.5,roof);box(wx,8+floor*6,z+8,3.1,.4,.5,stone);}box(x,7+floor*6,z+8,w+1,.6,1,stone);}for(let px=x-w/2+1;px<x+w/2;px+=5)box(px,5,z+8,1,7,1.5);}
  ellipse(0,0,0,50,31,5);ellipse(0,5,0,47,28,.6,water);
  if(ref==='gz'){
    building(-25,-3,24,24);building(27,-6,19,21);
    const rings=38,sides=32,verts=[];for(let j=0;j<=rings;j++){const t=j/rings,r=1.6+6*(t-.44)**2;verts.push(Array.from({length:sides},(_,i)=>[Math.cos(i/sides*Math.PI*2+t*.6)*r,6+t*54,Math.sin(i/sides*Math.PI*2+t*.6)*r]));}
    for(let j=0;j<rings;j++)for(let i=0;i<sides;i++){const n=(i+1)%sides;quad(verts[j][i],verts[j+1][i],verts[j+1][n],verts[j][n],[169,184,184]);}for(let j=0;j<rings;j+=2)for(let i=0;i<sides;i+=4){beam(verts[j][i],verts[Math.min(rings,j+2)][(i+1)%sides],.23);if(j%6===0)beam(verts[j][i],verts[j][(i+4)%sides],.18);}for(let i=0;i<sides;i++){const n=(i+1)%sides;tri([0,6,0],verts[0][i],verts[0][n],cream);tri([0,60,0],verts[rings][n],verts[rings][i],cream);}ellipse(0,60,0,.5,.5,9,stone);
    for(const x of [-38,-12,15,39])tree(x,-15,12);for(let x=-42;x<=42;x+=6){box(x,5,18,.8,4,.8);box(x,8,18,6,.5,.6);}box(0,6,21,17,2,5,cream);
  }else{
    if(ref==='sz'){building(-23,-7,21,18);building(24,-11,24,16);}else{for(const x of [-9,9])for(const z of [-12,4])ellipse(x,6,z,.8,.8,19,stone);box(0,24,-4,24,1,22);for(let l=0;l<6;l++)box(0,25+l,-4,36-l*4,.8,30-l*3,roof);}
    for(let i=0;i<16;i++){const x=-20+i*2.5,y=7+Math.sin(i/15*Math.PI)*8;box(x,y,14,2.6,1.8,8,cream);box(x,y+2,10.5,.6,3,.6);box(x,y+4,10.5,2.6,.5,.5);}
    tree(-34,-11,17);tree(34,-9,14);tree(29,8,10);
  }
  const scale=widthMm/100;return {mesh:Float32Array.from(out,v=>v*scale),colors:Uint8Array.from(col),widthMm,heightMm:(ref==='gz'?70:42)*scale,totalDepthMm:62*scale,centerY:(ref==='gz'?34:21)*scale,centerZ:0};
}
