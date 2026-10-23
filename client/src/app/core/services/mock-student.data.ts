import { Passport } from '../models/passport.model';

// Mock student login and passport (development only, see environment.useMockApi).
export const MOCK_OTP_CODE = '123456';
export const MOCK_TOKEN_PREFIX = 'mock-token:';
export const MOCK_TOKEN_EXPIRES_IN = 7200;

// Special emails to see the error states without a backend
export const MOCK_EMAIL_LOCKED = 'locked@example.org'; // verify -> 429 OTP_LOCKED
export const MOCK_EMAIL_NO_PASSPORT = 'new@example.org'; // passport -> 404 PASSPORT_NOT_FOUND

export const MOCK_PASSPORT: Passport = {
  passportId: 'BTU-AI-000125',
  firstName: 'Giorgi',
  lastName: 'Kapanadze',
  program: 'Computer Science',
  educationLevel: 'Bachelor',
  studentStatus: 'Active',
  firstIssued: '2026-10-01',
  latest: {
    version: 2,
    verificationCode: 'BTU-V-AAAA-1111',
    issuedAt: '2026-10-21T10:15:00.000Z',
    txHash: '0x3f1c000000000000000000000000000000000000000000000000000000000000',
  },
  skills: [
    {
      skillId: 'SKL-001',
      skillName: 'Prompt Engineering',
      skillCategory: 'AI Skill',
      stampCode: 'BDG-AI-001',
      skillDescription: 'Writes clear prompts and checks the answers of AI tools.',
      earnedThrough: null,
      dateEarned: '2026-09-12',
    },
    {
      skillId: 'SKL-005',
      skillName: 'AI Workflow Automation',
      skillCategory: 'AI Applied Skill',
      stampCode: 'BDG-AI-002',
      skillDescription: 'Builds a repeatable workflow that uses AI in a real task.',
      earnedThrough: null,
      dateEarned: '2026-09-28',
    },
    {
      skillId: 'SKL-012',
      skillName: 'Responsible AI Design',
      skillCategory: 'AI Advanced Skill',
      stampCode: 'BDG-AI-003',
      skillDescription: 'Designs an AI feature with risks, privacy and fairness in mind.',
      earnedThrough: null,
      dateEarned: '2026-10-10',
    },
  ],
};
