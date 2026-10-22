// Dev helper: tests the sync rules without a database, Google Sheet or chain. Run: npm run sync-test
// Part 1: row planning (which rows become students, awards, errors, duplicates).
// Part 2: which Sheet cells must change. Part 3: the one-call Sheet write.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeSheetUpdates } from '../sheets/writer.js';
import { readRowsFromXlsx } from '../sheets/reader.js';
import { validateRows } from '../sheets/validator.js';
import { planRows, studentSkillKey } from '../sync/rowPlanner.js';
import { buildSheetUpdates } from '../sync/sheetUpdates.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const testDataPath = path.join(currentDir, '../../docs/test-data.xlsx');

// ---------- Helpers ----------

let nextSheetRow = 5;
let nextRecordNumber = 1;

// A valid Sheet row like the reader gives it. Override only what a scenario is about.
function makeRow(overrides = {}) {
  const recordNumber = String(nextRecordNumber++).padStart(4, '0');
  return {
    sheetRow: nextSheetRow++,
    studentId: 'BTU-T-0101',
    firstName: 'Test',
    lastName: 'Student',
    email: 'btu-t-0101@example.org',
    program: 'Digital Marketing',
    educationLevel: "Bachelor's",
    passportId: null,
    firstIssued: null,
    studentStatus: 'Active',
    recordId: `REC-${recordNumber}`,
    skillId: 'SKL-001',
    skillName: 'Prompt Engineering',
    skillCategory: 'AI Skill',
    skillDescription: 'Writes clear prompts.',
    dateEarned: '2026-09-12',
    syncStatus: null,
    syncedVersion: null,
    syncedAt: null,
    syncError: null,
    ...overrides,
  };
}

function emptyKnown() {
  return { students: new Map(), passportOwners: new Map(), recordIds: new Set(), studentSkillPairs: new Set() };
}

// A student that is already in the database, with a passport
function knownStudent(overrides = {}) {
  return {
    studentId: 'BTU-T-0101',
    firstName: 'Test',
    lastName: 'Student',
    email: 'btu-t-0101@example.org',
    program: 'Digital Marketing',
    educationLevel: "Bachelor's",
    studentStatus: 'Active',
    passportId: 'BTU-AI-000200',
    firstIssued: '2026-10-01',
    ...overrides,
  };
}

function knownWith(students, { recordIds = [], pairs = [] } = {}) {
  const known = emptyKnown();
  for (const student of students) {
    known.students.set(student.studentId, student);
    known.passportOwners.set(student.passportId, student.studentId);
  }
  recordIds.forEach((recordId) => known.recordIds.add(recordId));
  pairs.forEach((pair) => known.studentSkillPairs.add(studentSkillKey(...pair)));
  return known;
}

let step = 0;
let failed = false;
async function scenario(name, work) {
  try {
    await work();
    step += 1;
    console.log(`ok ${step}  ${name}`);
  } catch (error) {
    failed = true;
    console.log(`FAIL  ${name}\n      ${error.message}`);
  }
}

const { valid: realRows } = validateRows(await readRowsFromXlsx(testDataPath));

// ---------- Part 1: row planning ----------

await scenario('bootstrap on the real test data: 18 students with their Passport IDs, 60 awards, no errors', () => {
  const plan = planRows(realRows, emptyKnown(), { bootstrap: true });
  assert.equal(plan.newStudents.length, 18);
  assert.equal(plan.newAwards.length, 60);
  assert.equal(plan.skills.length, new Set(realRows.map((row) => row.skillId)).size);
  assert.equal(plan.errors.length, 0);
  assert.equal(plan.duplicates.length, 0);
  for (const student of plan.newStudents) {
    assert.match(student.passportId, /^BTU-AI-\d{6}$/);
    assert.match(student.firstIssued, /^\d{4}-\d{2}-\d{2}$/);
  }
});

await scenario('the same data without bootstrap: every row is an unknown Student ID (Passport ID is filled)', () => {
  const plan = planRows(realRows, emptyKnown());
  assert.equal(plan.errors.length, 60);
  assert.equal(plan.newAwards.length, 0);
  assert.match(plan.errors[0].message, /^Row \d+: unknown Student ID BTU-T-\d{4}: its Passport ID BTU-AI-\d{6} is not in the database$/);
});

await scenario('repeated sync (scenario 5): known records are skipped silently, nothing is added', () => {
  const first = planRows(realRows, emptyKnown(), { bootstrap: true });
  const known = knownWith(first.newStudents, {
    recordIds: first.newAwards.map((award) => award.recordId),
    pairs: first.newAwards.map((award) => [award.studentId, award.skillId]),
  });
  const plan = planRows(realRows, known);
  assert.equal(plan.alreadySyncedCount, 60);
  assert.equal(plan.newAwards.length, 0);
  assert.equal(plan.newStudents.length, 0);
  assert.equal(plan.errors.length + plan.duplicates.length, 0);
});

