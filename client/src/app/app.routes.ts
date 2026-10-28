import { Routes } from '@angular/router';
import { adminGuard } from './core/guards/admin.guard';
import { studentGuard } from './core/guards/student.guard';

// Each page is loaded only when its route is opened (lazy loading).
// /verify and /verify/:code share one component, so the loader is defined once.
const loadVerifyPage = () => import('./features/verify/verify-page').then((m) => m.VerifyPage);

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'verify' },
  { path: 'verify', loadComponent: loadVerifyPage, data: { titleKey: 'seo.title.verify' } },
  {
    path: 'verify/:code',
    loadComponent: loadVerifyPage,
    data: { titleKey: 'seo.title.verify', noindex: true },
  },
  {
    path: 'p/:token',
    data: { titleKey: 'seo.title.publicLink', noindex: true },
    loadComponent: () =>
      import('./features/public-link/public-link-page').then((m) => m.PublicLinkPage),
  },
  {
    path: 'login',
    data: { titleKey: 'seo.title.login', noindex: true },
    loadComponent: () => import('./features/student/login-page').then((m) => m.LoginPage),
  },
  {
    path: 'my-passport',
    data: { titleKey: 'seo.title.myPassport', noindex: true },
    canActivate: [studentGuard],
    loadComponent: () =>
      import('./features/student/my-passport-page').then((m) => m.MyPassportPage),
  },
  {
    path: 'admin/passports/:id',
    data: { titleKey: 'seo.title.admin', noindex: true },
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/admin/admin-passport-detail').then((m) => m.AdminPassportDetail),
  },
  {
    path: 'admin',
    data: { titleKey: 'seo.title.admin', noindex: true },
    loadComponent: () => import('./features/admin/admin-page').then((m) => m.AdminPage),
  },
  {
    path: '**',
    data: { titleKey: 'seo.title.notFound', noindex: true },
    loadComponent: () =>
      import('./features/not-found/not-found-page').then((m) => m.NotFoundPage),
  },
];
