import { VERSION_STATUS } from '../constants';
import { VerifyInfo, VerifySkill } from '../models/verify.model';

// Mock answers in the shape of GET /api/verify/:code (docs/api.md). Development only.
// Any other code is "unknown" and gets a 404 from ApiService.
const MOCK_CHAIN = {
  chainId: 11155111,
  contractAddress: '0x9a2B000000000000000000000000000000000000',
  rpcUrls: ['https://rpc-1.example', 'https://rpc-2.example'],
};

export const MOCK_CODE_LATEST = 'BTU-V-AAAA-1111';
export const MOCK_CODE_OUTDATED = 'BTU-V-BBBB-2222';
export const MOCK_CODE_UNKNOWN = 'BTU-V-ZZZZ-0000';

// Version 1 has 3 skills, the latest version adds a fourth one
const MOCK_SKILLS_V1: VerifySkill[] = [
  {
    skillName: 'Prompt Engineering',
    skillCategory: 'AI Skill',
    stampCode: 'BDG-AI-001',
    dateEarned: '2026-09-12',
  },
  {
    skillName: 'Workflow Automation',
    skillCategory: 'AI Applied Skill',
    stampCode: 'BDG-AI-002',
    dateEarned: '2026-09-28',
  },
  {
    skillName: 'Responsible AI Design',
    skillCategory: 'AI Advanced Skill',
    stampCode: 'BDG-AI-003',
    dateEarned: '2026-10-10',
  },
];

const SKILL_DATA_ANALYSIS: VerifySkill = {
  skillName: 'Data Analysis with AI',
  skillCategory: 'AI Applied Skill',
  stampCode: 'BDG-AI-002',
  dateEarned: '2026-10-19',
};

export const MOCK_VERIFY_INFO: Record<string, VerifyInfo> = {
  [MOCK_CODE_LATEST]: {
    verificationCode: MOCK_CODE_LATEST,
    passportId: 'BTU-AI-000125',
    version: 2,
    status: VERSION_STATUS.LATEST,
    latestVersion: 2,
    issuedAt: '2026-10-21T10:15:00.000Z',
    txHash: '0x3f1c9a7e5b2d4c8f1a6e0b9d7c3a5f2e8b4d6a1c9e7f3b5d2a8c4e6f0b1d3a5c',
    chain: MOCK_CHAIN,
    skills: [...MOCK_SKILLS_V1, SKILL_DATA_ANALYSIS],
  },
  [MOCK_CODE_OUTDATED]: {
    verificationCode: MOCK_CODE_OUTDATED,
    passportId: 'BTU-AI-000125',
    version: 1,
    status: VERSION_STATUS.SUPERSEDED,
    latestVersion: 2,
    issuedAt: '2026-10-14T09:30:00.000Z',
    txHash: '0x7b2e4d6f8a0c1e3b5d7f9a2c4e6b8d0f1a3c5e7b9d2f4a6c8e0b1d3f5a7c9e2b',
    chain: MOCK_CHAIN,
    skills: MOCK_SKILLS_V1,
  },
};

// Mock "chain" docHash per code. It is the SHA-256 of server/pdf/assets/template/Passport_Blank.pdf,
// so that file counts as authentic in mock mode and any other PDF counts as modified.
const MOCK_DOC_HASH = '71a2efef1135bb00785db023404867c4220701038965da5608e735908f65d5b9';

export const MOCK_DOC_HASHES: Record<string, string> = {
  [MOCK_CODE_LATEST]: MOCK_DOC_HASH,
  [MOCK_CODE_OUTDATED]: MOCK_DOC_HASH,
};