await scenario('new student without Passport ID (scenario 1): one student, awards for both rows', () => {
  const rows = [makeRow({ skillId: 'SKL-001' }), makeRow({ skillId: 'SKL-002', skillName: 'Data Literacy' })];
  const plan = planRows(rows, emptyKnown());
  assert.equal(plan.newStudents.length, 1);
  assert.equal(plan.newStudents[0].passportId, null);
  assert.equal(plan.newStudents[0].firstIssued, null);
  assert.equal(plan.newAwards.length, 2);
  assert.equal(plan.skills.length, 2);
});

await scenario('two rows of a new student: the first decides the name, the last decides program and status', () => {
  const rows = [
    makeRow({ skillId: 'SKL-001' }),
    makeRow({ skillId: 'SKL-002', program: 'Computer Science', studentStatus: 'Graduate' }),
    makeRow({ skillId: 'SKL-003', lastName: 'Other' }),
  ];
  const plan = planRows(rows, emptyKnown());
  assert.equal(plan.newStudents[0].lastName, 'Student');
  assert.equal(plan.newStudents[0].program, 'Computer Science');
  assert.equal(plan.newStudents[0].studentStatus, 'Graduate');
  assert.equal(plan.newAwards.length, 2);
  assert.equal(plan.errors.length, 1);
  assert.match(plan.errors[0].message, new RegExp(`^Row ${rows[2].sheetRow}: BTU-T-0101 has a different Last Name than its first row$`));
});

await scenario('rows are handled in Sheet order, even if they arrive shuffled', () => {
  const first = makeRow({ lastName: 'Student' });
  const second = makeRow({ skillId: 'SKL-002', lastName: 'Other' });
  const plan = planRows([second, first], emptyKnown());
  assert.equal(plan.newStudents[0].lastName, 'Student');
  assert.equal(plan.errors[0].sheetRow, second.sheetRow);
});

await scenario('known student with a new skill (scenarios 3 and 4): one award, no new student', () => {
  const known = knownWith([knownStudent()], { recordIds: ['REC-9000'], pairs: [['BTU-T-0101', 'SKL-001']] });
  const plan = planRows([makeRow({ skillId: 'SKL-002', passportId: 'BTU-AI-000200' })], known);
  assert.equal(plan.newAwards.length, 1);
  assert.equal(plan.newStudents.length, 0);
  assert.equal(plan.errors.length, 0);
});

await scenario('known student with another name or email: error that names the fields', () => {
  const known = knownWith([knownStudent()]);
  const plan = planRows([makeRow({ firstName: 'Nino', email: 'someone@example.org' })], known);
  assert.equal(plan.newAwards.length, 0);
  assert.match(plan.errors[0].message, /BTU-T-0101 does not match the database \(First Name, Email differ\)/);
});

await scenario('an email in another letter case is the same email', () => {
  const known = knownWith([knownStudent()]);
  const plan = planRows([makeRow({ skillId: 'SKL-002', email: 'BTU-T-0101@Example.ORG' })], known);
  assert.equal(plan.errors.length, 0);
  assert.equal(plan.newAwards.length, 1);
});

await scenario('known student, but the row has the Passport ID of someone else: error', () => {
  const known = knownWith([knownStudent()]);
  const plan = planRows([makeRow({ passportId: 'BTU-AI-000999' })], known);
  assert.match(plan.errors[0].message, /Passport ID BTU-AI-000999 does not belong to BTU-T-0101/);
  assert.equal(plan.newAwards.length, 0);
});

await scenario('unknown Student ID with an unknown Passport ID (scenario 6): error, nothing added', () => {
  const plan = planRows([makeRow({ studentId: 'BTU-T-9999', passportId: 'BTU-AI-000999' })], emptyKnown());
  assert.equal(plan.newStudents.length, 0);
  assert.equal(plan.newAwards.length, 0);
  assert.match(plan.errors[0].message, /^Row \d+: unknown Student ID BTU-T-9999: its Passport ID BTU-AI-000999 is not in the database$/);
});

await scenario('new student with the Passport ID of another student: error', () => {
  const known = knownWith([knownStudent()]);
  const plan = planRows([makeRow({ studentId: 'BTU-T-0555', passportId: 'BTU-AI-000200' })], known);
  assert.match(plan.errors[0].message, /belongs to another student \(BTU-T-0101\)/);
});

