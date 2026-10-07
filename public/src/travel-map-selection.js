/** A fresh comparison; callers keep this view state separate from the accepted itinerary. */
export function emptyJourneySelection() {
  return {originId: null, destinationId: null, focusId: null, revision: 0};
}

function transition(state, originId, destinationId, focusId) {
  if (state.originId === originId && state.destinationId === destinationId && state.focusId === focusId) return state;
  return {originId, destinationId, focusId, revision: state.revision + 1};
}

function validId(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= 160
    && id.trim() === id && !/[\u0000-\u001f\u007f]/.test(id);
}

export function selectJourneyStop(state, id) {
  if (!validId(id)) return state;
  const destinationId = state.originId && id !== state.originId ? id : state.destinationId;
  return transition(state, state.originId || id, destinationId, id);
}

/** Setting an origin explicitly starts a fresh comparison, including for the existing origin. */
export function setJourneyOrigin(state, id) {
  if (!validId(id)) return state;
  return transition(state, id, null, id);
}

/** An origin is required; selecting that same point changes only focus. */
export function setJourneyDestination(state, id) {
  if (!validId(id) || !state.originId) return state;
  return transition(state, state.originId, id === state.originId ? state.destinationId : id, id);
}

/** Swapping direction retains the building currently shown in the place inspector. */
export function swapJourneySelection(state) {
  if (!validId(state.originId) || !validId(state.destinationId) || state.originId === state.destinationId) return state;
  return transition(state, state.destinationId, state.originId, state.focusId);
}

export function clearJourneySelection(state) {
  return transition(state, null, null, null);
}

export function reconcileJourneySelection(state, ids) {
  const available = new Set((Array.isArray(ids) || ids instanceof Set ? [...ids] : []).filter(validId));
  if ((state.originId && !available.has(state.originId)) || (state.destinationId && !available.has(state.destinationId))) {
    return clearJourneySelection(state);
  }
  return state.focusId && !available.has(state.focusId)
    ? transition(state, state.originId, state.destinationId, null)
    : state;
}
