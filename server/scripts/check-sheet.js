// Dev helper: reads docs/test-data.xlsx, validates it and prints counts. Run: npm run check-sheet
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRowsFromXlsx } from '../sheets/reader.js';
import { validateRows } from '../sheets/validator.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const testDataPath = path.join(currentDir, '../../docs/test-data.xlsx');

const rows = await readRowsFromXlsx(testDataPath);
const { valid, errors } = validateRows(rows);
const studentCount = new Set(rows.map((row) => row.studentId)).size;

console.log(`Records read:   ${rows.length}`);
console.log(`Valid records:  ${valid.length}`);
console.log(`Students:       ${studentCount}`);
console.log(`Errors:         ${errors.length}`);
for (const error of errors) {
  console.log(`  - ${error.message}`);
}
