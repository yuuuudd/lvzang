import {selectAmapPlace,selectAmapDistrict,mapDestinationKey,parseAmapRoute,amapNavigationUrl} from './travel-map-data.js';
import {createLandmarkMarker,setLandmarkState} from './travel-map-landmarks.js';
import {layoutLandmarks} from './travel-map-layout.js';
import {createJourneyInspector} from './travel-map-journey.js';
import {getExplorationLandmarks,getExplorationLandmark} from './travel-map-exploration.js';
import {createPacedQuery} from './travel-map-query.js';
import {locateCurrentPosition} from './travel-map-location.js';

let sdkPromise=null;
let configPromise=null;
let sdkLoadCount=0;
let sdkIdentity=null;
const SDK_TIMEOUT=20000,QUERY_TIMEOUT=12000;
const element=(tag,text,className)=>{const node=document.createElement(tag);if(text!=null)node.textContent=text;if(className)node.className=className;return node;};
const button=(text,action)=>{const node=element('button',text,'text-button');node.type='button';node.onclick=action;return node;};
const lookupKey=(city,stop)=>JSON.stringify([city,stop.name,stop.aliases||[]]);
const routeKey=(mode,from,to)=>JSON.stringify([mode,from.position,to.position]);
const catalogLandmark=(city,stop)=>[stop.id,stop.name,...(Array.isArray(stop.aliases)?stop.aliases:[])].map(value=>getExplorationLandmark(city,value)).find(Boolean);
const sameLandmark=(city,a,b)=>a.id===b.id||a.name===b.name||Boolean(catalogLandmark(city,a)?.id&&catalogLandmark(city,a).id===catalogLandmark(city,b)?.id);

async function configuration(){
  if(!configPromise)configPromise=fetch('/api/map/config',{cache:'no-store',signal:AbortSignal.timeout(QUERY_TIMEOUT)}).then(async response=>{if(!response.ok)throw new Error('暂时无法读取地图配置');return response.json();}).catch(error=>{configPromise=null;throw error;});
  return configPromise;
}

function loadSdk(config){
  const identity=JSON.stringify([config.key,config.serviceHost]);
  if(sdkPromise){if(sdkIdentity!==identity){const error=new Error('地图配置已更新');error.code='AMAP_CONFIG_CHANGED';throw error;}return sdkPromise;}
  sdkIdentity=identity;
  window._AMapSecurityConfig={serviceHost:new URL(config.serviceHost,location.origin).href};
  sdkPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.dataset.travelAmapSdk='true';
    const callbackName=`__lvzangAmapReady${++sdkLoadCount}`;
    const url=new URL('https://webapi.amap.com/maps');url.search=new URLSearchParams({v:'2.0',key:config.key,callback:callbackName}).toString();script.src=url.href;script.async=true;
    let settled=false;const timer=setTimeout(()=>fail(),SDK_TIMEOUT);
    const cleanup=()=>{clearTimeout(timer);delete window[callbackName];script.onerror=null;};
    const fail=()=>{if(settled)return;settled=true;cleanup();script.remove();sdkPromise=null;sdkIdentity=null;delete window.AMap;reject(new Error('高德地图加载失败，请检查网络后重试'));};
    window[callbackName]=()=>{if(settled)return;const sdk=window.AMap;if(!sdk?.Map||!sdk.plugin)return fail();try{sdk.plugin(['AMap.PlaceSearch','AMap.Walking','AMap.Driving','AMap.Scale'],()=>{if(settled)return;if(!sdk.PlaceSearch||!sdk.Walking||!sdk.Driving||!sdk.Scale)return fail();settled=true;cleanup();resolve(sdk);});}catch{fail();}};
    script.onerror=fail;
    document.head.append(script);
  });
  return sdkPromise;
}

function query(start){
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('高德查询超时')),QUERY_TIMEOUT);
    try{start((status,result)=>{clearTimeout(timer);if(status==='complete')resolve(result);else reject(new Error(status==='no_data'?'高德暂未找到结果':'高德查询失败'));});}catch{clearTimeout(timer);reject(new Error('高德查询失败'));}
  });
}

