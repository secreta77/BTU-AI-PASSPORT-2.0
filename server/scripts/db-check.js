// Dev helper: checks the database connection and prints the tables. Run: npm run db-check
import { pool } from '../db/pool.js';

const MIN_VERSION_NUM = 150000; // schema.sql uses NULLS NOT DISTINCT, which needs PostgreSQL 15+

try {
  const { rows: info } = await pool.query(
    "SELECT current_database() AS database, current_setting('server_version_num')::int AS version_num, version() AS version",
  );
  console.log(`Connected to database "${info[0].database}"`);
  console.log(info[0].version);
  if (info[0].version_num < MIN_VERSION_NUM) {
    console.log('WARNING: schema.sql needs PostgreSQL 15 or newer.');
  }

  const { rows: tables } = await pool.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
  );
  if (tables.length === 0) {
    console.log('No tables yet. Run server/db/schema.sql in the Supabase SQL Editor.');
  } else {
    console.log(`Tables (${tables.length}):`);
    for (const table of tables) {
      console.log(`  - ${table.table_name}`);
    }
  }
} catch (error) {
  console.error('Database check failed:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
