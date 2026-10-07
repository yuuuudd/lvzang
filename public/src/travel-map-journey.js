import {
  emptyJourneySelection, selectJourneyStop, setJourneyOrigin,
  setJourneyDestination, swapJourneySelection, clearJourneySelection,
  reconcileJourneySelection,
} from './travel-map-selection.js';

// This comparison is a view state. It never writes the accepted trip or profile.
export function createJourneyInspector({requestRoute, drawRoute, clearRoute, highlight}) {
  const panel = document.getElementById('map-journey-panel');
  const scopeNote = document.createElement('p');
  scopeNote.id = 'map-comparison-note';
  scopeNote.textContent = '点击建筑仅比较路程，不会加入行程。想加入某处，可在对话中明确提出。';
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
  let selection = emptyJourneySelection(), stops = new Map(), places = new Map();
  let mode = 'walk', active = false, token = 0, pairKey = null, isExample = false;
  const transport = () => mode === 'drive' ? '驾车' : '步行';

  function paint() {
    panel.hidden = !active;
    panel.dataset.selectionStage = selection.destinationId ? 'pair' : selection.originId ? 'origin' : 'idle';
    const focused = stops.get(selection.focusId);
    const place = places.get(selection.focusId);
    name.textContent = focused?.name || '选择建筑，比较两地路程';
    description.textContent = place ? `${place.city} ${place.address}` : '先选起点，再选终点；可比较行程景点和探索地标。';
    day.textContent = focused?.kind === 'exploration' ? '探索地标 · 未加入行程' : focused ? isExample ? '示例地点 · 未加入行程' : `已在行程${focused.dayIndex ? ` · 第${focused.dayIndex}天` : ''}` : '';
    origin.textContent = stops.get(selection.originId)?.name || '点击建筑选择';
    destination.textContent = stops.get(selection.destinationId)?.name || '再选一处建筑';
    const canFocus = active && Boolean(place);
    setOrigin.disabled = !canFocus;
    setDestination.disabled = !canFocus || !selection.originId || selection.focusId === selection.originId;
    swap.disabled = !active || !selection.originId || !selection.destinationId;
    clear.disabled = !active || !selection.originId;
    highlight(selection);
  }

  function hint() {
    result.dataset.state = 'idle';
    result.textContent = selection.originId
      ? '起点已选好，点击另一处建筑选择终点。'
      : '点击建筑选择起点，再点另一处选择终点。';
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
    const version = ++token, requestMode = mode;
    clearRoute();
    retry.hidden = true;
    result.dataset.state = 'loading';
    result.textContent = `正在查询高德${transport()}路线…`;
    try {
      const route = await requestRoute(requestMode, from, to);
      if (!active || token !== version) return;
      drawRoute(route, selection.originId, selection.destinationId);
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
      ++token;
      pairKey = null;
      retry.hidden = true;
      clearRoute();
    }
    paint();
    if (endpointsChanged) calculate();
  }

  setOrigin.onclick = () => change(setJourneyOrigin(selection, selection.focusId));
  setDestination.onclick = () => change(setJourneyDestination(selection, selection.focusId));
  swap.onclick = () => change(swapJourneySelection(selection));
  clear.onclick = () => change(clearJourneySelection(selection));
  retry.onclick = () => calculate(true);

  return {
    reset({landmarkStops, mode: nextMode, preserve = false, isExample: example = false}) {
      ++token;
      pairKey = null;
      active = false;
      places = new Map();
      stops = new Map(landmarkStops.map(stop => [stop.id, stop]));
      mode = nextMode;
      isExample = example;
      selection = preserve ? reconcileJourneySelection(selection, [...stops.keys()]) : emptyJourneySelection();
      clearRoute();
      retry.hidden = true;
      paint();
      hint();
    },
    updatePlaces(nextPlaces) {
      places = nextPlaces;
      active = true;
      paint();
      calculate();
    },
    choose(id) {
      if (!active || !places.has(id)) return;
      change(selectJourneyStop(selection, id));
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
