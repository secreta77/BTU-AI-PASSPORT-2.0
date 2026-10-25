import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Skeleton } from '@btu/ui';
import {
  Observable,
  Subject,
  merge,
  catchError,
  concat,
  debounceTime,
  map,
  of,
  switchMap,
} from 'rxjs';
import { SEARCH_DEBOUNCE_MS } from '../../core/constants';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { AdminPassport } from '../../core/models/admin.model';
import { AdminSyncService } from '../../core/services/admin-sync.service';
import { ApiService } from '../../core/services/api.service';

type ListState = 'loading' | 'ready' | 'error';

interface ListResult {
  state: ListState;
  items: AdminPassport[];
}

const LOADING: ListResult = { state: 'loading', items: [] };

// Passport list: table on wide screens, cards on narrow ones. Search runs on the client.
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-admin-passports',
  imports: [DatePipe, ReactiveFormsModule, RouterLink, TranslatePipe, Skeleton],
  templateUrl: './admin-passports.html',
  styleUrl: './admin-passports.scss',
})
export class AdminPassports {
  protected readonly language = inject(LanguageService).language;
  private readonly api = inject(ApiService);
  private readonly sync = inject(AdminSyncService);

  private readonly reloads = new Subject<void>();

  // Reloads on retry and when a sync ends; toObservable also emits once at start (first load).
  // switchMap: a new load replaces an older one still running
  private readonly result = toSignal(
    merge(this.reloads, toObservable(this.sync.finishedRuns)).pipe(switchMap(() => this.load())),
    { initialValue: LOADING },
  );
  protected readonly state = computed(() => this.result().state);

  protected readonly search = new FormControl('', { nonNullable: true });
  private readonly searchText = toSignal(
    this.search.valueChanges.pipe(
      debounceTime(SEARCH_DEBOUNCE_MS),
      map((text) => text.trim().toLowerCase()),
    ),
    { initialValue: '' },
  );

  protected readonly visibleItems = computed(() => {
    const text = this.searchText();
    return this.result().items.filter((item) => this.matches(item, text));
  });

  // Three placeholder rows while the list loads
  protected readonly skeletonItems = [1, 2, 3];

  protected reload(): void {
    this.reloads.next();
  }

  private matches(item: AdminPassport, text: string): boolean {
    if (!text) {
      return true;
    }
    const name = `${item.firstName} ${item.lastName}`.toLowerCase();
    return item.passportId.toLowerCase().includes(text) || name.includes(text);
  }

  private load(): Observable<ListResult> {
    const request = this.api.getAdminPassports().pipe(
      map((items): ListResult => ({ state: 'ready', items })),
      catchError(() => of<ListResult>({ state: 'error', items: [] })),
    );
    return concat(of(LOADING), request);
  }
}
