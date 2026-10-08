import {makeSouvenir} from './souvenir-mesh.js';
import {places as planningPlaces} from './travel-catalog.js';
import {getExplorationLandmark} from './travel-map-exploration.js';
import {buildLandmarkGeometry,hasLandmarkGeometry} from './travel-landmark-geometry.js';

// Dedicated miniature architecture and ordinary pins share verified POI positions.
// A static orthographic triangle renderer avoids a WebGL context for every marker.
const WIDTH=128,HEIGHT=124;
const geometryCache=new Map();
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const subtract=(a,b)=>a.map((value,index)=>value-b[index]);
const dot=(a,b)=>a.reduce((sum,value,index)=>sum+value*b[index],0);
const unit=vector=>{const length=Math.hypot(...vector)||1;return vector.map(value=>value/length);};
const palette={stone:[222,225,220],dark:[43,48,55],red:[162,43,47],glass:[116,168,184],silver:[208,221,224],green:[122,154,102],sand:[206,187,147]};

function builder(){
  const triangles=[];
  const tri=(a,b,c,color)=>triangles.push({points:[a,b,c],color});
  function box(x,y,z,width,height,depth,color){
    const vertices=[[x-width/2,y,z-depth/2],[x+width/2,y,z-depth/2],[x+width/2,y+height,z-depth/2],[x-width/2,y+height,z-depth/2],[x-width/2,y,z+depth/2],[x+width/2,y,z+depth/2],[x+width/2,y+height,z+depth/2],[x-width/2,y+height,z+depth/2]];
    for(const [a,b,c,d] of [[0,3,2,1],[4,5,6,7],[0,1,5,4],[3,7,6,2],[0,4,7,3],[1,2,6,5]]){tri(vertices[a],vertices[b],vertices[c],color);tri(vertices[a],vertices[c],vertices[d],color);}
  }
  function rod(a,b,radius,color,sides=6){
    const direction=unit(subtract(b,a)),side=unit(cross(direction,Math.abs(direction[1])>.9?[1,0,0]:[0,1,0])),other=cross(direction,side);
    const ring=point=>Array.from({length:sides},(_,index)=>{const angle=index/sides*Math.PI*2;return point.map((value,axis)=>value+radius*(Math.cos(angle)*side[axis]+Math.sin(angle)*other[axis]));});
    const lower=ring(a),upper=ring(b);
    for(let index=0;index<sides;index++){const next=(index+1)%sides;tri(lower[index],lower[next],upper[next],color);tri(lower[index],upper[next],upper[index],color);tri(a,lower[next],lower[index],color);tri(b,upper[index],upper[next],color);}
  }
  function pebble(x,z,width,height,depth,color){
    const sides=8,center=[x,height*.42,z],rings=[0,1].map(level=>Array.from({length:sides},(_,index)=>{const angle=index/sides*Math.PI*2;return [x+Math.cos(angle)*width*(level ? .46 : .39),3+(level?height*(.52+.09*Math.sin(angle)):0),z+Math.sin(angle)*depth*(level ? .43 : .34)];})),top=[x-width*.14,height+3,z-depth*.1];
    function face(a,b,c,tone){const normal=cross(subtract(b,a),subtract(c,a)),middle=a.map((value,axis)=>(value+b[axis]+c[axis])/3-center[axis]);if(dot(normal,middle)<0)tri(a,c,b,tone);else tri(a,b,c,tone);}
    for(let index=0;index<sides;index++){const next=(index+1)%sides,tone=index%3===0?color.map(value=>Math.min(255,value+13)):color;face(rings[0][index],rings[0][next],rings[1][next],tone);face(rings[0][index],rings[1][next],rings[1][index],tone);face(rings[1][index],rings[1][next],top,tone);}
  }
  function roof(x,y,z,width,height,depth,color){
    const vertices=[[x-width/2,y,z-depth/2],[x+width/2,y,z-depth/2],[x,y+height,z-depth/2],[x-width/2,y,z+depth/2],[x+width/2,y,z+depth/2],[x,y+height,z+depth/2]];
    tri(vertices[0],vertices[2],vertices[1],color);tri(vertices[3],vertices[4],vertices[5],color);
    for(const [a,b,c,d]of [[0,1,4,3],[1,2,5,4],[2,0,3,5]]){tri(vertices[a],vertices[b],vertices[c],color);tri(vertices[a],vertices[c],vertices[d],color);}
  }
  return {tri,box,rod,pebble,roof,triangles};
}

