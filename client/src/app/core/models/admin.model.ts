import { SYNC_LOG_LEVEL } from '../constants';

export type SyncLogLevel = (typeof SYNC_LOG_LEVEL)[keyof typeof SYNC_LOG_LEVEL];

// One row of GET /api/admin/passports
export interface AdminPassport {
  passportId: string;
  studentId: string;
  firstName: string;
  lastName: string;
  email: string;
  latestVersion: number | null; // null until the first version is issued
  skillCount: number;
  firstIssued: string; // YYYY-MM-DD
  lastIssuedAt: string | null; // ISO 8601 UTC
}

// One row of GET /api/admin/sync-log
export interface SyncLogItem {
  id: number;
  sheetRow: number | null;
  recordId: string | null;
  studentId: string | null;
  level: SyncLogLevel;
  message: string; // written by the server (English), shown as data
  createdAt: string;
}

export interface SyncSummary {
  rowsRead: number;
  newAwards: number;
  versionsIssued: number;
  duplicates: number;
  errors: number;
}

// GET /api/admin/sync/status
export interface SyncStatus {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  summary: SyncSummary | null;
  error: string | null;
}

// POST /api/admin/sync -> 202
export interface SyncStartResponse {
  status: 'started';
  startedAt: string;
}

// One item of GET /api/admin/skills
export interface AdminSkill {
  skillId: string;
  name: string;
  category: string; // 'AI Skill' | 'AI Applied Skill' | 'AI Advanced Skill'
  description: string;
}

// Body of POST /api/admin/awards
export interface CreateAwardRequest {
  studentId: string;
  skillId: string;
  dateEarned: string; // YYYY-MM-DD
  earnedThrough: string | null;
}

// POST /api/admin/awards -> 201
export interface CreateAwardResponse {
  recordId: string;
  studentId: string;
  skillId: string;
  dateEarned: string;
  earnedThrough: string | null;
  source: 'manual';
  status: 'pending';
  syncStarted: boolean; // false: a sync was already running
}
