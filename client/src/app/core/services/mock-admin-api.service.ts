import { Injectable, inject } from '@angular/core';
import { Observable, delay, of } from 'rxjs';
import { API_ERROR_CODE, SYNC_LOG_LEVEL, VERSION_STATUS } from '../constants';
import {
  AdminPassport,
  AdminSkill,
  CreateAwardRequest,
  CreateAwardResponse,
  SyncLogItem,
  SyncStartResponse,
  SyncStatus,
} from '../models/admin.model';
import { PdfDownload } from '../models/passport.model';
import { Version } from '../models/version.model';
import { AdminAuthService } from './admin-auth.service';
import { MOCK_DELAY_MS, mockHttpError } from './mock-http-error';

// Mock admin API (development only, see environment.useMockApi). The key to type: admin-dev
export const MOCK_ADMIN_KEY = 'admin-dev';

// The mock sync reports "running" for this many status calls, then finishes
const MOCK_SYNC_RUNNING_POLLS = 2;

const HASH_64 = '0'.repeat(64);

const MOCK_PASSPORTS: AdminPassport[] = [
  {
    passportId: 'BTU-AI-000125',
    studentId: 'BTU-T-0007',
    firstName: 'Giorgi',
    lastName: 'Kapanadze',
    email: 'giorgi@example.org',
    latestVersion: 2,
    skillCount: 5,
    firstIssued: '2026-10-01',
    lastIssuedAt: '2026-10-21T10:15:00.000Z',
  },
  {
    passportId: 'BTU-AI-000126',
    studentId: 'BTU-T-0008',
    firstName: 'Nino',
    lastName: 'Beridze',
    email: 'nino@example.org',
    latestVersion: 1,
    skillCount: 2,
    firstIssued: '2026-10-02',
    lastIssuedAt: '2026-10-02T09:00:00.000Z',
  },
  {
    passportId: 'BTU-AI-000127',
    studentId: 'BTU-T-0009',
    firstName: 'Luka',
    lastName: 'Gelashvili',
    email: 'luka@example.org',
    latestVersion: 1,
    skillCount: 1,
    firstIssued: '2026-10-03',
    lastIssuedAt: '2026-10-03T12:30:00.000Z',
  },
  {
    passportId: 'BTU-AI-000128',
    studentId: 'BTU-T-0010',
    firstName: 'Mariam',
    lastName: 'Tsiklauri',
    email: 'mariam@example.org',
    latestVersion: null,
    skillCount: 0,
    firstIssued: '2026-10-05',
    lastIssuedAt: null,
  },
];

const MOCK_SKILLS: AdminSkill[] = [
  { skillId: 'SKL-001', name: 'AI Literacy', category: 'AI Skill', description: 'Fundamentals.' },
  { skillId: 'SKL-002', name: 'Prompt Engineering', category: 'AI Skill', description: 'Prompts.' },
  {
    skillId: 'SKL-004',
    name: 'Data Analysis with AI',
    category: 'AI Applied Skill',
    description: 'Data.',
  },
  {
    skillId: 'SKL-007',
    name: 'AI Product Design',
    category: 'AI Applied Skill',
    description: 'Design.',
  },
  {
    skillId: 'SKL-012',
    name: 'Machine Learning Ops',
    category: 'AI Advanced Skill',
    description: 'MLOps.',
  },
];

// Pairs that already exist, so the mock can answer 409 (try BTU-T-0007 + AI Literacy)
const MOCK_EXISTING_AWARDS = new Set(['BTU-T-0007|SKL-001']);

const MOCK_VERSIONS: Version[] = [
  {
    version: 2,
    verificationCode: 'BTU-V-AAAA-1111',
    status: VERSION_STATUS.LATEST,
    issuedAt: '2026-10-21T10:15:00.000Z',
    txHash: `0x3f1c${HASH_64.slice(4)}`,
    docHash: HASH_64,
  },
  {
    version: 1,
    verificationCode: 'BTU-V-BBBB-2222',
    status: VERSION_STATUS.SUPERSEDED,
    issuedAt: '2026-10-01T08:00:00.000Z',
    txHash: `0x9a2d${HASH_64.slice(4)}`,
    docHash: HASH_64,
  },
];

