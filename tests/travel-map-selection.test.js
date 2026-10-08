import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyJourneySelection, selectJourneyStop, setJourneyOrigin, setJourneyDestination, swapJourneySelection, clearJourneySelection, reconcileJourneySelection} from '../public/src/travel-map-selection.js';

test('first landmark sets the origin and the next distinct landmark completes a comparison', () => {
  const empty = Object.freeze(emptyJourneySelection());
  assert.deepEqual(empty, {originId: null, destinationId: null, focusId: null, revision: 0});
  const origin = Object.freeze(selectJourneyStop(empty, 'gz-museum'));
  const pair = selectJourneyStop(origin, 'gz-square');
  assert.deepEqual(origin, {originId: 'gz-museum', destinationId: null, focusId: 'gz-museum', revision: 1});
  assert.deepEqual(pair, {originId: 'gz-museum', destinationId: 'gz-square', focusId: 'gz-square', revision: 2});
  assert.deepEqual(empty, {originId: null, destinationId: null, focusId: null, revision: 0});
});

test('same-origin clicks retain the pair and later landmarks replace only the destination', () => {
  const origin = selectJourneyStop(emptyJourneySelection(), 'gz-museum');
  assert.equal(selectJourneyStop(origin, 'gz-museum'), origin, 'an unchanged selection is a no-op');
  const pair = Object.freeze(selectJourneyStop(origin, 'gz-square'));
  const focusedOrigin = selectJourneyStop(pair, 'gz-museum');
  assert.deepEqual(focusedOrigin, {originId: 'gz-museum', destinationId: 'gz-square', focusId: 'gz-museum', revision: 3});
  const changedDestination = selectJourneyStop(focusedOrigin, 'gz-tower');
  assert.deepEqual(changedDestination, {originId: 'gz-museum', destinationId: 'gz-tower', focusId: 'gz-tower', revision: 4});
  assert.equal(selectJourneyStop(changedDestination, 'gz-tower'), changedDestination);
  assert.deepEqual(pair, {originId: 'gz-museum', destinationId: 'gz-square', focusId: 'gz-square', revision: 2});
});

test('explicit origin changes start a fresh comparison even when the origin is unchanged', () => {
  const pair = Object.freeze(selectJourneyStop(selectJourneyStop(emptyJourneySelection(), 'gz-museum'), 'gz-square'));
  assert.deepEqual(setJourneyOrigin(pair, 'gz-museum'), {originId: 'gz-museum', destinationId: null, focusId: 'gz-museum', revision: 3});
  const replacement = setJourneyOrigin(pair, 'gz-tower');
  assert.deepEqual(replacement, {originId: 'gz-tower', destinationId: null, focusId: 'gz-tower', revision: 3});
  assert.equal(setJourneyOrigin(replacement, 'gz-tower'), replacement);
  assert.equal(pair.destinationId, 'gz-square');
});

test('explicit destination requires an origin and cannot turn it into a self route', () => {
  const empty = emptyJourneySelection();
  assert.equal(setJourneyDestination(empty, 'gz-square'), empty);
  const origin = selectJourneyStop(empty, 'gz-museum');
  assert.equal(setJourneyDestination(origin, 'gz-museum'), origin);
  const pair = Object.freeze(setJourneyDestination(origin, 'gz-square'));
  assert.deepEqual(pair, {originId: 'gz-museum', destinationId: 'gz-square', focusId: 'gz-square', revision: 2});
  assert.deepEqual(setJourneyDestination(pair, 'gz-museum'), {originId: 'gz-museum', destinationId: 'gz-square', focusId: 'gz-museum', revision: 3});
});

test('invalid and unbounded landmark IDs leave selections and revisions unchanged', () => {
  const empty = Object.freeze(emptyJourneySelection());
  const pair = Object.freeze(selectJourneyStop(selectJourneyStop(empty, 'gz-museum'), 'gz-square'));
  for (const id of [null, undefined, 0, true, {}, [], '', ' ', '\n', ' gz-tower', 'gz-tower ', 'gz\u0000tower', 'a'.repeat(161)]) {
    for (const change of [selectJourneyStop, setJourneyOrigin, setJourneyDestination]) {
      assert.equal(change(empty, id), empty);
      assert.equal(change(pair, id), pair);
    }
  }
  assert.equal(selectJourneyStop(empty, 'a'.repeat(160)).originId.length, 160);
});

