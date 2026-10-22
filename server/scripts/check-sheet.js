// Dev helper: reads the Sheet, validates it and prints counts.
// Run: npm run check-sheet            (local docs/test-data.xlsx)
//      npm run check-sheet -- --live  (the real Google Sheet)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRowsFromGoogleSheet, readRowsFromXlsx } from '../sheets/reader.js';
import { validateRows } from '../sheets/validator.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const testDataPath = path.join(currentDir, '../../docs/test-data.xlsx');

const useGoogleSheet = process.argv.includes('--live');
console.log(`Source:         ${useGoogleSheet ? 'Google Sheet' : 'docs/test-data.xlsx'}`);

const rows = useGoogleSheet ? await readRowsFromGoogleSheet() : await readRowsFromXlsx(testDataPath);
const { valid, errors } = validateRows(rows);
const studentCount = new Set(rows.map((row) => row.studentId)).size;

console.log(`Records read:   ${rows.length}`);
console.log(`Valid records:  ${valid.length}`);
console.log(`Students:       ${studentCount}`);
console.log(`Errors:         ${errors.length}`);
for (const error of errors) {
  console.log(`  - ${error.message}`);
}
