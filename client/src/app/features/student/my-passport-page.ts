import { DatePipe, NgOptimizedImage } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { createSlowFlag } from '../../core/utils/slow-loading';
import { Skeleton } from '@btu/ui';
import { EMPTY, Observable, Subject, catchError, exhaustMap, finalize, map, of, tap } from 'rxjs';
import {
  API_ERROR_CODE,
  SKILL_CATEGORY_KEY,
  DEFAULT_STAMP_IMAGE_SIZE,
  STAMP_IMAGE_EXTENSION,
  STAMP_IMAGE_SIZE,
  STAMP_IMAGE_URL,
} from '../../core/constants';
import type { TranslationKey } from '../../core/i18n/ka';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { getApiErrorCode } from '../../core/models/api-error.model';
import { Passport } from '../../core/models/passport.model';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { FileDownloadService } from '../../core/services/file-download.service';

type PageState = 'loading' | 'ready' | 'error';

interface LoadResult {
  state: PageState;
  passport: Passport | null;
  errorKey: TranslationKey;
}

const GENERIC_ERROR_KEY: TranslationKey = 'myPassport.error.generic';

@Component({
  selector: 'app-my-passport-page',
  imports: [DatePipe, NgOptimizedImage, RouterLink, TranslatePipe, Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './my-passport-page.html',
  styleUrl: './my-passport-page.scss',
})
export class MyPassportPage {
  protected readonly language = inject(LanguageService).language;

  private readonly api = inject(ApiService);
  private readonly authService = inject(AuthService);
  private readonly fileDownload = inject(FileDownloadService);

  // toSignal subscribes and unsubscribes by itself; errors become part of the value
  private readonly loadResult = toSignal(this.loadPassport(), {
    initialValue: { state: 'loading', passport: null, errorKey: GENERIC_ERROR_KEY } as LoadResult,
  });
  protected readonly state = computed(() => this.loadResult().state);
  protected readonly isLoading = computed(() => this.state() === 'loading');
  protected readonly isSlow = createSlowFlag(this.isLoading);
  protected readonly passport = computed(() => this.loadResult().passport);
  protected readonly loadErrorKey = computed(() => this.loadResult().errorKey);

  // The page title: focused when the passport arrives (tabindex=-1 in the template)
  private readonly pageTitle = viewChild<ElementRef<HTMLElement>>('pageTitle');

  // Three placeholder rows while the skills list loads
  protected readonly skeletonItems = [1, 2, 3];

  protected readonly downloading = signal(false);
  protected readonly downloadFailed = signal(false);

  // exhaustMap: a second click during a running download is ignored
  private readonly downloadRequests = new Subject<Passport>();

  constructor() {
    effect(() => {
      if (this.state() === 'ready') {
        this.pageTitle()?.nativeElement.focus();
      }
    });
    this.downloadRequests
      .pipe(
        exhaustMap((passport) => this.downloadFile(passport)),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  // Unknown category: show the raw text from the data instead of nothing
  protected categoryLabelKey(category: string): TranslationKey | null {
    return SKILL_CATEGORY_KEY[category] ?? null;
  }

  protected stampSize(stampCode: string): { width: number; height: number } {
    return STAMP_IMAGE_SIZE[stampCode] ?? DEFAULT_STAMP_IMAGE_SIZE;
  }

  protected stampUrl(stampCode: string): string {
    return `${STAMP_IMAGE_URL}${stampCode}${STAMP_IMAGE_EXTENSION}`;
  }

  protected downloadPdf(passport: Passport): void {
    this.downloadRequests.next(passport);
  }

  private downloadFile(passport: Passport): Observable<unknown> {
    this.downloading.set(true);
    this.downloadFailed.set(false);

    const fallbackName = `${passport.passportId}-v${passport.latest.version}.pdf`;
    return this.api.downloadMyPassportPdf(fallbackName).pipe(
      tap((file) => this.fileDownload.save(file.blob, file.fileName)),
      catchError(() => {
        this.downloadFailed.set(true);
        return EMPTY;
      }),
      finalize(() => this.downloading.set(false)),
    );
  }

  private loadPassport(): Observable<LoadResult> {
    return this.api.getMyPassport().pipe(
      tap((passport) =>
        this.authService.setStudentName(`${passport.firstName} ${passport.lastName}`),
      ),
      map((passport): LoadResult => ({ state: 'ready', passport, errorKey: GENERIC_ERROR_KEY })),
      catchError((error) => {
        const notIssued = getApiErrorCode(error) === API_ERROR_CODE.PASSPORT_NOT_FOUND;
        const errorKey: TranslationKey = notIssued
          ? 'myPassport.error.PASSPORT_NOT_FOUND'
          : GENERIC_ERROR_KEY;
        return of<LoadResult>({ state: 'error', passport: null, errorKey });
      }),
    );
  }
}
