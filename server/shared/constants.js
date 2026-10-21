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

export const VERIFY_RESULT = {
  AUTHENTIC_LATEST: 'AUTHENTIC_LATEST',
  AUTHENTIC_OUTDATED: 'AUTHENTIC_OUTDATED',
  MODIFIED: 'MODIFIED',
  UNKNOWN_CODE: 'UNKNOWN_CODE',
};

export const ID_PATTERN = {
  STUDENT_ID: /^BTU-T-\d{4}$/,
  SKILL_ID: /^SKL-\d{3}$/,
  RECORD_ID: /^REC-\d{4}$/,
  PASSPORT_ID: /^BTU-AI-\d{6}$/,
  VERIFICATION_CODE: /^BTU-V-[A-Z0-9]{4}-[A-Z0-9]{4}$/,
};

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
