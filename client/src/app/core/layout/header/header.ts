import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LANGUAGE } from '../../constants';
import { LanguageService } from '../../i18n/language.service';
import { TranslatePipe } from '../../i18n/translate.pipe';

@Component({
  selector: 'app-header',
  imports: [RouterLink, TranslatePipe],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class Header {
  protected readonly languageService = inject(LanguageService);

  protected readonly languages = [
    { code: LANGUAGE.KA, labelKey: 'lang.ka' },
    { code: LANGUAGE.EN, labelKey: 'lang.en' },
  ] as const;
}
