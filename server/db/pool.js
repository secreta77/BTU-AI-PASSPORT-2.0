// Creates one pg Pool from DATABASE_URL and exports it.
import pg from 'pg';
import { config } from '../config.js';

// config.js does not fail on empty values, so this module checks the one it needs
if (!config.databaseUrl) {
  throw new Error('DATABASE_URL is empty. Fill it in server/.env (see server/.env.example).');
}

// A SQL date would become a JS Date object, and the timezone can shift the day (2026-09-12 -> 09-11).
// We keep dates as plain "YYYY-MM-DD" text, like the Sheet reader and the PDF renderer expect.
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  // Supabase only accepts encrypted connections. The traffic is still encrypted with this setting;
  // we just do not check the server certificate (it is not in Node's default list).
  // WHY: simplest for the MVP. Before real use, pass the Supabase CA certificate and set rejectUnauthorized: true.
  ssl: { rejectUnauthorized: false },
});

// An idle connection can break (network, restart). Log it instead of crashing the whole server.
pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error:', error.message);
});
