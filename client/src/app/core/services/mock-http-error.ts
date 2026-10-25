import { HttpErrorResponse } from '@angular/common/http';
import { Observable, delay, throwError } from 'rxjs';
import { ApiErrorBody } from '../models/api-error.model';

// Long enough to see the loading skeletons in the browser (mock mode is for dev only)
export const MOCK_DELAY_MS = 800;

// A failed call with the same body shape as the real API
export function mockHttpError(status: number, code: string, message: string): Observable<never> {
  const body: ApiErrorBody = { error: { code, message } };
  return throwError(() => new HttpErrorResponse({ status, error: body })).pipe(
    delay(MOCK_DELAY_MS),
  );
}
