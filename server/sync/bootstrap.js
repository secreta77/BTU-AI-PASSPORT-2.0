// First run only (Decision 2): imports the students that already have a Passport ID in the Sheet, with their
// Passport ID and First Issued date as they are, and issues a fresh V1 for each of them.
//   npm run bootstrap
// It sends one blockchain transaction per student (about 18 for the test data) and costs Sepolia test ETH.
// It stops by itself when the Sheet's students are already in the database, so it cannot run twice by accident.
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { pool } from '../db/pool.js';
import { printRunResult, runSync } from './syncService.js';

const CONFIRMATION = 'YES';

async function askConfirmation() {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log('Bootstrap imports the old Passport IDs and issues a fresh V1 for every student.');
    console.log('This sends one Sepolia transaction per student and cannot be undone.');
    const answer = await terminal.question(`Type ${CONFIRMATION} to continue: `);
    return answer.trim() === CONFIRMATION;
  } finally {
    terminal.close();
  }
}

async function main() {
  try {
    if (!(await askConfirmation())) {
      console.log('Cancelled. Nothing was changed.');
      return;
    }
    printRunResult(await runSync({ bootstrap: true, report: console.log }));
  } catch (error) {
    console.error('Bootstrap failed:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

// True only when this file is started directly (npm run bootstrap), not when another file imports it
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
