import { Injectable, inject, signal } from '@angular/core';
import { Subscription, exhaustMap, takeWhile, timer } from 'rxjs';
import { API_ERROR_CODE, SYNC_POLL_INTERVAL_MS } from '../constants';
import { SyncStatus } from '../models/admin.model';
import { getApiErrorCode } from '../models/api-error.model';
import { ApiService } from './api.service';

export type SyncState = 'idle' | 'starting' | 'running' | 'done' | 'failed';

// Starts a sync and polls its status until it ends. One place for this, so the sync panel,
// the passport list and the log all see the same state.
@Injectable({ providedIn: 'root' })
export class AdminSyncService {
  private readonly api = inject(ApiService);

  readonly state = signal<SyncState>('idle');
  readonly status = signal<SyncStatus | null>(null);
  // True when the server said "409: already running" (someone else started it)
  readonly alreadyRunning = signal(false);
  // Grows by one every time a sync ends: the list and the log reload when it changes
  readonly finishedRuns = signal(0);

  private pollSubscription: Subscription | undefined;

  // The state check blocks a second start while one is starting or running (same as exhaustMap)
  start(): void {
    if (this.state() === 'starting' || this.state() === 'running') {
      return;
    }
    this.state.set('starting');
    this.alreadyRunning.set(false);
    this.status.set(null);

    this.api.startAdminSync().subscribe({
      next: () => this.followRun(),
      error: (error) => {
        if (getApiErrorCode(error) === API_ERROR_CODE.SYNC_ALREADY_RUNNING) {
          this.alreadyRunning.set(true);
          this.followRun();
          return;
        }
        this.state.set('failed');
      },
    });
  }

  // The page was left while a sync was running: pick it up again when the admin returns
  resume(): void {
    if (this.state() === 'starting' || this.state() === 'running') {
      return;
    }
    this.api.getAdminSyncStatus().subscribe({
      next: (status) => {
        if (status.running) {
          this.status.set(status);
          this.followRun();
        }
      },
      error: () => undefined, // nothing to resume; the admin can still start a sync
    });
  }

  // Called when the admin page is left. The sync itself keeps running on the server.
  stopPolling(): void {
    this.pollSubscription?.unsubscribe();
    this.pollSubscription = undefined;
    if (this.state() === 'running' || this.state() === 'starting') {
      this.state.set('idle');
    }
  }

  // timer + exhaustMap: a new request starts only when the previous one is finished
  private followRun(): void {
    this.state.set('running');
    this.pollSubscription?.unsubscribe();
    this.pollSubscription = timer(SYNC_POLL_INTERVAL_MS, SYNC_POLL_INTERVAL_MS)
      .pipe(
        exhaustMap(() => this.api.getAdminSyncStatus()),
        takeWhile((status) => status.running, true), // true: the last (finished) status is kept
      )
      .subscribe({
        next: (status) => this.handleStatus(status),
        error: () => this.state.set('failed'),
      });
  }

  private handleStatus(status: SyncStatus): void {
    this.status.set(status);
    if (status.running) {
      return;
    }
    this.state.set(status.error ? 'failed' : 'done');
    this.finishedRuns.update((count) => count + 1);
  }
}
