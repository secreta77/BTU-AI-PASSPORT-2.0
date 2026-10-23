import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, delay, of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiErrorBody } from '../models/api-error.model';
import { VerifyInfo } from '../models/verify.model';
import { MOCK_VERIFY_INFO } from './mock-verify.data';

// Short pause so the loading state is visible in mock mode
const MOCK_DELAY_MS = 400;

// The only place that knows API URLs. Other methods are added together with their feature.
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  getVerifyInfo(code: string): Observable<VerifyInfo> {
    if (environment.useMockApi) {
      return this.getMockVerifyInfo(code);
    }
    return this.http.get<VerifyInfo>(`${environment.apiUrl}/verify/${encodeURIComponent(code)}`);
  }

  // Same behavior as the real API: known code -> 200, unknown code -> 404 CODE_NOT_FOUND
  private getMockVerifyInfo(code: string): Observable<VerifyInfo> {
    const info = MOCK_VERIFY_INFO[code];
    if (info) {
      return of(info).pipe(delay(MOCK_DELAY_MS));
    }
    const body: ApiErrorBody = {
      error: { code: 'CODE_NOT_FOUND', message: 'Verification code not found' },
    };
    return throwError(() => new HttpErrorResponse({ status: 404, error: body })).pipe(
      delay(MOCK_DELAY_MS),
    );
  }
}
