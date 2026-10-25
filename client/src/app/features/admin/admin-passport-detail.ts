import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Skeleton, StatusBadge } from '@btu/ui';
import {
  EMPTY,
  Observable,
  Subject,
  catchError,
  concat,
  exhaustMap,
  finalize,
  map,
  of,
  switchMap,
  tap,
} from 'rxjs';
import {
  API_ERROR_CODE,
  TX_EXPLORER_URL,
  VERSION_BADGE,
  VERSION_STATUS,
} from '../../core/constants';
import type { TranslationKey } from '../../core/i18n/ka';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { getApiErrorCode } from '../../core/models/api-error.model';
import { Version } from '../../core/models/version.model';
import { ApiService } from '../../core/services/api.service';
import { FileDownloadService } from '../../core/services/file-download.service';

type PageState = 'loading' | 'ready' | 'error';

interface LoadResult {
  state: PageState;
  versions: Version[];
  errorKey: TranslationKey;
}

const LOADING: LoadResult = { state: 'loading', versions: [], errorKey: 'admin.loadError' };

// All issued versions of one passport (newest first), with PDF download for each.
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-admin-passport-detail',
  imports: [DatePipe, RouterLink, TranslatePipe, Skeleton, StatusBadge],
  templateUrl: './admin-passport-detail.html',
  styleUrl: './admin-passport-detail.scss',
})
export class AdminPassportDetail {
  protected readonly language = inject(LanguageService).language;
  private readonly api = inject(ApiService);
  private readonly fileDownload = inject(FileDownloadService);

  // :id from the route (withComponentInputBinding)
  readonly id = input.required<string>();

  private readonly result = toSignal(
    toObservable(this.id).pipe(switchMap((passportId) => this.load(passportId))),
    { initialValue: LOADING },
  );
  protected readonly state = computed(() => this.result().state);
  protected readonly versions = computed(() => this.result().versions);
  protected readonly errorKey = computed(() => this.result().errorKey);

  protected readonly skeletonItems = [1, 2];

  // Which version is downloading now (null = none); all download buttons are disabled meanwhile
  protected readonly downloadingVersion = signal<number | null>(null);
  protected readonly downloadFailed = signal(false);

  // exhaustMap: a second click during a running download is ignored
  private readonly downloadRequests = new Subject<Version>();

  constructor() {
    this.downloadRequests
      .pipe(
        exhaustMap((version) => this.downloadFile(version)),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  protected badgeVariant(version: Version): 'latest' | 'outdated' {
    return version.status === VERSION_STATUS.LATEST ? VERSION_BADGE.LATEST : VERSION_BADGE.OUTDATED;
  }

  protected badgeLabelKey(version: Version): TranslationKey {
    return version.status === VERSION_STATUS.LATEST ? 'status.latest' : 'status.outdated';
  }

  protected txUrl(version: Version): string {
    return `${TX_EXPLORER_URL}${version.txHash}`;
  }

  protected downloadPdf(version: Version): void {
    this.downloadRequests.next(version);
  }

  private downloadFile(version: Version): Observable<unknown> {
    this.downloadingVersion.set(version.version);
    this.downloadFailed.set(false);

    const passportId = this.id();
    const fallbackName = `${passportId}-v${version.version}.pdf`;
    return this.api.downloadAdminVersionPdf(passportId, version.version, fallbackName).pipe(
      tap((file) => this.fileDownload.save(file.blob, file.fileName)),
      catchError(() => {
        this.downloadFailed.set(true);
        return EMPTY;
      }),
      finalize(() => this.downloadingVersion.set(null)),
    );
  }

  private load(passportId: string): Observable<LoadResult> {
    const request = this.api.getAdminVersions(passportId).pipe(
      map((versions): LoadResult => ({ state: 'ready', versions, errorKey: LOADING.errorKey })),
      catchError((error) => {
        const notFound = getApiErrorCode(error) === API_ERROR_CODE.PASSPORT_NOT_FOUND;
        const errorKey: TranslationKey = notFound ? 'admin.versions.notFound' : 'admin.loadError';
        return of<LoadResult>({ state: 'error', versions: [], errorKey });
      }),
    );
    return concat(of(LOADING), request);
  }
}