function museum(){
  const shape=builder();shape.box(0,0,0,66,3,43,palette.stone);shape.box(0,3,0,60,1,36,palette.sand);
  for(const x of [-18,18])shape.box(x,4,0,5,11,18,palette.dark);
  shape.box(0,14,0,52,25,31,palette.dark);shape.box(0,39,0,53,1.5,32,palette.red);
  for(const [x,y,width,height] of [[-22,24,6,14],[-13,16,8,16],[-2,20,9,12],[10,28,12,10],[22,16,5,16]])shape.box(x,y,16,width,height,2.4,palette.red);
  shape.box(26.3,20,-7,2,18,12,palette.red);shape.box(26.3,15,9,2,13,7,palette.red);
  return shape.triangles;
}

function tower(){
  const shape=builder();shape.box(0,0,0,42,2,36,palette.stone);shape.box(0,2,0,31,1.5,26,palette.green);
  const levels=12,sides=18,rings=Array.from({length:levels+1},(_,level)=>{const t=level/levels,radius=3.7+18*(t-.47)**2;return Array.from({length:sides},(_,index)=>{const angle=index/sides*Math.PI*2+t*.9;return [Math.cos(angle)*radius,4+t*91,Math.sin(angle)*radius];});});
  for(let level=0;level<levels;level++)for(let index=0;index<sides;index++){const next=(index+1)%sides,tone=index%4===0?[127,152,186]:palette.glass;shape.tri(rings[level][index],rings[level+1][index],rings[level+1][next],tone);shape.tri(rings[level][index],rings[level+1][next],rings[level][next],tone);}
  for(let index=0;index<sides;index+=2)for(let level=0;level<levels;level++)shape.rod(rings[level][index],rings[level+1][index],.45,palette.silver,4);
  shape.rod([0,91,0],[0,96,0],8.6,[93,131,151],18);shape.rod([0,96,0],[0,116,0],.7,palette.silver,6);
  return shape.triangles;
}

function square(){
  const shape=builder();shape.box(0,0,0,68,2,44,palette.stone);shape.box(0,2,10,49,1,19,palette.sand);
  for(const [x,z,width,height,depth] of [[-23,-8,10,35,13],[-10,-9,9,23,12],[6,-10,11,47,15],[24,-7,9,32,12]]){
    shape.box(x,2,z,width,height,depth,palette.glass);shape.box(x,2+height,z,width,1,depth,palette.silver);
    for(let y=8;y<height;y+=7)shape.box(x,y,z+depth/2+.1,width-.6,.6,.2,[180,211,218]);
  }
  for(const x of [-25,-13,13,25]){shape.box(x,2,15,6,1,6,palette.green);shape.rod([x,3,15],[x,6,15],.7,palette.dark);shape.pebble(x,15,6,5,6,palette.green);}
  shape.box(0,3,12,7,.8,13,[175,204,208]);
  return shape.triangles;
}

function opera(){
  const shape=builder();shape.box(0,0,0,68,2,44,palette.stone);shape.box(0,2,14,50,.8,7,[158,191,197]);
  shape.pebble(-17,2,34,23,31,[182,187,175]);shape.pebble(17,-5,30,19,27,[202,205,192]);
  // Triangular glass planes articulate the entrance in the two faceted stone volumes.
  shape.tri([-24,4,13],[-12,4,15],[-19,15,15],[78,121,143]);shape.tri([9,4,6],[22,4,9],[15,12,8],[85,133,148]);
  return shape.triangles;
}

function library(){
  const shape=builder();shape.box(0,0,0,64,2,42,palette.stone);shape.box(0,2,0,49,8,29,palette.glass);
  // Staggered light volumes suggest the library's open-book silhouette.
  for(let level=0;level<8;level++){
    const y=9+level*4,shift=level%3-1;
    shape.box(-15+shift*1.7,y,-2,25-level*.7,3.1,28,palette.silver);
    shape.box(15-shift*1.7,y,2,24-level*.45,3.1,28,[229,233,225]);
    shape.box(-15+shift*1.7,y+3.1,12.2,23-level*.7,.7,.7,palette.dark);
    shape.box(15-shift*1.7,y+3.1,16.2,22-level*.45,.7,.7,palette.glass);
  }
  shape.box(0,34,-6,20,4,19,palette.silver);return shape.triangles;
}

