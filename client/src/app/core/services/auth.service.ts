import { Injectable, signal } from '@angular/core';
import { AUTH_STORAGE_KEY, STUDENT_NAME_STORAGE_KEY } from '../constants';

interface StudentSession {
  token: string;
  expiresAt: number; // ms since 1970
}

// Keeps the student token in a signal (for the UI) and in sessionStorage (survives a page reload).
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly session = signal<StudentSession | null>(this.loadSession());
  // Full name for the header avatar. The passport page sets it after it loaded the passport,
  // so the header needs no extra request. Kept in sessionStorage for page reloads.
  readonly studentName = signal<string | null>(this.loadStudentName());
  private expiryTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.scheduleExpiry();
  }

  // Reads the signal, so templates update after login and logout
  isLoggedIn(): boolean {
    const session = this.session();
    return session !== null && session.expiresAt > Date.now();
  }

  // Returns null when logged out or expired
  getToken(): string | null {
    return this.isLoggedIn() ? this.session()!.token : null;
  }

  login(token: string, expiresInSeconds: number): void {
    const session: StudentSession = { token, expiresAt: Date.now() + expiresInSeconds * 1000 };
    this.session.set(session);
    this.saveSession(session);
    this.scheduleExpiry();
  }

  setStudentName(fullName: string): void {
    this.studentName.set(fullName);
    try {
      sessionStorage.setItem(STUDENT_NAME_STORAGE_KEY, fullName);
    } catch {
      // the name is only a convenience: the avatar falls back to an icon
    }
  }

  logout(): void {
    clearTimeout(this.expiryTimer);
    this.session.set(null);
    this.studentName.set(null);
    try {
      sessionStorage.removeItem(AUTH_STORAGE_KEY);
      sessionStorage.removeItem(STUDENT_NAME_STORAGE_KEY);
    } catch {
      // storage can be blocked (private window): the signal is already cleared
    }
  }

  // The header must switch back to "Log in" when the token expires, even if nobody clicks anything
  private scheduleExpiry(): void {
    clearTimeout(this.expiryTimer);
    const session = this.session();
    if (!session) {
      return;
    }
    const msLeft = session.expiresAt - Date.now();
    if (msLeft <= 0) {
      this.logout();
      return;
    }
    this.expiryTimer = setTimeout(() => this.logout(), msLeft);
  }

  private saveSession(session: StudentSession): void {
    try {
      sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    } catch {
      // without storage the student stays logged in until the page is reloaded
    }
  }

  private loadStudentName(): string | null {
    try {
      return sessionStorage.getItem(STUDENT_NAME_STORAGE_KEY) || null;
    } catch {
      return null;
    }
  }

  private loadSession(): StudentSession | null {
    try {
      const raw = sessionStorage.getItem(AUTH_STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const data = JSON.parse(raw);
      if (typeof data?.token !== 'string' || typeof data?.expiresAt !== 'number') {
        return null;
      }
      return data.expiresAt > Date.now() ? data : null;
    } catch {
      return null;
    }
  }
}
