import { Routes } from '@angular/router';
import { adminGuard } from './core/guards/admin.guard';
import { studentGuard } from './core/guards/student.guard';

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
  {
    path: 'my-passport',
    canActivate: [studentGuard],
    loadComponent: () =>
      import('./features/student/my-passport-page').then((m) => m.MyPassportPage),
  },
  {
    path: 'admin/passports/:id',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/admin/admin-passport-detail').then((m) => m.AdminPassportDetail),
  },
  {
    path: 'admin',
    loadComponent: () => import('./features/admin/admin-page').then((m) => m.AdminPage),
  },
  { path: '**', redirectTo: 'verify' },
];