function ifc(){
  const shape=builder();shape.box(0,0,0,43,2,35,palette.stone);
  const sides=15,levels=9,rings=Array.from({length:levels+1},(_,level)=>{
    const t=level/levels,radius=13.5-4.4*t;
    return Array.from({length:sides},(_,index)=>{const angle=index/sides*Math.PI*2,outline=1+.08*Math.cos(angle*3);return [Math.cos(angle)*radius*outline,3+t*92,Math.sin(angle)*radius*outline];});
  });
  for(let level=0;level<levels;level++)for(let index=0;index<sides;index++){
    const next=(index+1)%sides,tone=index%3===0?[104,143,158]:palette.glass;
    shape.tri(rings[level][index],rings[level+1][index],rings[level+1][next],tone);shape.tri(rings[level][index],rings[level+1][next],rings[level][next],tone);
    if(index%3===0){shape.rod(rings[level][index],rings[level+1][(index+2)%sides],.35,palette.silver,4);shape.rod(rings[level][(index+2)%sides],rings[level+1][index],.35,palette.silver,4);}
  }
  for(let index=0;index<sides;index++)shape.tri([0,95,0],rings[levels][(index+1)%sides],rings[levels][index],palette.silver);
  return shape.triangles;
}

function ctf(){
  const shape=builder();shape.box(0,0,0,42,2,34,palette.stone);
  for(const [y,width,height,depth] of [[2,24,64,22],[66,19,19,18],[85,13,13,13]]){
    shape.box(0,y,0,width,height,depth,palette.glass);shape.box(0,y+height,0,width,1,depth,palette.silver);
    for(let x=-width/2+2;x<width/2;x+=4)shape.box(x,y,depth/2+.15,.6,height,.35,palette.silver);
    for(let z=-depth/2+2;z<depth/2;z+=4)shape.box(width/2+.15,y,z,.35,height,.6,palette.silver);
    for(let row=y+7;row<y+height;row+=7)shape.box(0,row,depth/2+.3,width,.5,.35,[184,209,213]);
  }
  return shape.triangles;
}

function youthPalace(){
  const shape=builder();shape.box(0,0,0,68,2,44,palette.stone);shape.box(0,2,0,55,10,29,palette.glass);
  const profile=Array.from({length:13},(_,index)=>{const t=index/12;return [-31+t*62,11+12*Math.sin(t*Math.PI)];});
  for(let index=0;index<profile.length-1;index++){
    const [x,y]=profile[index],[nextX,nextY]=profile[index+1],front=[x,y,17],back=[x,y,-17],nextFront=[nextX,nextY,17],nextBack=[nextX,nextY,-17];
    shape.tri(front,nextBack,back,palette.silver);shape.tri(front,nextFront,nextBack,palette.silver);
    shape.tri([x,y-1.5,17],[nextX,nextY-1.5,17],nextFront,palette.stone);shape.tri([x,y-1.5,17],nextFront,front,palette.stone);
    shape.tri(back,nextBack,[nextX,nextY-1.5,-17],palette.stone);shape.tri(back,[nextX,nextY-1.5,-17],[x,y-1.5,-17],palette.stone);
  }
  for(const x of [-22,-11,0,11,22])shape.box(x,2,14.7,.9,10,.8,palette.silver);
  shape.box(0,2,19,36,1,5,palette.sand);return shape.triangles;
}

