// Small architectural silhouettes, not measured reconstructions or map geometry.
// Every mesh uses the same local axes; the map supplies the actual POI location.
const C={white:[236,232,215],stone:[199,202,187],dark:[49,60,62],roof:[66,79,76],red:[174,49,39],gold:[218,169,62],glass:[111,168,184],blue:[39,79,128],green:[100,137,88],water:[131,186,191],brick:[185,145,102]};
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
const unit=v=>{const n=Math.hypot(...v)||1;return v.map(x=>x/n);};

function mesh(){
  const triangles=[];
  function face(a,b,c,color,center){
    const normal=cross(sub(b,a),sub(c,a));if(Math.hypot(...normal)<1e-8)return;
    if(center&&dot(normal,a.map((v,i)=>(v+b[i]+c[i])/3-center[i]))<0)[b,c]=[c,b];
    triangles.push({points:[a,b,c],color});
  }
  function box(x,y,z,w,h,d,color){
    const v=[[-1,0,-1],[1,0,-1],[1,1,-1],[-1,1,-1],[-1,0,1],[1,0,1],[1,1,1],[-1,1,1]].map(([a,b,c])=>[x+a*w/2,y+b*h,z+c*d/2]),center=[x,y+h/2,z];
    for(const [a,b,c,d]of [[0,1,2,3],[4,5,6,7],[0,1,5,4],[3,2,6,7],[0,4,7,3],[1,5,6,2]]){face(v[a],v[b],v[c],color,center);face(v[a],v[c],v[d],color,center);}
  }
  function frustum(x,y,z,r,h,top,color,sides=12,stretch=1,turn=0){
    const ring=(radius,level)=>Array.from({length:sides},(_,i)=>{const a=i/sides*Math.PI*2+turn;return [x+Math.cos(a)*radius,level,z+Math.sin(a)*radius*stretch];}),lo=ring(r,y),hi=ring(top,y+h),center=[x,y+h/2,z];
    for(let i=0;i<sides;i++){const n=(i+1)%sides;face(lo[i],hi[i],hi[n],color,center);face(lo[i],hi[n],lo[n],color,center);face([x,y,z],lo[n],lo[i],color,center);face([x,y+h,z],hi[i],hi[n],color,center);}
  }
  function rod(a,b,r,color,sides=6){
    const axis=unit(sub(b,a)),side=unit(cross(axis,Math.abs(axis[1])>.9?[1,0,0]:[0,1,0])),other=cross(axis,side),ring=p=>Array.from({length:sides},(_,i)=>p.map((v,j)=>v+r*(Math.cos(i/sides*Math.PI*2)*side[j]+Math.sin(i/sides*Math.PI*2)*other[j]))),lo=ring(a),hi=ring(b),center=a.map((v,i)=>(v+b[i])/2);
    for(let i=0;i<sides;i++){const n=(i+1)%sides;face(lo[i],hi[i],hi[n],color,center);face(lo[i],hi[n],lo[n],color,center);face(a,lo[n],lo[i],color,center);face(b,hi[i],hi[n],color,center);}
  }
  function sphere(x,y,z,rx,ry,rz,color,sides=14,levels=8){
    const at=(i,j)=>{const a=i/sides*Math.PI*2,b=-Math.PI/2+j/levels*Math.PI;return [x+rx*Math.cos(b)*Math.cos(a),y+ry*Math.sin(b),z+rz*Math.cos(b)*Math.sin(a)];};
    for(let j=0;j<levels;j++)for(let i=0;i<sides;i++){face(at(i,j),at(i+1,j),at(i+1,j+1),color,[x,y,z]);face(at(i,j),at(i+1,j+1),at(i,j+1),color,[x,y,z]);}
  }
  function roof(x,y,z,w,d,h,color=C.roof){
    const lo=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]].map(([a,b])=>[x+a,y,z+b]);
    const hi=[[-w*.23,-d*.06],[w*.23,-d*.06],[w*.23,d*.06],[-w*.23,d*.06]].map(([a,b])=>[x+a,y+h,z+b]),center=[x,y+h*.2,z];
    for(let i=0;i<4;i++){const n=(i+1)%4;face(lo[i],lo[n],hi[n],color,center);face(lo[i],hi[n],hi[i],color,center);}face(hi[0],hi[1],hi[2],color,center);face(hi[0],hi[2],hi[3],color,center);
    box(x,y-.8,z,w,.9,d,color);
  }
  const base=(w=68,d=46,color=C.stone)=>box(0,0,0,w,2,d,color);
  const windows=(x,y,z,w,h,rows=2)=>{for(let row=0;row<rows;row++)for(let col=-2;col<=2;col++)box(x+col*w/6,y+row*h/rows,z,Math.max(1,w/14),Math.max(1.8,h/rows*.42),.35,C.dark);};
  const hall=(x,y,z,w,d,h,roofColor=C.roof,wallColor=C.red)=>{box(x,y,z,w,h,d,wallColor);roof(x,y+h,z,w+6,d+5,6,roofColor);for(let i=-2;i<=2;i++)box(x+i*w/5,y,z+d/2+.3,1,h,1,C.white);};
  const tree=(x,z)=>{rod([x,2,z],[x,8,z],.8,C.brick);frustum(x,6,z,4.5,8,0,C.green,7);};
  return {triangles,face,box,frustum,rod,sphere,roof,base,windows,hall,tree};
}

