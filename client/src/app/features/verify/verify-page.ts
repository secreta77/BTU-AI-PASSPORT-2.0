import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { catchError, map, of, switchMap, tap } from 'rxjs';
import { TX_EXPLORER_URL, VERSION_BADGE } from '../../core/constants';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { VerifyInfo } from '../../core/models/verify.model';
import { ApiService } from '../../core/services/api.service';
import { StatusBadge } from '../../shared/components/status-badge/status-badge';

const NOT_FOUND_HTTP_STATUS = 404;

type PageState = 'idle' | 'loading' | 'found' | 'notFound' | 'error';

interface LoadResult {
  state: PageState;
  info: VerifyInfo | null;
}

// Serves /verify and /verify/:code (the QR target). Typing a code only navigates,
// so QR and manual entry follow the same path.
@Component({
  selector: 'app-verify-page',
  imports: [ReactiveFormsModule, DatePipe, TranslatePipe, StatusBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './verify-page.html',
  styleUrl: './verify-page.scss',
})
export class VerifyPage {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  // Filled from the :code route parameter (withComponentInputBinding), undefined on /verify
  readonly code = input<string>();

  protected readonly codeControl = new FormControl('', { nonNullable: true });
  protected readonly state = signal<PageState>('idle');
  protected readonly info = signal<VerifyInfo | null>(null);

  // Changes on every "try again" click so the same code is requested once more
  private readonly attempt = signal(0);

  protected readonly badgeVariant = computed(() => {
    const info = this.info();
    return info && info.version === info.latestVersion
      ? VERSION_BADGE.LATEST
      : VERSION_BADGE.OUTDATED;
  });

  protected readonly isLatest = computed(() => this.badgeVariant() === VERSION_BADGE.LATEST);

  protected readonly txUrl = computed(() => {
    const info = this.info();
    if (!info) {
      return '';
    }
    return TX_EXPLORER_URL + info.txHash;
  });

  constructor() {
    const request = computed(() => ({ code: this.code(), attempt: this.attempt() }));

    // switchMap drops an older answer when the code changes while it is still loading
    toObservable(request)
      .pipe(
        tap(({ code }) => this.prepareRequest(code)),
        switchMap(({ code }) => this.loadInfo(code)),
        takeUntilDestroyed(),
      )
      .subscribe((result) => {
        this.state.set(result.state);
        this.info.set(result.info);
      });
  }

  protected submit(event: Event): void {
    // Without this the browser would reload the page (native form submit)
    event.preventDefault();
    const code = this.codeControl.value.trim().toUpperCase();
    if (!code) {
      return;
    }
    this.router.navigate(['/verify', code]);
  }

  protected retry(): void {
    this.attempt.update((value) => value + 1);
  }

  private prepareRequest(code: string | undefined): void {
    if (!code) {
      return;
    }
    // A QR link opens the page with a code: show it in the input as well
    this.codeControl.setValue(code);
    this.state.set('loading');
    this.info.set(null);
  }

  private loadInfo(code: string | undefined) {
    if (!code) {
      return of<LoadResult>({ state: 'idle', info: null });
    }
    return this.api.getVerifyInfo(code).pipe(
      map((info): LoadResult => ({ state: 'found', info })),
      catchError((error) => {
        const state = error?.status === NOT_FOUND_HTTP_STATUS ? 'notFound' : 'error';
        return of<LoadResult>({ state, info: null });
      }),
    );
  }
}