function commercial(){
  // Shared ground-building form for trusted shopping places, not an exact reconstruction.
  const shape=builder();shape.box(0,0,0,68,2,46,palette.stone);
  shape.box(0,2,0,57,13,34,palette.sand);shape.box(0,15,0,58,2,35,palette.silver);
  shape.box(-17,17,-7,21,11,20,palette.glass);shape.box(18,17,-5,18,8,23,palette.stone);
  shape.box(0,2,17.3,49,10,.7,palette.glass);
  for(const x of [-22,-11,0,11,22])shape.box(x,2,17.8,1.1,11,.8,palette.silver);
  shape.box(0,3,21,18,1,6,palette.stone);shape.box(-11,17,8,12,.7,8,palette.green);
  shape.box(20,25,-4,16,1,21,palette.red);shape.box(-17,28,-7,22,1,21,palette.silver);
  return shape.triangles;
}
function groundTree(shape,x,z){
  shape.rod([x,2,z],[x,11,z],.7,palette.dark);const start=shape.triangles.length;shape.pebble(x,z,10,8,10,palette.green);
  for(const point of new Set(shape.triangles.slice(start).flatMap(triangle=>triangle.points)))point[1]+=6;
}
function street(){
  const shape=builder();shape.box(0,0,0,74,2,46,palette.stone);shape.box(0,2,0,68,.7,8,palette.sand);
  for(const z of [-13,13])for(const [index,x]of [-25,-8,9,26].entries()){
    const height=11+index%3*3;shape.box(x,2,z,13,height,12,index%2?palette.stone:[234,223,201]);shape.roof(x,2+height,z,16,5,15,palette.dark);
    for(const side of [-1,1])shape.box(x+side*3,7,z+6.1,2.5,4,.4,palette.glass);
    shape.box(x,2,z-6.1,3,7,.4,palette.dark);
  }
  return shape.triangles;
}
function park(){
  const shape=builder();shape.box(0,0,0,74,2,48,palette.stone);shape.box(0,2,0,68,.6,42,[151,177,129]);
  shape.box(0,2.6,9,61,.5,3,palette.sand);shape.box(-12,2.6,0,3,.5,36,palette.sand);
  shape.pebble(10,-6,30,1.2,18,[133,184,195]);shape.box(-23,3,-9,12,8,11,palette.stone);shape.roof(-23,11,-9,16,6,15,palette.dark);
  for(const [x,z]of [[-28,14],[24,14],[27,-15],[-4,-16]])groundTree(shape,x,z);
  return shape.triangles;
}
function culturalBuilding(traditional=false){
  const shape=builder();shape.box(0,0,0,72,2,48,palette.stone);
  for(let step=0;step<3;step++)shape.box(0,2+step,21-step*2,38,1,6,palette.sand);
  shape.box(0,3,0,34,17,25,traditional?palette.sand:palette.silver);
  for(const x of [-25,25]){shape.box(x,3,1,14,11,24,palette.stone);if(traditional)shape.roof(x,14,1,18,5,28,palette.dark);}
  if(traditional){shape.roof(0,20,0,43,9,31,palette.dark);for(const x of [-14,-7,0,7,14])shape.box(x,3,13,1.2,15,1.2,palette.red);}
  else{shape.box(0,20,0,38,2,29,palette.silver);shape.box(0,5,12.8,29,12,.7,palette.glass);}
  shape.box(0,3,13,7,10,.8,palette.dark);return shape.triangles;
}
function bridge(){
  const shape=builder();shape.box(0,0,0,74,2,46,palette.stone);shape.box(0,2,0,68,.7,35,[133,184,195]);
  for(const x of [-29,29])shape.box(x,3,0,10,6,20,palette.stone);shape.box(0,8,0,61,2,12,palette.silver);
  for(const z of [-7,7])for(let index=0;index<12;index++){
    const x=-29+index*58/12,nextX=-29+(index+1)*58/12,y=11+14*Math.sin(index/12*Math.PI),nextY=11+14*Math.sin((index+1)/12*Math.PI);
    shape.rod([x,y,z],[nextX,nextY,z],.9,palette.silver);shape.rod([x,10,z],[x,y,z],.35,palette.silver,4);
  }
  return shape.triangles;
}

