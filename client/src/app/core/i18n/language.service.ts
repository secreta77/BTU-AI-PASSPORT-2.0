import { Injectable, effect, signal } from '@angular/core';
import { DEFAULT_LANGUAGE, LANGUAGE, LANGUAGE_STORAGE_KEY } from '../constants';
import { en } from './en';
import { ka, type TranslationKey, type Translations } from './ka';

export type Language = (typeof LANGUAGE)[keyof typeof LANGUAGE];

export type TranslateParams = Record<string, string | number>;

const DICTIONARIES: Record<Language, Translations> = { ka, en };

@Injectable({ providedIn: 'root' })
export class LanguageService {
  readonly language = signal<Language>(this.readSavedLanguage());

  constructor() {
    // Keep <html lang> in sync (screen readers, hyphenation, search engines)
    effect(() => {
      document.documentElement.lang = this.language();
    });
  }

  setLanguage(language: Language): void {
    this.language.set(language);
    this.saveLanguage(language);
  }

  // params fill {name} placeholders, e.g. translate('verify.outdatedHint', { n: 2 })
  // language defaults to the current one; the translate pipe passes it in to stay pure
  translate(
    key: TranslationKey,
    params?: TranslateParams,
    language: Language = this.language(),
  ): string {
    const text = DICTIONARIES[language][key];
    if (!params) {
      return text;
    }
    return Object.entries(params).reduce(
      (result, [name, value]) => result.replaceAll(`{${name}}`, String(value)),
      text,
    );
  }

  // localStorage can throw (private window, blocked site data), so fall back to the default
  private readSavedLanguage(): Language {
    try {
      const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (saved === LANGUAGE.KA || saved === LANGUAGE.EN) {
        return saved;
      }
    } catch {
      // ignore: use default
    }
    return DEFAULT_LANGUAGE;
  }

  private saveLanguage(language: Language): void {
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // ignore: the choice just won't be remembered
    }
  }
}
