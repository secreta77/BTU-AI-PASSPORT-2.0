import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AdminAuthService } from '../services/admin-auth.service';

// Protects /admin/passports/:id: without an admin key the user is sent to the key form on /admin.
export const adminGuard: CanActivateFn = () => {
  if (inject(AdminAuthService).isLoggedIn()) {
    return true;
  }
  return inject(Router).createUrlTree(['/admin']);
};
