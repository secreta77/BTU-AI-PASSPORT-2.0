// Dev helper: renders a test passport for one student from docs/test-data.xlsx into server/output/test.pdf.
// Run: npm run render-test
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPassportPdf } from '../pdf/renderer.js';
import { readRowsFromXlsx } from '../sheets/reader.js';
import { validateRows } from '../sheets/validator.js';

const TEST_STUDENT_ID = 'BTU-T-0001';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const testDataPath = path.join(currentDir, '../../docs/test-data.xlsx');
const outputDir = path.join(currentDir, '../output');
const outputPath = path.join(outputDir, 'test.pdf');

const rows = await readRowsFromXlsx(testDataPath);
const { valid } = validateRows(rows);
const awards = valid.filter((row) => row.studentId === TEST_STUDENT_ID);

if (awards.length === 0) {
  throw new Error(`No valid rows for ${TEST_STUDENT_ID}`);
}

// Student data is the same on every row of this student, so the first row is enough
const student = awards[0];
const pdfBytes = await renderPassportPdf(student, awards);

await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, pdfBytes);
console.log(`Saved ${outputPath} (${awards.length} skills)`);
