import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { API_ERROR_CODE } from '../../core/constants';
import type { TranslationKey } from '../../core/i18n/ka';
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
  imports: [ReactiveFormsModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login-page.html',
  styleUrl: './login-page.scss',
})
export class LoginPage {
  private readonly api = inject(ApiService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

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

  // preventDefault: without it the browser would submit the form natively and reload the page
  protected sendCode(event: Event): void {
    event.preventDefault();
    if (this.emailControl.invalid) {
      this.errorKey.set('login.error.invalidEmail');
      return;
    }
    this.busy.set(true);
    this.errorKey.set(null);

    // The answer is the same for known and unknown emails, so we always move on
    this.api.requestOtp(this.emailControl.value.trim()).subscribe({
      next: () => {
        this.busy.set(false);
        this.step.set('code');
      },
      error: () => {
        this.busy.set(false);
        this.errorKey.set('login.error.generic');
      },
    });
  }

  protected login(event: Event): void {
    event.preventDefault();
    if (this.codeControl.invalid || !OTP_CODE_PATTERN.test(this.codeControl.value)) {
      this.errorKey.set('login.error.invalidCodeFormat');
      return;
    }
    this.busy.set(true);
    this.errorKey.set(null);

    this.api.verifyOtp(this.emailControl.value.trim(), this.codeControl.value).subscribe({
      next: (response) => {
        this.authService.login(response.token, response.expiresIn);
        void this.router.navigateByUrl('/my-passport');
      },
      error: (error) => {
        this.busy.set(false);
        const code = getApiErrorCode(error);
        this.errorKey.set((code && VERIFY_ERROR_KEYS[code]) || 'login.error.generic');
      },
    });
  }

  protected changeEmail(): void {
    this.codeControl.reset();
    this.errorKey.set(null);
    this.step.set('email');
  }
}