await scenario('same (student, skill) under a new Record ID: logged as duplicate, not added', () => {
  const known = knownWith([knownStudent()], { pairs: [['BTU-T-0101', 'SKL-001']] });
  const plan = planRows([makeRow({ skillId: 'SKL-001' })], known);
  assert.equal(plan.newAwards.length, 0);
  assert.equal(plan.duplicates.length, 1);
  assert.match(plan.duplicates[0].message, /duplicate award: BTU-T-0101 already has skill SKL-001/);
});

await scenario('the same Record ID twice in the Sheet: the second one is a duplicate', () => {
  const first = makeRow();
  const second = makeRow({ recordId: first.recordId, skillId: 'SKL-002' });
  const plan = planRows([first, second], emptyKnown());
  assert.equal(plan.newAwards.length, 1);
  assert.match(plan.duplicates[0].message, /appears more than once in the Sheet/);
});

await scenario('changed program of a known student is noticed even when the record is already synced (Decision 11)', () => {
  const known = knownWith([knownStudent()], { recordIds: ['REC-7000'], pairs: [['BTU-T-0101', 'SKL-001']] });
  const plan = planRows([makeRow({ recordId: 'REC-7000', program: 'Computer Science', studentStatus: 'Graduate' })], known);
  assert.equal(plan.alreadySyncedCount, 1);
  assert.equal(plan.newAwards.length, 0);
  assert.deepEqual(plan.studentUpdates, [
    { studentId: 'BTU-T-0101', program: 'Computer Science', educationLevel: "Bachelor's", studentStatus: 'Graduate' },
  ]);
});

await scenario('bootstrap: a Passport ID without First Issued is an error; the same Passport ID for two students too', () => {
  const noDate = planRows([makeRow({ passportId: 'BTU-AI-000300' })], emptyKnown(), { bootstrap: true });
  assert.match(noDate.errors[0].message, /First Issued is empty/);

  const rows = [
    makeRow({ studentId: 'BTU-T-0201', email: 'a@example.org', passportId: 'BTU-AI-000301', firstIssued: '2026-01-01' }),
    makeRow({ studentId: 'BTU-T-0202', email: 'b@example.org', passportId: 'BTU-AI-000301', firstIssued: '2026-01-02' }),
  ];
  const plan = planRows(rows, emptyKnown(), { bootstrap: true });
  assert.equal(plan.newStudents.length, 1);
  assert.match(plan.errors[0].message, /belongs to another student \(BTU-T-0201\)/);
});

await scenario('skills come only from rows that were accepted', () => {
  const rows = [
    makeRow({ skillId: 'SKL-001' }),
    makeRow({ studentId: 'BTU-T-9999', passportId: 'BTU-AI-000999', skillId: 'SKL-050' }),
  ];
  const plan = planRows(rows, emptyKnown());
  assert.deepEqual(plan.skills.map((skill) => skill.skillId), ['SKL-001']);
});

// ---------- Part 2: which Sheet cells must change ----------

const ISSUED_AT = new Date('2026-10-22T14:05:30Z');
const dbState = {
  versionByRecordId: new Map([['REC-8001', { version: 1, issuedAt: ISSUED_AT }]]),
  passportByStudentId: new Map([['BTU-T-0101', { passportId: 'BTU-AI-000200', firstIssued: '2026-10-22' }]]),
};

await scenario('Sheet cells: issued record -> SYNCED/V1/time, other record -> NOT SYNCED', () => {
  const issued = makeRow({ recordId: 'REC-8001', passportId: 'BTU-AI-000200', firstIssued: '2026-10-22' });
  const waiting = makeRow({ recordId: 'REC-8002', passportId: 'BTU-AI-000200', firstIssued: '2026-10-22' });
  const { syncRows } = buildSheetUpdates([issued, waiting], dbState, new Map());
  assert.deepEqual(syncRows, [
    { sheetRow: issued.sheetRow, cells: ['SYNCED', 'V1', '2026-10-22 14:05 UTC', ''] },
  ].concat(
    // the waiting row is already empty = NOT SYNCED is a change from null
    [{ sheetRow: waiting.sheetRow, cells: ['NOT SYNCED', '', '', ''] }],
  ));
});

await scenario('Sheet cells: a Sheet that already shows the truth gets no writes (a repeated sync writes nothing)', () => {
  const row = makeRow({
    recordId: 'REC-8001',
    passportId: 'BTU-AI-000200',
    firstIssued: '2026-10-22',
    syncStatus: 'SYNCED',
    syncedVersion: 'V1',
    syncedAt: '2026-10-22 14:05 UTC',
  });
  const result = buildSheetUpdates([row], dbState, new Map());
  assert.deepEqual(result, { syncRows: [], passportRows: [] });
});