function pagoda({levels=7,radius=11,step=9,taper=.065,lean=0,eaves=3,wall=C.brick,roof=C.roof,octagon=true}){
  const m=mesh();m.base(40,34);m.frustum(0,2,0,17,3,16,C.white,8);
  for(let i=0;i<levels;i++){
    const r=radius*(1-i*taper),x=lean*i,y=5+i*step;
    m.frustum(x,y,0,r,step-eaves,r*.95,wall,octagon?8:4,1,Math.PI/8);
    m.frustum(x,y+step-eaves,0,r+2,eaves,r*.57,roof,octagon?8:4,1,Math.PI/8);
    m.box(x,y+2,r*.94,2.2,3,.5,C.dark);m.box(x+r*.94,y+2,0,.5,3,2.2,C.dark);
  }
  const top=5+levels*step,x=lean*(levels-1);m.frustum(x,top,0,2.5,7,0,C.gold,8);m.rod([x,top+6,0],[x,top+11,0],.35,C.gold);return m.triangles;
}
function leifeng(){return pagoda({levels:5,radius:16,step:12,taper:.06,eaves:4,wall:[179,92,47],roof:[126,95,67]});}
function baochu(){return pagoda({levels:7,radius:6,step:10,taper:.08,eaves:1.2,wall:[183,145,104],roof:[160,128,87]});}
function tigerHill(){return pagoda({levels:7,radius:12,step:10,taper:.065,lean:.65,eaves:1.5,wall:[182,146,100],roof:[151,122,85]});}
function northTemple(){return pagoda({levels:9,radius:14,step:9,taper:.065,eaves:3,wall:[130,53,34],roof:C.roof});}
function threePools(){
  const m=mesh();m.base(76,61,C.water);
  for(const [x,z]of [[-21,12],[20,12],[0,-17]]){
    m.frustum(x,2,z,7,2,7,C.stone,12);m.frustum(x,4,z,3.5,7,4,C.white,10);m.sphere(x,13,z,5.4,5.6,5.4,C.white);
    m.frustum(x,17,z,6.4,3,2.7,C.stone,10);m.frustum(x,20,z,2.8,6,.6,C.white,8);m.sphere(x,27,z,1.1,1.3,1.1,C.stone,8,5);
    for(const a of [0,Math.PI/2,Math.PI])m.sphere(x+Math.cos(a)*5,13,z+Math.sin(a)*5,1.5,1.5,1.5,C.dark,8,5);
  }return m.triangles;
}
function lingyin(){
  const m=mesh();m.base(82,63);m.box(0,2,3,64,3,45,C.white);m.hall(0,5,-7,45,24,17,[105,95,70],[185,151,84]);m.roof(0,31,-7,38,22,9,C.roof);
  m.hall(-29,3,9,11,28,8,C.roof,[188,153,89]);m.hall(29,3,9,11,28,8,C.roof,[188,153,89]);m.hall(0,3,22,28,9,8,C.roof,[191,154,81]);
  for(const x of [-13,-6,0,6,13])m.box(x,5,5,1.2,17,1.5,C.red);return m.triangles;
}
function suzhouMuseum(){
  const m=mesh();m.base(84,59,C.white);m.box(-22,2,11,28,.6,17,C.water);
  for(const [x,z,w,d,h]of [[0,-10,29,27,18],[-27,-11,20,24,11],[28,-10,21,25,12],[20,16,33,13,9]]){m.box(x,2,z,w,h,d,C.white);m.roof(x,h+2,z,w+1,d+1,7,C.dark);}
  m.frustum(0,22,-10,11,7,3.5,C.glass,8,1,Math.PI/8);m.box(0,2,10,14,11,14,C.glass);m.roof(0,13,10,18,18,7,C.dark);
  for(const x of [-34,-15,14,33])m.box(x,5,-23,.8,7,1.3,C.dark);return m.triangles;
}
function gateEast(){
  const m=mesh();m.base(67,43);
  for(let i=0;i<10;i++){
    const y=2+i*9,offset=22-Math.max(0,i-5)**1.7*.85,w=13+(i>5?i-5:0);
    for(const side of [-1,1]){m.box(side*offset,y,0,w,9,25,C.glass);m.box(side*offset,y+1,12.7,w,.6,.5,C.white);}
  }
  m.box(0,88,0,38,7,25,C.glass);for(const x of [-26,-21,21,26])m.box(x,3,12.8,.5,69,.4,[179,210,214]);return m.triangles;
}
function templeHeaven(){
  const m=mesh();m.base(72,62);for(let i=0;i<3;i++)m.frustum(0,2+i*3,0,30-i*4,3,30-i*4,C.white,24);
  m.frustum(0,11,0,16,16,16,C.red,16);for(let i=0;i<12;i++){const a=i/12*Math.PI*2;m.rod([Math.cos(a)*16,11,Math.sin(a)*16],[Math.cos(a)*16,27,Math.sin(a)*16],.7,C.red);}
  m.frustum(0,31,0,13,6,13,C.red,16);m.frustum(0,41,0,10,6,10,C.red,16);
  for(const [y,r,h]of [[26,25,6],[36,20,6],[46,15,9]]){m.frustum(0,y-.8,0,r,1,r,[25,54,91],24);m.frustum(0,y,0,r,h,r*.28,C.blue,24);}
  m.frustum(0,55,0,3,7,0,C.gold,10);m.sphere(0,62,0,1.6,1.7,1.6,C.gold,8,5);return m.triangles;
}
function palaceMuseum(){
  const m=mesh();m.base(91,69,C.brick);for(let i=0;i<3;i++)m.box(0,2+i*2,0,80-i*11,2,52-i*7,C.white);
  m.hall(0,8,-3,53,24,16,C.gold);m.roof(0,30,-3,45,20,6,C.gold);
  for(const x of [-34,34])m.hall(x,3,7,15,34,9,C.gold);m.hall(0,3,26,34,10,8,C.gold);
  for(let i=0;i<4;i++)m.box(0,2+i*1.5,20-i*2,15,1.5,5,C.white);return m.triangles;
}
function birdsNest(){
  const m=mesh();m.base(90,67);m.frustum(0,2,0,34,3,34,[139,57,48],24,.63);
  const ring=(a,r,y)=>[Math.cos(a)*r,y,Math.sin(a)*r*.66];
  for(let i=0;i<32;i++){
    const a=i/32*Math.PI*2,b=(i+1)/32*Math.PI*2,h=18+4*Math.cos(a*2),next=18+4*Math.cos(b*2);
    m.face(ring(a,41,h),ring(b,41,next),ring(b,28,next-2),C.stone,[0,8,0]);m.face(ring(a,41,h),ring(b,28,next-2),ring(a,28,h-2),C.stone,[0,8,0]);
    m.rod(ring(a,36,3),ring(a+.5,41,h),1.25,C.white,5);m.rod(ring(a+.42,37,4),ring(a-.2,41,h),1,C.stone,5);
    m.rod(ring(a,41,h),ring(b,41,next),1.1,C.white,5);m.rod(ring(a,39,11),ring(a+.6,40,15),1,C.white,5);
  }return m.triangles;
}
function orientalPearl(){
  const m=mesh();m.base(56,44);for(const a of [0,2.1,4.2])m.rod([Math.cos(a)*19,2,Math.sin(a)*19],[0,44,0],2.2,C.white,8);
  m.rod([0,3,0],[0,101,0],2.7,C.white,10);m.sphere(0,43,0,15,13,15,[185,74,104]);m.sphere(0,82,0,10,9,10,[194,83,109]);
  for(const y of [40,44,79,83])m.frustum(0,y,0,y<60?14.7:9.7,1,y<60?14.7:9.7,C.glass,20);
  m.frustum(0,99,0,3,4,2,C.white);m.rod([0,103,0],[0,119,0],.7,C.white);return m.triangles;
}
function shanghaiTower(){
  const m=mesh();m.base(45,37);const rings=Array.from({length:13},(_,j)=>Array.from({length:16},(_,i)=>{const t=j/12,a=i/16*Math.PI*2+t*1.9,r=14-7*t;return [Math.cos(a)*r+t*2,3+110*t,Math.sin(a)*r*.76];}));
  for(let j=0;j<12;j++)for(let i=0;i<16;i++){const n=(i+1)%16,center=[0,57,0],color=i%4===0?[167,205,214]:C.glass;m.face(rings[j][i],rings[j+1][i],rings[j+1][n],color,center);m.face(rings[j][i],rings[j+1][n],rings[j][n],color,center);if(i%4===0)m.rod(rings[j][i],rings[j+1][i],.32,C.white,4);}
  for(let i=0;i<16;i++)m.face([2,115,0],rings[12][i],rings[12][(i+1)%16],C.white,[2,112,0]);return m.triangles;
}
function customsHouse(){
  const m=mesh();m.base(74,46);m.box(0,2,0,61,24,32,C.white);m.box(0,26,0,64,2,34,C.stone);m.windows(0,7,16.2,53,17,3);
  m.box(0,28,0,19,27,20,C.white);m.box(0,43,0,21,2,22,C.stone);m.roof(0,55,0,24,24,8,C.roof);m.rod([0,63,0],[0,71,0],.65,C.gold);
  m.sphere(0,49,10.4,5,5,.5,C.dark);m.rod([0,49,11],[0,52.7,11],.35,C.white,4);m.rod([0,49,11],[3,48.5,11],.35,C.white,4);
  for(const x of [-26,-17,17,26])m.box(x,3,16.6,1.5,21,1.5,C.stone);return m.triangles;
}
function chinaArt(){
  const m=mesh();m.base(83,62);m.box(0,2,0,65,3,41,C.white);for(const x of [-18,18])for(const z of [-12,12])m.box(x,5,z,10,20,10,C.red);
  for(let i=0;i<6;i++){const w=39+i*7;m.box(0,23+i*4,0,w,3.5,29+i*4,C.red);m.box(0,23+i*4,15+i*2,w,1,1,[125,34,32]);}
  m.box(0,47,0,77,2,52,[143,38,32]);return m.triangles;
}
function pandaTower(){
  const m=mesh();m.base(44,37);for(const x of [-9,9])m.rod([x,2,0],[0,39,0],1.8,C.white,6);m.rod([0,3,0],[0,89,0],3.1,C.white,12);
  m.frustum(0,63,0,7,5,16,C.stone,20);m.frustum(0,68,0,16,6,16,C.glass,20);m.frustum(0,74,0,17,4,8,C.white,20);m.frustum(0,78,0,8,6,3,C.white,16);
  m.rod([0,88,0],[0,113,0],.8,C.red,6);m.frustum(0,88,0,5,2,5,C.white,12);return m.triangles;
}
function anshunBridge(){
  const m=mesh();m.base(96,49,C.water);m.box(0,10,0,86,4,19,C.white);
  for(const x of [-34,-15,15,34])m.box(x,2,0,5,8,16,C.stone);
  for(const x of [-30,-20,-10,0,10,20,30])for(const z of [-8,8])m.rod([x,14,z],[x,24,z],.9,C.red,6);
  m.roof(0,24,0,90,25,7,C.roof);m.hall(0,26,0,19,17,8,C.roof,[155,89,55]);
  for(const z of [-11,11])m.box(0,14,z,83,2,1.5,C.red);return m.triangles;
}
function wangjiangTower(){
  const m=mesh();m.base(55,44);m.box(0,2,0,35,3,28,C.white);
  for(const [y,w,d,h]of [[5,28,25,13],[24,24,22,10]]){m.hall(0,y,0,w,d,h,C.roof,[150,68,43]);}
  m.frustum(0,39,0,10,10,9,C.red,8);m.frustum(0,49,0,15,6,7,C.roof,8);m.frustum(0,55,0,6.5,8,6,C.red,8);m.frustum(0,63,0,11,6,2,C.roof,8);m.rod([0,69,0],[0,76,0],.6,C.gold);return m.triangles;
}
function wenshu(){
  const m=mesh();m.base(82,65,C.green);m.box(0,2,2,66,2,53,C.stone);m.hall(0,4,-14,45,22,15,C.roof,[180,130,65]);m.roof(0,25,-14,36,18,7,C.roof);
  m.hall(-27,4,7,11,28,8,C.roof,C.red);m.hall(27,4,7,11,28,8,C.roof,C.red);m.hall(0,4,25,28,10,9,C.roof,C.red);
  m.frustum(0,4,6,5,3,5,C.stone,8);m.frustum(0,7,6,3,8,2,C.dark,8);m.frustum(0,15,6,5,3,0,C.roof,8);return m.triangles;
}
function potala(){
  const m=mesh();m.base(101,58,[172,164,139]);
  for(const [x,y,z,w,h,d]of [[0,2,4,94,7,43],[-26,9,4,37,18,32],[27,9,3,36,22,33],[-21,27,0,30,13,24],[24,31,-1,31,12,26],[0,9,-8,38,47,32]])m.box(x,y,z,w,h,d,C.white);
  m.box(0,30,-7,40,28,31,[141,45,37]);m.box(-7,56,-8,29,10,23,[137,40,33]);
  for(const [x,y,z,w,h]of [[-27,14,20.3,32,21],[27,14,19.8,30,25],[0,34,8.8,35,20]])m.windows(x,y,z,w,h,4);
  for(const [x,y,z]of [[-10,66,-7],[10,58,-5],[-25,40,-1],[26,43,0]]){m.box(x,y,z,12,2,9,C.gold);m.roof(x,y+2,z,15,12,5,C.gold);}
  for(let i=0;i<6;i++)m.box(-38+i*2.5,2+i*2,23-i*1.5,13,2,4,C.white);return m.triangles;
}
function jokhang(){
  const m=mesh();m.base(79,61,C.stone);m.box(0,2,0,68,15,47,C.white);m.box(0,14,0,69,3,48,[98,47,38]);m.box(0,17,-5,38,15,26,C.white);m.box(0,28,-5,40,4,28,[116,44,32]);
  m.roof(0,32,-5,44,32,8,C.gold);m.roof(-25,17,8,18,23,5,C.gold);m.roof(25,17,8,18,23,5,C.gold);
  m.box(0,2,24,14,12,1,C.dark);m.windows(0,6,24.2,60,7,1);m.sphere(0,44,-4,3,3,.65,C.gold,12,8);m.rod([0,39,-4],[0,47,-4],.5,C.gold);return m.triangles;
}
function norbulingka(){
  const m=mesh();m.base(87,66,C.green);m.box(0,2,0,63,3,43,C.stone);m.box(0,5,-5,45,16,25,C.white);m.box(0,18,-5,47,4,27,[130,55,37]);m.roof(0,22,-5,52,30,7,C.gold);
  m.box(-20,5,15,15,9,16,[226,188,112]);m.roof(-20,14,15,19,20,4,C.roof);m.box(20,5,15,15,9,16,[226,188,112]);m.roof(20,14,15,19,20,4,C.roof);
  m.windows(0,8,7.8,41,9,1);for(const x of [-34,34])for(const z of [-20,18])m.tree(x,z);m.box(0,2,24,9,.8,16,C.white);return m.triangles;
}
function tashilhunpo(){
  const m=mesh();m.base(97,63,C.stone);m.box(0,2,2,89,8,48,C.white);
  for(const [x,z,w,h]of [[-28,-7,22,29],[0,-12,26,39],[28,-6,23,26]]){
    m.box(x,10,z,w,h,25,[151,48,35]);m.box(x,10,z+13,w,7,1.5,C.white);m.box(x,10+h,z,w+1,3,26,C.gold);m.roof(x,13+h,z,w+6,30,8,C.gold);m.windows(x,20,z+12.8,w-2,h-12,3);
  }
  m.hall(-30,10,22,24,11,7,C.gold,C.white);m.hall(28,10,22,23,11,7,C.gold,C.white);return m.triangles;
}

