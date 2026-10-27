import { Injectable, effect, inject, signal } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { LANGUAGE, OG_IMAGE_URL, SITE_URL } from '../constants';
import { TranslationKey } from '../i18n/ka';
import { LanguageService } from '../i18n/language.service';

const SITE_NAME = 'BTU AI Passport';
const ROBOTS_INDEX = 'index, follow';
const ROBOTS_NOINDEX = 'noindex, nofollow';

// Set per route in app.routes.ts
interface SeoRouteData {
  titleKey?: TranslationKey;
  noindex?: boolean;
}

// Keeps <title>, meta description and meta robots in sync with the current route and language.
// The X-Robots-Tag header in netlify.toml is the main noindex; the meta tag is the second line.
@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly router = inject(Router);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly languageService = inject(LanguageService);

  private readonly routeData = signal<SeoRouteData>({});

  constructor() {
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(() => this.routeData.set(this.readDeepestRouteData()));

    // Runs again when the language changes, because translate() reads the language signal
    effect(() => {
      const { titleKey, noindex } = this.routeData();
      const pageTitle = titleKey ? this.languageService.translate(titleKey) : '';
      this.title.setTitle(pageTitle ? `${pageTitle} · ${SITE_NAME}` : SITE_NAME);
      const description = this.languageService.translate('seo.description');
      this.meta.updateTag({ name: 'description', content: description });
      this.updateSocialTags(
        pageTitle ? `${pageTitle} · ${SITE_NAME}` : SITE_NAME,
        description,
      );
      this.meta.updateTag({ name: 'robots', content: noindex ? ROBOTS_NOINDEX : ROBOTS_INDEX });
    });
  }

  // Open Graph (WhatsApp, Messenger, Facebook) and Twitter cards. Crawlers read the static tags
  // in index.html; these updates keep the tags right for the current page and language in the browser.
  private updateSocialTags(title: string, description: string): void {
    const isGeorgian = this.languageService.language() === LANGUAGE.KA;
    const ogTags = [
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:url', content: SITE_URL + this.router.url.split('?')[0] },
      { property: 'og:image', content: OG_IMAGE_URL },
      { property: 'og:locale', content: isGeorgian ? 'ka_GE' : 'en_US' },
    ];
    // updateTag finds an existing tag by the selector; the default selector is name=..., not property=...
    ogTags.forEach((tag) => this.meta.updateTag(tag, `property="${tag.property}"`));
    this.meta.updateTag({ name: 'twitter:title', content: title });
    this.meta.updateTag({ name: 'twitter:description', content: description });
  }

  // Route data sits on the lazy-loaded leaf route, not on the root snapshot
  private readDeepestRouteData(): SeoRouteData {
    let route: ActivatedRouteSnapshot = this.router.routerState.snapshot.root;
    while (route.firstChild) {
      route = route.firstChild;
    }
    return route.data as SeoRouteData;
  }
}
