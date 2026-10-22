// Answer of GET /api/student/passport

export interface PassportSkill {
  skillId: string;
  skillName: string;
  skillCategory: string;
  stampCode: string;
  skillDescription: string;
  earnedThrough: string | null; // null until the Sheet has this column
  dateEarned: string; // YYYY-MM-DD
}

export interface PassportLatestVersion {
  version: number;
  verificationCode: string;
  issuedAt: string;
  txHash: string;
}

export interface Passport {
  passportId: string;
  firstName: string;
  lastName: string;
  program: string;
  educationLevel: string;
  studentStatus: string;
  firstIssued: string; // YYYY-MM-DD
  latest: PassportLatestVersion;
  skills: PassportSkill[];
}