test('swapping requires a complete pair and preserves the focused landmark', () => {
  const empty = emptyJourneySelection();
  const origin = selectJourneyStop(empty, 'gz-museum');
  assert.equal(swapJourneySelection(empty), empty);
  assert.equal(swapJourneySelection(origin), origin);
  const pair = Object.freeze(selectJourneyStop(origin, 'gz-square'));
  const swapped = swapJourneySelection(pair);
  assert.deepEqual(swapped, {originId: 'gz-square', destinationId: 'gz-museum', focusId: 'gz-square', revision: 3});
  assert.deepEqual(swapJourneySelection(swapped), {originId: 'gz-museum', destinationId: 'gz-square', focusId: 'gz-square', revision: 4});
  assert.equal(pair.originId, 'gz-museum');
});

test('clearing invalidates an existing comparison but an already empty selection is unchanged', () => {
  const empty = emptyJourneySelection();
  assert.equal(clearJourneySelection(empty), empty);
  const origin = selectJourneyStop(empty, 'gz-museum');
  assert.deepEqual(clearJourneySelection(origin), {originId: null, destinationId: null, focusId: null, revision: 2});
  const pair = Object.freeze(selectJourneyStop(origin, 'gz-square'));
  const cleared = clearJourneySelection(pair);
  assert.deepEqual(cleared, {originId: null, destinationId: null, focusId: null, revision: 3});
  assert.equal(clearJourneySelection(cleared), cleared);
  assert.equal(pair.destinationId, 'gz-square');
});

test('reconciling missing either endpoint clears the whole comparison and invalidates its revision', () => {
  const pair = Object.freeze(selectJourneyStop(selectJourneyStop(emptyJourneySelection(), 'gz-museum'), 'gz-square'));
  assert.equal(reconcileJourneySelection(pair, ['gz-museum', 'gz-square', 'gz-tower']), pair);
  assert.equal(reconcileJourneySelection(pair, new Set(['gz-museum', 'gz-square'])), pair);
  for (const ids of [['gz-museum'], ['gz-square'], [], null, undefined, 'gz-museum']) {
    assert.deepEqual(reconcileJourneySelection(pair, ids), {originId: null, destinationId: null, focusId: null, revision: 3});
  }
  const origin = selectJourneyStop(emptyJourneySelection(), 'gz-museum');
  assert.equal(reconcileJourneySelection(origin, ['gz-museum']), origin);
  assert.deepEqual(reconcileJourneySelection(origin, ['gz-square']), {originId: null, destinationId: null, focusId: null, revision: 2});
  assert.equal(pair.destinationId, 'gz-square');
});

test('reconciliation ignores invalid available IDs and leaves an empty selection unchanged', () => {
  const empty = emptyJourneySelection();
  assert.equal(reconcileJourneySelection(empty, []), empty);
  const origin = selectJourneyStop(empty, 'gz-museum');
  assert.deepEqual(reconcileJourneySelection(origin, [null, {}, ' gz-museum', 'a'.repeat(161)]), {originId: null, destinationId: null, focusId: null, revision: 2});
});

test('a complete swap requires two valid distinct endpoint IDs', () => {
  for (const state of [
    {originId: 'gz-museum', destinationId: 'gz-museum', focusId: 'gz-museum', revision: 2},
    {originId: 'gz-museum', destinationId: {}, focusId: 'gz-museum', revision: 2},
    {originId: ' ', destinationId: 'gz-square', focusId: 'gz-square', revision: 2},
  ]) assert.equal(swapJourneySelection(Object.freeze(state)), state);
});

test('a disappearing focused landmark clears focus without discarding two available endpoints', () => {
  const state = Object.freeze({originId: 'gz-museum', destinationId: 'gz-square', focusId: 'gz-tower', revision: 4});
  assert.deepEqual(reconcileJourneySelection(state, ['gz-museum', 'gz-square']), {originId: 'gz-museum', destinationId: 'gz-square', focusId: null, revision: 5});
});
