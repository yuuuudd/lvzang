import {
  emptyJourneySelection, selectJourneyStop, setJourneyOrigin,
  setJourneyDestination, swapJourneySelection, clearJourneySelection,
  reconcileJourneySelection,
} from './travel-map-selection.js';

// This comparison is a view state. It never writes the accepted trip or profile.
export function createJourneyInspector({requestRoute, drawRoute, clearRoute, highlight, onMembershipChange, onOriginIntent}) {
  const panel = document.getElementById('map-journey-panel');
  const scopeNote = document.createElement('p');
  scopeNote.id = 'map-comparison-note';
  scopeNote.textContent = '点击地点只查看和比较路程；加入或移出行程，请使用对应按钮。';
  panel.prepend(scopeNote);
  const name = document.getElementById('map-place-name');
  const description = document.getElementById('map-place-description');
  const day = document.getElementById('map-place-day');
  const origin = document.getElementById('map-origin');
  const destination = document.getElementById('map-destination');
  const result = document.getElementById('map-journey-result');
  const retry = document.getElementById('map-journey-retry');
  const setOrigin = document.getElementById('map-set-origin');
  const setDestination = document.getElementById('map-set-destination');
  const swap = document.getElementById('map-swap');
  const clear = document.getElementById('map-clear-selection');
  const membership = document.getElementById('map-membership');
  const membershipStatus = document.getElementById('map-membership-status');
  let selection = emptyJourneySelection(), stops = new Map(), places = new Map();
  let mode = 'walk', active = false, token = 0, pairKey = null, isExample = false;
  let currentLocation = null, membershipBusy = false, membershipEnabled = true, fitComparison = true;
  const transport = () => mode === 'drive' ? '驾车' : '步行';

  function paint() {
    panel.hidden = !active;
    panel.dataset.selectionStage = selection.destinationId ? 'pair' : selection.originId ? 'origin' : 'idle';
    const focused = stops.get(selection.focusId);
    const place = places.get(selection.focusId);
    name.textContent = focused?.name || '选择地点，比较两地路程';
    description.textContent = place ? `${place.city} ${place.address}` : '先选起点，再选终点；可比较行程景点和探索地标。';
    day.textContent = focused?.kind === 'location' ? '当前位置 · 仅用于路程比较' : focused?.kind === 'exploration' ? '探索地标 · 未加入行程' : focused ? isExample ? '示例地点 · 未加入行程' : `已在行程${focused.dayIndex ? ` · 第${focused.dayIndex}天` : ''}` : '';
    origin.textContent = stops.get(selection.originId)?.name || '点击地点选择';
    destination.textContent = stops.get(selection.destinationId)?.name || '再选一处地点';
    const canFocus = active && Boolean(place);
    setOrigin.disabled = !canFocus;
    setDestination.disabled = !canFocus || !selection.originId || selection.focusId === selection.originId;
    swap.disabled = !active || !selection.originId || !selection.destinationId;
    clear.disabled = !active || !selection.originId;
    if (membership) {
      membership.hidden = !focused || focused.kind === 'location' || !onMembershipChange || !membershipEnabled;
      membership.disabled = !canFocus || membershipBusy || !membershipEnabled;
      membership.textContent = focused?.kind === 'exploration' || isExample ? '加入行程' : '移出行程';
    }
    highlight(selection);
  }

  function hint() {
    result.dataset.state = 'idle';
    result.textContent = selection.originId
      ? '起点已选好，点击另一处地点选择终点。'
      : '点击地点选择起点，再点另一处选择终点。';
  }

  async function calculate(force = false) {
    const from = places.get(selection.originId), to = places.get(selection.destinationId);
    if (!from || !to || selection.originId === selection.destinationId) {
      if (selection.originId && selection.destinationId) {
        result.dataset.state = 'loading';
        result.textContent = '正在核实选中的地点…';
      } else hint();
      return;
    }
    const key = JSON.stringify([mode, selection.originId, selection.destinationId, from.position, to.position]);
    if (!force && pairKey === key) return;
    pairKey = key;
    const version = ++token, requestMode = mode, fitView = fitComparison;
    clearRoute();
    retry.hidden = true;
    result.dataset.state = 'loading';
    result.textContent = `正在查询高德${transport()}路线…`;
    try {
      const route = await requestRoute(requestMode, from, to);
      if (!active || token !== version) return;
      drawRoute(route, selection.originId, selection.destinationId, {fitView});
      result.dataset.state = 'ready';
      result.textContent = `高德${transport()}约 ${(route.meters / 1000).toFixed(2)} 公里 · ${Math.ceil(route.seconds / 60)} 分钟`;
    } catch {
      if (!active || token !== version) return;
      result.dataset.state = 'error';
      result.textContent = `这两处地点暂无完整${transport()}路线，请重试或切换交通方式。`;
      retry.hidden = false;
    }
  }

  function change(next) {
    if (next === selection) return;
    const endpointsChanged = next.originId !== selection.originId || next.destinationId !== selection.destinationId;
    selection = next;
    if (endpointsChanged) {
      fitComparison = true;
      ++token;
      pairKey = null;
      retry.hidden = true;
      clearRoute();
    }
    paint();
    if (endpointsChanged) calculate();
  }

  const manualOrigin = next => {onOriginIntent?.();change(next);};
  setOrigin.onclick = () => manualOrigin(setJourneyOrigin(selection, selection.focusId));
  setDestination.onclick = () => change(setJourneyDestination(selection, selection.focusId));
  swap.onclick = () => manualOrigin(swapJourneySelection(selection));
  clear.onclick = () => manualOrigin(clearJourneySelection(selection));
  retry.onclick = () => calculate(true);
  if (membership) membership.onclick = async () => {
    const focused = stops.get(selection.focusId);
    if (!focused || membershipBusy || !onMembershipChange || !membershipEnabled) return;
    membershipBusy = true; membershipStatus.textContent = '正在更新行程…'; paint();
    try {
      const action = focused.kind === 'exploration' || isExample ? 'add' : 'remove';
      const applied = await onMembershipChange({action, stop: focused});
      membershipStatus.textContent = applied ? (action === 'add' ? '已加入行程，可随时移出。' : '已移出行程。想恢复时可搜索此地点，再加入。') : '本次未改变行程，请查看对话中的说明。';
    } catch (error) { membershipStatus.textContent = error.message || '更新未完成，原行程已保留。'; }
    finally { membershipBusy = false; paint(); }
  };

  return {
    reset({landmarkStops, mode: nextMode, preserve = false, preserveCamera = false, isExample: example = false, membershipEnabled: allowMembership = true}) {
      ++token;
      pairKey = null;
      active = false;
      places = new Map();
      stops = new Map(landmarkStops.map(stop => [stop.id, stop]));
      if (!preserve) currentLocation = null;
      if (currentLocation) {stops.set(currentLocation.id, {...currentLocation,kind:'location'});places.set(currentLocation.id,currentLocation);}
      mode = nextMode;
      isExample = example;
      membershipEnabled = Boolean(allowMembership);
      scopeNote.textContent = membershipEnabled
        ? '点击地点只查看和比较路程；加入或移出行程，请使用对应按钮。'
        : '点击地点可查看和比较路程；先完成这个目的地的攻略，再增删行程地点。';
      if (!membershipEnabled && membershipStatus) membershipStatus.textContent = '';
      const previousOrigin = selection.originId;
      selection = preserve ? reconcileJourneySelection(selection, [...stops.keys()]) : emptyJourneySelection();
      // Hiding the selected destination does not undo an explicit device origin.
      if (preserve && currentLocation && previousOrigin === currentLocation.id && !selection.originId) selection = setJourneyOrigin(selection, currentLocation.id);
      fitComparison = !preserveCamera;
      clearRoute();
      retry.hidden = true;
      paint();
      hint();
    },
    updatePlaces(nextPlaces) {
      places = new Map(nextPlaces);
      if (currentLocation) places.set(currentLocation.id,currentLocation);
      active = true;
      paint();
      calculate();
    },
    choose(id) {
      if (!active || !places.has(id)) return;
      const next = selectJourneyStop(selection, id);
      if (next.originId !== selection.originId) onOriginIntent?.();
      change(next);
    },
    setCurrentLocation(place) {
      const target = selection.focusId !== 'current-location' ? selection.focusId : selection.destinationId;
      currentLocation = place;
      stops.set(place.id,{...place,kind:'location'});places.set(place.id,place);active=true;
      let next = setJourneyOrigin(selection,place.id);
      if (target && stops.has(target)) next = setJourneyDestination(next,target);
      ++token;pairKey=null;fitComparison=true;clearRoute();
      change(next);
      // Same IDs can now refer to newer device coordinates. change() alone only
      // observes endpoint IDs, so always reconsider the coordinate-based key.
      paint();calculate();
    },
    pause() {
      ++token;
      pairKey = null;
      active = false;
      clearRoute();
      selection = clearJourneySelection(selection);
      retry.hidden = true;
      paint();
      hint();
    },
  };
}
