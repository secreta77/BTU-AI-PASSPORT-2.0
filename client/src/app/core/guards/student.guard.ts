import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

// Protects /my-passport: without a valid token the student is sent to /login.
export const studentGuard: CanActivateFn = () => {
  if (inject(AuthService).isLoggedIn()) {
    return true;
  }
  return inject(Router).createUrlTree(['/login']);
};
