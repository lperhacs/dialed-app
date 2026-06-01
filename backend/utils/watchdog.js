'use strict';
const { Worker } = require('worker_threads');
const path = require('path');

// Event-loop stall watchdog.
//
// On May 28, 2026 the process froze mid-cron with no error and no restart:
// Railway's ON_FAILURE policy only catches a process that *exits*, so a hung
// (but still "alive") process stays down indefinitely. This watchdog converts
// a silent hang into a process exit the platform can recover from.
//
// Mechanism: the main thread writes Date.now() into a SharedArrayBuffer every
// HEARTBEAT_MS. A separate worker thread (which keeps running even when the
// main event loop is fully blocked) checks that timestamp; if the main thread
// hasn't updated it within STALL_MS, the worker force-exits the whole process.
//
// Threshold is deliberately generous so a legitimate long synchronous op (e.g.
// the VACUUM INTO backup on the shared node:sqlite connection) can't trip it.
const HEARTBEAT_MS = 2000;
const STALL_MS = Number(process.env.WATCHDOG_STALL_MS) || 120000; // 2 min

function startWatchdog() {
  if (process.env.WATCHDOG_DISABLED === '1') {
    console.log('[watchdog] disabled via WATCHDOG_DISABLED=1');
    return;
  }

  // BigInt64Array so Atomics can operate on it (Float64Array isn't allowed).
  // A ms epoch fits comfortably in 64 bits.
  const sab = new SharedArrayBuffer(8);
  const view = new BigInt64Array(sab);
  Atomics.store(view, 0, BigInt(Date.now()));

  // Heartbeat from the main thread. unref() so it never keeps the process
  // alive on its own during a clean shutdown.
  const beat = setInterval(() => {
    Atomics.store(view, 0, BigInt(Date.now()));
  }, HEARTBEAT_MS);
  beat.unref();

  const worker = new Worker(path.join(__dirname, 'watchdogWorker.js'), {
    workerData: { sab, stallMs: STALL_MS, checkMs: HEARTBEAT_MS },
  });
  // Don't block clean process exit on the watchdog worker.
  worker.unref();
  worker.on('error', (err) => {
    // If the watchdog itself fails, log it but never take down the app.
    console.error('[watchdog] worker error (no longer monitoring):', err.message);
  });

  console.log(`[watchdog] event-loop stall watchdog started (threshold ${STALL_MS}ms)`);
}

module.exports = { startWatchdog };
