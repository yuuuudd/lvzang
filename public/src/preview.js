import { normalAt } from './model.js';
// Prefer the broad, visually detailed side of source models whose glTF axes vary.
export function initialModelYaw(options){
  const m=options?.mesh,c=options?.originalColors;if(options?.previewVersion!=='raw-1'||!m?.length)return -.2;
  if(!c||c.length!==m.length)return options.totalDepthMm>options.widthMm*1.4?Math.PI/2:0;
  const stride=9*Math.max(1,Math.ceil(m.length/9/10000)),views=[0,Math.PI/2,Math.PI,-Math.PI/2];let best=0,bestScore=-Infinity;
  for(const yaw of views){let area=0,saturation=0;const bins=new Map(),sin=Math.sin(yaw),cos=Math.cos(yaw);for(let i=0;i<m.length;i+=stride){const ax=m[i+3]-m[i],ay=m[i+4]-m[i+1],az=m[i+5]-m[i+2],bx=m[i+6]-m[i],by=m[i+7]-m[i+1],bz=m[i+8]-m[i+2],weight=Math.max(0,-sin*(ay*bz-az*by)+cos*(ax*by-ay*bx));if(!weight)continue;const rgb=[0,1,2].map(k=>(c[i+k]+c[i+3+k]+c[i+6+k])/3),key=rgb.map(v=>Math.floor(v/32)).join(',');area+=weight;saturation+=weight*(Math.max(...rgb)-Math.min(...rgb))/255;bins.set(key,(bins.get(key)||0)+weight);}if(!area)continue;let entropy=0;for(const weight of bins.values()){const p=weight/area;entropy-=p*Math.log(p);}const score=entropy*(1+saturation/area)*Math.sqrt(area);if(score>bestScore){bestScore=score;best=yaw;}}
  return best-.15;
}
export function createPreview(canvas,spinSpeed=.00018){
  const gl=canvas.getContext('webgl',{alpha:true,antialias:true,preserveDrawingBuffer:true});if(!gl)return null;
  const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error('三维着色器不可用');return s;};
  const program=gl.createProgram();
  gl.attachShader(program,shader(gl.VERTEX_SHADER,`attribute vec3 position;attribute vec3 normal;attribute vec2 texcoord;attribute vec3 partcolor;uniform vec2 rotation;uniform vec2 scale;uniform float centerZ;uniform float centerY;uniform float depthRange;uniform float verticalOffset;varying vec3 N;varying vec2 UV;varying vec3 C;varying float face;
  vec3 rotate(vec3 p){float a=rotation.x,b=rotation.y;vec3 q=vec3(p.x,cos(a)*p.y-sin(a)*p.z,sin(a)*p.y+cos(a)*p.z);return vec3(cos(b)*q.x+sin(b)*q.z,q.y,-sin(b)*q.x+cos(b)*q.z);}
  void main(){vec3 p=rotate(position-vec3(0.,centerY,centerZ));N=rotate(normal);UV=texcoord;C=partcolor;face=normal.z;gl_Position=vec4(p.x*scale.x,p.y*scale.y+verticalOffset,-p.z/depthRange,1.);}`));
  gl.attachShader(program,shader(gl.FRAGMENT_SHADER,`precision mediump float;uniform sampler2D artwork;uniform float colored;uniform float textured;varying vec3 N;varying vec2 UV;varying vec3 C;varying float face;
  void main(){vec3 n=normalize(N),light=normalize(vec3(-.7,.8,1.));float diffuse=max(dot(n,light),0.);float fill=max(dot(n,normalize(vec3(.7,-.1,.5))),0.);float spec=pow(max(dot(n,normalize(light+vec3(0.,0.,1.))),0.),20.);vec4 tex=texture2D(artwork,UV);vec3 ink=mix(vec3(.97,.955,.91),tex.rgb,tex.a);vec3 pigment=mix(C,mix(vec3(.97,.968,.95),ink,step(.08,face)),textured);vec3 base=mix(vec3(.97,.968,.95),pigment,colored);float shade=.26+.62*diffuse+.10*fill;gl_FragColor=vec4(base*shade+vec3(spec*.025),1.);}`));
  gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('三维预览不可用');gl.useProgram(program);
  const attrs=['position','normal','texcoord','partcolor'].map(n=>gl.getAttribLocation(program,n)),buffers=attrs.map(()=>gl.createBuffer());
  const rotation=gl.getUniformLocation(program,'rotation'),scale=gl.getUniformLocation(program,'scale'),colored=gl.getUniformLocation(program,'colored');
  const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([255,255,255,255]));
  let count=0,rx=-.18,ry=-.16,zoom=1,color=false,widthMm=60,heightMm=45,depthRange=150,alignBottom=false,sourceHeight=45,sourceDepth=3;
  function draw(){
    const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight),dpr=Math.min(devicePixelRatio||1,2),pixelWidth=Math.round(w*dpr),pixelHeight=Math.round(h*dpr);
    if(canvas.width!==pixelWidth||canvas.height!==pixelHeight){canvas.width=pixelWidth;canvas.height=pixelHeight;}
    gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.useProgram(program);gl.uniform2f(rotation,rx,ry);
    const unit=Math.min(w/(widthMm*1.27),h/(heightMm*1.38))*zoom;gl.uniform2f(scale,unit*2/w,unit*2/h);gl.uniform1f(colored,color?1:0);gl.uniform1f(gl.getUniformLocation(program,'depthRange'),depthRange);const projectedHeight=Math.abs(Math.cos(rx))*sourceHeight+Math.abs(Math.sin(rx))*sourceDepth;gl.uniform1f(gl.getUniformLocation(program,'verticalOffset'),alignBottom?(-h*.42+projectedHeight*unit/2)*2/h:0);
    attrs.forEach((attr,i)=>{gl.bindBuffer(gl.ARRAY_BUFFER,buffers[i]);gl.enableVertexAttribArray(attr);gl.vertexAttribPointer(attr,i===2?2:3,gl.FLOAT,false,0,0);});gl.drawArrays(gl.TRIANGLES,0,count);
  }
  function setMesh(mesh,options={}){
    const palette=[[.94,.92,.87],[.64,.25,.16],[.16,.29,.37],[.47,.57,.39]];
    let colors=new Float32Array(mesh.length).fill(1);
    if(options.originalColors?.length===mesh.length){
      colors=Float32Array.from(options.originalColors,value=>value/255);mesh=Float32Array.from(mesh);
    }else if(options.faceColors?.length===mesh.length/9&&options.palette?.length){
      const palette=options.palette.map(hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255));
      for(let i=0;i<mesh.length;i+=3)colors.set(palette[options.faceColors[Math.floor(i/9)]]||palette[0],i);
      mesh=Float32Array.from(mesh);
    }else if(options.parts?.length){
      const size=options.parts.reduce((sum,part)=>sum+part.mesh.length,0);mesh=new Float32Array(size);colors=new Float32Array(size);let offset=0;
      for(const part of options.parts){mesh.set(part.mesh,offset);for(let i=0;i<part.mesh.length;i+=3)colors.set(palette[part.colorIndex%4],offset+i);offset+=part.mesh.length;}
    }
    gl.uniform1f(gl.getUniformLocation(program,'centerY'),options.centerY??(options.totalDepthMm?options.heightMm/2:0));
    gl.uniform1f(gl.getUniformLocation(program,'centerZ'),options.centerZ??((options.totalDepthMm||2+(options.depthMm||1.6))/2));
    gl.uniform1f(gl.getUniformLocation(program,'textured'),options.texture&&!options.parts&&!options.faceColors?1:0);
    alignBottom=options.alignBottom===true;sourceHeight=options.heightMm||45;sourceDepth=options.totalDepthMm||3;count=mesh.length/3;widthMm=options.widthMm||60;heightMm=options.heightMm||45;if(options.previewVersion==='raw-1'){const size=Math.hypot(widthMm,heightMm,options.totalDepthMm||0);widthMm=size;heightMm=size;}depthRange=Math.max(150,Math.hypot(options.widthMm||60,options.heightMm||45,options.totalDepthMm||0)*2);
    // Average only top faces; preserve sharp sides and a flat back.
    const averaged=new Map(),faceNormals=new Float32Array(mesh.length/3),n=new Float32Array(mesh.length);
    for(let i=0;i<mesh.length;i+=9){const normal=normalAt(mesh,i);faceNormals.set(normal,i/3);if(normal[2]>.01)for(let j=0;j<9;j+=3){const key=`${mesh[i+j]},${mesh[i+j+1]},${mesh[i+j+2]}`,v=averaged.get(key)||[0,0,0];for(let k=0;k<3;k++)v[k]+=normal[k];averaged.set(key,v);}}
    for(let i=0;i<mesh.length;i+=9)for(let j=0;j<9;j+=3){let v=Array.from(faceNormals.subarray(i/3,i/3+3));if(v[2]>.01)v=averaged.get(`${mesh[i+j]},${mesh[i+j+1]},${mesh[i+j+2]}`);const length=Math.hypot(...v)||1;n.set(v.map(x=>x/length),i+j);}
    const uv=options.uv||new Float32Array(count*2);
    [mesh,n,uv,colors].forEach((data,i)=>{gl.bindBuffer(gl.ARRAY_BUFFER,buffers[i]);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);});
    if(options.texture){gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,options.texture);}draw();
  }
  let pointer,spinFrame=0,lastSpin=0;
  function spin(now){
    if(!spinFrame)return;
    if(lastSpin&&!pointer&&document.visibilityState==='visible'&&count){ry+=Math.min(now-lastSpin,32)*spinSpeed;draw();}
    lastSpin=now;spinFrame=requestAnimationFrame(spin);
  }
  const listeners=new AbortController(),listenOptions={signal:listeners.signal};
  canvas.addEventListener('pointerdown',e=>{pointer={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);},listenOptions);
  canvas.addEventListener('pointermove',e=>{if(!pointer)return;ry+=(e.clientX-pointer.x)*.008;rx+=(e.clientY-pointer.y)*.008;pointer={x:e.clientX,y:e.clientY};draw();},listenOptions);
  for(const name of ['pointerup','pointercancel'])canvas.addEventListener(name,()=>pointer=null,listenOptions);
  canvas.addEventListener('wheel',e=>{if(!e.ctrlKey)return;e.preventDefault();zoom=Math.max(.6,Math.min(1.6,zoom-e.deltaY*.001));draw();},{passive:false,...listenOptions});
  canvas.addEventListener('keydown',e=>{const moves={ArrowLeft:[0,-.1],ArrowRight:[0,.1],ArrowUp:[-.1,0],ArrowDown:[.1,0]};if(moves[e.key]){e.preventDefault();rx+=moves[e.key][0];ry+=moves[e.key][1];draw();}},listenOptions);
  const resizeObserver=new ResizeObserver(draw);resizeObserver.observe(canvas);
  return {setMesh,setColor(value){color=value;draw();},setView(name){rx=0;ry=name==='back'?Math.PI:name==='side'?Math.PI/2:0;zoom=1;draw();},setRotation(x,y){rx=x;ry=y;draw();},setZoom(value){zoom=Math.max(.6,Math.min(1.6,value));draw();},view(front){rx=front==='back'?-.18:front?0:-.35;ry=front==='back'?Math.PI-.3:front?0:-.22;zoom=1;draw();},setAutoRotate(active){
    if(active&&!spinFrame){lastSpin=0;spinFrame=requestAnimationFrame(spin);}
    if(!active&&spinFrame){cancelAnimationFrame(spinFrame);spinFrame=0;lastSpin=0;}
  },destroy(){listeners.abort();if(spinFrame)cancelAnimationFrame(spinFrame);spinFrame=0;resizeObserver.disconnect();gl.getExtension('WEBGL_lose_context')?.loseContext();}};
}
