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