function pinganFinance(){
  // Faceted taper and pale structural ribs distinguish Ping An's pointed crown.
  const m=mesh(),silver=[205,214,209],glass=[109,147,157],turn=Math.PI/8;m.base(43,36);
  m.box(0,2,0,32,4,27,silver);m.frustum(0,6,0,16,82,12.7,glass,8,1,turn);m.frustum(0,88,0,12.7,28,.65,glass,8,1,turn);
  for(let i=0;i<8;i++){
    const a=i/8*Math.PI*2+turn,at=(r,y)=>[Math.cos(a)*r,y,Math.sin(a)*r];
    m.rod(at(16.2,6),at(12.9,88),.75,silver,4);m.rod(at(12.9,88),at(.65,116),.5,silver,4);
  }
  for(let y=14;y<88;y+=8){
    const r=16-(y-6)/82*3.3+.15,at=i=>[Math.cos(i/8*Math.PI*2+turn)*r,y,Math.sin(i/8*Math.PI*2+turn)*r];
    for(let i=0;i<8;i++)m.rod(at(i),at(i+1),.22,silver,4);
  }
  return m.triangles;
}
function kk100(){
  // An oval glass shaft closes in a curved, slightly offset crown, without a spire.
  const m=mesh(),sides=16,levels=12;m.base(43,35);m.box(0,2,0,31,4,24,C.white);
  const rings=Array.from({length:levels+1},(_,j)=>{const t=j/levels,crown=Math.max(0,(t-.76)/.24),r=(14-2*t)*Math.sqrt(Math.max(0,1-crown*crown));return Array.from({length:sides},(_,i)=>{const a=i/sides*Math.PI*2;return [-3*t*t+Math.cos(a)*r,6+108*t,Math.sin(a)*r*.63];});});
  for(let j=0;j<levels;j++)for(let i=0;i<sides;i++){
    const n=(i+1)%sides,color=i%4===0?[134,185,199]:[65,122,150];m.face(rings[j][i],rings[j+1][i],rings[j+1][n],color,[0,55,0]);m.face(rings[j][i],rings[j+1][n],rings[j][n],color,[0,55,0]);
    if(i%4===0)m.rod(rings[j][i],rings[j+1][i],.36,C.white,4);
    if(j>0&&j<10)m.rod(rings[j][i],rings[j][n],.22,[178,208,215],4);
  }
  return m.triangles;
}
function diwang(){
  // Green rectangular tower, recessed shoulders and two separate rooftop needles.
  const m=mesh(),glass=[80,148,132],trim=[209,212,181];m.base(47,38);m.box(0,2,0,37,7,29,C.stone);
  m.box(0,9,0,26,76,20,glass);m.box(0,85,0,21,7,17,glass);m.box(0,92,0,13,7,12,trim);
  for(const x of [-12,-6,6,12])m.box(x,9,10.2,.7,75,.5,trim);
  for(let y=16;y<86;y+=7){m.box(0,y,10.4,26,.7,.45,trim);m.box(13.2,y,0,.45,.7,20,trim);}
  for(const x of [-8,8]){m.frustum(x,87,0,4,12,4,trim,12);m.frustum(x,99,0,4,5,1.5,C.glass,12);m.rod([x,103,0],[x,122,0],.55,trim,6);}
  m.windows(0,4,14.8,32,5,1);return m.triangles;
}
function civicCenter(){
  // Broad blue-grey wing canopy, with the contrasting red and yellow end volumes.
  const m=mesh(),canopy=[118,158,179];m.base(111,61);m.box(0,2,3,94,3,43,C.white);m.box(0,5,-2,88,15,27,[180,196,199]);
  m.windows(0,8,11.8,83,10,2);m.box(0,5,12,23,16,1,C.glass);
  m.frustum(-33,5,0,8,26,8,[183,63,51],16);m.box(32,5,0,16,26,17,[216,174,59]);
  const section=x=>{const y=23+12*Math.pow(Math.abs(x)/54,1.7),depth=19+4*(1-Math.abs(x)/54);return [[x,y,-depth],[x,y,depth]];};
  for(let x=-54;x<54;x+=9){
    const [a,b]=section(x),[c,d]=section(x+9),lower=p=>[p[0],p[1]-1.8,p[2]];
    m.face(a,b,d,canopy,[x,10,0]);m.face(a,d,c,canopy,[x,10,0]);m.face(lower(a),lower(d),lower(b),C.roof,[x,40,0]);m.face(lower(a),lower(c),lower(d),C.roof,[x,40,0]);
    m.face(b,lower(b),lower(d),C.white,[x,0,0]);m.face(b,lower(d),d,C.white,[x,0,0]);m.rod(a,b,.28,C.white,4);
  }
  for(const x of [-47,-20,20,47])m.rod([x,5,-10],[x,25,-10],.7,C.white,6);
  for(const x of [-38,-19,0,19,38])m.box(x,2,25,12,.6,8,[187,200,184]);return m.triangles;
}
function chinaResourcesTower(){
  // The rounded bamboo-shoot envelope has a visible diagonal structural lattice.
  const m=mesh(),sides=16,profile=[[4,11],[19,14],[38,14.2],[59,12.2],[80,9.1],[99,5.3],[114,.55]];m.base(44,37);
  const rings=profile.map(([y,r])=>Array.from({length:sides},(_,i)=>{const a=i/sides*Math.PI*2;return [Math.cos(a)*r,y,Math.sin(a)*r];}));
  for(let j=0;j<rings.length-1;j++)for(let i=0;i<sides;i++){
    const n=(i+1)%sides,color=i%4===0?[157,188,194]:[94,139,153];m.face(rings[j][i],rings[j+1][i],rings[j+1][n],color,[0,53,0]);m.face(rings[j][i],rings[j+1][n],rings[j][n],color,[0,53,0]);
    m.rod(rings[j][i],rings[j+1][n],.29,C.white,4);m.rod(rings[j][n],rings[j+1][i],.29,C.white,4);
  }
  m.frustum(0,2,0,16,2,15,C.white,16);m.frustum(0,114,0,.55,1,0,C.white,8);return m.triangles;
}
function bayCulture(){
  // Paired pale boulders with overhangs and dark entry recesses, not the Bay stadium.
  const m=mesh(),stone=[221,220,210];m.base(105,63);m.box(0,2,2,94,3,49,[202,205,195]);
  for(const [x,z,scale,flip]of [[-25,-2,1,1],[25,3,.86,-1]]){
    m.box(x,5,z,23,12,24,C.glass);
    const profile=[[11,11],[17,19],[29,21],[39,17],[43,8]],sides=16;
    const rings=profile.map(([y,r])=>Array.from({length:sides},(_,i)=>{const a=i/sides*Math.PI*2,round=v=>Math.sign(v)*Math.pow(Math.abs(v),.65);return [x+flip*(y-11)*.14+round(Math.cos(a))*r*scale,5+(y-5)*scale,z+round(Math.sin(a))*r*scale*.83];}));
    for(let j=0;j<rings.length-1;j++)for(let i=0;i<sides;i++){const n=(i+1)%sides,color=j===0?[188,191,184]:stone;m.face(rings[j][i],rings[j+1][i],rings[j+1][n],color,[x,25,z]);m.face(rings[j][i],rings[j+1][n],rings[j][n],color,[x,25,z]);}
    const top=rings.at(-1),center=[x+flip*32*.14,5+38*scale,z];for(let i=0;i<sides;i++)m.face(center,top[i],top[(i+1)%sides],stone,[x,22,z]);
    m.box(x,6,z+12*scale,15*scale,7*scale,.8,C.dark);m.box(x,14*scale,z+13*scale,20*scale,1.4,5,stone);
    for(let step=0;step<3;step++)m.box(x,2+step,z+23-step*2,22,1,5,C.white);
  }
  m.box(0,5,-13,16,5,10,[201,207,200]);for(const x of [-46,46])m.tree(x,-23);return m.triangles;
}

