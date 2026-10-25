import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LANGUAGE } from '../../constants';
import { LanguageService } from '../../i18n/language.service';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { AuthService } from '../../services/auth.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-header',
  imports: [RouterLink, TranslatePipe],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class Header {
  protected readonly language = inject(LanguageService).language;

  protected readonly languageService = inject(LanguageService);
  protected readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly languages = [
    { code: LANGUAGE.KA, labelKey: 'lang.ka' },
    { code: LANGUAGE.EN, labelKey: 'lang.en' },
  ] as const;

  protected logout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/login');
  }
}
