// Same names and values as server/shared/constants.js. No magic strings in the app.
import type { TranslationKey } from './i18n/ka';

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
  VERSION_NOT_FOUND: 'VERSION_NOT_FOUND',
  SYNC_ALREADY_RUNNING: 'SYNC_ALREADY_RUNNING',
  STUDENT_NOT_FOUND: 'STUDENT_NOT_FOUND',
  SKILL_NOT_FOUND: 'SKILL_NOT_FOUND',
  AWARD_ALREADY_EXISTS: 'AWARD_ALREADY_EXISTS',
} as const;

// Student session (sessionStorage: gone when the tab is closed)
export const AUTH_STORAGE_KEY = 'btu-student-session';

// Only requests to this path get the Authorization header
export const STUDENT_API_PATH = '/student/';

// Admin key (sessionStorage: gone when the tab is closed). Never in code or environment files.
export const ADMIN_KEY_STORAGE_KEY = 'btu-admin-key';
export const ADMIN_KEY_HEADER = 'X-Admin-Key';

// Only requests to this path get the admin key header
export const ADMIN_API_PATH = '/admin/';

// Admin page timing
export const SYNC_POLL_INTERVAL_MS = 2000;
export const SEARCH_DEBOUNCE_MS = 300;

// Manual award form (docs/api.md, POST /api/admin/awards)
export const STUDENT_ID_PATTERN = /^BTU-T-\d{4}$/;
export const EARNED_THROUGH_MAX_LENGTH = 120;

// Stamp image of a passport skill, e.g. /assets/stamps/BDG-AI-001.png
export const STAMP_IMAGE_URL = '/assets/stamps/';
export const STAMP_IMAGE_EXTENSION = '.png';

// Real pixel size of each stamp file: NgOptimizedImage needs it to reserve the right space.
// The visible size is set by CSS (max-width/max-height + object-fit: contain).
export const STAMP_IMAGE_SIZE: Record<string, { width: number; height: number }> = {
  'BDG-AI-001': { width: 328, height: 284 },
  'BDG-AI-002': { width: 656, height: 211 },
  'BDG-AI-003': { width: 304, height: 304 },
};
export const DEFAULT_STAMP_IMAGE_SIZE = { width: 304, height: 304 };

// Used when the server sends no usable Content-Disposition header
export const FALLBACK_PDF_FILE_NAME = 'BTU-AI-passport.pdf';

// Wait time before a new login code can be requested
export const RESEND_COOLDOWN_SECONDS = 60;

// Skill category (as sent by the API) -> UI text. Single place for this mapping.
export const SKILL_CATEGORY_KEY: Record<string, TranslationKey> = {
  'AI Skill': 'skillCategory.skill',
  'AI Applied Skill': 'skillCategory.applied',
  'AI Advanced Skill': 'skillCategory.advanced',
};
