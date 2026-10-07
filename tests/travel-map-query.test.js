import test from 'node:test';
import assert from 'node:assert/strict';
import {createPacedQuery} from '../public/src/travel-map-query.js';

test('eight concurrent place queries start immediately then at least 400 milliseconds apart', async () => {
  let now = 0;
  const started = [], waits = [];
  const enqueue = createPacedQuery({clock: () => now, sleep: async milliseconds => {
    waits.push(milliseconds);
    now += milliseconds;
  }});
  const results = Array.from({length: 8}, (_, index) => enqueue(() => {
    started.push(now);
    return index;
  }));
  assert.equal(started[0], 0, 'the first query starts in the first enqueue call');
  assert.deepEqual(await Promise.all(results), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(started, [0, 400, 800, 1200, 1600, 2000, 2400, 2800]);
  assert.deepEqual(waits, [400, 400, 400, 400, 400, 400, 400]);
});

test('an early timer wake cannot shorten the minimum spacing between starts', async () => {
  let now = 0, early = true;
  const started = [];
  const enqueue = createPacedQuery({clock: () => now, sleep: async milliseconds => {
    now += early ? milliseconds - 1 : milliseconds;
    early = false;
  }});
  await Promise.all([enqueue(() => started.push(now)), enqueue(() => started.push(now))]);
  assert.deepEqual(started, [0, 400]);
});

test('a rejected query and a synchronous start error do not prevent later starts', async () => {
  let now = 0;
  const started = [], networkError = new Error('provider rejected'), startError = new Error('start failed');
  const enqueue = createPacedQuery({clock: () => now, sleep: async milliseconds => {now += milliseconds;}});
  const results = await Promise.allSettled([
    enqueue(() => {started.push(now); return Promise.reject(networkError);}),
    enqueue(() => {started.push(now); throw startError;}),
    enqueue(() => {started.push(now); return 'third succeeded';}),
  ]);
  assert.deepEqual(started, [0, 400, 800]);
  assert.equal(results[0].status, 'rejected');
  assert.equal(results[0].reason, networkError);
  assert.equal(results[1].status, 'rejected');
  assert.equal(results[1].reason, startError);
  assert.deepEqual(results[2], {status: 'fulfilled', value: 'third succeeded'});
});

test('a slow network response remains pending while later requests start and resolve', async () => {
  let now = 0, finishSlow, firstFinished = false;
  const started = [];
  const enqueue = createPacedQuery({clock: () => now, sleep: async milliseconds => {now += milliseconds;}});
  const slow = enqueue(() => {
    started.push(now);
    return new Promise(resolve => {finishSlow = resolve;});
  });
  slow.then(() => {firstFinished = true;});
  const second = enqueue(() => {started.push(now); return 'second';});
  const third = enqueue(() => {started.push(now); return 'third';});
  assert.deepEqual(await Promise.all([second, third]), ['second', 'third']);
  assert.equal(firstFinished, false);
  assert.deepEqual(started, [0, 400, 800]);
  finishSlow('first');
  assert.equal(await slow, 'first');
});

test('time already elapsed since the previous start reduces the remaining wait', async () => {
  let now = 0;
  const started = [], waits = [];
  const enqueue = createPacedQuery({clock: () => now, sleep: async milliseconds => {waits.push(milliseconds); now += milliseconds;}});
  await enqueue(() => started.push(now));
  now = 150;
  await enqueue(() => started.push(now));
  now = 1100;
  await enqueue(() => started.push(now));
  assert.deepEqual(started, [0, 400, 1100]);
  assert.deepEqual(waits, [250]);
});

test('a custom minimum interval is applied to starts', async () => {
  let now = 0;
  const started = [];
  const enqueue = createPacedQuery({minimumIntervalMs: 750, clock: () => now, sleep: async milliseconds => {now += milliseconds;}});
  await Promise.all(Array.from({length: 3}, () => enqueue(() => started.push(now))));
  assert.deepEqual(started, [0, 750, 1500]);
});