const guangzhouModelKeys=new Set(['gz-museum','gz-tower','gz-square','gz-opera','gz-library','gz-ifc','gz-ctf','gz-youth-palace']);
const identityKey=value=>String(value||'').normalize('NFKC').replace(/\s+/g,'').toLowerCase();
const destinationKey=value=>identityKey(value).replace(/市$/,'');
export function resolveLandmarkKind(stop={}){
  stop=stop||{};
  // Generated itinerary IDs and provider search IDs are not catalog identities.
  // Only a city-scoped trusted name/alias match may select a dedicated model.
  const curated=[stop.id,stop.name,...(Array.isArray(stop.aliases)?stop.aliases:[])].map(value=>getExplorationLandmark(stop.city,value)).find(Boolean);
  const key=curated?.modelKey||curated?.id;
  if(guangzhouModelKeys.has(key)||hasLandmarkGeometry(key))return key;
  if(curated){
    if(['gz-beijing-road','gz-yongqingfang','gz-shamian'].includes(curated.id))return 'ground-street';
    if(curated.category==='shopping')return 'commercial';
    if(curated.category==='park')return 'ground-park';
    if(curated.id==='gz-haixin-bridge')return 'ground-bridge';
    return ['gz-chen-clan-hall','gz-zhongshan-memorial','gz-cantonese-opera-museum'].includes(curated.id)?'ground-hall':'ground-culture';
  }
  const names=[stop.id,stop.name,...(Array.isArray(stop.aliases)?stop.aliases:[])].map(identityKey).filter(Boolean);
  const legacy=planningPlaces.find(place=>destinationKey(place.city)===destinationKey(stop.city)&&[place.id,place.name,...place.aliases].some(value=>names.includes(identityKey(value))));
  return legacy?.id||'place';
}
export function hasLandmarkModel(stop){return resolveLandmarkKind(stop)!=='place';}
export function landmarkGeometry(stop){
  const key=resolveLandmarkKind(stop);if(key==='place')return {kind:key,triangles:null};
  if(geometryCache.has(key))return {kind:key,triangles:geometryCache.get(key)};
  let triangles;
  if(key==='gz-museum')triangles=museum();else if(key==='gz-tower')triangles=tower();else if(key==='gz-square')triangles=square();else if(key==='gz-opera')triangles=opera();
  else if(key==='gz-library')triangles=library();else if(key==='gz-ifc')triangles=ifc();else if(key==='gz-ctf')triangles=ctf();else if(key==='gz-youth-palace')triangles=youthPalace();
  else if(key==='commercial')triangles=commercial();
  else if(key==='ground-street')triangles=street();
  else if(key==='ground-park')triangles=park();
  else if(key==='ground-hall'||key==='ground-culture')triangles=culturalBuilding(key==='ground-hall');
  else if(key==='ground-bridge')triangles=bridge();
  else if(hasLandmarkGeometry(key))triangles=buildLandmarkGeometry(key);
  else{const model=makeSouvenir(key);triangles=Array.from({length:model.mesh.length/9},(_,index)=>({points:Array.from({length:3},(_,vertex)=>Array.from(model.mesh.slice(index*9+vertex*3,index*9+vertex*3+3))),color:Array.from(model.colors.slice(index*9,index*9+3))}));}
  geometryCache.set(key,triangles);return {kind:key,triangles};
}

function render(canvas,triangles){
  const context=canvas.getContext('2d');if(!context)return false;
  const ratio=Math.max(1,Math.min(2,window.devicePixelRatio||1));canvas.width=WIDTH*ratio;canvas.height=HEIGHT*ratio;context.scale(ratio,ratio);
  const azimuth=.62,elevation=.48,right=[Math.cos(azimuth),0,-Math.sin(azimuth)],up=[-Math.sin(azimuth)*Math.sin(elevation),Math.cos(elevation),-Math.cos(azimuth)*Math.sin(elevation)],eye=[Math.sin(azimuth)*Math.cos(elevation),Math.sin(elevation),Math.cos(azimuth)*Math.cos(elevation)],light=unit([-.25,.85,.7]);
  const faces=triangles.map(triangle=>{const normal=unit(cross(subtract(triangle.points[1],triangle.points[0]),subtract(triangle.points[2],triangle.points[0])));return {...triangle,normal,depth:triangle.points.reduce((sum,point)=>sum+dot(point,eye),0)/3,projected:triangle.points.map(point=>[dot(point,right),-dot(point,up)])};});
  const points=faces.flatMap(face=>face.projected),minX=Math.min(...points.map(point=>point[0])),maxX=Math.max(...points.map(point=>point[0])),minY=Math.min(...points.map(point=>point[1])),maxY=Math.max(...points.map(point=>point[1])),scale=Math.min((WIDTH-18)/(maxX-minX||1),(HEIGHT-15)/(maxY-minY||1)),middle=(minX+maxX)/2;
  const position=point=>[WIDTH/2+(point[0]-middle)*scale,HEIGHT-9+(point[1]-maxY)*scale];
  context.fillStyle='rgba(33,47,38,.16)';context.beginPath();context.ellipse(WIDTH/2,HEIGHT-10,Math.min(42,(maxX-minX)*scale*.34),5,0,0,Math.PI*2);context.fill();
  for(const face of faces.filter(face=>dot(face.normal,eye)>0).sort((a,b)=>a.depth-b.depth)){
    const shade=.52+.48*Math.max(0,dot(face.normal,light)),color=face.color.map(value=>Math.round(value*shade));context.fillStyle=`rgb(${color.join(',')})`;context.strokeStyle=context.fillStyle;context.lineWidth=.45;context.beginPath();face.projected.forEach((point,index)=>{const [x,y]=position(point);if(index)context.lineTo(x,y);else context.moveTo(x,y);});context.closePath();context.fill();context.stroke();
  }
  return true;
}

