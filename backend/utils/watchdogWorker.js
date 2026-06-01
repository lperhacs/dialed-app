'use strict';
// Runs on its own thread so it keeps ticking even when the main event loop is
// fully blocked. If the main thread's heartbeat goes stale past the threshold,
// the loop is hung — force-exit the whole process so the platform restarts it.
// process.exit() from a worker terminates the entire process, not just the worker.
const { workerData } = require('worker_threads');

const view = new BigInt64Array(workerData.sab);
const stallMs = workerData.stallMs;
const checkMs = Math.max(1000, Math.floor(workerData.checkMs));

setInterval(() => {
  const last = Number(Atomics.load(view, 0));
  const lag = Date.now() - last;
  if (lag > stallMs) {
    console.error(
      `[watchdog] event loop stalled for ${lag}ms (threshold ${stallMs}ms) — ` +
      `exiting so the platform can restart the service`
    );
    process.exit(1);
  }
}, checkMs);
