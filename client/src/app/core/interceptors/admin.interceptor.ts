import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ADMIN_API_PATH, ADMIN_KEY_HEADER } from '../constants';
import { AdminAuthService } from '../services/admin-auth.service';

const ADMIN_API_URL = `${environment.apiUrl}${ADMIN_API_PATH}`;
const ADMIN_PAGE_URL = '/admin';

// Adds X-Admin-Key to /api/admin/* requests only. A refused key is forgotten at once.
export const adminInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith(ADMIN_API_URL)) {
    return next(request);
  }

  const adminAuth = inject(AdminAuthService);
  const router = inject(Router);
  const key = adminAuth.getKey();
  const keyedRequest = key ? request.clone({ setHeaders: { [ADMIN_KEY_HEADER]: key } }) : request;

  return next(keyedRequest).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 || error.status === 403) {
        adminAuth.reject();
        void router.navigateByUrl(ADMIN_PAGE_URL);
      }
      return throwError(() => error);
    }),
  );
};
