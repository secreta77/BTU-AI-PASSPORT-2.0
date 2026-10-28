// Dev helper: tests the automatic sync timer without waiting for real minutes. Run: npm run auto-sync-test
import assert from 'node:assert/strict';
import { startAutoSync } from '../sync/autoSync.js';
import { createSyncRunner } from '../sync/syncRunner.js';

let step = 0;
let failed = false;
async function scenario(name, work) {
  try {
    await work();
    step += 1;
    console.log(`ok ${step}  ${name}`);
  } catch (error) {
    failed = true;
    console.log(`FAIL  ${name}\n      ${error.message}`);
  }
}

// A fake clock: remembers the timer, and fires it by hand
function createFakeTimer() {
  const timer = { callback: null, delayMs: null, cleared: false, unrefCalled: false };
  return {
    state: timer,
    setTimer(callback, delayMs) {
      timer.callback = callback;
      timer.delayMs = delayMs;
      return { unref: () => { timer.unrefCalled = true; } };
    },
    clearTimer() { timer.cleared = true; },
    tick() { timer.callback(); },
  };
}

function createQuietOptions(extra = {}) {
  const messages = { logs: [], warnings: [] };
  return { messages, options: { log: (text) => messages.logs.push(text), warn: (text) => messages.warnings.push(text), ...extra } };
}

await scenario('off by default: nothing is started for empty, 0, null (no timer is made)', () => {
  for (const minutes of [undefined, null, 0]) {
    const fake = createFakeTimer();
    const { options } = createQuietOptions({ setTimer: fake.setTimer });
    assert.equal(startAutoSync({ minutes, ...options }), null, `minutes = ${minutes}`);
    assert.equal(fake.state.callback, null, 'no timer');
  }
});

await scenario('an invalid value (negative, under 1, NaN, Infinity) is off, with a warning that names the variable', () => {
  for (const minutes of [-5, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const fake = createFakeTimer();
    const { messages, options } = createQuietOptions({ setTimer: fake.setTimer });
    assert.equal(startAutoSync({ minutes, ...options }), null);
    assert.equal(fake.state.callback, null);
    assert.match(messages.warnings[0], /AUTO_SYNC_MINUTES/);
  }
});

await scenario('30 minutes: one timer of 1 800 000 ms that does not keep the process alive; the first sync is NOT at once', () => {
  const fake = createFakeTimer();
  const started = [];
  const runner = { start: () => { started.push('start'); return { status: 'started' }; } };
  const { messages, options } = createQuietOptions({ runner, setTimer: fake.setTimer });
  const auto = startAutoSync({ minutes: 30, ...options });
  assert.equal(auto.intervalMinutes, 30);
  assert.equal(fake.state.delayMs, 30 * 60 * 1000);
  assert.equal(fake.state.unrefCalled, true);
  assert.equal(started.length, 0, 'nothing runs before the first interval');
  assert.match(messages.logs[0], /every 30 minutes/);
});

await scenario('every tick starts a sync, and a tick during a running sync is skipped (the runner says no)', () => {
  const fake = createFakeTimer();
  let running = false;
  const runner = { start: () => (running ? null : ((running = true), { status: 'started' })) };
  const { messages, options } = createQuietOptions({ runner, setTimer: fake.setTimer });
  startAutoSync({ minutes: 30, ...options });
  fake.tick();
  fake.tick();
  assert.deepEqual(messages.logs.slice(1), ['[auto-sync] sync started', '[auto-sync] a sync is already running, skipped']);
});

await scenario('a runner that throws does not stop the timer or crash: a warning is written', () => {
  const fake = createFakeTimer();
  const runner = { start: () => { throw new Error('boom'); } };
  const { messages, options } = createQuietOptions({ runner, setTimer: fake.setTimer });
  startAutoSync({ minutes: 30, ...options });
  assert.doesNotThrow(() => fake.tick());
  assert.match(messages.warnings[0], /could not start a sync: boom/);
  assert.equal(fake.state.cleared, false);
});

await scenario('stop() clears the timer', () => {
  const fake = createFakeTimer();
  const { options } = createQuietOptions({ runner: { start: () => null }, setTimer: fake.setTimer, clearTimer: fake.clearTimer });
  startAutoSync({ minutes: 30, ...options }).stop();
  assert.equal(fake.state.cleared, true);
});

await scenario('with the REAL runner: two ticks while the first sync is running start only one sync; after it ends the next tick starts again', async () => {
  const fake = createFakeTimer();
  const runs = [];
  let finishRun = null;
  const runner = createSyncRunner({
    run: () => new Promise((resolve) => { runs.push('run'); finishRun = () => resolve({ summary: { rowsRead: 1, newAwards: 0, versionsIssued: 0, duplicates: 0, errors: 0 } }); }),
    logError: () => {},
  });
  const { options } = createQuietOptions({ runner, setTimer: fake.setTimer });
  startAutoSync({ minutes: 30, ...options });

  fake.tick();
  await Promise.resolve();
  fake.tick();
  assert.equal(runs.length, 1, 'the second tick must not start a second sync');
  assert.equal(runner.getStatus().running, true);

  finishRun();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(runner.getStatus().running, false);
  fake.tick();
  await Promise.resolve();
  assert.equal(runs.length, 2);
});

console.log(failed ? '\nSome scenarios FAILED.' : `\nAll ${step} scenarios passed.`);
process.exitCode = failed ? 1 : 0;
