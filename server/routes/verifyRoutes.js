// Public endpoint (no login): facts about one verification code. The page that scans the QR code calls it,
// then compares the PDF with the contract in the browser. No personal data here (docs/api.md).
import { Router } from 'express';
import { config } from '../config.js';
import { findVersionByCode } from '../db/queries.js';
import { AppError } from '../middleware/appError.js';
import { ERROR_CODE, ID_PATTERN, STAMP_CODE_BY_CATEGORY } from '../shared/constants.js';

const defaultDeps = {
  findVersionByCode,
  getChainInfo: readChainInfoFromConfig,
};

// The browser reads the contract by itself, so it needs the chain, the contract and PUBLIC RPC URLs.
// config.chain.rpcUrls (server only, may hold an API key) must never be used here.
export function readChainInfoFromConfig() {
  const { chainId, contractAddress, publicRpcUrls } = config.chain;
  const missing = [
    chainId === null && 'CHAIN_ID',
    contractAddress === '' && 'CONTRACT_ADDRESS',
    publicRpcUrls.length === 0 && 'PUBLIC_RPC_URLS',
  ].filter(Boolean);
  if (missing.length > 0) {
    // A setup problem, not the caller's: the answer would be useless without it, so it is a 500 with the cause in the log
    throw new Error(`${missing.join(', ')} must be filled in server/.env (see server/.env.example).`);
  }
  return { chainId, contractAddress, rpcUrls: publicRpcUrls };
}

// `deps` replaces only what it names (tests give a fake ledger and keep the config-based chain info)
export function createVerifyRouter(deps = {}) {
  const { findVersionByCode: findVersion, getChainInfo } = { ...defaultDeps, ...deps };
  const router = Router();

  // GET /api/verify/:code
  router.get('/:code', async (req, res) => {
    // People type codes by hand and QR links may be lower case: BTU-V-7f3k-92qx is the same code
    const code = req.params.code.trim().toUpperCase();
    if (!ID_PATTERN.VERIFICATION_CODE.test(code)) {
      throw new AppError(ERROR_CODE.INVALID_CODE_FORMAT, 'The verification code must look like BTU-V-XXXX-XXXX');
    }

    const version = await findVersion(code);
    if (version === null) {
      throw new AppError(ERROR_CODE.CODE_NOT_FOUND, 'This verification code was never issued');
    }

    res.json({
      verificationCode: version.verificationCode,
      passportId: version.passportId,
      version: version.version,
      status: version.status,
      latestVersion: version.latestVersion,
      issuedAt: version.issuedAt,
      txHash: version.txHash,
      // Only these four fields of each skill leave the server (no ids, no description, no personal data).
      // stampCode is not in the database: only constants.js knows the category mapping (Decision 12).
      skills: (version.skills ?? []).map((skill) => ({
        skillName: skill.skillName,
        skillCategory: skill.skillCategory,
        stampCode: STAMP_CODE_BY_CATEGORY[skill.skillCategory] ?? null,
        dateEarned: skill.dateEarned,
      })),
      chain: getChainInfo(),
    });
  });

  return router;
}
