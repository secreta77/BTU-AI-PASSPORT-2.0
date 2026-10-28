// Starts a sync by itself every N minutes, with the same runner as the admin "Sync" button.
// OFF by default (AUTO_SYNC_MINUTES empty or 0): rows prepared in the Sheet must not be issued before a demo is ready.
// The runner allows one sync at a time, so a tick that meets a running sync does nothing and the next tick tries again.
// Render free instances sleep after ~15 minutes without requests, and a sleeping server has no timer.
// Something must call the API now and then (for example an uptime monitor on /api/health) to keep it awake.
import { syncRunner } from './syncRunner.js';

const MS_PER_MINUTE = 60 * 1000;

// minutes: number of minutes between two syncs. Empty, 0 or an invalid value = off (returns null).
// The other options are replaceable for tests. Returns { intervalMinutes, stop } or null.
export function startAutoSync({
  minutes,
  runner = syncRunner,
  setTimer = setInterval,
  clearTimer = clearInterval,
  log = console.log,
  warn = console.warn,
} = {}) {
  if (minutes === undefined || minutes === null || minutes === 0) {
    return null;
  }
  if (!Number.isFinite(minutes) || minutes < 1) {
    warn(`Auto-sync is off: AUTO_SYNC_MINUTES must be a number of at least 1, got ${minutes}.`);
    return null;
  }

  const timer = setTimer(() => runTick(runner, log, warn), minutes * MS_PER_MINUTE);
  timer.unref?.(); // never keeps the process alive by itself
  log(`Auto-sync is on: every ${minutes} minutes.`);
  return { intervalMinutes: minutes, stop: () => clearTimer(timer) };
}

function runTick(runner, log, warn) {
  try {
    const started = runner.start();
    log(started === null ? '[auto-sync] a sync is already running, skipped' : '[auto-sync] sync started');
  } catch (error) {
    // A problem here must never stop the server: the next tick tries again
    warn(`[auto-sync] could not start a sync: ${error.message}`);
  }
}