await scenario('Sheet cells: the old test-data time is replaced by the real issue time from the database', () => {
  const row = makeRow({
    recordId: 'REC-8001',
    passportId: 'BTU-AI-000200',
    firstIssued: '2026-10-22',
    syncStatus: 'SYNCED',
    syncedVersion: 'V1',
    syncedAt: '2026-10-17 10:00 UTC',
  });
  const { syncRows } = buildSheetUpdates([row], dbState, new Map());
  assert.deepEqual(syncRows[0].cells, ['SYNCED', 'V1', '2026-10-22 14:05 UTC', '']);
});

await scenario('Sheet cells: a row with a problem shows the message in T, even if its record is in the database', () => {
  const row = makeRow({ recordId: 'REC-8001', passportId: 'BTU-AI-000200', firstIssued: '2026-10-22' });
  const messages = new Map([[row.sheetRow, `Row ${row.sheetRow}: duplicate award`]]);
  const { syncRows, passportRows } = buildSheetUpdates([row], dbState, messages);
  assert.deepEqual(syncRows[0].cells, ['NOT SYNCED', '', '', `Row ${row.sheetRow}: duplicate award`]);
  assert.equal(passportRows.length, 0, 'no Passport ID is written into a row with a problem');
});

await scenario('Sheet cells: a fixed row loses its old error text', () => {
  const row = makeRow({ syncStatus: 'NOT SYNCED', syncError: 'Row 5: old problem' });
  const { syncRows } = buildSheetUpdates([row], dbState, new Map());
  assert.deepEqual(syncRows[0].cells, ['NOT SYNCED', '', '', '']);
});

await scenario('Sheet cells: Passport ID and First Issued are written into the rows of a new student', () => {
  const rows = [makeRow(), makeRow({ skillId: 'SKL-002' }), makeRow({ studentId: 'BTU-T-0999', email: 'x@example.org' })];
  const { passportRows } = buildSheetUpdates(rows, dbState, new Map());
  assert.deepEqual(passportRows, [
    { sheetRow: rows[0].sheetRow, cells: ['BTU-AI-000200', '2026-10-22'] },
    { sheetRow: rows[1].sheetRow, cells: ['BTU-AI-000200', '2026-10-22'] },
  ]);
});

await scenario('Sheet cells: an invalid row without Record ID is NOT SYNCED with its message', () => {
  const row = makeRow({ recordId: null, studentId: 'BTU-T-77' });
  const messages = new Map([[row.sheetRow, `Row ${row.sheetRow}: missing Record ID`]]);
  const { syncRows } = buildSheetUpdates([row], dbState, messages);
  assert.deepEqual(syncRows[0].cells, ['NOT SYNCED', '', '', `Row ${row.sheetRow}: missing Record ID`]);
});

// ---------- Part 3: the one-call Sheet write ----------

await scenario('Sheet write: Q–T and G–H of many rows go out in ONE call; nothing to write = no call', async () => {
  const calls = [];
  const fakeApi = { spreadsheets: { values: { batchUpdate: async (request) => calls.push(request) } } };

  const written = await writeSheetUpdates({
    syncRows: [
      { sheetRow: 10, cells: ['SYNCED', 'V1', '2026-10-22 14:05 UTC', ''] },
      { sheetRow: 11, cells: ['NOT SYNCED', '', '', 'Row 11: problem'] },
    ],
    passportRows: [{ sheetRow: 10, cells: ['BTU-AI-000200', '2026-10-22'] }],
  }, fakeApi);

  assert.deepEqual(written, { syncRows: 2, passportRows: 1 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].requestBody.valueInputOption, 'RAW');
  assert.deepEqual(calls[0].requestBody.data.map((item) => item.range), [
    "'Passport Skill Records'!Q10:T10",
    "'Passport Skill Records'!Q11:T11",
    "'Passport Skill Records'!G10:H10",
  ]);

  assert.deepEqual(await writeSheetUpdates({ syncRows: [], passportRows: [] }, fakeApi), { syncRows: 0, passportRows: 0 });
  assert.equal(calls.length, 1, 'no second call for an empty update');
});

await scenario('Sheet write: a wrong number of cells is refused before any call', async () => {
  const calls = [];
  const fakeApi = { spreadsheets: { values: { batchUpdate: async (request) => calls.push(request) } } };
  await assert.rejects(writeSheetUpdates({ passportRows: [{ sheetRow: 10, cells: ['BTU-AI-000200'] }] }, fakeApi), /expected 2 cells \(G–H\)/);
  assert.equal(calls.length, 0);
});

console.log(failed ? '\nSome scenarios FAILED.' : `\nAll ${step} scenarios passed.`);
process.exitCode = failed ? 1 : 0;
