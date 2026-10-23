import { Injectable } from '@angular/core';

// SHA-256 in the browser. Output format = server sha256Hex(): 64 lowercase hex characters, no 0x.
@Injectable({ providedIn: 'root' })
export class HashService {
  // Text is hashed as UTF-8 (verification code), bytes as they are (PDF file)
  async sha256Hex(data: string | ArrayBuffer): Promise<string> {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }
}
