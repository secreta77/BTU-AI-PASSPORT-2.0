// Runs a sync in the background for the admin API. Waiting for the blockchain takes minutes, far too long for one
// HTTP request, so POST /api/admin/sync only starts it and the admin page asks GET /api/admin/sync/status.
// The state lives in server memory and is lost on restart (enough for the MVP, docs/api.md).
// It guards against two syncs in THIS server only: a second one started with `npm run sync` is not noticed.
import { runSync } from './syncService.js';

const MAX_ERROR_LENGTH = 300; // the status is shown on a page: keep the text short

// `run`, `now` and `logError` are replaceable for tests
export function createSyncRunner({ run = runSync, now = () => new Date(), logError = console.error } = {}) {
  let state = { running: false, startedAt: null, finishedAt: null, summary: null, error: null };

  function finish(outcome) {
    state = { running: false, startedAt: state.startedAt, finishedAt: now(), summary: null, error: null, ...outcome };
  }

  return {
    // Starts a sync and returns at once. Returns null when one is already running.
    start() {
      if (state.running) {
        return null;
      }
      const startedAt = now();
      state = { running: true, startedAt, finishedAt: null, summary: null, error: null };

      // The `then` makes a problem that is thrown at once (not as a rejected promise) end up in the same place
      Promise.resolve()
        .then(() => run({ bootstrap: false, report: (line) => console.log(`[sync] ${line}`) }))
        .then(({ summary }) => finish({ summary }))
        .catch((error) => {
          logError('Sync failed:', error);
          finish({ error: shorten(error.message) });
        });
      return { status: 'started', startedAt };
    },

    // A copy, so nobody can change the state from outside
    getStatus() {
      return { ...state };
    },
  };
}

function shorten(text) {
  return text.length > MAX_ERROR_LENGTH ? `${text.slice(0, MAX_ERROR_LENGTH - 1)}…` : text;
}

// The one runner of the server
export const syncRunner = createSyncRunner();
