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
  publicToken?: string; // permanent link /p/:token; missing until the server sends it
  firstName: string;
  lastName: string;
  program: string;
  educationLevel: string;
  studentStatus: string;
  firstIssued: string; // YYYY-MM-DD
  latest: PassportLatestVersion;
  skills: PassportSkill[];
}

// Answer of GET /api/public/passport/:token
export interface PublicPassportLink {
  latestCode: string;
}

// Result of GET /api/student/passport/pdf: the file and the name the server chose
export interface PdfDownload {
  blob: Blob;
  fileName: string;
}
