const storageKey='lvzang.guide-layout.v1';
const fontSizes=[16,18,20,22];
const defaults={width:300,height:644,fontSize:18};

// Dimensions are in canvas coordinates; limits follow the visible viewport.
export function constrainGuideSize({width,height},{width:availableWidth,height:availableHeight,scale=1}){
  const factor=Number.isFinite(scale)&&scale>0?scale:1;
  const maxWidth=Math.max(1,(availableWidth-24)/factor),maxHeight=Math.max(1,(availableHeight-32)/factor);
  return {width:Math.max(Math.min(320/factor,maxWidth),Math.min(maxWidth,Number(width)||defaults.width)),height:Math.max(Math.min(440/factor,maxHeight),Math.min(maxHeight,Number(height)||defaults.height))};
}

export function initTravelGuideLayout(){
  const node=document.getElementById('route-section'),world=document.getElementById('canvas-world'),viewport=document.getElementById('canvas-viewport');
  const handle=document.getElementById('guide-resize-handle'),fontSelect=document.getElementById('guide-font-size'),reset=document.getElementById('guide-reset-layout');
  if(!node||!world||!viewport||!handle||!fontSelect||!reset)return {destroy(){}};
  const initialRight=Number(node.dataset.x)+defaults.width,media=matchMedia('(max-width:767px)');
  let preferences={...defaults},drag=null,frame=0,lastDesktopWidth=node.offsetWidth;
  try{const saved=JSON.parse(localStorage.getItem(storageKey)||'null');if(saved&&typeof saved==='object'){for(const field of ['width','height'])if(Number.isFinite(saved[field])&&saved[field]>0)preferences[field]=saved[field];if(fontSizes.includes(saved.fontSize))preferences.fontSize=saved.fontSize;}}catch{}
  function scale(){if(media.matches)return 1;const matrix=getComputedStyle(world).transform;return matrix==='none'?1:Math.max(.01,new DOMMatrixReadOnly(matrix).a);}
  function limits(){return {width:viewport.clientWidth,height:media.matches?innerHeight:viewport.clientHeight,scale:scale()};}
  function changed(user=false){node.dispatchEvent(new CustomEvent('travel-guide-layout',{bubbles:true,detail:{user}}));}
  function save(){try{localStorage.setItem(storageKey,JSON.stringify(preferences));}catch{}}
  function setPosition(x){node.dataset.x=String(x);node.style.left=`${x}px`;}
  function paint(right){
    frame=0;const factor=scale(),size=constrainGuideSize(preferences,limits());
    node.style.setProperty('--guide-font-size',`${preferences.fontSize/Math.min(1,factor)}px`);
    node.style.setProperty('--guide-control-size',`${14/Math.min(1,factor)}px`);
    node.style.setProperty('--guide-target-size',`${40/Math.min(1,factor)}px`);
    if(!media.matches){setPosition((Number.isFinite(right)?right:Number(node.dataset.x)+lastDesktopWidth)-size.width);lastDesktopWidth=size.width;}
    node.style.width=`${size.width}px`;node.style.height=`${size.height}px`;
    fontSelect.value=String(preferences.fontSize);
    handle.setAttribute('aria-label',media.matches?'调整攻略高度；使用上下方向键':'调整攻略大小；向左拖动加宽，向下拖动加高，也可使用方向键');
    handle.querySelector('span').textContent=media.matches?'拖动调整高度':'拖动调整大小';
    changed();
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(()=>paint());}
  function resize(width,height,right){
    const size=constrainGuideSize({width,height},limits());preferences={...preferences,...size,width:media.matches?preferences.width:size.width};
    paint(right);changed(true);
  }
  function start(event){
    if(event.button!==0||drag)return;
    event.preventDefault();event.stopPropagation();
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,width:node.offsetWidth,height:node.offsetHeight,right:Number(node.dataset.x)+node.offsetWidth,scale:scale()};
    handle.setPointerCapture(event.pointerId);node.classList.add('guide-resizing');changed(true);
  }
  function move(event){
    if(!drag||event.pointerId!==drag.id)return;
    event.preventDefault();event.stopPropagation();
    resize(media.matches?drag.width:drag.width-(event.clientX-drag.x)/drag.scale,drag.height+(event.clientY-drag.y)/drag.scale,drag.right);
  }
  function end(event){
    if(!drag||event.pointerId!==drag.id)return;
    const id=drag.id;drag=null;node.classList.remove('guide-resizing');save();event.stopPropagation();
    if(handle.hasPointerCapture(id))handle.releasePointerCapture(id);
  }
  function keyboard(event){
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();
    const amount=(event.shiftKey?40:20)/scale(),width=node.offsetWidth+(event.key==='ArrowLeft'?amount:event.key==='ArrowRight'?-amount:0),height=node.offsetHeight+(event.key==='ArrowDown'?amount:event.key==='ArrowUp'?-amount:0);
    resize(media.matches?node.offsetWidth:width,height,Number(node.dataset.x)+node.offsetWidth);save();
  }
  function changeFont(){preferences.fontSize=Number(fontSelect.value);paint();save();}
  function resetLayout(){
    const right=Number(node.dataset.x)+node.offsetWidth;preferences={...defaults};
    try{localStorage.removeItem(storageKey);}catch{}paint(right);changed(true);
  }
  handle.addEventListener('pointerdown',start);handle.addEventListener('pointermove',move);
  for(const type of ['pointerup','pointercancel','lostpointercapture'])handle.addEventListener(type,end);
  handle.addEventListener('keydown',keyboard);fontSelect.addEventListener('change',changeFont);reset.addEventListener('click',resetLayout);
  const worldObserver=new MutationObserver(schedule);worldObserver.observe(world,{attributes:true,attributeFilter:['style']});
  const viewportObserver=new ResizeObserver(schedule);viewportObserver.observe(viewport);media.addEventListener('change',schedule);
  paint(initialRight);
  return {destroy(){
    if(frame)cancelAnimationFrame(frame);worldObserver.disconnect();viewportObserver.disconnect();media.removeEventListener('change',schedule);
    handle.removeEventListener('pointerdown',start);handle.removeEventListener('pointermove',move);
    for(const type of ['pointerup','pointercancel','lostpointercapture'])handle.removeEventListener(type,end);
    handle.removeEventListener('keydown',keyboard);fontSelect.removeEventListener('change',changeFont);reset.removeEventListener('click',resetLayout);
  }};
}
