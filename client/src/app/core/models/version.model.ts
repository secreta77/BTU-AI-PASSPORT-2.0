import { VERSION_STATUS } from '../constants';

export type VersionStatus = (typeof VERSION_STATUS)[keyof typeof VERSION_STATUS];

// One issued version of a passport (admin list: GET /api/admin/passports/:id/versions)
export interface Version {
  version: number;
  verificationCode: string;
  status: VersionStatus;
  issuedAt: string; // ISO 8601 UTC
  txHash: string;
  docHash: string;
}
