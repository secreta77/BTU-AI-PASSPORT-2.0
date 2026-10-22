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
