// Admin endpoints for the sync: start it, see how it is going, read its log (docs/api.md).
// The admin key is checked in app.js, where this router is mounted.
import { Router } from 'express';
import { findSyncLog } from '../db/queries.js';
import { AppError } from '../middleware/appError.js';
import { ERROR_CODE, SYNC_LOG_LEVEL } from '../shared/constants.js';
import { syncRunner } from '../sync/syncRunner.js';

const DEFAULT_LOG_LIMIT = 100;
const MAX_LOG_LIMIT = 500;

const defaultDeps = { findSyncLog, syncRunner };

// `deps` replaces only what it names (tests give a fake log and a runner they can control)
export function createSyncRouter(deps = {}) {
  const dependencies = { ...defaultDeps, ...deps };
  const router = Router();

  // GET /api/admin/sync-log?level=error&limit=50   (newest first)
  router.get('/sync-log', async (req, res) => {
    const { level, limit } = readLogQuery(req.query);
    const entries = await dependencies.findSyncLog({ level, limit });
    res.json({
      items: entries.map((entry) => ({
        id: entry.id,
        sheetRow: entry.sheetRow,
        recordId: entry.recordId,
        studentId: entry.studentId,
        level: entry.level,
        message: entry.message,
        createdAt: entry.createdAt,
      })),
    });
  });

  // POST /api/admin/sync   (the sync runs in the background; 202 means "started")
  router.post('/sync', (req, res) => {
    const started = dependencies.syncRunner.start();
    if (started === null) {
      throw new AppError(ERROR_CODE.SYNC_ALREADY_RUNNING, 'A sync is already running');
    }
    res.status(202).json(started);
  });

  // GET /api/admin/sync/status
  router.get('/sync/status', (req, res) => {
    res.json(dependencies.syncRunner.getStatus());
  });

  return router;
}

// level: one of info | error | duplicate (or nothing = all). limit: 1..500 (default 100).
function readLogQuery(query) {
  const level = query.level ?? null;
  if (level !== null && !Object.values(SYNC_LOG_LEVEL).includes(level)) {
    throw new AppError(ERROR_CODE.INVALID_REQUEST, `level must be one of: ${Object.values(SYNC_LOG_LEVEL).join(', ')}`);
  }

  const limitText = query.limit ?? String(DEFAULT_LOG_LIMIT);
  const limit = typeof limitText === 'string' && /^\d{1,4}$/.test(limitText) ? Number(limitText) : 0;
  if (limit < 1 || limit > MAX_LOG_LIMIT) {
    throw new AppError(ERROR_CODE.INVALID_REQUEST, `limit must be a whole number from 1 to ${MAX_LOG_LIMIT}`);
  }
  return { level, limit };
}
