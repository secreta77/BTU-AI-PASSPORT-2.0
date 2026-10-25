import { Injectable, signal } from '@angular/core';
import { ADMIN_KEY_STORAGE_KEY } from '../constants';

// Keeps the admin key in a signal (for the UI) and in sessionStorage (survives a page reload).
// The key is typed by the admin: it is never written in code or environment files.
@Injectable({ providedIn: 'root' })
export class AdminAuthService {
  private readonly key = signal<string | null>(this.loadKey());

  // True after the server (or the mock) refused the last key: the login form shows an error
  readonly keyRejected = signal(false);

  // Reads a signal, so templates update after login and logout
  isLoggedIn(): boolean {
    return this.key() !== null;
  }

  getKey(): string | null {
    return this.key();
  }

  // Copied keys often bring a space or a new line: trim here, the one place that stores the key
  login(rawKey: string): void {
    const key = rawKey.trim();
    if (!key) {
      return;
    }
    this.keyRejected.set(false);
    this.key.set(key);
    this.saveKey(key);
  }

  logout(): void {
    this.key.set(null);
    try {
      sessionStorage.removeItem(ADMIN_KEY_STORAGE_KEY);
    } catch {
      // storage can be blocked (private window): the signal is already cleared
    }
  }

  // The server answered 401/403: forget the key and tell the form to show the error
  reject(): void {
    this.logout();
    this.keyRejected.set(true);
  }

  private saveKey(key: string): void {
    try {
      sessionStorage.setItem(ADMIN_KEY_STORAGE_KEY, key);
    } catch {
      // without storage the admin stays logged in until the page is reloaded
    }
  }

  private loadKey(): string | null {
    try {
      return sessionStorage.getItem(ADMIN_KEY_STORAGE_KEY) || null;
    } catch {
      return null;
    }
  }
}
