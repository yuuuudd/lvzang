const storageKey='lvzang.travel-split.v1';
const defaultRatio=.55;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

// Width excludes the separator. Minimums contract together on very narrow screens.
export function travelSplitLayout(width,mapRatio=defaultRatio){
  const available=Number.isFinite(width)?Math.max(0,width):0;
  let mapMin=clamp(available*.3,120,240),guideMin=clamp(available*.34,180,260);
  const fit=Math.min(1,available/(mapMin+guideMin));mapMin*=fit;guideMin*=fit;
  const minRatio=available?mapMin/available:0,maxRatio=available?1-guideMin/available:1;
  const ratio=clamp(Number.isFinite(mapRatio)?mapRatio:defaultRatio,minRatio,maxRatio);
  const mapWidth=available*ratio,guideWidth=available-mapWidth;
  return {mapWidth,guideWidth,mapRatio:ratio,minRatio,maxRatio,fontSize:clamp(14+(guideWidth-180)/85,14,18)};
}

export function initTravelGuideLayout(){
  const world=document.getElementById('canvas-world'),splitter=document.getElementById('travel-splitter');
  const mapPane=document.getElementById('map-pane'),guidePane=document.getElementById('guide-pane');
  const toolbar=document.getElementById('route-refresh-slot');
  if(!world||!splitter||!mapPane||!guidePane)return {destroy(){}};
  let preference=defaultRatio,drag=null,frame=0;
  const compact=matchMedia('(max-width:767px)'),viewButtons=[...document.querySelectorAll('[data-travel-view]')];
  let mobileView='map';
  function showView(){
    mapPane.hidden=compact.matches&&mobileView!=='map';guidePane.hidden=compact.matches&&mobileView!=='guide';
    for(const button of viewButtons)button.setAttribute('aria-pressed',String(button.dataset.travelView===mobileView));
    schedule();
  }
  function chooseView(event){mobileView=event.currentTarget.dataset.travelView;showView();}
  for(const button of viewButtons)button.addEventListener('click',chooseView);
  compact.addEventListener('change',showView);showView();
  try{const saved=JSON.parse(localStorage.getItem(storageKey)||'null');if(Number.isFinite(saved?.mapRatio)&&saved.mapRatio>0&&saved.mapRatio<1)preference=saved.mapRatio;}catch{}
  function availableWidth(){return Math.max(0,world.clientWidth-(splitter.offsetWidth||12));}
  function paint(){
    frame=0;const layout=travelSplitLayout(availableWidth(),preference);
    if(toolbar)world.closest('.canvas-panel')?.style.setProperty('--travel-toolbar-height',toolbar.offsetHeight+'px');
    world.style.setProperty('--travel-map-width',layout.mapWidth+'px');
    guidePane.style.setProperty('--guide-font-size',layout.fontSize+'px');
    guidePane.style.setProperty('--guide-control-size',(12+(layout.fontSize-14)/2)+'px');
    splitter.setAttribute('aria-valuemin',String(Math.round(layout.minRatio*100)));
    splitter.setAttribute('aria-valuemax',String(Math.round(layout.maxRatio*100)));
    splitter.setAttribute('aria-valuenow',String(Math.round(layout.mapRatio*100)));
    splitter.setAttribute('aria-valuetext','地图 '+Math.round(layout.mapRatio*100)+'%，攻略 '+Math.round((1-layout.mapRatio)*100)+'%');
    return layout;
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(paint);}
  function save(){try{localStorage.setItem(storageKey,JSON.stringify({mapRatio:preference}));}catch{}}
  function change(ratio){preference=travelSplitLayout(availableWidth(),ratio).mapRatio;paint();}
  function start(event){
    if(event.button!==0||event.isPrimary===false||drag)return;
    event.preventDefault();event.stopPropagation();
    drag={id:event.pointerId,x:event.clientX,mapWidth:paint().mapWidth};
    splitter.setPointerCapture(event.pointerId);world.classList.add('travel-split-dragging');
  }
  function move(event){
    if(!drag||event.pointerId!==drag.id)return;
    event.preventDefault();event.stopPropagation();
    const available=availableWidth();if(available)change((drag.mapWidth+event.clientX-drag.x)/available);
  }
  function end(event){
    if(!drag||event.pointerId!==drag.id)return;
    const id=drag.id;drag=null;world.classList.remove('travel-split-dragging');save();event.stopPropagation();
    if(splitter.hasPointerCapture(id))splitter.releasePointerCapture(id);
  }
  function keyboard(event){
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();
    const current=paint(),available=availableWidth(),amount=event.shiftKey?40:20;
    if(event.key==='Home'){preference=defaultRatio;paint();}
    else if(event.key==='End')change(current.maxRatio);
    else if(available)change((current.mapWidth+(event.key==='ArrowLeft'?-amount:amount))/available);
    save();
  }
  function reset(){preference=defaultRatio;paint();save();}
  splitter.addEventListener('pointerdown',start);splitter.addEventListener('pointermove',move);
  for(const type of ['pointerup','pointercancel','lostpointercapture'])splitter.addEventListener(type,end);
  splitter.addEventListener('keydown',keyboard);splitter.addEventListener('dblclick',reset);
  splitter.setAttribute('aria-orientation','vertical');
  splitter.title='左右拖动调整地图与攻略比例；方向键微调，Home 或双击复原';
  const observer=new ResizeObserver(schedule);observer.observe(world);if(toolbar)observer.observe(toolbar);paint();
  return {destroy(){
    compact.removeEventListener('change',showView);for(const button of viewButtons)button.removeEventListener('click',chooseView);
    mapPane.hidden=false;guidePane.hidden=false;
    if(frame)cancelAnimationFrame(frame);observer.disconnect();
    const captured=drag?.id;drag=null;world.classList.remove('travel-split-dragging');
    if(captured!==undefined&&splitter.hasPointerCapture(captured))splitter.releasePointerCapture(captured);
    splitter.removeEventListener('pointerdown',start);splitter.removeEventListener('pointermove',move);
    for(const type of ['pointerup','pointercancel','lostpointercapture'])splitter.removeEventListener(type,end);
    splitter.removeEventListener('keydown',keyboard);splitter.removeEventListener('dblclick',reset);
  }};
}
