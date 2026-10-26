import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { EMPTY, Observable, Subject, catchError, exhaustMap, finalize, tap } from 'rxjs';
import { API_ERROR_CODE, RESEND_COOLDOWN_SECONDS } from '../../core/constants';
import type { TranslationKey } from '../../core/i18n/ka';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { getApiErrorCode } from '../../core/models/api-error.model';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

type LoginStep = 'email' | 'code';

const OTP_CODE_PATTERN = /^\d{6}$/;

// API error code -> text. Anything else shows the generic text.
const VERIFY_ERROR_KEYS: Record<string, TranslationKey> = {
  [API_ERROR_CODE.INVALID_OTP]: 'login.error.INVALID_OTP',
  [API_ERROR_CODE.OTP_EXPIRED]: 'login.error.OTP_EXPIRED',
  [API_ERROR_CODE.OTP_LOCKED]: 'login.error.OTP_LOCKED',
};

// Two steps on one page: email -> code. The code stays a string (leading zeros).
@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login-page.html',
  styleUrl: './login-page.scss',
})
export class LoginPage {
  protected readonly language = inject(LanguageService).language;

  private readonly api = inject(ApiService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  protected readonly emailControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.email],
  });
  protected readonly codeControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.pattern(OTP_CODE_PATTERN)],
  });

  protected readonly step = signal<LoginStep>('email');
  protected readonly busy = signal(false);
  protected readonly errorKey = signal<TranslationKey | null>(null);
  protected readonly codeSentKey = signal<TranslationKey>('login.codeSent');
  // Seconds left until a new code can be requested; 0 = the resend button is active
  protected readonly resendSeconds = signal(0);

  private readonly codeInput = viewChild<ElementRef<HTMLInputElement>>('codeInput');
  private cooldownTimer: ReturnType<typeof setInterval> | undefined;

  // exhaustMap: while one request is running, further clicks are ignored (no double requests)
  private readonly codeRequests = new Subject<boolean>(); // true = "resend"
  private readonly loginRequests = new Subject<void>();

  constructor() {
    this.codeRequests
      .pipe(
        exhaustMap((isResend) => this.requestCode(isResend)),
        takeUntilDestroyed(),
      )
      .subscribe();
    this.loginRequests
      .pipe(
        exhaustMap(() => this.verifyCode()),
        takeUntilDestroyed(),
      )
      .subscribe();
    inject(DestroyRef).onDestroy(() => clearInterval(this.cooldownTimer));
  }

  // preventDefault: without it the browser would submit the form natively and reload the page
  protected sendCode(event: Event): void {
    event.preventDefault();
    if (this.emailControl.invalid) {
      this.errorKey.set('login.error.invalidEmail');
      return;
    }
    this.codeRequests.next(false);
  }

  protected resendCode(): void {
    if (this.busy() || this.resendSeconds() > 0) {
      return;
    }
    this.codeRequests.next(true);
  }

  protected login(event: Event): void {
    event.preventDefault();
    if (this.codeControl.invalid || !OTP_CODE_PATTERN.test(this.codeControl.value)) {
      this.errorKey.set('login.error.invalidCodeFormat');
      return;
    }
    this.loginRequests.next();
  }

  protected changeEmail(): void {
    this.codeControl.reset();
    this.errorKey.set(null);
    this.step.set('email');
  }

  private requestCode(isResend: boolean): Observable<unknown> {
    this.busy.set(true);
    this.errorKey.set(null);

    // The answer is the same for known and unknown emails, so we always move on
    return this.api.requestOtp(this.emailControl.value.trim()).pipe(
      tap(() => {
        this.codeSentKey.set(isResend ? 'login.resent' : 'login.codeSent');
        this.step.set('code');
        this.startCooldown();
        this.focusCodeInput();
      }),
      catchError(() => {
        this.errorKey.set('login.error.generic');
        return EMPTY;
      }),
      finalize(() => this.busy.set(false)),
    );
  }

  private verifyCode(): Observable<unknown> {
    this.busy.set(true);
    this.errorKey.set(null);

    return this.api.verifyOtp(this.emailControl.value.trim(), this.codeControl.value).pipe(
      tap((response) => {
        this.authService.login(response.token, response.expiresIn);
        void this.router.navigateByUrl('/my-passport');
      }),
      catchError((error) => {
        const code = getApiErrorCode(error);
        this.errorKey.set((code && VERIFY_ERROR_KEYS[code]) || 'login.error.generic');
        return EMPTY;
      }),
      finalize(() => this.busy.set(false)),
    );
  }

  private startCooldown(): void {
    clearInterval(this.cooldownTimer);
    this.resendSeconds.set(RESEND_COOLDOWN_SECONDS);
    this.cooldownTimer = setInterval(() => {
      this.resendSeconds.update((seconds) => seconds - 1);
      if (this.resendSeconds() <= 0) {
        clearInterval(this.cooldownTimer);
      }
    }, 1000);
  }

  // Wait for the code step to be drawn, then move the focus into its input
  private focusCodeInput(): void {
    afterNextRender(() => this.codeInput()?.nativeElement.focus(), { injector: this.injector });
  }
}
