import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LanguageService } from '../../core/i18n/language.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-admin-page',
  imports: [TranslatePipe],
  template: `
    <h1>{{ 'admin.title' | t: language() }}</h1>
    <p>{{ 'admin.subtitle' | t: language() }} {{ 'common.comingSoon' | t: language() }}</p>
  `,
})
export class AdminPage {
  protected readonly language = inject(LanguageService).language;
}
