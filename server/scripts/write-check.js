// Dev helper: tests writing columns Q–T to the real Google Sheet. Run: npm run write-check
// Takes the last data row, writes test values, reads them back, then puts the original values back.
import { readRowsFromGoogleSheet } from '../sheets/reader.js';
import { buildSyncCells, writeSyncCells, writeSyncResults } from '../sheets/writer.js';

const OUTPUT_FIELDS = ['syncStatus', 'syncedVersion', 'syncedAt', 'syncError']; // columns Q–T
const TEST_VERSION = 99;
const TEST_ERROR = 'write-check test';

let step = 0;
function ok(message) {
  step += 1;
  console.log(`ok ${step}  ${message}`);
}

const outputOf = (row) => OUTPUT_FIELDS.map((field) => row[field] ?? '');
// Everything except Q–T, to prove that the input columns A–P stay untouched
const inputOf = (row) => JSON.stringify(Object.entries(row).filter(([field]) => !OUTPUT_FIELDS.includes(field)));

async function readRow(sheetRow) {
  const rows = await readRowsFromGoogleSheet();
  const row = rows.find((candidate) => candidate.sheetRow === sheetRow);
  if (!row) {
    throw new Error(`Row ${sheetRow} not found after writing`);
  }
  return row;
}

let target = null;
let original = null;
let wrote = false;
try {
  const rows = await readRowsFromGoogleSheet();
  if (rows.length === 0) {
    throw new Error('The Sheet has no data rows to test with');
  }
  target = rows.at(-1);
  original = outputOf(target);
  console.log(`Test row: Sheet row ${target.sheetRow} (${target.studentId})`);
  console.log(`Original Q–T: ${JSON.stringify(original)}`);

  const syncedAt = new Date();
  const result = { sheetRow: target.sheetRow, synced: true, version: TEST_VERSION, syncedAt, error: TEST_ERROR };
  const expected = buildSyncCells(result);

  const count = await writeSyncResults([result]);
  wrote = true; // from here on the Sheet row holds test values, so the finally block must restore it
  if (count !== 1) {
    throw new Error(`writeSyncResults reported ${count} rows, expected 1`);
  }
  ok('write works (one batchUpdate call)');

  const after = await readRow(target.sheetRow);
  if (JSON.stringify(outputOf(after)) !== JSON.stringify(expected)) {
    throw new Error(`Read back ${JSON.stringify(outputOf(after))}, expected ${JSON.stringify(expected)}`);
  }
  ok(`the Sheet shows what we wrote: ${JSON.stringify(expected)}`);

  if (inputOf(after) !== inputOf(target)) {
    throw new Error('Columns A–P of the test row changed');
  }
  ok('columns A–P of that row are untouched');
} catch (error) {
  console.error('Write check failed:', error.message);
  process.exitCode = 1;
} finally {
  if (wrote) {
    try {
      await writeSyncCells([{ sheetRow: target.sheetRow, cells: original }]);
      const restored = await readRow(target.sheetRow);
      if (JSON.stringify(outputOf(restored)) !== JSON.stringify(original)) {
        throw new Error(`restored values differ: ${JSON.stringify(outputOf(restored))}`);
      }
      ok('original Q–T values are back');
    } catch (error) {
      console.error(
        `WARNING: could not restore Sheet row ${target.sheetRow} (${error.message}). `
        + `Put these original values back into Q–T by hand: ${JSON.stringify(original)}`,
      );
      process.exitCode = 1;
    }
  }
}