function sunResidence(){
  // Cuiheng's two-storey residence: red Western-style arched verandas,
  // pale brickwork, a pitched roof and its enclosed forecourt.
  const m=mesh(),red=[165,57,42],brick=[195,194,170];m.base(73,58,C.stone);
  m.box(0,2,-7,42,25,25,brick);m.roof(0,27,-7,47,29,5,[92,105,88]);
  for(const y of [3,15]){
    m.box(0,y,8,45,1.2,7,C.white);m.box(0,y+10,10,45,1.1,1.3,C.white);
    for(let column=-3;column<=3;column++)m.box(column*6.6,y,10,1.2,10,1.3,red);
    for(let bay=-3;bay<3;bay++){
      const cx=(bay+.5)*6.6;
      for(let segment=0;segment<6;segment++){
        const a=segment/6*Math.PI,b=(segment+1)/6*Math.PI;
        m.rod([cx+Math.cos(a)*2.7,y+6.5+Math.sin(a)*2.6,10],[cx+Math.cos(b)*2.7,y+6.5+Math.sin(b)*2.6,10],.7,red,5);
      }
    }
  }
  m.box(0,16,5,43,1.2,1,C.white);m.frustum(0,29,9,2.5,1,2.5,C.gold,12,.3);
  for(const x of [-13,0,13])m.box(x,7,-19.7,3,5,.4,C.dark);
  for(const x of [-31,31])m.box(x,2,8,1.6,6,42,C.white);
  for(const x of [-19,19])m.box(x,2,28,22,6,1.6,C.white);
  m.box(0,2,28,14,1.3,4,C.stone);m.tree(-24,14);m.frustum(23,2,16,4,4,4,C.stone,12);
  return m.triangles;
}
function zhongshanMemorial(){
  // Shiqi's memorial hall has a three-pavilion "mountain" facade:
  // one taller octagonal pavilion and two lower square pavilions.
  const m=mesh(),roof=[47,93,84],wall=[215,202,170];m.base(98,66,C.stone);
  for(let step=0;step<4;step++)m.box(0,2+step*1.4,22-step*2,74-step*5,1.4,9,C.white);
  m.box(0,7,-3,78,18,29,wall);m.box(0,25,-3,82,1.5,32,C.white);
  m.windows(0,11,11.8,69,12,2);m.box(0,7,12,12,10,1,C.dark);m.box(0,20,12,16,3,1,C.gold);
  for(const x of [-28,28]){
    m.box(x,26,-3,17,8,18,wall);m.windows(x,28,6.2,14,6,1);
    m.roof(x,34,-3,25,25,7,roof);m.rod([x,41,-3],[x,44,-3],.5,C.gold);
  }
  m.frustum(0,26,-3,12,15,12,wall,8,1,Math.PI/8);
  m.frustum(0,41,-3,18,7,5,roof,8,1,Math.PI/8);m.frustum(0,48,-3,5,4,0,C.gold,8);
  for(const x of [-35,-17,17,35])m.box(x,7,12,1.3,18,1.4,C.white);
  m.box(0,7,-24,57,17,19,[173,177,158]);m.roof(0,24,-24,61,22,4,roof);
  return m.triangles;
}
function zhanGarden(){
  // Lingnan garden silhouette: grey tiled halls, covered corridors and
  // a small pale bridge crossing a water courtyard, rather than a tower.
  const m=mesh(),wall=[226,220,199],roof=[73,82,79];m.base(94,70,C.green);
  m.box(15,2,6,39,1,35,C.water);m.hall(-24,2,-8,28,24,15,roof,wall);
  m.hall(12,2,-22,44,13,10,roof,wall);m.hall(35,2,-4,12,27,8,roof,wall);
  m.hall(-29,2,24,19,13,8,roof,wall);m.roof(-24,22,-8,22,21,5,roof);
  m.box(11,8,6,27,1.5,7,C.white);
  for(const x of [0,7,14,21])for(const z of [2,10]){m.box(x,9.5,z,.8,3,.8,C.white);if(x<21)m.rod([x,12,z],[x+7,12,z],.45,C.white,5);}
  for(const x of [5,23])m.box(x,3,6,2,5,5,C.stone);
  m.frustum(18,3,24,6.5,9,6.5,wall,6);m.frustum(18,12,24,10,5,2.5,roof,6);
  for(const x of [-13,0,13])m.box(x,2,30,9,7,1.5,wall);
  m.roof(0,9,30,38,8,5,roof);m.tree(-40,12);m.tree(39,-27);m.tree(-8,20);
  return m.triangles;
}
function zhongshanSkywheel(){
  // Xingzhong Plaza's rooftop wheel keeps its open spokes and capsules.
  const m=mesh(),rim=[227,228,219],blue=[85,139,162],center=[0,57,0],r=29;m.base(80,52);
  m.box(0,2,0,64,14,38,[212,194,158]);m.box(0,16,0,68,2,41,C.white);m.windows(0,5,19.3,55,9,2);
  for(const x of [-20,20])for(const z of [-8,8])m.rod([x,18,z],[0,57,z*.3],1.3,blue,6);
  for(let index=0;index<32;index++){
    const a=index/32*Math.PI*2,b=(index+1)/32*Math.PI*2;
    for(const z of [-3,3])m.rod([Math.cos(a)*r,center[1]+Math.sin(a)*r,z],[Math.cos(b)*r,center[1]+Math.sin(b)*r,z],.8,rim,6);
    if(index%2===0)m.rod(center,[Math.cos(a)*r,center[1]+Math.sin(a)*r,0],.4,C.gold,5);
    if(index%4===0){const x=Math.cos(a)*(r+1),y=center[1]+Math.sin(a)*(r+1);m.box(x,y-3,0,5,5,6,blue);m.box(x,y+2,0,5.6,.8,6.5,C.red);}
  }
  m.sphere(0,57,0,3,3,4,C.gold,10,6);return m.triangles;
}

