import { Pipe, PipeTransform, inject } from '@angular/core';
import { LanguageService, type TranslateParams } from './language.service';
import type { TranslationKey } from './ka';

// Usage: {{ 'header.title' | t }} or {{ 'verify.outdatedHint' | t: { n: 2 } }}
// pure: false so the text updates when the language signal changes.
@Pipe({ name: 't', pure: false })
export class TranslatePipe implements PipeTransform {
  private readonly languageService = inject(LanguageService);

  transform(key: TranslationKey, params?: TranslateParams): string {
    return this.languageService.translate(key, params);
  }
}
