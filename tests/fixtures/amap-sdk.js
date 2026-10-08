export const sdkSource=String.raw`
  window.mock.securityAtLoad=window._AMapSecurityConfig;
  class Pixel{constructor(x,y){this.x=x;this.y=y;}getX(){return this.x;}getY(){return this.y;}}
  class MapView {
    constructor(node,options){this.node=node;this.options=options;this.overlays=[];this.events={};this.pitch=options.pitch||0;this.rotation=options.rotation||0;this.zoom=options.zoom;this.center=[...options.center];this.pan=[0,0];window.mock.maps.push(this);this.bindGestures();const credits=document.createElement('div');credits.className='amap-copyright';credits.textContent='© 高德地图';credits.style.cssText='position:absolute;bottom:3px;right:8px;font-size:10px';node.append(credits);const fail=window.mock.mapFailures>0;if(fail)window.mock.mapFailures--;if(!window.mock.neverComplete)setTimeout(()=>this.emit(fail?'error':'complete'),window.mock.mapDelay);}
    bindGestures(){
      const surface=document.createElement('div');surface.className='fixture-map-surface';surface.style.cssText='position:absolute;inset:0;touch-action:none';this.node.append(surface);
      this.gestureStart=event=>{if(event.button!==0||event.target.closest('.map-marker,button,.amap-copyright,.fixture-scale'))return;this.drag={pointerId:event.pointerId,x:event.clientX,y:event.clientY,pan:[...this.pan],center:[...this.center]};this.node.setPointerCapture(event.pointerId);this.emit('dragstart');event.preventDefault();};
      this.gestureMove=event=>{if(!this.drag||event.pointerId!==this.drag.pointerId)return;const bounds=this.node.getBoundingClientRect(),dx=(event.clientX-this.drag.x)*this.node.clientWidth/bounds.width,dy=(event.clientY-this.drag.y)*this.node.clientHeight/bounds.height;this.pan=[this.drag.pan[0]+dx,this.drag.pan[1]+dy];this.center=[this.drag.center[0]-dx*.00001,this.drag.center[1]+dy*.00001];window.mock.drags.push({center:[...this.center],pan:[...this.pan]});for(const marker of this.overlays.filter(item=>item.kind==='marker'))this.positionMarker(marker);this.emit('mapmove');};
      this.gestureEnd=event=>{if(!this.drag||event.pointerId!==this.drag.pointerId)return;this.drag=null;this.emit('moveend');};
      this.gestureWheel=event=>{event.preventDefault();this.setZoom(this.zoom+(event.deltaY<0?1:-1));};
      this.node.addEventListener('pointerdown',this.gestureStart);this.node.addEventListener('pointermove',this.gestureMove);this.node.addEventListener('pointerup',this.gestureEnd);this.node.addEventListener('pointercancel',this.gestureEnd);this.node.addEventListener('wheel',this.gestureWheel,{passive:false});
    }
    on(event,callback){(this.events[event]||=[]).push(callback);}
    off(event,callback){this.events[event]=(this.events[event]||[]).filter(value=>value!==callback);}
    emit(event){for(const callback of [...(this.events[event]||[])])callback();}
    destroy(){window.mock.destroys++;this.node.removeEventListener('pointerdown',this.gestureStart);this.node.removeEventListener('pointermove',this.gestureMove);this.node.removeEventListener('pointerup',this.gestureEnd);this.node.removeEventListener('pointercancel',this.gestureEnd);this.node.removeEventListener('wheel',this.gestureWheel);this.node.replaceChildren();this.events={};this.overlays=[];}
    addControl(){const scale=document.createElement('div');scale.className='fixture-scale';scale.textContent='100 米';scale.style.cssText='position:absolute;bottom:7px;left:8px;font-size:10px';this.node.append(scale);}
    add(overlay){if(Array.isArray(overlay)){for(const item of overlay)this.add(item);return;}if(this.overlays.includes(overlay))return;this.overlays.push(overlay);overlay.map=this;if(overlay.kind==='marker'){overlay.projectedIndex=this.overlays.filter(item=>item.kind==='marker').length-1;overlay.content.style.position='absolute';this.node.append(overlay.content);this.positionMarker(overlay);}if(overlay.kind==='route'){const path=document.createElement('div');path.className='fixture-route';path.dataset.path=JSON.stringify(overlay.path);path.dataset.color=overlay.strokeColor||'';this.node.append(path);overlay.node=path;}}
    lngLatToContainer(position){
      const marker=this.overlays.find(item=>item.kind==='marker'&&item.position[0]===position[0]&&item.position[1]===position[1]),index=marker?.projectedIndex||0;
      window.mock.projections.push([...position]);
      const width=this.node.clientWidth,height=this.node.clientHeight,cx=width/2,cy=height/2,factor=2**((this.zoom||17)-(this.fitZoom||17));
      const bounds=this.fitBounds||{minX:this.center[0]-.01,maxX:this.center[0]+.01,minY:this.center[1]-.006,maxY:this.center[1]+.006};
      const left=Math.min(95,width*.24),right=width-left,top=Math.min(245,height*.52),bottom=height-55;
      const x=window.mock.clustered?cx+index*5:left+(position[0]-bounds.minX)/(bounds.maxX-bounds.minX||.004)*(right-left);
      const y=window.mock.clustered?height*.6:bottom-(position[1]-bounds.minY)/(bounds.maxY-bounds.minY||.004)*(bottom-top);
      return new Pixel(cx+(x-cx)*factor+this.pan[0],cy+(y-cy)*factor+this.pan[1]);
    }
    positionMarker(marker){const point=this.lngLatToContainer(marker.position),offset=marker.offset||new Pixel(0,0);marker.content.style.left=point.x-marker.content.offsetWidth/2+(offset.x||0)+'px';marker.content.style.top=point.y-marker.content.offsetHeight+(offset.y||0)+'px';}
    remove(overlay){if(Array.isArray(overlay)){for(const item of overlay)this.remove(item);return;}window.mock.removes++;this.overlays=this.overlays.filter(item=>item!==overlay);(overlay.content||overlay.node)?.remove();overlay.map=null;}
    clearMap(){window.mock.clears++;for(const overlay of this.overlays)(overlay.content||overlay.node)?.remove();this.overlays=[];}
    setFitView(overlays,immediately,avoid,maxZoom){
      this.pan=[0,0];if(maxZoom)this.zoom=maxZoom;this.fitZoom=this.zoom;
      const positions=overlays.flatMap(item=>item.position?[item.position]:item.path||[]);
      if(positions.length){const xs=positions.map(p=>p[0]),ys=positions.map(p=>p[1]);let minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);if(minX===maxX){minX-=.002;maxX+=.002;}if(minY===maxY){minY-=.003;maxY+=.003;}this.fitBounds={minX,maxX,minY,maxY};this.center=[(minX+maxX)/2,(minY+maxY)/2];}
      window.mock.fits.push({positions:overlays.map(item=>item.position||item.path),immediately,avoid,maxZoom,pitch:this.pitch,rotation:this.rotation});for(const marker of this.overlays.filter(item=>item.kind==='marker'))this.positionMarker(marker);this.emit('moveend');this.emit('zoomend');
    }
    setZoomAndCenter(zoom,center){this.zoom=zoom;this.fitZoom=zoom;this.center=[...center];this.pan=[0,0];this.fitBounds={minX:center[0]-.004,maxX:center[0]+.004,minY:center[1]-.003,maxY:center[1]+.003};window.mock.centers.push({zoom,center});for(const marker of this.overlays.filter(item=>item.kind==='marker'))this.positionMarker(marker);this.emit('zoomend');this.emit('moveend');}
    setPitch(pitch,immediately,duration){this.pitch=pitch;window.mock.pitches.push({pitch,immediately,duration});this.emit('pitchchange');}
    setRotation(rotation,immediately,duration){this.rotation=rotation;window.mock.rotations.push({rotation,immediately,duration});this.emit('rotatechange');}
    setCenter(center){this.center=[...center];this.pan=[0,0];window.mock.centers.push({zoom:this.zoom,center});this.emit('moveend');}
    setZoom(zoom){this.zoom=zoom;for(const marker of this.overlays.filter(item=>item.kind==='marker'))this.positionMarker(marker);this.emit('zoomchange');this.emit('zoomend');}
    zoomIn(){this.setZoom(this.zoom+1);}
    zoomOut(){this.setZoom(this.zoom-1);}
    getPitch(){return this.pitch;}
    getRotation(){return this.rotation;}
    getZoom(){return this.zoom;}
    getCenter(){return this.center;}
    getContainer(){return this.node;}
    resize(){this.emit('resize');}
  }
  class Marker{constructor(options){Object.assign(this,options);this.originalPosition=[...options.position];this.kind='marker';}setMap(map){this.map?.remove(this);if(map)map.add(this);}setOffset(offset){this.offset=offset;window.mock.offsets.push({id:this.content.dataset.stop,x:offset.x,y:offset.y,position:[...this.position]});this.map?.positionMarker(this);}getOffset(){return this.offset||new Pixel(0,0);}getPosition(){return this.position;}getContent(){return this.content;}}
  class Polyline{constructor(options){Object.assign(this,options);this.kind='route';}setMap(map){this.map?.remove(this);if(map)map.add(this);}getPath(){return this.path;}}
  class PlaceSearch {
    constructor(options){this.options=options;}
    search(name,callback){const city=this.options.city;window.mock.searches.push({name,...this.options,startTime:performance.now()});const fixture=window.mock.fixtures[city+'|'+name]||{};const index=window.mock.searches.length,base=city==='北京'?[116.4,39.9]:city==='珠海'?[113.5,22.2]:[113.3,23.1];const pois=fixture.pois||[{id:city+'-'+name,name,cityname:city+'市',address:'测试地址 '+index,location:[base[0]+((index-1)%6)*.003,base[1]-Math.floor((index-1)/6)*.004]}];window.mock.poiResults.push({name,city,pois});setTimeout(()=>callback(fixture.status||'complete',{poiList:{pois}}),fixture.delay||5);}
  }
  class Walking {
    search(from,to,optionsOrCallback,callback){callback=typeof optionsOrCallback==='function'?optionsOrCallback:callback;const request={id:window.mock.routes.length,mode:this instanceof Driving?'drive':'walk',from,to};window.mock.routes.push(request);const delay=window.mock.routeDelay||5,fail=window.mock.failRoutes,bend=[from[0]+.004,from[1]+.009],finish=()=>callback(fail?'error':'complete',{routes:[{distance:1485,time:321,steps:[{path:[from,bend]},{path:[bend,to]}]}]});if(window.mock.holdRoutes)window.mock.pendingRoutes.push({...request,finish});else setTimeout(finish,delay);}
  }
  class Driving extends Walking{}
  const sdkCallback=new URL(document.currentScript.src).searchParams.get('callback');
  // Core and service plugins become ready after the script load event, as the real SDK does.
  window.AMap={Map:MapView,Marker,Polyline,Pixel,plugin(plugins,callback){window.mock.plugins=plugins;setTimeout(()=>{Object.assign(window.AMap,{PlaceSearch,Walking,Driving,Scale:class{}});callback();},15);}};
  setTimeout(()=>window[sdkCallback]?.(),15);
`;