export function createLandmarkMarker(stop,{index=0,dayIndex=null,isToday=true,isExample=false,compact=false}={}){
  stop=stop||{};const name=String(stop.name||'旅行地点').slice(0,120),exploration=stop.kind==='exploration',shortNames={'gz-library':'广州图书馆','gz-ifc':'广州西塔','gz-ctf':'广州东塔','gz-youth-palace':'第二少年宫'},displayName=String(stop.shortName||(exploration&&shortNames[stop.id])||name).slice(0,120),number=Number.isInteger(index)&&index>=0?index+1:1,day=Number.isInteger(dayIndex)&&dayIndex>0?dayIndex:null;
  const button=document.createElement('button');button.type='button';button.className=`map-marker landmark-marker ${exploration?'is-exploration':isToday?'is-today':'is-other-day'}${compact?' is-compact':''}`;button.dataset.stop=String(stop.id||'');
  let model=null,kind='place';
  try{
    const result=landmarkGeometry(stop);
    if(result.triangles){const canvas=document.createElement('canvas');canvas.className='landmark-canvas';canvas.setAttribute('aria-hidden','true');if(render(canvas,result.triangles)){model=document.createElement('span');model.className='landmark-model';model.append(canvas);kind=result.kind;}}
  }catch{}
  button.dataset.landmarkKind=kind;button.dataset.markerStyle=model?'model':'pin';
  const label=document.createElement('span');label.className='landmark-label';const title=document.createElement('span');title.className='landmark-name';title.textContent=displayName;const context=document.createElement('span');context.className='landmark-day';context.textContent=exploration?'探索 · 未入行程':isExample?'示例 · 未加入':'已在行程 · '+(day?`第${day}天`:`第${number}站`);label.append(title,context);
  const endpoint=document.createElement('span');endpoint.className='landmark-endpoint';endpoint.hidden=true;
  if(model)button.append(model,label,endpoint);
  else{
    button.classList.add('is-pin');
    const pin=document.createElementNS('http://www.w3.org/2000/svg','svg');pin.classList.add('landmark-pin');pin.setAttribute('viewBox','0 0 32 40');pin.setAttribute('aria-hidden','true');pin.setAttribute('focusable','false');
    const outline=document.createElementNS('http://www.w3.org/2000/svg','path');outline.setAttribute('d','M16 1C8.3 1 2 7.3 2 15c0 10.5 14 24 14 24s14-13.5 14-24C30 7.3 23.7 1 16 1Z');outline.setAttribute('fill','currentColor');outline.setAttribute('stroke','#fff');outline.setAttribute('stroke-width','2');
    const center=document.createElementNS('http://www.w3.org/2000/svg','circle');center.setAttribute('cx','16');center.setAttribute('cy','15');center.setAttribute('r','5');center.setAttribute('fill','#fff');pin.append(outline,center);button.append(label,pin,endpoint);
  }
  button.dataset.landmarkLabel=exploration?`${name}，探索${model?'地标':'地点'}，未加入行程`:isExample?`${name}，示例地点，未加入行程`:`${name}，已在行程，${day?`第${day}天，`:''}第${number}站，${isToday?'当天地点':'其他日期地点'}`;
  setLandmarkState(button);return button;
}

export function setLandmarkState(element,{origin=false,destination=false,focused=false}={}){
  if(!element?.classList)return;
  origin=Boolean(origin);destination=Boolean(destination)&&!origin;focused=Boolean(focused);
  element.classList.toggle('is-origin',origin);element.classList.toggle('is-destination',destination);element.classList.toggle('is-focused',focused);element.dataset.endpoint=origin?'origin':destination?'destination':'';element.setAttribute('aria-pressed',String(origin||destination));
  if(focused)element.setAttribute('aria-current','location');else element.removeAttribute('aria-current');
  const endpoint=element.querySelector('.landmark-endpoint');if(endpoint){endpoint.hidden=!(origin||destination);endpoint.textContent=origin?'起点':destination?'终点':'';}
  element.setAttribute('aria-label',`${element.dataset.landmarkLabel||'旅行地点'}${origin?'，已选为起点':destination?'，已选为终点':''}${focused?'，当前查看':''}`);
}
