// Entry point: loads config, checks the database connection, starts the Express server.
//   npm start      (or `npm run dev` to restart on every file change)
import { getJwtSecret } from './auth/authMiddleware.js';
import { config } from './config.js';

// Missing secrets do not stop the server: the public verify page still works. The parts that need them say so here.
function warnAboutMissingSecrets() {
  try {
    getJwtSecret();
  } catch (error) {
    console.warn(`WARNING: student login does not work. ${error.message}`);
  }
  if (config.adminApiKey === '') {
    console.warn('WARNING: ADMIN_API_KEY is empty, so every admin endpoint is closed.');
  }
}

async function main() {
  // Imported here, not at the top: db/pool.js stops with a clear message when DATABASE_URL is empty, and the
  // routes load the pool too. At the top that message would come as a stack trace instead of the line below.
  const { pool } = await import('./db/pool.js');
  const { createApp } = await import('./app.js');
  const { startAutoSync } = await import('./sync/autoSync.js');
  await pool.query('SELECT 1'); // fail now, not on the first request

  warnAboutMissingSecrets();
  const server = createApp().listen(config.port, () => {
    console.log(`API is running on http://localhost:${config.port}`);
  });
  const autoSync = startAutoSync({ minutes: config.autoSyncMinutes });

  const stop = () => {
    autoSync?.stop();
    server.close(() => pool.end().then(() => process.exit(0)));
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((error) => {
  console.error('The server could not start:', error.message);
  process.exit(1);
});
