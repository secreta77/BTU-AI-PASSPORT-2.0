// Builds the Express app: middleware, routes, and the error middleware last.
// index.js starts it; the tests start it on a free port with fake dependencies.
import cors from 'cors';
import express from 'express';
import { requireAdmin } from './auth/authMiddleware.js';
import { config } from './config.js';
import { createErrorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createAdminRouter } from './routes/adminRoutes.js';
import { createPublicRouter } from './routes/publicRoutes.js';
import { createStudentRouter } from './routes/studentRoutes.js';
import { createSyncRouter } from './routes/syncRoutes.js';
import { createVerifyRouter } from './routes/verifyRoutes.js';

const MAX_BODY_SIZE = '10kb'; // the largest body we expect is a login request

// deps.verify, deps.public, deps.student, deps.admin, deps.sync: dependencies of those routes (tests give fakes).
// deps.logError: where unexpected errors are logged.
export function createApp(deps = {}) {
  const app = express();
  app.disable('x-powered-by'); // no reason to tell which framework runs here

  // Only our own site (the Angular app) may call the API from a browser. The server-to-server calls are not affected.
  // Content-Disposition is exposed, so the page can read the file name of a downloaded PDF
  app.use(cors({ origin: config.publicBaseUrl, exposedHeaders: ['Content-Disposition'] }));
  app.use(express.json({ limit: MAX_BODY_SIZE }));

  app.get('/api/health', (req, res) => {
    res.json({ ok: true });
  });
  app.use('/api/verify', createVerifyRouter(deps.verify));
  app.use('/api/public', createPublicRouter(deps.public));
  app.use('/api/student', createStudentRouter(deps.student));
  // The key is checked here, once, before any admin router: even an unknown /api/admin/... path answers 401 without it
  app.use('/api/admin', requireAdmin, createAdminRouter(deps.admin), createSyncRouter(deps.sync));

  app.use(notFoundHandler);
  app.use(createErrorHandler(deps.logError));
  return app;
}
