import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Avatar } from '@btu/ui';
import { filter } from 'rxjs';
import { LANGUAGE } from '../../constants';
import { LanguageService } from '../../i18n/language.service';
import { TranslatePipe } from '../../i18n/translate.pipe';
import { AdminAuthService } from '../../services/admin-auth.service';
import { AuthService } from '../../services/auth.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-header',
  imports: [RouterLink, RouterLinkActive, TranslatePipe, Avatar],
  templateUrl: './header.html',
  styleUrl: './header.scss',
  host: {
    '(document:keydown.escape)': 'onEscape()',
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class Header {
  protected readonly language = inject(LanguageService).language;

  protected readonly languageService = inject(LanguageService);
  protected readonly authService = inject(AuthService);
  protected readonly adminAuthService = inject(AdminAuthService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  protected readonly languages = [
    { code: LANGUAGE.KA, labelKey: 'lang.ka' },
    { code: LANGUAGE.EN, labelKey: 'lang.en' },
  ] as const;

  // Burger menu (only used below the md breakpoint, CSS hides the button above it)
  protected readonly menuOpen = signal(false);
  private readonly burger = viewChild.required<ElementRef<HTMLElement>>('burger');
  private readonly menu = viewChild.required<ElementRef<HTMLElement>>('menu');
  private readonly navigationEnd = toSignal(
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)),
  );

  constructor() {
    // Every finished navigation closes the menu
    effect(() => {
      this.navigationEnd();
      this.menuOpen.set(false);
    });
  }

  protected toggleMenu(): void {
    if (this.menuOpen()) {
      this.closeMenu(true);
      return;
    }
    this.menuOpen.set(true);
    // Wait for the render: the menu is not focusable before it is shown
    afterNextRender(
      () => this.menu().nativeElement.querySelector<HTMLElement>('a, button')?.focus(),
      { injector: this.injector },
    );
  }

  protected onEscape(): void {
    if (this.menuOpen()) {
      this.closeMenu(true);
    }
  }

  // A link to the page we are already on does not navigate, so NavigationEnd would never close the menu
  protected onMenuClick(event: Event): void {
    if ((event.target as HTMLElement).closest('a')) {
      this.closeMenu(false);
    }
  }

  protected onDocumentClick(event: Event): void {
    if (!this.menuOpen()) {
      return;
    }
    const target = event.target as Node;
    const clickedInside =
      this.menu().nativeElement.contains(target) || this.burger().nativeElement.contains(target);
    if (!clickedInside) {
      this.closeMenu(false);
    }
  }

  protected logout(): void {
    this.authService.logout();
    this.closeMenu(false);
    void this.router.navigateByUrl('/login');
  }

  protected adminLogout(): void {
    this.adminAuthService.logout();
    this.closeMenu(false);
    void this.router.navigateByUrl('/admin');
  }

  // returnFocus: keyboard users go back to the burger button they opened the menu with
  private closeMenu(returnFocus: boolean): void {
    this.menuOpen.set(false);
    if (returnFocus) {
      this.burger().nativeElement.focus();
    }
  }
}
