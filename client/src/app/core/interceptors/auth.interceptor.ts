import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { API_ERROR_CODE, STUDENT_API_PATH } from '../constants';
import { getApiErrorCode } from '../models/api-error.model';
import { AuthService } from '../services/auth.service';

const STUDENT_API_URL = `${environment.apiUrl}${STUDENT_API_PATH}`;

// Adds the token to /api/student/* requests only (never to /verify or admin requests).
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith(STUDENT_API_URL)) {
    return next(request);
  }

  const authService = inject(AuthService);
  const router = inject(Router);
  const token = authService.getToken();
  const authorizedRequest = token
    ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : request;

  return next(authorizedRequest).pipe(
    catchError((error: HttpErrorResponse) => {
      // Only UNAUTHORIZED means "token is bad". On the login form a wrong code is
      // 401 INVALID_OTP and must stay a normal form error.
      if (error.status === 401 && getApiErrorCode(error) === API_ERROR_CODE.UNAUTHORIZED) {
        authService.logout();
        void router.navigateByUrl('/login');
      }
      return throwError(() => error);
    }),
  );
};
