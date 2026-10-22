import { Routes } from '@angular/router';

// Each page is loaded only when its route is opened (lazy loading).
// /verify and /verify/:code share one component, so the loader is defined once.
const loadVerifyPage = () => import('./features/verify/verify-page').then((m) => m.VerifyPage);

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'verify' },
  { path: 'verify', loadComponent: loadVerifyPage },
  { path: 'verify/:code', loadComponent: loadVerifyPage },
  {
    path: 'login',
    loadComponent: () => import('./features/student/login-page').then((m) => m.LoginPage),
  },
  // studentGuard will be added together with the login
  {
    path: 'my-passport',
    loadComponent: () =>
      import('./features/student/my-passport-page').then((m) => m.MyPassportPage),
  },
  {
    path: 'admin',
    loadComponent: () => import('./features/admin/admin-page').then((m) => m.AdminPage),
  },
  { path: '**', redirectTo: 'verify' },
];
