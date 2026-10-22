import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { VerifyInfo } from '../models/verify.model';

// The only place that knows API URLs. Other methods are added together with their feature.
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  getVerifyInfo(code: string): Observable<VerifyInfo> {
    return this.http.get<VerifyInfo>(`${environment.apiUrl}/verify/${encodeURIComponent(code)}`);
  }
}
