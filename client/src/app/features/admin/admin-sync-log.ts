import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Skeleton } from '@btu/ui';
import { Observable, Subject, catchError, concat, map, merge, of, switchMap } from 'rxjs';
import { SYNC_LOG_LEVEL } from '../../core/constants';
import type { TranslationKey } from '../../core/i18n/ka';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { SyncLogItem, SyncLogLevel } from '../../core/models/admin.model';
import { AdminSyncService } from '../../core/services/admin-sync.service';
import { ApiService } from '../../core/services/api.service';

type LogState = 'loading' | 'ready' | 'error';

interface LogResult {
  state: LogState;
  items: SyncLogItem[];
}

const LOADING: LogResult = { state: 'loading', items: [] };

const LEVEL_KEY: Record<SyncLogLevel, TranslationKey> = {
  [SYNC_LOG_LEVEL.INFO]: 'admin.log.level.info',
  [SYNC_LOG_LEVEL.ERROR]: 'admin.log.level.error',
  [SYNC_LOG_LEVEL.DUPLICATE]: 'admin.log.level.duplicate',
};

// Newest sync_log entries. Reloads when a sync ends.
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-admin-sync-log',
  imports: [DatePipe, TranslatePipe, Skeleton],
  templateUrl: './admin-sync-log.html',
  styleUrl: './admin-sync-log.scss',
})
export class AdminSyncLog {
  protected readonly language = inject(LanguageService).language;
  private readonly api = inject(ApiService);
  private readonly sync = inject(AdminSyncService);

  private readonly reloads = new Subject<void>();

  // toObservable also emits once at start, which is the first load
  private readonly result = toSignal(
    merge(this.reloads, toObservable(this.sync.finishedRuns)).pipe(switchMap(() => this.load())),
    { initialValue: LOADING },
  );
  protected readonly state = computed(() => this.result().state);
  // Newest first by time (same time: higher id first), whatever order the API sends
  protected readonly items = computed(() =>
    [...this.result().items].sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id - a.id,
    ),
  );

  protected readonly skeletonItems = [1, 2, 3];
  protected readonly levels = SYNC_LOG_LEVEL;

  protected reload(): void {
    this.reloads.next();
  }

  protected levelKey(level: SyncLogLevel): TranslationKey {
    return LEVEL_KEY[level];
  }

  private load(): Observable<LogResult> {
    const request = this.api.getAdminSyncLog().pipe(
      map((items): LogResult => ({ state: 'ready', items })),
      catchError(() => of<LogResult>({ state: 'error', items: [] })),
    );
    return concat(of(LOADING), request);
  }
}
