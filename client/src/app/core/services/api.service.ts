import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, delay, map, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { API_ERROR_CODE, FALLBACK_PDF_FILE_NAME } from '../constants';
import { AdminPassport, SyncLogItem, SyncStartResponse, SyncStatus } from '../models/admin.model';
import { OtpRequestResponse, OtpVerifyResponse } from '../models/auth.model';
import { Passport, PdfDownload } from '../models/passport.model';
import { Version } from '../models/version.model';
import { VerifyInfo } from '../models/verify.model';
import { AuthService } from './auth.service';
import { MockAdminApiService } from './mock-admin-api.service';
import { MOCK_DELAY_MS, mockHttpError } from './mock-http-error';
import { MOCK_VERIFY_INFO } from './mock-verify.data';
import {
  MOCK_EMAIL_LOCKED,
  MOCK_EMAIL_NO_PASSPORT,
  MOCK_OTP_CODE,
  MOCK_PASSPORT,
  MOCK_TOKEN_EXPIRES_IN,
  MOCK_TOKEN_PREFIX,
} from './mock-student.data';

// The only place that knows API URLs. Other methods are added together with their feature.
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly mockAdmin = inject(MockAdminApiService);

  getVerifyInfo(code: string): Observable<VerifyInfo> {
    if (environment.useMockApi) {
      return this.getMockVerifyInfo(code);
    }
    return this.http.get<VerifyInfo>(`${environment.apiUrl}/verify/${encodeURIComponent(code)}`);
  }

  // The answer is always { ok: true }, also for unknown emails
  requestOtp(email: string): Observable<OtpRequestResponse> {
    if (environment.useMockApi) {
      return of({ ok: true }).pipe(delay(MOCK_DELAY_MS));
    }
    return this.http.post<OtpRequestResponse>(`${environment.apiUrl}/student/otp/request`, {
      email,
    });
  }

  // code is a string on purpose: a number would lose leading zeros
  verifyOtp(email: string, code: string): Observable<OtpVerifyResponse> {
    if (environment.useMockApi) {
      return this.verifyMockOtp(email, code);
    }
    return this.http.post<OtpVerifyResponse>(`${environment.apiUrl}/student/otp/verify`, {
      email,
      code,
    });
  }

  getMyPassport(): Observable<Passport> {
    if (environment.useMockApi) {
      return this.getMockPassport();
    }
    return this.http.get<Passport>(`${environment.apiUrl}/student/passport`);
  }

  // A plain link cannot send the Authorization header, so the PDF is loaded as a blob
  downloadMyPassportPdf(fallbackFileName = FALLBACK_PDF_FILE_NAME): Observable<PdfDownload> {
    if (environment.useMockApi) {
      return this.getMockPdf(fallbackFileName);
    }
    return this.http
      .get(`${environment.apiUrl}/student/passport/pdf`, {
        observe: 'response',
        responseType: 'blob',
      })
      .pipe(
        map((response) => ({
          blob: response.body as Blob,
          fileName: this.readFileName(
            response.headers.get('Content-Disposition'),
            fallbackFileName,
          ),
        })),
      );
  }

  // --- Admin (the X-Admin-Key header is added by adminInterceptor) ---

  getAdminPassports(): Observable<AdminPassport[]> {
    if (environment.useMockApi) {
      return this.mockAdmin.getPassports();
    }
    return this.http
      .get<{ items: AdminPassport[] }>(`${environment.apiUrl}/admin/passports`)
      .pipe(map((response) => response.items));
  }

  getAdminVersions(passportId: string): Observable<Version[]> {
    if (environment.useMockApi) {
      return this.mockAdmin.getVersions(passportId);
    }
    return this.http
      .get<{ versions: Version[] }>(
        `${environment.apiUrl}/admin/passports/${encodeURIComponent(passportId)}/versions`,
      )
      .pipe(map((response) => response.versions));
  }

  downloadAdminVersionPdf(
    passportId: string,
    version: number,
    fallbackFileName: string,
  ): Observable<PdfDownload> {
    if (environment.useMockApi) {
      return this.mockAdmin.getPdf(fallbackFileName);
    }
    return this.http
      .get(
        `${environment.apiUrl}/admin/passports/${encodeURIComponent(passportId)}/versions/${version}/pdf`,
        { observe: 'response', responseType: 'blob' },
      )
      .pipe(
        map((response) => ({
          blob: response.body as Blob,
          fileName: this.readFileName(
            response.headers.get('Content-Disposition'),
            fallbackFileName,
          ),
        })),
      );
  }

  getAdminSyncLog(): Observable<SyncLogItem[]> {
    if (environment.useMockApi) {
      return this.mockAdmin.getSyncLog();
    }
    return this.http
      .get<{ items: SyncLogItem[] }>(`${environment.apiUrl}/admin/sync-log`)
      .pipe(map((response) => response.items));
  }

  startAdminSync(): Observable<SyncStartResponse> {
    if (environment.useMockApi) {
      return this.mockAdmin.startSync();
    }
    return this.http.post<SyncStartResponse>(`${environment.apiUrl}/admin/sync`, {});
  }

  getAdminSyncStatus(): Observable<SyncStatus> {
    if (environment.useMockApi) {
      return this.mockAdmin.getSyncStatus();
    }
    return this.http.get<SyncStatus>(`${environment.apiUrl}/admin/sync/status`);
  }

  // Reads filename="BTU-AI-000125-v2.pdf" from the header
  private readFileName(contentDisposition: string | null, fallbackFileName: string): string {
    const match = contentDisposition?.match(/filename="?([^";]+)"?/i);
    return match ? match[1] : fallbackFileName;
  }

  // Same behavior as the real API: known code -> 200, unknown code -> 404 CODE_NOT_FOUND
  private getMockVerifyInfo(code: string): Observable<VerifyInfo> {
    const info = MOCK_VERIFY_INFO[code];
    if (info) {
      return of(info).pipe(delay(MOCK_DELAY_MS));
    }
    return this.mockError(404, API_ERROR_CODE.CODE_NOT_FOUND, 'Verification code not found');
  }

  // The mock token contains the email, so the passport call knows who is logged in
  private verifyMockOtp(email: string, code: string): Observable<OtpVerifyResponse> {
    if (email === MOCK_EMAIL_LOCKED) {
      return this.mockError(429, API_ERROR_CODE.OTP_LOCKED, 'Too many wrong attempts');
    }
    if (code !== MOCK_OTP_CODE) {
      return this.mockError(401, API_ERROR_CODE.INVALID_OTP, 'Wrong code');
    }
    const response = { token: `${MOCK_TOKEN_PREFIX}${email}`, expiresIn: MOCK_TOKEN_EXPIRES_IN };
    return of(response).pipe(delay(MOCK_DELAY_MS));
  }

  private getMockPassport(): Observable<Passport> {
    if (this.isMockStudentWithoutPassport()) {
      return this.mockError(404, API_ERROR_CODE.PASSPORT_NOT_FOUND, 'Passport not found');
    }
    return of(MOCK_PASSPORT).pipe(delay(MOCK_DELAY_MS));
  }

  private getMockPdf(fallbackFileName: string): Observable<PdfDownload> {
    if (this.isMockStudentWithoutPassport()) {
      return this.mockError(404, API_ERROR_CODE.PASSPORT_NOT_FOUND, 'Passport not found');
    }
    const blob = new Blob(['Mock passport PDF'], { type: 'application/pdf' });
    return of({ blob, fileName: fallbackFileName }).pipe(delay(MOCK_DELAY_MS));
  }

  private isMockStudentWithoutPassport(): boolean {
    return this.authService.getToken() === `${MOCK_TOKEN_PREFIX}${MOCK_EMAIL_NO_PASSPORT}`;
  }

  private mockError(status: number, code: string, message: string): Observable<never> {
    return mockHttpError(status, code, message);
  }
}