function foshanTemple(){
  // Axial grey-tiled halls, a courtyard pool and colorful ceramic ridge figures.
  const m=mesh(),wall=[183,175,151],tile=[61,82,72];m.base(96,68,C.stone);
  m.hall(0,3,-15,47,26,15,tile,wall);m.hall(-32,3,3,13,35,10,tile,wall);m.hall(32,3,3,13,35,10,tile,wall);
  m.hall(0,3,25,37,12,10,tile,wall);m.box(0,3,5,19,.6,14,C.water);
  for(const [z,y,w]of [[-15,24,34],[25,19,25]]){
    m.box(0,y,z,w,1.4,2.2,[93,125,86]);
    for(let x=-w/2+2;x<w/2;x+=4){m.frustum(x,y+1.4,z,1,3,.8,x%3?C.red:C.gold,6);m.sphere(x,y+4.7,z,1.2,1.1,1.2,C.white,8,5);}
    for(const side of [-1,1])m.rod([side*w/2,y,z],[side*(w/2+4),y+4,z],.9,C.gold,6);
  }
  for(const x of [-12,-6,0,6,12])m.box(x,3,-1.5,1,15,1,C.red);
  for(const x of [-39,39])m.tree(x,-25);return m.triangles;
}
function foshanKiln(){
  // The long brick dragon kiln rises with the hillside under a sloping tiled shed.
  const m=mesh(),brick=[166,117,77],tile=[77,78,69],level=x=>3+(x+40)*.25;m.base(100,54,C.stone);
  const arch=(x,index)=>{const a=index/10*Math.PI;return [x,level(x)+Math.sin(a)*8,Math.cos(a)*8];};
  for(let x=-40;x<40;x+=8){
    m.box(x+4,2,0,8,level(x+8)-2,17,brick);
    for(let i=0;i<10;i++){const a=arch(x,i),b=arch(x+8,i),c=arch(x+8,i+1),d=arch(x,i+1),center=[x+4,level(x+4),0];m.face(a,b,c,brick,center);m.face(a,c,d,brick,center);}
    m.box(x+3,level(x+3)+2,8.3,3,3,.4,C.dark);
  }
  m.box(-40.4,3,0,.7,6,10,C.dark);
  for(let x=-44;x<44;x+=8){
    const section=value=>[[value,level(value)+11,-14],[value,level(value)+17,0],[value,level(value)+11,14]],a=section(x),b=section(x+8),center=[x+4,level(x+4),0];
    for(let i=0;i<2;i++){m.face(a[i],b[i],b[i+1],tile,center);m.face(a[i],b[i+1],a[i+1],tile,center);}
    for(const z of [-13,13])m.rod([x,2,z],[x,level(x)+11,z],.8,[112,96,72],6);
    for(let step=0;step<2;step++)m.box(x+step*4,2,20,4,level(x+step*4)-1,7,C.stone);
  }
  m.hall(-33,2,-21,22,11,6,tile,C.white);m.tree(42,-19);return m.triangles;
}
function foshanQinghui(){
  // A two-storey boat hall faces a rectangular pond, with grey-tiled garden pavilions.
  const m=mesh(),wall=[225,218,191],tile=[76,85,80];m.base(88,68,C.green);
  m.box(-9,2,10,44,.7,29,C.water);m.box(18,2,-6,25,3,34,C.stone);
  m.face([5.5,5,11],[30.5,5,11],[18,5,18],C.stone,[18,1,11]);
  m.hall(18,5,-7,22,24,10,tile,wall);m.hall(18,21,-13,18,17,9,tile,wall);
  m.windows(18,9,5.3,20,6,1);m.windows(18,23,-4.3,16,5,1);
  for(const x of [9,15,21,27])m.box(x,9,5.6,2.5,4,.4,[151,178,138]);
  m.hall(-25,2,-19,23,14,10,tile,wall);m.hall(-35,2,7,9,29,7,tile,wall);
  m.frustum(-15,3,27,6,8,6,wall,6);m.frustum(-15,11,27,10,5,2,tile,6);
  m.box(-8,4,10,33,1.3,5,C.white);
  for(const x of [-21,-14,-7,0,7])for(const z of [7,13]){m.box(x,5.3,z,.7,2.5,.7,C.white);if(x<7)m.rod([x,7.8,z],[x+7,7.8,z],.35,C.white,5);}
  m.tree(-37,-27);m.tree(36,23);m.box(0,2,-31,62,6,1.5,wall);return m.triangles;
}
function zhuhaiTheater(){
  // Upright white sun-and-moon shells retain their unequal size and fan-like ribs.
  const m=mesh(),shell=[238,238,222],rib=[205,212,206];m.base(105,66,C.water);m.box(0,2,0,94,1.3,54,C.stone);
  for(const [x,y,z,rx,ry,rz]of [[-20,36,-9,23,32,8],[27,26,11,16,22,6]]){
    m.box(x,3,z,rx*1.4,8,rz*2.4,C.glass);m.sphere(x,y,z,rx,ry,rz,shell,24,16);
    for(let i=1;i<12;i++){
      const a=i/12*Math.PI,ex=rx*Math.cos(a),ey=ry*Math.sin(a),at=t=>{const vx=ex*t,vy=-ry+(ey+ry)*t;return [x+vx,y+vy,z+rz*Math.sqrt(Math.max(0,1-(vx/rx)**2-(vy/ry)**2))+.16];};
      for(let segment=1;segment<8;segment++)m.rod(at(segment/8),at((segment+1)/8),.19,rib,4);
    }
  }
  m.box(0,3,23,71,.7,10,C.white);return m.triangles;
}
function zhuhaiYuanming(){
  // Golden-roofed royal halls, red colonnades and the garden's broad lake court.
  const m=mesh();m.base(104,78,C.green);m.box(0,2,-8,86,2,49,C.white);m.box(0,2,24,49,.7,23,C.water);
  m.hall(0,5,-15,47,25,16,C.gold,C.red);m.roof(0,31,-15,40,21,6,C.gold);
  for(const x of [-34,34])m.hall(x,4,0,14,34,9,C.gold,C.red);
  for(const x of [-18,-9,0,9,18])m.box(x,5,-1.8,1.3,16,1.5,C.white);
  for(let step=0;step<4;step++)m.box(0,2+step*.75,15-step*2,17,1,6,C.white);
  for(const x of [-24,24])for(const z of [11,18,25,32]){m.box(x,3,z,.8,3,.8,C.white);if(z<32)m.rod([x,6,z],[x,6,z+7],.4,C.white,5);}
  m.box(0,3,24,8,1,24,C.white);for(const x of [-44,44])m.tree(x,-28);return m.triangles;
}
function zhuhaiLighthouse(){
  // The coastal lighthouse is distinct from the neighboring Love Post Office POI.
  const m=mesh(),blue=[51,101,132];m.base(66,50,C.water);m.box(0,2,6,17,1.4,39,C.stone);
  m.frustum(0,3,0,10,3,9,C.white,20);m.frustum(0,6,0,9,40,6.7,C.white,20);
  for(const y of [18,32]){const r=9-(y-6)/40*2.3;m.frustum(0,y,0,r+.15,3,r-.02,blue,20);}
  m.box(0,6,8.8,3.7,8,.5,C.dark);m.frustum(0,46,0,10,2,10,C.white,20);m.frustum(0,48,0,6.5,9,6.5,C.glass,16);
  for(let i=0;i<8;i++){const a=i/8*Math.PI*2;m.rod([Math.cos(a)*6.6,48,Math.sin(a)*6.6],[Math.cos(a)*6.6,57,Math.sin(a)*6.6],.35,C.white,5);m.rod([Math.cos(a)*9.5,48,Math.sin(a)*9.5],[Math.cos(a)*9.5,51,Math.sin(a)*9.5],.35,C.white,5);}
  m.frustum(0,57,0,10,6,.8,blue,20);m.rod([0,63,0],[0,68,0],.55,C.white,6);
  for(const x of [-24,22])m.frustum(x,2,-9,5,4,3,C.stone,7);return m.triangles;
}

