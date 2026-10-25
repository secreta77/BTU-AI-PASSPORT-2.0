import { Pipe, PipeTransform, inject } from '@angular/core';
import { LanguageService, type Language, type TranslateParams } from './language.service';
import type { TranslationKey } from './ka';

// Usage: {{ 'header.title' | t: language() }}
//        {{ 'verify.outdatedHint' | t: language() : { n: 2 } }}
// The pipe is pure. The language is an argument so Angular runs it again when the language changes.
@Pipe({ name: 't' })
export class TranslatePipe implements PipeTransform {
  private readonly languageService = inject(LanguageService);

  transform(key: TranslationKey, language: Language, params?: TranslateParams): string {
    return this.languageService.translate(key, params, language);
  }
}
