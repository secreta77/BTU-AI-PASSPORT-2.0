import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { AdminAuthService } from '../../core/services/admin-auth.service';

// The admin types the key; it is only kept in AdminAuthService (never in code).
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-admin-login',
  imports: [ReactiveFormsModule, TranslatePipe],
  templateUrl: './admin-login.html',
  styleUrl: './admin-login.scss',
})
export class AdminLogin {
  protected readonly language = inject(LanguageService).language;
  protected readonly adminAuth = inject(AdminAuthService);

  protected readonly key = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });

  protected submit(event: Event): void {
    event.preventDefault(); // no page reload
    this.adminAuth.login(this.key.value);
  }
}