const factories=Object.freeze({
  'foshan-ancestral-temple':foshanTemple,'foshan-nanfeng-kiln':foshanKiln,'foshan-qinghui-garden':foshanQinghui,
  'zhuhai-grand-theatre':zhuhaiTheater,'zhuhai-new-yuanming-palace':zhuhaiYuanming,'zhuhai-love-post-lighthouse':zhuhaiLighthouse,
  'zhongshan-sun-residence':sunResidence,'zhongshan-memorial-hall':zhongshanMemorial,
  'zhongshan-zhan-garden':zhanGarden,'zhongshan-skywheel':zhongshanSkywheel,
  'hz-leifeng-tower':leifeng,'hz-baochu-pagoda':baochu,'hz-three-pools':threePools,'hz-lingyin-temple':lingyin,
  'sz-tiger-hill':tigerHill,'sz-museum':suzhouMuseum,'sz-north-temple-pagoda':northTemple,'sz-gate-east':gateEast,
  'bj-temple-heaven':templeHeaven,'bj-palace-museum':palaceMuseum,'bj-birds-nest':birdsNest,
  'sh-oriental-pearl':orientalPearl,'sh-shanghai-tower':shanghaiTower,'sh-customs-house':customsHouse,'sh-china-art-museum':chinaArt,
  'cd-panda-tower':pandaTower,'cd-anshun-bridge':anshunBridge,'cd-wangjiang-tower':wangjiangTower,'cd-wenshu-monastery':wenshu,
  'xz-potala-palace':potala,'xz-jokhang-temple':jokhang,'xz-norbulingka':norbulingka,'xz-tashilhunpo':tashilhunpo,
  'shenzhen-pingan-finance':pinganFinance,'shenzhen-kk100':kk100,'shenzhen-diwang':diwang,
  'shenzhen-civic-center':civicCenter,'shenzhen-china-resources-tower':chinaResourcesTower,'shenzhen-bay-culture':bayCulture,
});
export const landmarkModelKeys=Object.freeze(Object.keys(factories));
export function hasLandmarkGeometry(key){return Object.hasOwn(factories,key);}
export function buildLandmarkGeometry(key){return hasLandmarkGeometry(key)?factories[key]():null;}