/** Provider results stay in this view cache; the accepted itinerary is never mutated. */
export function createTravelMap() {
  const viewport = document.getElementById('amap-viewport');
  const surface = document.querySelector('.route-map');
  const status = document.getElementById('map-status');
  const message = document.getElementById('map-message');
  const details = document.getElementById('map-details');
  const locationDetails = document.getElementById('map-location-details');
  const modeSelect = document.getElementById('map-route-mode');
  const cameraButton = document.getElementById('map-camera-toggle');
  const fitButton = document.getElementById('map-fit');
  const northButton = document.getElementById('map-reset-bearing');
  const explorationButton = document.getElementById('map-exploration-toggle');
  const zoomInButton = document.getElementById('map-zoom-in');
  const zoomOutButton = document.getElementById('map-zoom-out');
  const densitySelect = document.getElementById('map-density');
  const categorySelect = document.getElementById('map-category');
  const locationButton = document.getElementById('map-use-location');
  const locationStatus = document.getElementById('map-location-status');
  const searchForm = document.getElementById('map-search-form');
  const searchInput = document.getElementById('map-search-input');
  const searchStatus = document.getElementById('map-search-status');
  const searchResults = document.getElementById('map-search-results');
  densitySelect.setAttribute('aria-label','地标密度');
  categorySelect.setAttribute('aria-label','地标分类');
  let map = null, mapReadyPromise = null, sdk = null, generation = 0;
  let currentPlan = null, landmarkStops = [], mode = 'walk', available = false, threeD = true;
  let currentDestination = null;
  let acceptedStops = [], excludedPlaces = [], excludedIds = [], showExploration = true, cameraMoved = false, isExample = false;
  let density = 'signature', category = 'all', membershipChange = null, activeDayIndex = 1;
  let locationToken = 0, searchToken = 0, currentLocation = null, locationMarker = null, locationPending = false;
  const searchedPlaces = new Map();
  // Track user input separately from SDK zoom events, which also fire during fit().
  viewport.addEventListener('wheel', () => {cameraMoved = true;}, {capture: true, passive: true});
  viewport.addEventListener('touchstart', event => {if (event.touches.length > 1) cameraMoved = true;}, {capture: true, passive: true});
  viewport.addEventListener('keydown', event => {if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','+','-','='].includes(event.key)) cameraMoved = true;}, true);
  const viewOptions = (preserveSelection = false) => ({landmarkStops: acceptedStops, excludedPlaces, excludedIds, preserveSelection, preserveCamera: true, isExample, onMembershipChange: membershipChange, activeDayIndex});
  let resolved = new Map(), markers = [], markerById = new Map(), rows = new Map();
  let drawn = new Set(), displayedRoutes = new Set(), selectionLine = null;
  const places = new Map(), placeRequests = new Map(), routes = new Map(), routeRequests = new Map();
  const destinations = new Map(), destinationRequests = new Map();
  const enqueuePlaceQuery = createPacedQuery();
  const isCurrent = token => generation === token;
  const svgNamespace = 'http://www.w3.org/2000/svg';
  const leaders = document.createElementNS(svgNamespace, 'svg');
  leaders.classList.add('landmark-leaders');
  leaders.setAttribute('aria-hidden', 'true');
  surface.append(leaders);
  let layoutFrame = null;

  function layoutMarkers() {
    if (!map?.lngLatToContainer || !sdk?.Pixel) return;
    const width = viewport.clientWidth, height = viewport.clientHeight;
    if (!width || !height) return;
    const items = [...markerById].map(([id, {content}]) => {
      const point = map.lngLatToContainer(resolved.get(id).position);
      return {id, x: point.x ?? point.getX(), y: point.y ?? point.getY(), width: content.offsetWidth, height: content.offsetHeight};
    });
    const caption = document.getElementById('map-landmark-caption');
    const top = Math.max(90, Math.ceil((caption.getBoundingClientRect().bottom - viewport.getBoundingClientRect().top) / (viewport.getBoundingClientRect().width / width)) + 12);
    // Dense discovery stays anchored to geography. Large packing offsets made a
    // city look like a board of buildings disconnected from the road network.
    const offsets = density === 'detailed' ? items.map(item=>({id:item.id,dx:0,dy:0})) : layoutLandmarks(items, {width, height, top, bottom: 32, gap: 12}).map(item=>{
      const length=Math.hypot(item.dx,item.dy),factor=length>36?36/length:1;
      return {...item,dx:item.dx*factor,dy:item.dy*factor};
    });
    const nodes = [];
    leaders.setAttribute('viewBox', `0 0 ${width} ${height}`);
    for (const {id, dx, dy} of offsets) {
      const item = items.find(point => point.id === id), marker = markerById.get(id);
      if (!item || !marker) continue;
      if (marker.dx !== dx || marker.dy !== dy) {
        marker.marker.setOffset?.(new sdk.Pixel(dx, dy));
        marker.dx = dx; marker.dy = dy;
      }
      if (item.x < 0 || item.x > width || item.y < 0 || item.y > height) continue;
      if (Math.hypot(dx, dy) > 2) {
        const line = document.createElementNS(svgNamespace, 'line');
        for (const [attribute, value] of Object.entries({x1:item.x, y1:item.y, x2:item.x+dx, y2:item.y+dy})) line.setAttribute(attribute, value);
        nodes.push(line);
      }
      const dot = document.createElementNS(svgNamespace, 'circle');
      dot.setAttribute('cx', item.x); dot.setAttribute('cy', item.y); dot.setAttribute('r', '3.5');
      nodes.push(dot);
    }
    leaders.replaceChildren(...nodes);
  }
  function scheduleLayout() {
    if (layoutFrame !== null) return;
    layoutFrame = requestAnimationFrame(() => {layoutFrame = null; layoutMarkers();});
  }
  new ResizeObserver(()=>{map?.resize?.();scheduleLayout();}).observe(viewport);

  function clearSelectedRoute() {
    if (selectionLine) map?.remove?.(selectionLine);
    selectionLine = null;
  }
  function cancelLocation(note = '') {
    ++locationToken;
    locationPending = false;
    locationButton.disabled = !available;
    locationStatus.dataset.state = 'idle';
    locationStatus.textContent = note;
  }
  const journey = createJourneyInspector({
    onMembershipChange: change => membershipChange?.({...change,dayIndex:activeDayIndex}) ?? Promise.resolve(false),
    onOriginIntent: () => cancelLocation(),
    requestRoute: requestJourney,
    clearRoute: clearSelectedRoute,
    drawRoute(route, _originId, _destinationId, {fitView = true} = {}) {
      clearSelectedRoute();
      selectionLine = new sdk.Polyline({
        path: route.path, strokeColor: '#176b62', strokeWeight: 6, strokeOpacity: .96,
        zIndex: 120, extData: {kind: 'comparison'},
      });
      map.add(selectionLine);
      if (fitView) map.setFitView([selectionLine], true, [135, 70, 80, 80], 17);
    },
    highlight(selection) {
      for (const [id, marker] of markerById) setLandmarkState(marker.content, {
        origin: id === selection.originId, destination: id === selection.destinationId,
        focused: id === selection.focusId,
      });
    },
  });

  function controls(enabled) {
    for (const control of [cameraButton, fitButton, northButton, zoomInButton, zoomOutButton]) control.disabled = !enabled;
    explorationButton.setAttribute('aria-pressed', String(showExploration));
    cameraButton.setAttribute('aria-pressed', String(threeD));
    cameraButton.textContent = threeD ? '3D 视角' : '俯视视角';
    cameraButton.title = threeD ? '切换为俯视地图' : '切换为立体地图';
    locationButton.disabled = !enabled || locationPending;
    searchForm.querySelector('button').disabled = !enabled;
  }
  function clear() {
    if (layoutFrame !== null) {cancelAnimationFrame(layoutFrame); layoutFrame = null;}
    leaders.replaceChildren();
    clearSelectedRoute();
    map?.clearMap();
    locationMarker = null;
    markers = []; markerById = new Map();
    drawn = new Set(); displayedRoutes = new Set(); resolved = new Map(); rows = new Map();
    details.replaceChildren();
    locationDetails.hidden = true;
  }
  function setStatus(text, phase) {status.textContent = text; surface.dataset.mapPhase = phase;}
  function resetNavigation() {
    document.querySelectorAll('[data-navigation-stop]').forEach(link => {
      const stop = currentPlan?.stops.find(item => item.id === link.dataset.navigationStop);
      if (!stop) return;
      link.href = 'https://uri.amap.com/search?keyword=' + encodeURIComponent((stop.city || currentPlan.city) + stop.name);
      link.textContent = '在高德搜索'; link.dataset.locationStatus = 'unresolved';
    });
  }
  function navigation() {
    currentPlan.stops.forEach((stop, index) => {
      const place = resolved.get(stop.id); if (!place) return;
      const previous = resolved.get(currentPlan.stops[index - 1]?.id);
      const link = [...document.querySelectorAll('[data-navigation-stop]')].find(item => item.dataset.navigationStop === stop.id);
      if (!link) return;
      link.href = amapNavigationUrl({position: place.position, name: place.name, fromPosition: previous?.position, fromName: previous?.name, mode: mode === 'drive' ? 'car' : 'walk'});
      link.textContent = '在高德导航'; link.dataset.locationStatus = 'resolved';
    });
  }
  function showMessage(text, retry = false) {
    message.replaceChildren(element('p', text));
    if (retry) message.append(button('重新加载地图', () => {configPromise = null; render(currentPlan, viewOptions());}));
    message.hidden = false;
  }
  function mapFailure() {
    ++generation; ++searchToken; available = false; cancelLocation(); journey.pause(); clear(); controls(false);
    const failedMap = map; map = null; mapReadyPromise = null; failedMap?.destroy?.();
    resetNavigation(); modeSelect.disabled = true;
    setStatus('高德底图加载失败', 'error');
    showMessage('高德底图加载失败，请检查网络或配置后重试。', true);
  }
  function initializeMap() {
    if (mapReadyPromise) return mapReadyPromise;
    mapReadyPromise = new Promise((resolve, reject) => {
      const candidate = new sdk.Map(viewport, {
        viewMode: '3D', pitch: threeD ? 45 : 0, rotation: 0, showBuildingBlock: true,
        zoom: 4, center: [104, 35], resizeEnable: true, dragEnable: true, zoomEnable: true,
        scrollWheel: true, touchZoom: true, keyboardEnable: true,
        features: ['bg', 'road', 'building', 'point'],
      });
      map = candidate;
      const cleanup = () => {clearTimeout(timer); candidate.off?.('complete', complete); candidate.off?.('error', fail);};
      const fail = () => {cleanup(); candidate.destroy?.(); if (map === candidate) map = null; reject(new Error('高德底图加载失败'));};
      const complete = () => {
        cleanup();
        try {
          candidate.addControl(new sdk.Scale());
          candidate.on('dragstart', () => {cameraMoved = true;});
          candidate.on('error', () => {if (map === candidate) mapFailure();});
          for (const event of ['mapmove', 'zoomchange', 'moveend', 'zoomend', 'rotatechange', 'pitchchange']) {
            candidate.on(event, () => {if (map === candidate) scheduleLayout();});
          }
          resolve(candidate);
        } catch {if (map === candidate) map = null; candidate.destroy?.(); reject(new Error('高德地图控件加载失败'));}
      };
      const timer = setTimeout(fail, SDK_TIMEOUT);
      candidate.on('complete', complete); candidate.on('error', fail);
    }).catch(error => {mapReadyPromise = null; throw error;});
    return mapReadyPromise;
  }
  function fit({all = false} = {}) {
    // Automatic framing follows the active day. City-wide exploration and
    // other days remain available without shrinking nearby itinerary buildings.
    const focusStops = currentPlan.stops.length ? currentPlan.stops : landmarkStops.filter(stop => stop.kind === 'exploration');
    const focusMarkers = all ? markers : focusStops.map(stop => markerById.get(stop.id)?.marker).filter(Boolean);
    if (focusMarkers.length === 1) map.setZoomAndCenter(17, focusMarkers[0].getPosition());
    else if (focusMarkers.length > 1) map.setFitView(focusMarkers, true, [135, 60, 75, 75], 17);
    scheduleLayout();
  }
  async function destinationArea(city) {
    if(destinations.has(city))return destinations.get(city);
    if(!destinationRequests.has(city))destinationRequests.set(city,query(callback=>{
      sdk.plugin(['AMap.DistrictSearch'],()=>{
        try{if(!sdk.DistrictSearch)return callback('error');new sdk.DistrictSearch({subdistrict:0,extensions:'base',showbiz:false}).search(city,callback);}catch{callback('error');}
      });
    }).then(result=>{const area=selectAmapDistrict(result.districtList,city);if(area)destinations.set(city,area);return area;}).catch(()=>null).finally(()=>destinationRequests.delete(city)));
    return destinationRequests.get(city);
  }
  function collectLandmarks(plan,options) {
    const currentIds=new Set(plan.stops.map(stop=>stop.id));
    const merged=[...plan.stops,...(options.landmarkStops||plan.stops)].filter(stop=>currentIds.has(stop.id)||currentDestination?.level==='province'||mapDestinationKey(stop.city||plan.city)===mapDestinationKey(plan.city));
    acceptedStops=[...new Map(merged.filter(stop=>stop.kind!=='exploration').map(stop=>[stop.id,stop])).values()];
    const discoveries=showExploration?getExplorationLandmarks(plan.city,{acceptedStops,excludedPlaces,excludedIds,density,category}):[];
    const searched=[...searchedPlaces.values()].map(item=>item.stop).filter(stop=>!acceptedStops.some(accepted=>sameLandmark(plan.city,accepted,stop)));
    landmarkStops=[...new Map([...acceptedStops,...discoveries,...searched].map(stop=>[stop.id,stop])).values()];
  }
  function showCurrentLocation() {
    if (!currentLocation || !map || locationMarker) return;
    const content = element('span', '我的位置', 'map-current-location');
    locationMarker = new sdk.Marker({position:currentLocation.position,content,anchor:'bottom-center',zIndex:130,title:'我的位置'});
    map.add(locationMarker);
  }
  function report() {
    const count = currentPlan.stops.filter(stop => resolved.has(stop.id)).length;
    const explorers = landmarkStops.filter(stop => stop.kind === 'exploration' && resolved.has(stop.id)).length;
    const extra = explorers ? ` · ${explorers}处探索地标` : '';
    if (!currentPlan.stops.length) setStatus(`当天尚无地点${extra}`, 'empty');
    else setStatus(`高德地图 · ${count}/${currentPlan.stops.length}站已定位${extra}`, count ? 'ready' : 'resolving');
    message.hidden = true;
  }
  function rowFor(stop) {
    const row = element('section', null, 'map-place-row'); row.dataset.mapStop = stop.id;
    row.append(element('strong', stop.name), element('p', '正在高德核实地点…', 'fine'));
    details.append(row); rows.set(stop.id, row); return row;
  }
  function confirm(stop, place, token) {
    if (!isCurrent(token)) return;
    places.set(lookupKey(currentPlan.city, stop), place); resolved.set(stop.id, place);
    rows.get(stop.id).replaceChildren(element('strong', stop.name), element('p', `已定位：${place.name} · ${place.city} ${place.address}`, 'fine'));
    const index = currentPlan.stops.findIndex(item => item.id === stop.id);
    const dayIndex = stop.kind === 'exploration' ? null : stop.dayIndex || currentPlan.dayIndex || null;
    const dayStops = dayIndex ? landmarkStops.filter(item => item.dayIndex === dayIndex) : landmarkStops;
    const dayStopIndex = dayStops.findIndex(item => item.id === stop.id);
    const content = createLandmarkMarker(stop, {index: index >= 0 ? index : Math.max(0, dayStopIndex), dayIndex, isToday: index >= 0, isExample,compact:density==='detailed'});
    content.onclick = () => {
      if(locationPending)cancelLocation();
      journey.choose(stop.id);
    };
    const marker = new sdk.Marker({position: place.position, title: place.name, content, anchor: 'bottom-center', zIndex: index >= 0 ? 110 : 100});
    map.add(marker); markers.push(marker); markerById.set(stop.id, {marker, content});
    const followsDay = currentPlan.stops.length ? index >= 0 : stop.kind === 'exploration';
    if (!cameraMoved && followsDay) fit(); else scheduleLayout();
    navigation(); report(); journey.updatePlaces(resolved); drawRoutes(token);
  }
  function candidates(stop, result, token, error = '') {
    if (!isCurrent(token)) return;
    locationDetails.open = true;
    const row = rows.get(stop.id);
    row.replaceChildren(element('strong', stop.name), element('p', error || (result.candidates.length ? '存在多个或近似地点，请核对地址后选择。' : '尚未定位；请补充地址或更准确的地点名称。'), 'fine'));
    result.candidates.forEach(place => {
      const choice = button(`${place.name} · ${place.city} ${place.address}`, () => {
        if (!isCurrent(token)) return;
        places.set(lookupKey(currentPlan.city, stop), place);
        render(currentPlan, viewOptions());
      });
      choice.classList.add('map-place-choice'); row.append(choice);
    });
    const form = element('form', null, 'map-address-form'), input = element('input');
    input.placeholder = '街道、地址或更准确的名称'; input.maxLength = 120;
    input.setAttribute('aria-label', `补充${stop.name}的地址`);
    const submit = button('查询地址', () => {}); submit.type = 'submit'; submit.onclick = null;
    form.append(input, submit);
    form.onsubmit = async event => {
      event.preventDefault(); if (!input.value.trim()) return; submit.disabled = true;
      try {
        const result = await search(input.value.trim(), currentPlan.city);
        const selection = selectAmapPlace(result.poiList?.pois || [], {name: stop.name, city: currentPlan.city, aliases: stop.aliases || [],region:currentDestination});
        candidates(stop, selection, token, selection.candidates.length ? '地址查询结果，请选择要前往的地点。' : '该地址暂无结果，请更换地址查询。');
      } catch {candidates(stop, {candidates: []}, token, '地址查询失败，请重试。');}
    };
    row.append(form, button('重试地点查询', () => render(currentPlan, viewOptions())));
  }
  function search(keyword, city, priority = false) {
    const scope=currentDestination?.level==='province'&&mapDestinationKey(currentDestination.name)===mapDestinationKey(city)&&currentDestination.adcode?currentDestination.adcode:city;
    const service = new sdk.PlaceSearch({city:scope, citylimit: true, pageSize: 20, extensions: 'all'});
    return enqueuePlaceQuery(() => query(callback => service.search(keyword, (status, result) => callback(status === 'no_data' ? 'complete' : status, status === 'no_data' ? {poiList: {pois: []}} : result))),{priority});
  }
  async function locate(stop, city, token) {
    const region=currentDestination;
    const known=catalogLandmark(city,stop);
    const aliases=[...(stop.aliases||[]),...(known?.aliases||[]),...(known?[known.name]:[])];
    const key = lookupKey(city, stop);
    if (places.has(key)) return confirm(stop, places.get(key), token);
    if (!placeRequests.has(key)) placeRequests.set(key, search(known?.name||stop.name, city).then(result => {
      const selection = selectAmapPlace(result.poiList?.pois || [], {name: stop.name, city, aliases,region});
      if (selection.status === 'matched') places.set(key, selection.place);
      return selection;
    }).finally(() => placeRequests.delete(key)));
    try {
      const selection = await placeRequests.get(key); if (!isCurrent(token)) return;
      if (selection.status === 'matched') confirm(stop, selection.place, token); else candidates(stop, selection, token);
    } catch {candidates(stop, {candidates: []}, token, '地点查询失败，请重试或补充地址。');}
  }
  async function requestJourney(requestMode, from, to) {
    const key = routeKey(requestMode, from, to);
    if (routes.has(key)) return routes.get(key);
    if (!routeRequests.has(key)) {
      const service = requestMode === 'walk' ? new sdk.Walking({extensions: 'all'}) : new sdk.Driving({extensions: 'all'});
      routeRequests.set(key, query(callback => service.search(from.position, to.position, callback)).then(result => {
        const route = parseAmapRoute(result); if (!route) throw new Error('高德未返回完整路线');
        routes.set(key, route); return route;
      }).finally(() => routeRequests.delete(key)));
    }
    return routeRequests.get(key);
  }
  async function drawRoutes(token) {
    // An unresolved intermediate stop can never be bridged by the daily route.
    for (let index = 1; index < currentPlan.stops.length; index++) {
      if (!isCurrent(token)) return;
      const before = currentPlan.stops[index - 1], after = currentPlan.stops[index];
      const from = resolved.get(before.id), to = resolved.get(after.id); if (!from || !to) continue;
      const key = routeKey(mode, from, to), legKey = JSON.stringify([index, key]);
      if (drawn.has(legKey)) continue; drawn.add(legKey);
      const row = element('p', `${before.name} → ${after.name}：正在查询${mode === 'walk' ? '步行' : '驾车'}路线…`, 'map-route-estimate');
      row.dataset.mapLeg = String(index);
      const following = [...details.querySelectorAll('.map-route-estimate')].find(item => Number(item.dataset.mapLeg) > index);
      details.insertBefore(row, following || null);
      const requestMode = mode;
      try {
        const route = await requestJourney(requestMode, from, to); if (!isCurrent(token)) return;
        if (!displayedRoutes.has(key)) {
          map.add(new sdk.Polyline({path: route.path, strokeColor: '#507c22', strokeWeight: 4, strokeOpacity: .5, zIndex: 50}));
          displayedRoutes.add(key);
        }
        row.textContent = `${before.name} → ${after.name}：高德${requestMode === 'walk' ? '步行' : '驾车'}约 ${(route.meters / 1000).toFixed(2)} 公里 · ${Math.ceil(route.seconds / 60)} 分钟（高德查询估算）`;
      } catch {
        if (isCurrent(token)) {locationDetails.open = true; row.replaceChildren(element('span', `${before.name} → ${after.name}：高德路线查询失败，暂无交通距离与时间。`), button('重试路线', () => render(currentPlan, viewOptions())));}
      }
    }
  }
  async function render(plan, options = {}) {
    if (!plan) return;
    const cityChanged = currentPlan && currentPlan.city !== plan.city;
    const needsDestinationView=!map||!currentPlan||cityChanged;
    const preserveSelection = Boolean(options.preserveSelection && !cityChanged);
    if (!preserveSelection) cancelLocation();
    if (cityChanged) {currentDestination=null;searchedPlaces.clear();currentLocation=null;++searchToken;searchResults.replaceChildren();searchInput.value='';searchStatus.textContent='精选目录并非目的地所有地点；可以用高德搜索补充。';}
    currentPlan = plan;
    searchInput.placeholder=`搜索${plan.city}的景点、餐厅或商圈`;searchInput.setAttribute('aria-label',`搜索${plan.city}的地点`);
    membershipChange = options.onMembershipChange || null;
    activeDayIndex = options.activeDayIndex || plan.dayIndex || 1;
    isExample = Boolean(options.isExample);
    cameraMoved = Boolean(options.preserveCamera && map && !cityChanged);
    excludedPlaces = [...(options.excludedPlaces || [])]; excludedIds = [...(options.excludedIds || [])];
    collectLandmarks(plan,options);
    const token = ++generation;
    clear(); journey.reset({landmarkStops, mode, preserve: preserveSelection, preserveCamera: cameraMoved, isExample}); resetNavigation(); controls(false);
    locationDetails.open = false;
    surface.classList.remove('illustration', 'schematic'); modeSelect.disabled = false;
    setStatus('正在加载高德地图…', 'loading'); showMessage('正在连接高德地图…');
    try {
      const config = await configuration(); if (!isCurrent(token)) return;
      if (config.provider !== 'amap' || !config.enabled || !config.key || !config.serviceHost) {
        available = false; modeSelect.disabled = true; setStatus('高德地图尚未配置', 'unconfigured');
        showMessage('高德地图尚未配置。配置 JS API Key 与安全密钥后，可核实地点及交通路线。', true); return;
      }
      sdk = await loadSdk(config); if (!isCurrent(token)) return;
      await initializeMap(); if (!isCurrent(token)) return;
      // Clear the previous destination even if its replacement has no POIs yet.
      if(cityChanged&&!cameraMoved)map.setZoomAndCenter(4,[104,35]);
      const area=await destinationArea(plan.city);if(!isCurrent(token))return;
      currentDestination=area;collectLandmarks(plan,options);
      journey.reset({landmarkStops,mode,preserve:preserveSelection,preserveCamera:cameraMoved,isExample});
      if(needsDestinationView&&!cameraMoved&&area)map.setZoomAndCenter(area.zoom,area.position);
      map.resize?.(); available = true; controls(true);showCurrentLocation();
      if (!landmarkStops.length) {
        setStatus(`${plan.city} · 当天尚无地点 · 高德地图`, 'empty'); showMessage(area?`已定位${area.name}。这一天还没有可靠地点安排，可搜索地点或在对话中补充。`:`暂未定位“${plan.city}”，当前显示全国范围。可搜索具体地点或补充目的地名称。`); return;
      }
      setStatus(`高德地图 · 正在核实 ${landmarkStops.length} 处地标`, 'resolving'); message.hidden = true;
      landmarkStops.forEach(rowFor); locationDetails.hidden = false; await Promise.all(landmarkStops.map(stop => locate(stop, plan.city, token)));
      if (isCurrent(token)) {
        report(); locationDetails.open = resolved.size < landmarkStops.length;
        if (!resolved.size && plan.stops.length) setStatus('高德地图 · 地点待确认', 'unresolved');
      }
    } catch (error) {
      if (!isCurrent(token)) return;
      available = false; cancelLocation(); journey.pause(); controls(false); modeSelect.disabled = true;
      if (error.code === 'AMAP_CONFIG_CHANGED') {
        const previousMap = map; map = null; mapReadyPromise = null; previousMap?.destroy?.();
        setStatus('高德地图配置已更新', 'error'); showMessage('地图配置已更新，请刷新页面应用新配置。');
        message.append(button('刷新并重试', () => location.reload())); return;
      }
      setStatus('高德地图暂时不可用', 'error'); showMessage('高德地图加载失败，请检查网络或配置后重试。', true);
    }
  }
  modeSelect.onchange = () => {
    mode = modeSelect.value === 'drive' ? 'drive' : 'walk';
    render(currentPlan, viewOptions(true));
  };
  cameraButton.onclick = () => {
    if (!available) return;
    threeD = !threeD; map.setPitch?.(threeD ? 45 : 0, true);
    if (!threeD) map.setRotation?.(0, true);
    controls(true);
  };
  fitButton.onclick = () => {if (available) {cameraMoved = true;fit({all:true});}};
  northButton.onclick = () => {if (available) map.setRotation?.(0, true);};
  explorationButton.onclick = () => {showExploration = !showExploration; render(currentPlan, viewOptions(true));};
  densitySelect.onchange = () => {density=densitySelect.value;showExploration=density!=='itinerary';render(currentPlan,viewOptions(true));};
  categorySelect.onchange = () => {category=categorySelect.value;render(currentPlan,viewOptions(true));};
  locationButton.onclick = async () => {
    if (!available || locationPending) return;
    const version=++locationToken;
    locationPending=true;
    locationButton.disabled=true;locationStatus.dataset.state='loading';locationStatus.textContent='正在获取设备位置，请允许浏览器定位…';
    try {
      const place=await locateCurrentPosition(sdk);
      if (version!==locationToken || !available) return;
      currentLocation=place;if(locationMarker)map.remove(locationMarker);locationMarker=null;showCurrentLocation();
      cameraMoved=true;journey.setCurrentLocation(place);
      locationStatus.dataset.state='ready';locationStatus.textContent=place.warning||`已设为起点${place.accuracy?` · 精度约 ${Math.ceil(place.accuracy)} 米`:''}。点击想去的景点即可估算路程。`;
    } catch(error) {if(version===locationToken){locationStatus.dataset.state='error';locationStatus.textContent=error.message;}}
    finally {if(version===locationToken){locationPending=false;locationButton.disabled=!available;}}
  };
  searchForm.onsubmit = async event => {
    event.preventDefault();const term=searchInput.value.trim();if(!term||!available)return;
    const version=++searchToken,city=currentPlan.city;
    searchStatus.textContent=`正在高德搜索${city}的“${term}”…`;searchResults.replaceChildren();
    try {
      const result=await search(term,city,true);if(version!==searchToken||currentPlan.city!==city)return;
      const candidates=selectAmapPlace(result.poiList?.pois||[],{city,name:term,region:currentDestination}).candidates.slice(0,8);
      searchStatus.textContent=candidates.length?'核对地址后选择；查看地点不会自动加入行程。':'没有找到该目的地的匹配地点，请换个名称或补充地址。';
      for(const place of candidates){
        const choice=button(`${place.name} · ${place.address||place.city}`,async()=>{
          if(version!==searchToken||currentPlan.city!==city)return;
          const known=getExplorationLandmark(city,place.name);
          const accepted=acceptedStops.find(stop=>stop.name===place.name||known&&sameLandmark(city,stop,known));
          const providerId=String(place.id||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,100);
          if(!accepted&&!known&&!providerId){searchStatus.textContent='该结果缺少可确认的地点编号，请换一个候选。';return;}
          const stop=accepted||known||{id:'amap-'+providerId,name:place.name,city,kind:'exploration',aliases:[],source:''};
          if(searchedPlaces.size>=12)searchedPlaces.delete(searchedPlaces.keys().next().value);
          searchedPlaces.set(stop.id,{stop,place});places.set(lookupKey(city,stop),place);
          await render(currentPlan,viewOptions(true));
          if(version!==searchToken)return;
          cameraMoved=true;map.setZoomAndCenter?.(16,place.position);journey.choose(stop.id);searchResults.replaceChildren();
          searchStatus.textContent=`已定位${place.name}。可比较路程，也可明确加入行程。`;
        });
        choice.classList.add('map-search-choice');searchResults.append(choice);
      }
    }catch{if(version===searchToken)searchStatus.textContent='地点搜索失败，请检查网络后重试。';}
  };
  zoomInButton.onclick = () => {if (available) {cameraMoved = true; map.zoomIn();}};
  zoomOutButton.onclick = () => {if (available) {cameraMoved = true; map.zoomOut();}};
  controls(false);
  return {
    render,
    pause() {
      ++generation; ++searchToken; available=false; cancelLocation(); journey.pause(); clear(); resetNavigation(); controls(false);
      message.hidden = true; modeSelect.disabled = true;
      setStatus('可选示意图 · 地点、线路和距离未经高德核实', 'illustration');
    },
    get available() {return available;},
  };
}