const MOCK_LOG: SyncLogItem[] = [
  {
    id: 3,
    sheetRow: 14,
    recordId: null,
    studentId: 'BTU-T-9999',
    level: SYNC_LOG_LEVEL.ERROR,
    message: 'Row 14: unknown Student ID BTU-T-9999',
    createdAt: '2026-10-21T10:15:00.000Z',
  },
  {
    id: 2,
    sheetRow: 9,
    recordId: 'REC-0009',
    studentId: 'BTU-T-0007',
    level: SYNC_LOG_LEVEL.DUPLICATE,
    message: 'Row 9: skill SKL-003 already in the passport of BTU-T-0007',
    createdAt: '2026-10-21T10:15:00.000Z',
  },
  {
    id: 1,
    sheetRow: null,
    recordId: null,
    studentId: null,
    level: SYNC_LOG_LEVEL.INFO,
    message: 'Sync finished: 2 versions issued',
    createdAt: '2026-10-21T10:16:40.000Z',
  },
];

@Injectable({ providedIn: 'root' })
export class MockAdminApiService {
  private readonly adminAuth = inject(AdminAuthService);

  private syncRunning = false;
  private syncPolls = 0;
  private syncStartedAt: string | null = null;
  private syncFinishedAt: string | null = null;
  private syncFinished = false;
  private manualAwardCount = 0;

  // Copies, so manual awards can change them while the mock sync "issues" new versions
  private readonly passports: AdminPassport[] = MOCK_PASSPORTS.map((item) => ({ ...item }));
  private readonly log: SyncLogItem[] = [...MOCK_LOG];
  // Manual awards wait here until the mock sync finishes (like "pending" on the real server)
  private pendingAwards: CreateAwardResponse[] = [];

  getPassports(): Observable<AdminPassport[]> {
    return this.answer(() => this.passports.map((item) => ({ ...item })));
  }

  getVersions(passportId: string): Observable<Version[]> {
    const passport = this.passports.find((item) => item.passportId === passportId);
    if (!this.hasValidKey()) {
      return this.rejectKey();
    }
    if (!passport) {
      return mockHttpError(404, API_ERROR_CODE.PASSPORT_NOT_FOUND, 'Passport not found');
    }
    return of(this.buildVersions(passport)).pipe(delay(MOCK_DELAY_MS));
  }

  getPdf(fallbackFileName: string): Observable<PdfDownload> {
    return this.answer(() => ({
      blob: new Blob(['Mock passport PDF'], { type: 'application/pdf' }),
      fileName: fallbackFileName,
    }));
  }

  getSyncLog(): Observable<SyncLogItem[]> {
    return this.answer(() => [...this.log]);
  }

  startSync(): Observable<SyncStartResponse> {
    if (!this.hasValidKey()) {
      return this.rejectKey();
    }
    if (this.syncRunning) {
      return mockHttpError(409, API_ERROR_CODE.SYNC_ALREADY_RUNNING, 'Sync is already running');
    }
    const startedAt = this.beginSync();
    return of({ status: 'started' as const, startedAt }).pipe(delay(MOCK_DELAY_MS));
  }

  getSkills(): Observable<AdminSkill[]> {
    return this.answer(() => MOCK_SKILLS);
  }

  // Same checks and answers as the real server (docs/api.md)
  createAward(body: CreateAwardRequest): Observable<CreateAwardResponse> {
    if (!this.hasValidKey()) {
      return this.rejectKey();
    }
    if (!this.passports.some((item) => item.studentId === body.studentId)) {
      return mockHttpError(404, API_ERROR_CODE.STUDENT_NOT_FOUND, 'Student not found');
    }
    if (!MOCK_SKILLS.some((item) => item.skillId === body.skillId)) {
      return mockHttpError(404, API_ERROR_CODE.SKILL_NOT_FOUND, 'Skill not found');
    }
    const pair = `${body.studentId}|${body.skillId}`;
    if (MOCK_EXISTING_AWARDS.has(pair)) {
      return mockHttpError(409, API_ERROR_CODE.AWARD_ALREADY_EXISTS, 'Award already exists');
    }
    MOCK_EXISTING_AWARDS.add(pair);
    this.manualAwardCount++;

    const syncStarted = !this.syncRunning;
    if (syncStarted) {
      this.beginSync();
    }
    const response: CreateAwardResponse = {
      recordId: `MAN-${String(this.manualAwardCount).padStart(4, '0')}`,
      ...body,
      earnedThrough: body.earnedThrough || null,
      source: 'manual',
      status: 'pending',
      syncStarted,
    };
    this.pendingAwards.push(response);
    return of(response).pipe(delay(MOCK_DELAY_MS));
  }

