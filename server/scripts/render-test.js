// Dev helper: renders a test passport for one student from docs/test-data.xlsx into server/output/test.pdf.
// Run: npm run render-test -- BTU-T-0003   (default student: BTU-T-0001)
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPassportPdf } from '../pdf/renderer.js';
import { readRowsFromXlsx } from '../sheets/reader.js';
import { validateRows } from '../sheets/validator.js';
import { ID_PATTERN } from '../shared/constants.js';

const DEFAULT_STUDENT_ID = 'BTU-T-0001';
const TEST_VERIFICATION_CODE = 'BTU-V-TEST-0001'; // the real code is created by the issuance pipeline

const studentId = process.argv[2] ?? DEFAULT_STUDENT_ID;
if (!ID_PATTERN.STUDENT_ID.test(studentId)) {
  throw new Error(`"${studentId}" is not a Student ID like BTU-T-0001`);
}

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const testDataPath = path.join(currentDir, '../../docs/test-data.xlsx');
const outputDir = path.join(currentDir, '../output');
const outputPath = path.join(outputDir, 'test.pdf');

const rows = await readRowsFromXlsx(testDataPath);
const { valid } = validateRows(rows);
const awards = valid.filter((row) => row.studentId === studentId);

if (awards.length === 0) {
  throw new Error(`No valid rows for ${studentId}`);
}

// Student data is the same on every row of this student, so the first row is enough
const student = awards[0];
const pdfBytes = await renderPassportPdf(student, awards, TEST_VERIFICATION_CODE);

await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, pdfBytes);
console.log(`Saved ${outputPath} (${awards.length} skills)`);
