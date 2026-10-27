import { Signal, effect, signal } from '@angular/core';

// After this time a waiting request gets an extra "server is waking up" hint (free hosting sleeps)
export const SLOW_REQUEST_MS = 5000;

// Returns true when isLoading has been true for SLOW_REQUEST_MS. It only reads the flag,
// so the request itself is never touched or cancelled. Call it in an injection context.
export function createSlowFlag(isLoading: Signal<boolean>): Signal<boolean> {
  const isSlow = signal(false);

  effect((onCleanup) => {
    if (!isLoading()) {
      isSlow.set(false);
      return;
    }
    const timerId = setTimeout(() => isSlow.set(true), SLOW_REQUEST_MS);
    onCleanup(() => clearTimeout(timerId));
  });

  return isSlow.asReadonly();
}
