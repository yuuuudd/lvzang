/** Pace request starts without waiting for earlier network responses. */
export function createPacedQuery({
  minimumIntervalMs = 400,
  clock = () => Date.now(),
  sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
} = {}) {
  const pending = [];
  let draining = false, lastStarted = null;

  async function drain() {
    draining = true;
    while (pending.length) {
      const {start, resolve, reject} = pending.shift();
      try {
        if (lastStarted !== null) {
          let delay = minimumIntervalMs - (clock() - lastStarted);
          while (delay > 0) {
            await sleep(delay);
            delay = minimumIntervalMs - (clock() - lastStarted);
          }
        }
        lastStarted = clock();
        // Promise settlement belongs to this caller; it does not block the queue.
        Promise.resolve(start()).then(resolve, reject);
      } catch (error) {
        reject(error);
      }
    }
    draining = false;
  }

  return start => new Promise((resolve, reject) => {
    pending.push({start, resolve, reject});
    if (!draining) drain();
  });
}
