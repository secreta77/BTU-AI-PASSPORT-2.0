import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { Skeleton } from '@btu/ui';
import { Subject, catchError, exhaustMap, map, of, startWith, switchMap, tap } from 'rxjs';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ApiService } from '../../core/services/api.service';

const NOT_FOUND_HTTP_STATUS = 404;
// A malformed token is shown like an unknown one: the link is simply wrong
const BAD_REQUEST_HTTP_STATUS = 400;

type PageState = 'loading' | 'notFound' | 'error';

// Permanent link /p/:token (used on LinkedIn). It only looks up the latest code
// and sends the visitor to /verify/:code, so the verify page stays the one place for results.
@Component({
  selector: 'app-public-link-page',
  imports: [RouterLink, TranslatePipe, Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './public-link-page.html',
  styleUrl: './public-link-page.scss',
})
export class PublicLinkPage {
  protected readonly language = inject(LanguageService).language;
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  // Filled from the :token route parameter (withComponentInputBinding)
  readonly token = input.required<string>();

  protected readonly state = signal<PageState>('loading');

  private readonly retryClicks = new Subject<void>();

  constructor() {
    // switchMap: a new token cancels the old lookup.
    // exhaustMap: clicks on "try again" are ignored while a request is pending.
    toObservable(this.token)
      .pipe(
        switchMap((token) =>
          this.retryClicks.pipe(
            startWith(undefined),
            tap(() => this.state.set('loading')),
            exhaustMap(() => this.findLatestCode(token)),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((result) => {
        if (result.state === 'redirect') {
          // replaceUrl: the Back button must not return to this redirect page
          void this.router.navigate(['/verify', result.code], { replaceUrl: true });
          return;
        }
        this.state.set(result.state);
      });
  }

  protected retry(): void {
    this.retryClicks.next();
  }

  private findLatestCode(token: string) {
    return this.api.getPublicPassport(token).pipe(
      map((link) => ({ state: 'redirect' as const, code: link.latestCode })),
      catchError((error) => {
        const isWrongLink =
          error?.status === NOT_FOUND_HTTP_STATUS || error?.status === BAD_REQUEST_HTTP_STATUS;
        const state = isWrongLink ? 'notFound' : 'error';
        return of({ state } as { state: PageState });
      }),
    );
  }
}
