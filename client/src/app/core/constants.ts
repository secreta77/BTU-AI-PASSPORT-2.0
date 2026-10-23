// Same names and values as server/shared/constants.js. No magic strings in the app.

export const VERIFY_RESULT = {
  AUTHENTIC_LATEST: 'AUTHENTIC_LATEST',
  AUTHENTIC_OUTDATED: 'AUTHENTIC_OUTDATED',
  MODIFIED: 'MODIFIED',
  UNKNOWN_CODE: 'UNKNOWN_CODE',
} as const;

export const VERSION_STATUS = {
  LATEST: 'latest',
  SUPERSEDED: 'superseded',
} as const;

export const SYNC_LOG_LEVEL = {
  INFO: 'info',
  ERROR: 'error',
  DUPLICATE: 'duplicate',
} as const;

export const LANGUAGE = {
  KA: 'ka',
  EN: 'en',
} as const;

export const DEFAULT_LANGUAGE = LANGUAGE.KA;
export const LANGUAGE_STORAGE_KEY = 'btu-lang';

// Block explorer transaction page (Sepolia testnet, verify page link)
export const TX_EXPLORER_URL = 'https://sepolia.etherscan.io/tx/';

// What the status badge shows (decided by comparing version with latestVersion)
export const VERSION_BADGE = {
  LATEST: 'latest',
  OUTDATED: 'outdated',
} as const;

// Published BTU issuer address (did:web style). The verify page compares it with the contract issuer().
export const ISSUER_FILE_URL = '/.well-known/btu-issuer.json';

// Error codes of the API (docs/api.md). Same values as ERROR_CODE in server/shared/constants.js.
export const API_ERROR_CODE = {
  INVALID_REQUEST: 'INVALID_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_OTP: 'INVALID_OTP',
  OTP_EXPIRED: 'OTP_EXPIRED',
  OTP_LOCKED: 'OTP_LOCKED',
  CODE_NOT_FOUND: 'CODE_NOT_FOUND',
  PASSPORT_NOT_FOUND: 'PASSPORT_NOT_FOUND',
} as const;

// Student session (sessionStorage: gone when the tab is closed)
export const AUTH_STORAGE_KEY = 'btu-student-session';

// Only requests to this path get the Authorization header
export const STUDENT_API_PATH = '/student/';

// Stamp image of a passport skill, e.g. /assets/stamps/BDG-AI-001.png
export const STAMP_IMAGE_URL = '/assets/stamps/';
export const STAMP_IMAGE_EXTENSION = '.png';

// Used when the server sends no usable Content-Disposition header
export const FALLBACK_PDF_FILE_NAME = 'BTU-AI-passport.pdf';
