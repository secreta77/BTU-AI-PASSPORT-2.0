import { VERIFY_RESULT } from '../constants';
import { VersionStatus } from './version.model';

// The 4 possible results of a verification
export type VerifyResult = (typeof VERIFY_RESULT)[keyof typeof VERIFY_RESULT];

export interface VerifyChain {
  chainId: number;
  contractAddress: string;
  rpcUrls: string[]; // public URLs only
}

// Answer of GET /api/verify/:code (no personal data)
export interface VerifyInfo {
  verificationCode: string;
  passportId: string;
  version: number;
  status: VersionStatus;
  latestVersion: number;
  issuedAt: string;
  txHash: string;
  chain: VerifyChain;
}

// Content of client/public/.well-known/btu-issuer.json
export interface IssuerFile {
  issuer: string;
  chainId: number;
}

// What the browser read from the contract on its own
export type ChainCheck =
  | { recordExists: false }
  | {
      recordExists: true;
      docHash: string; // 64 hex, no 0x
      version: number;
      latestVersion: number;
      isLatest: boolean;
      versionMatchesDatabase: boolean;
      issuerMatches: boolean;
    };