  // What the real sync does: one new version per student, however many skills are pending
  private issuePendingAwards(issuedAt: string): void {
    for (const award of this.pendingAwards) {
      this.addLog(
        SYNC_LOG_LEVEL.INFO,
        issuedAt,
        award.studentId,
        award.recordId,
        `Record ${award.recordId}: skill ${award.skillId} added to ${award.studentId}`,
      );
    }
    const studentIds = new Set(this.pendingAwards.map((award) => award.studentId));
    for (const studentId of studentIds) {
      const passport = this.passports.find((item) => item.studentId === studentId);
      if (!passport) {
        continue;
      }
      const newSkills = this.pendingAwards.filter((award) => award.studentId === studentId);
      passport.latestVersion = (passport.latestVersion ?? 0) + 1;
      passport.skillCount += newSkills.length;
      passport.lastIssuedAt = issuedAt;
      this.addLog(
        SYNC_LOG_LEVEL.INFO,
        issuedAt,
        studentId,
        null,
        `Issued version ${passport.latestVersion} for ${studentId}`,
      );
    }
    this.pendingAwards = [];
  }

  private addLog(
    level: SyncLogItem['level'],
    createdAt: string,
    studentId: string,
    recordId: string | null,
    message: string,
  ): void {
    const id = Math.max(0, ...this.log.map((item) => item.id)) + 1;
    this.log.unshift({ id, sheetRow: null, recordId, studentId, level, message, createdAt });
  }

  // Versions 1..latest, newest first. V1 and V2 reuse the fixed mock data.
  private buildVersions(passport: AdminPassport): Version[] {
    const latest = passport.latestVersion ?? 0;
    const versions: Version[] = [];
    for (let number = latest; number >= 1; number--) {
      const fixed = MOCK_VERSIONS.find((item) => item.version === number);
      versions.push({
        ...(fixed ?? {
          version: number,
          verificationCode: `BTU-V-MOCK-${String(number).padStart(4, '0')}`,
          issuedAt: passport.lastIssuedAt ?? '',
          txHash: `0x${String(number).repeat(64).slice(0, 64)}`,
          docHash: HASH_64,
        }),
        status: number === latest ? VERSION_STATUS.LATEST : VERSION_STATUS.SUPERSEDED,
      });
    }
    return versions;
  }

  private beginSync(): string {
    this.syncRunning = true;
    this.syncPolls = 0;
    this.syncFinished = false;
    this.syncStartedAt = new Date().toISOString();
    return this.syncStartedAt;
  }

  // Counts the calls: "running" for the first polls, then finished with a summary
  getSyncStatus(): Observable<SyncStatus> {
    return this.answer(() => {
      if (this.syncRunning) {
        this.syncPolls++;
        if (this.syncPolls > MOCK_SYNC_RUNNING_POLLS) {
          this.syncRunning = false;
          this.syncFinished = true;
          this.syncFinishedAt = new Date().toISOString();
          this.issuePendingAwards(this.syncFinishedAt);
        }
      }
      return {
        running: this.syncRunning,
        startedAt: this.syncStartedAt,
        finishedAt: this.syncFinishedAt,
        summary: this.syncFinished
          ? { rowsRead: 60, newAwards: 3, versionsIssued: 2, duplicates: 1, errors: 1 }
          : null,
        error: null,
      };
    });
  }

  // Every mock endpoint checks the key like the real server does
  private answer<T>(build: () => T): Observable<T> {
    if (!this.hasValidKey()) {
      return this.rejectKey();
    }
    return of(build()).pipe(delay(MOCK_DELAY_MS));
  }

  private hasValidKey(): boolean {
    return this.adminAuth.getKey() === MOCK_ADMIN_KEY;
  }

  // In real mode the interceptor does this when the server answers 401
  private rejectKey(): Observable<never> {
    this.adminAuth.reject();
    return mockHttpError(401, API_ERROR_CODE.UNAUTHORIZED, 'Invalid admin key');
  }
}
