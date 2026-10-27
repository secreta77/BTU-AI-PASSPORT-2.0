// Single source of truth for statuses, ID formats and mappings.
// DB CHECK lists in db/schema.sql must change together with this file.

export const STUDENT_STATUS = {
  ACTIVE: 'Active',
  GRADUATE: 'Graduate',
};

export const SKILL_CATEGORY = {
  SKILL: 'AI Skill',
  APPLIED: 'AI Applied Skill',
  ADVANCED: 'AI Advanced Skill',
};

// The only place where category is mapped to a stamp code
export const STAMP_CODE_BY_CATEGORY = {
  [SKILL_CATEGORY.SKILL]: 'BDG-AI-001',
  [SKILL_CATEGORY.APPLIED]: 'BDG-AI-002',
  [SKILL_CATEGORY.ADVANCED]: 'BDG-AI-003',
};

export const VERSION_STATUS = {
  LATEST: 'latest',
  SUPERSEDED: 'superseded',
};

export const SYNC_LOG_LEVEL = {
  INFO: 'info',
  ERROR: 'error',
  DUPLICATE: 'duplicate',
};

export const SHEET_SYNC_STATUS = {
  SYNCED: 'SYNCED',
  NOT_SYNCED: 'NOT SYNCED',
};

// Column U "Verification Status" (task.md: only CONFIRMED skills go into the passport)
export const VERIFICATION_STATUS = {
  CONFIRMED: 'CONFIRMED',
  PENDING: 'PENDING',
  REJECTED: 'REJECTED',
};

export const VERIFY_RESULT = {
  AUTHENTIC_LATEST: 'AUTHENTIC_LATEST',
  AUTHENTIC_OUTDATED: 'AUTHENTIC_OUTDATED',
  MODIFIED: 'MODIFIED',
  UNKNOWN_CODE: 'UNKNOWN_CODE',
};

// Email login code (Decision 7). MAX_ATTEMPTS must match the CHECK on otp_codes.attempts in db/schema.sql.
export const OTP = {
  VALID_MINUTES: 10,
  MAX_ATTEMPTS: 5,
};

export const ID_PATTERN = {
  STUDENT_ID: /^BTU-T-\d{4}$/,
  SKILL_ID: /^SKL-\d{3}$/,
  RECORD_ID: /^REC-\d{4}$/,
  PASSPORT_ID: /^BTU-AI-\d{6}$/,
  VERIFICATION_CODE: /^BTU-V-[A-Z0-9]{4}-[A-Z0-9]{4}$/,
};

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Awards added by hand (POST /api/admin/awards): Record IDs MAN-0001, MAN-0002 ... (REC- is the Sheet, CLS- is reserved)
export const MANUAL_RECORD_PREFIX = 'MAN-';
export const EARNED_THROUGH_MAX_LENGTH = 120;

// One email pattern for the Sheet validator and for the login (the same rule everywhere)
export const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+$/;

// Error codes of the API (docs/api.md, "Errors") with their HTTP status. Used by AppError and the error middleware.
export const ERROR_CODE = {
  INVALID_REQUEST: 'INVALID_REQUEST',
  INVALID_CODE_FORMAT: 'INVALID_CODE_FORMAT',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_OTP: 'INVALID_OTP',
  OTP_EXPIRED: 'OTP_EXPIRED',
  CODE_NOT_FOUND: 'CODE_NOT_FOUND',
  PASSPORT_NOT_FOUND: 'PASSPORT_NOT_FOUND',
  VERSION_NOT_FOUND: 'VERSION_NOT_FOUND',
  STUDENT_NOT_FOUND: 'STUDENT_NOT_FOUND',
  SKILL_NOT_FOUND: 'SKILL_NOT_FOUND',
  AWARD_ALREADY_EXISTS: 'AWARD_ALREADY_EXISTS',
  SYNC_ALREADY_RUNNING: 'SYNC_ALREADY_RUNNING',
  OTP_LOCKED: 'OTP_LOCKED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
};

export const HTTP_STATUS_BY_ERROR_CODE = {
  [ERROR_CODE.INVALID_REQUEST]: 400,
  [ERROR_CODE.INVALID_CODE_FORMAT]: 400,
  [ERROR_CODE.NOT_FOUND]: 404,
  [ERROR_CODE.UNAUTHORIZED]: 401,
  [ERROR_CODE.INVALID_OTP]: 401,
  [ERROR_CODE.OTP_EXPIRED]: 401,
  [ERROR_CODE.CODE_NOT_FOUND]: 404,
  [ERROR_CODE.PASSPORT_NOT_FOUND]: 404,
  [ERROR_CODE.VERSION_NOT_FOUND]: 404,
  [ERROR_CODE.STUDENT_NOT_FOUND]: 404,
  [ERROR_CODE.SKILL_NOT_FOUND]: 404,
  [ERROR_CODE.AWARD_ALREADY_EXISTS]: 409,
  [ERROR_CODE.SYNC_ALREADY_RUNNING]: 409,
  [ERROR_CODE.OTP_LOCKED]: 429,
  [ERROR_CODE.INTERNAL_ERROR]: 500,
};
