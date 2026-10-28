// Public endpoints (no login) that start from a permanent link instead of a verification code.
// GET /api/public/passport/:token answers with the code of the NEWEST version, so a link put on LinkedIn once keeps working
// after new versions are issued. The page then sends the visitor to /verify/:code. No personal data here (docs/api.md).
import { Router } from 'express';
import { findLatestCodeByPublicToken } from '../db/queries.js';
import { AppError } from '../middleware/appError.js';
import { ERROR_CODE, ID_PATTERN } from '../shared/constants.js';

const defaultDeps = { findLatestCodeByPublicToken };

// `deps` replaces only what it names (tests give a fake database)
export function createPublicRouter(deps = {}) {
  const { findLatestCodeByPublicToken: findLatestCode } = { ...defaultDeps, ...deps };
  const router = Router();

  // GET /api/public/passport/:token  ->  { latestCode }
  router.get('/passport/:token', async (req, res) => {
    // The token is case sensitive (base64url), so it is used exactly as it came. Never repeat it in an error message or a log.
    const { token } = req.params;
    if (!ID_PATTERN.PUBLIC_TOKEN.test(token)) {
      throw new AppError(ERROR_CODE.INVALID_TOKEN_FORMAT, 'The link token has the wrong format');
    }

    const latestCode = await findLatestCode(token);
    if (latestCode === null) {
      throw new AppError(ERROR_CODE.PASSPORT_NOT_FOUND, 'No passport belongs to this link');
    }

    res.set('Cache-Control', 'no-store'); // the newest code changes when a new version is issued
    res.json({ latestCode });
  });

  return router;
}
