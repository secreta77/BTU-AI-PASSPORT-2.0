// Dev helper: runs the WHOLE sync (runSync) with a FAKE database, Sheet and issuing. Run: npm run sync-run-test
// It checks how the parts work together: reading, planning, saving in one transaction, issuing one student at a time,
// writing the Sheet back, retries after a failure. It never touches the real database, Google or the chain.
// The real renderer, Storage and chain are tested by issue-test; the real SQL by db-test.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRowsFromXlsx } from '../sheets/reader.js';
import { runSync } from '../sync/syncService.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const testDataPath = path.join(currentDir, '../../docs/test-data.xlsx');
const realRows = await readRowsFromXlsx(testDataPath);

const NOW = new Date('2026-10-22T09:30:00Z');
const TRANSACTION_CLIENT = { name: 'transaction client' };

// ---------- A Sheet row like the reader gives it ----------

let nextSheetRow = 100; // below this are the 60 real rows (5..64), new test rows must not collide with them
let nextRecordNumber = 9000; // far away from the real test data (REC-0001..REC-0060)

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
    skillName: 'AI Literacy',
    skillCategory: 'AI Skill',
    skillDescription: 'Fundamentals of AI.',
    dateEarned: '2026-09-12',
    syncStatus: null,
    syncedVersion: null,
    syncedAt: null,
    syncError: null,
    ...overrides,
  };
}

// ---------- A fake world: database, Sheet and issuing in memory ----------

function createWorld({ rows, failIssueFor = [] } = {}) {
  const world = {
    sheetRows: structuredClone(rows),
    sheetWrites: [], // what writeSheetUpdates received
    issueCalls: [], // studentIds, in the order issuing was asked
    maxIssuingAtOnce: 0,
    failIssueFor: new Set(failIssueFor),
    readFails: false,
    sheetWriteFails: false,
    outsideTransactionWrites: [],
    state: { students: new Map(), passports: new Map(), skills: new Map(), awards: [], versions: [], log: [], nextNumber: 1 },
  };
  const { state } = world;
  let issuingNow = 0;

  // A write must happen inside runInTransaction, otherwise a failure half way would leave half saved data
  const requireTransaction = (name, client) => {
    if (client !== TRANSACTION_CLIENT) world.outsideTransactionWrites.push(name);
  };

  const passportOf = (studentId) => [...state.passports.values()].find((passport) => passport.studentId === studentId);

  world.db = {
    async findExistingRecordIds(recordIds) {
      return new Set(state.awards.filter((award) => recordIds.includes(award.recordId)).map((award) => award.recordId));
    },
    async findExistingStudentSkillPairs(studentIds) {
      return state.awards
        .filter((award) => studentIds.includes(award.studentId))
        .map((award) => ({ studentId: award.studentId, skillId: award.skillId }));
    },
    async findStudentsByIds(studentIds) {
      return studentIds
        .filter((studentId) => state.students.has(studentId))
        .map((studentId) => {
          const passport = passportOf(studentId);
          return {
            ...state.students.get(studentId),
            passportId: passport?.passportId ?? null,
            firstIssued: passport?.firstIssued ?? null,
          };
        });
    },
    async findPassportsByIds(passportIds) {
      return passportIds
        .filter((passportId) => state.passports.has(passportId))
        .map((passportId) => ({ passportId, studentId: state.passports.get(passportId).studentId }));
    },
    async runInTransaction(work) {
      const before = structuredClone(state);
      try {
        return await work(TRANSACTION_CLIENT);
      } catch (error) {
        Object.assign(state, before); // ROLLBACK
        throw error;
      }
    },
    async insertNewSkills(skills, client) {
      requireTransaction('insertNewSkills', client);
      for (const skill of skills) {
        if (!state.skills.has(skill.skillId)) state.skills.set(skill.skillId, { ...skill });
      }
    },
    async setPassportNumberSequence(maxNumber, client) {
      requireTransaction('setPassportNumberSequence', client);
      state.nextNumber = maxNumber + 1;
    },
    async insertStudent(student, client) {
      requireTransaction('insertStudent', client);
      assert(!state.students.has(student.studentId), `student ${student.studentId} inserted twice`);
      state.students.set(student.studentId, {
        studentId: student.studentId,
        firstName: student.firstName,
        lastName: student.lastName,
        email: student.email,
        program: student.program,
        educationLevel: student.educationLevel,
        studentStatus: student.studentStatus,
      });
    },
    async createPassport({ studentId, passportId = null, firstIssued }, client) {
      requireTransaction('createPassport', client);
      assert(state.students.has(studentId), 'the student must exist before the passport');
      const id = passportId ?? `BTU-AI-${String(state.nextNumber++).padStart(6, '0')}`;
      assert(!state.passports.has(id), `Passport ID ${id} created twice`);
      state.passports.set(id, { passportId: id, studentId, firstIssued });
    },
    async updateStudentDetails(update, client) {
      requireTransaction('updateStudentDetails', client);
      Object.assign(state.students.get(update.studentId), {
        program: update.program,
        educationLevel: update.educationLevel,
        studentStatus: update.studentStatus,
      });
    },
    async insertSkillAwards(awards, client) {
      requireTransaction('insertSkillAwards', client);
      for (const award of awards) {
        assert(state.students.has(award.studentId), 'the student must exist before the award');
        assert(state.skills.has(award.skillId), 'the skill must exist before the award');
        state.awards.push({ ...award, versionId: null, createdAt: NOW });
      }
    },
    async insertSyncLog(entries) {
      for (const entry of entries) {
        const repeated = entry.level !== 'info'
          && state.log.some((old) => old.level !== 'info' && old.recordId === entry.recordId && old.message === entry.message);
        if (!repeated) state.log.push({ ...entry });
      }
    },
    async findPendingStudentIds() {
      return [...new Set(state.awards.filter((award) => award.versionId === null).map((award) => award.studentId))].sort();
    },
    async findAwardsByStudent(studentId) {
      return state.awards.filter((award) => award.studentId === studentId).map((award) => ({ ...award }));
    },
    async findIssuedVersionsByRecordIds(recordIds) {
      return state.awards
        .filter((award) => award.versionId !== null && recordIds.includes(award.recordId))
        .map((award) => {
          const version = state.versions.find((item) => item.id === award.versionId);
          return { recordId: award.recordId, version: version.version, issuedAt: version.issuedAt };
        });
    },
  };

  world.deps = {
    db: world.db,
    now: () => NOW,
    async readRows() {
      if (world.readFails) throw new Error('Google Sheet is not readable');
      return structuredClone(world.sheetRows);
    },
    async writeSheetUpdates(updates) {
      if (world.sheetWriteFails) throw new Error('Google Sheets API 503');
      world.sheetWrites.push(structuredClone(updates));
      applyToSheet(world.sheetRows, updates);
      return { syncRows: updates.syncRows.length, passportRows: updates.passportRows.length };
    },
    // Does what issuePassportVersion does to the database, without PDF, Storage and chain
    async issueVersion(student, awards) {
      world.issueCalls.push(student.studentId);
      issuingNow += 1;
      world.maxIssuingAtOnce = Math.max(world.maxIssuingAtOnce, issuingNow);
      await new Promise((resolve) => setTimeout(resolve, 1)); // gives a parallel run the chance to overlap
      issuingNow -= 1;

      if (world.failIssueFor.has(student.studentId)) {
        throw new Error('Chain step failed for BTU-V-FAKE-0001: timeout. The PDF stays in Storage');
      }
      assert(student.passportId, `${student.studentId} has no passport when issuing starts`);
      const pending = state.awards.filter((award) => award.studentId === student.studentId && award.versionId === null);
      assert(pending.length > 0, 'issuing was asked for a student without new awards');

      const sameStudent = state.versions.filter((item) => item.passportId === student.passportId);
      const version = sameStudent.length + 1;
      const id = state.versions.length + 1;
      state.versions.push({ id, passportId: student.passportId, version, issuedAt: NOW });
      pending.forEach((award) => { award.versionId = id; });
      return { passportId: student.passportId, version, txHash: `0x${String(id).padStart(64, '0')}` };
    },
  };
  return world;
}

// What Google would show after the write
function applyToSheet(rows, { syncRows, passportRows }) {
  for (const { sheetRow, cells } of syncRows) {
    const row = rows.find((item) => item.sheetRow === sheetRow);
    [row.syncStatus, row.syncedVersion, row.syncedAt, row.syncError] = cells.map((cell) => (cell === '' ? null : cell));
  }
  for (const { sheetRow, cells } of passportRows) {
    const row = rows.find((item) => item.sheetRow === sheetRow);
    [row.passportId, row.firstIssued] = cells;
  }
}

const sheetRowOf = (world, recordId) => world.sheetRows.find((row) => row.recordId === recordId);
const logMessages = (world, level) => world.state.log.filter((entry) => entry.level === level).map((entry) => entry.message);

// Runs a bootstrap on the real test data and returns the world. Many scenarios start from here.
async function bootstrapWorld() {
  const world = createWorld({ rows: realRows });
  await runSync({ bootstrap: true }, world.deps);
  return world;
}

// ---------- Scenarios ----------

let step = 0;
let failed = false;
async function scenario(name, work) {
  step += 1;
  try {
    await work();
    console.log(`ok ${step}  ${name}`);
  } catch (error) {
    failed = true;
    console.log(`FAILED ${step}  ${name}\n   ${error.message}`);
  }
}

await scenario('bootstrap on the real test data: 18 students, 60 awards, one V1 each, Passport IDs kept', async () => {
  const world = createWorld({ rows: realRows });
  const { summary, problems } = await runSync({ bootstrap: true }, world.deps);

  assert.deepEqual(summary, { rowsRead: 60, newAwards: 60, versionsIssued: 18, duplicates: 0, errors: 0 });
  assert.deepEqual(problems, []);
  assert.equal(world.state.students.size, 18);
  assert.equal(world.state.passports.get('BTU-AI-000125').studentId, 'BTU-T-0001');
  assert.equal(world.state.passports.get('BTU-AI-000125').firstIssued, '2026-09-15'); // imported as it is
  assert.equal(world.state.skills.size, 16);
  assert(world.state.awards.every((award) => award.versionId !== null), 'every award is in a version');
  assert(world.state.versions.every((item) => item.version === 1), 'every passport is at V1');
  assert.equal(world.issueCalls.length, 18);
  assert.deepEqual(world.outsideTransactionWrites, []);
});

await scenario('bootstrap sets the number sequence: the next new passport follows the highest imported one (142)', async () => {
  const world = await bootstrapWorld();
  assert.equal(world.state.nextNumber, 143);
});

await scenario('bootstrap writes the Sheet in ONE call with the new V1 values, and a repeated sync then writes nothing', async () => {
  const world = await bootstrapWorld();
  assert.equal(world.sheetWrites.length, 1);
  assert.equal(world.sheetWrites[0].syncRows.length, 60); // the fake "SYNCED V1 2026-10-17" values are replaced
  assert.deepEqual(sheetRowOf(world, 'REC-0001').syncedAt, '2026-10-22 09:30 UTC');
  assert.deepEqual(world.sheetWrites[0].passportRows, []); // Passport IDs are already in the Sheet

  const { summary } = await runSync({}, world.deps);
  assert.deepEqual(summary, { rowsRead: 60, newAwards: 0, versionsIssued: 0, duplicates: 0, errors: 0 });
  assert.equal(world.sheetWrites[1].syncRows.length, 0);
  assert.equal(world.sheetWrites[1].passportRows.length, 0);
});

await scenario('bootstrap twice is refused, before anything is saved or issued', async () => {
  const world = await bootstrapWorld();
  const issuedBefore = world.issueCalls.length;
  const versionsBefore = world.state.versions.length;
  await assert.rejects(runSync({ bootstrap: true }, world.deps), /only for the first run/);
  assert.equal(world.issueCalls.length, issuedBefore);
  assert.equal(world.state.versions.length, versionsBefore);
});

await scenario('repeated sync (demo 5): no new awards, no new versions, no duplicates, the Sheet is not touched', async () => {
  const world = await bootstrapWorld();
  const awardsBefore = world.state.awards.length;
  const { summary, problems } = await runSync({}, world.deps);
  assert.deepEqual(summary, { rowsRead: 60, newAwards: 0, versionsIssued: 0, duplicates: 0, errors: 0 });
  assert.deepEqual(problems, []);
  assert.equal(world.state.awards.length, awardsBefore);
  assert.equal(world.issueCalls.length, 18);
});

await scenario('new student (demos 1 and 2): new Passport ID, V1 issued, Passport ID and First Issued written to ALL its rows', async () => {
  const world = await bootstrapWorld();
  const first = makeRow({ studentId: 'BTU-T-0200', firstName: 'Nino', lastName: 'Beridze', email: 'nino@example.org' });
  const second = makeRow({ studentId: 'BTU-T-0200', firstName: 'Nino', lastName: 'Beridze', email: 'nino@example.org', skillId: 'SKL-002', skillName: 'Prompt Engineering' });
  world.sheetRows.push(first, second);

  const { summary } = await runSync({}, world.deps);
  assert.deepEqual(summary, { rowsRead: 62, newAwards: 2, versionsIssued: 1, duplicates: 0, errors: 0 });
  assert.equal(world.state.students.get('BTU-T-0200').email, 'nino@example.org');
  for (const row of [sheetRowOf(world, first.recordId), sheetRowOf(world, second.recordId)]) {
    assert.equal(row.passportId, 'BTU-AI-000143');
    assert.equal(row.firstIssued, '2026-10-22'); // UTC date of the run
    assert.equal(row.syncStatus, 'SYNCED');
    assert.equal(row.syncedVersion, 'V1');
  }
});

await scenario('new skill for a known student (demos 3, 4, 7, 8): V2, Passport ID and First Issued stay, old rows stay V1', async () => {
  const world = await bootstrapWorld();
  const oldRow = realRows.find((row) => row.studentId === 'BTU-T-0001');
  const newRow = makeRow({ ...pickStudent(oldRow), skillId: 'SKL-009', skillName: 'Data Ethics', passportId: oldRow.passportId, firstIssued: oldRow.firstIssued });
  world.sheetRows.push(newRow);

  const { summary } = await runSync({}, world.deps);
  assert.deepEqual(summary, { rowsRead: 61, newAwards: 1, versionsIssued: 1, duplicates: 0, errors: 0 });
  assert.equal(sheetRowOf(world, newRow.recordId).syncedVersion, 'V2');
  assert.equal(sheetRowOf(world, oldRow.recordId).syncedVersion, 'V1'); // still the version that first contained it
  assert.equal(world.state.passports.get('BTU-AI-000125').firstIssued, '2026-09-15');
  assert.equal(world.state.versions.filter((item) => item.passportId === 'BTU-AI-000125').length, 2);
  assert.equal(world.issueCalls.at(-1), 'BTU-T-0001');
});

await scenario('wrong student (demo 6): the row stops with an error in column T, other rows still go through', async () => {
  const world = await bootstrapWorld();
  const wrong = makeRow({ studentId: 'BTU-T-9999', passportId: 'BTU-AI-000999', firstIssued: '2026-09-01' });
  const good = makeRow({ studentId: 'BTU-T-0200', firstName: 'Nino', lastName: 'Beridze', email: 'nino@example.org' });
  world.sheetRows.push(wrong, good);

  const { summary, problems } = await runSync({}, world.deps);
  assert.equal(summary.errors, 1);
  assert.equal(summary.newAwards, 1);
  assert.equal(summary.versionsIssued, 1);
  assert.equal(problems.length, 1);
  assert(!world.state.students.has('BTU-T-9999'));
  const shown = sheetRowOf(world, wrong.recordId);
  assert.equal(shown.syncStatus, 'NOT SYNCED');
  assert.match(shown.syncError, /^Row \d+: unknown Student ID BTU-T-9999/);
  assert.equal(shown.passportId, 'BTU-AI-000999'); // a broken row is never "fixed" silently
  assert.equal(sheetRowOf(world, good.recordId).syncStatus, 'SYNCED');
  assert.equal(logMessages(world, 'error').length, 1);
});

await scenario('an invalid row (missing field) is logged and shown in column T; running again does not log it twice', async () => {
  const world = await bootstrapWorld();
  const broken = makeRow({ studentId: 'BTU-T-0200', recordId: 'REC-8000', email: null });
  world.sheetRows.push(broken);

  const first = await runSync({}, world.deps);
  assert.equal(first.summary.errors, 1);
  assert.match(sheetRowOf(world, 'REC-8000').syncError, /missing Email/);
  await runSync({}, world.deps);
  assert.equal(logMessages(world, 'error').length, 1);
  assert.equal(world.issueCalls.length, 18); // nothing to issue
});

await scenario('duplicate award: logged once as duplicate, not added, the Sheet row shows why', async () => {
  const world = await bootstrapWorld();
  const old = realRows[0];
  const copy = makeRow({ ...pickStudent(old), passportId: old.passportId, firstIssued: old.firstIssued, skillId: old.skillId, skillName: old.skillName });
  world.sheetRows.push(copy);

  const first = await runSync({}, world.deps);
  assert.equal(first.summary.duplicates, 1);
  assert.equal(first.summary.newAwards, 0);
  assert.equal(first.summary.errors, 0); // a duplicate is not an error
  assert.match(sheetRowOf(world, copy.recordId).syncError, /duplicate award/);
  await runSync({}, world.deps);
  assert.equal(logMessages(world, 'duplicate').length, 1);
  assert.equal(world.state.awards.length, 60);
});

await scenario('changed program of a known student is saved, with no new passport version (Decision 11)', async () => {
  const world = await bootstrapWorld();
  // The last row of a student decides (see rowPlanner), so the Sheet owner changes it on all rows of the student
  world.sheetRows.filter((item) => item.studentId === 'BTU-T-0001').forEach((item) => { item.program = 'Law'; });
  const versionsBefore = world.state.versions.length;

  await runSync({}, world.deps);
  assert.equal(world.state.students.get('BTU-T-0001').program, 'Law');
  assert.equal(world.state.versions.length, versionsBefore);
});

await scenario('issuing fails for one student: the others succeed, the failed one is shown in the Sheet and the summary', async () => {
  const world = createWorld({ rows: realRows, failIssueFor: ['BTU-T-0002'] });
  const { summary, problems } = await runSync({ bootstrap: true }, world.deps);

  assert.deepEqual(summary, { rowsRead: 60, newAwards: 60, versionsIssued: 17, duplicates: 0, errors: 1 });
  assert.match(problems[0], /BTU-T-0002: issuing a new passport version failed: Chain step failed/);
  const failedAwards = world.state.awards.filter((award) => award.studentId === 'BTU-T-0002');
  assert(failedAwards.length > 0 && failedAwards.every((award) => award.versionId === null), 'awards wait for the next sync');
  assert(world.state.awards.filter((award) => award.studentId !== 'BTU-T-0002').every((award) => award.versionId !== null));
  const shown = sheetRowOf(world, failedAwards[0].recordId);
  assert.equal(shown.syncStatus, 'NOT SYNCED');
  assert.match(shown.syncError, /BTU-T-0002 could not be issued/);
  assert(logMessages(world, 'error').some((message) => message.includes('BTU-T-0002')));
});

await scenario('retry after a failure: the next sync issues the waiting student and clears the error from the Sheet', async () => {
  const world = createWorld({ rows: realRows, failIssueFor: ['BTU-T-0002'] });
  await runSync({ bootstrap: true }, world.deps);

  world.failIssueFor.clear(); // the problem is fixed
  const { summary, problems } = await runSync({}, world.deps);
  assert.deepEqual(summary, { rowsRead: 60, newAwards: 0, versionsIssued: 1, duplicates: 0, errors: 0 });
  assert.deepEqual(problems, []);
  assert(world.state.awards.every((award) => award.versionId !== null));
  assert(world.sheetRows.every((row) => row.syncStatus === 'SYNCED' && row.syncError === null));
});

await scenario('students are issued one at a time, in a fixed order', async () => {
  const world = await bootstrapWorld();
  assert.equal(world.maxIssuingAtOnce, 1);
  assert.deepEqual(world.issueCalls, [...world.issueCalls].sort());
});

await scenario('the Sheet cannot be written: data stays in the database, the problem is reported, the next sync fixes the Sheet', async () => {
  const world = createWorld({ rows: realRows });
  world.sheetWriteFails = true;
  const { summary, problems } = await runSync({ bootstrap: true }, world.deps);

  assert.equal(summary.versionsIssued, 18);
  assert.equal(summary.errors, 1);
  assert(problems.some((problem) => problem.includes('Writing the results back to the Sheet failed')));
  assert(world.state.awards.every((award) => award.versionId !== null));
  assert(logMessages(world, 'error').some((message) => message.includes('Google Sheets API 503')));

  world.sheetWriteFails = false;
  const second = await runSync({}, world.deps);
  assert.equal(second.summary.errors, 0);
  assert.equal(world.sheetWrites.length, 1); // the Sheet is written now
  assert.equal(sheetRowOf(world, 'REC-0001').syncedAt, '2026-10-22 09:30 UTC');
});

await scenario('saving fails half way: NOTHING is saved (one transaction) and nothing is issued', async () => {
  const world = createWorld({ rows: realRows });
  world.db.insertSkillAwards = async () => { throw new Error('database connection lost'); };

  await assert.rejects(runSync({ bootstrap: true }, world.deps), /database connection lost/);
  assert.equal(world.state.students.size, 0);
  assert.equal(world.state.passports.size, 0);
  assert.equal(world.state.skills.size, 0);
  assert.equal(world.state.nextNumber, 1);
  assert.equal(world.issueCalls.length, 0);
  assert.equal(world.sheetWrites.length, 0);
});

await scenario('the Sheet cannot be read: the run stops before anything is changed', async () => {
  const world = createWorld({ rows: realRows });
  world.readFails = true;
  await assert.rejects(runSync({ bootstrap: true }, world.deps), /not readable/);
  assert.equal(world.state.students.size, 0);
  assert.equal(world.sheetWrites.length, 0);
});

await scenario('a very long failure text is cut before it goes into a Sheet cell', async () => {
  const world = createWorld({ rows: realRows });
  world.deps.issueVersion = async () => { throw new Error('x'.repeat(2000)); };
  await runSync({ bootstrap: true }, world.deps);
  const lengths = world.sheetRows.map((row) => (row.syncError ?? '').length);
  assert(Math.max(...lengths) > 0 && Math.max(...lengths) <= 500, `longest text ${Math.max(...lengths)}`);
});

await scenario('every run ends with an info line in the log that holds the numbers', async () => {
  const world = await bootstrapWorld();
  const infos = logMessages(world, 'info');
  assert.equal(infos.at(-1), 'Sync finished: 60 rows read, 60 new awards, 18 versions issued, 0 duplicates, 0 errors');
});

await scenario('progress is reported line by line for a person watching (npm run bootstrap)', async () => {
  const world = createWorld({ rows: realRows });
  const lines = [];
  await runSync({ bootstrap: true, report: (line) => lines.push(line) }, world.deps);
  assert(lines.some((line) => line.includes('Read 60 rows')));
  assert(lines.some((line) => line.includes('Issuing BTU-T-0001 (1/18)')));
  assert(lines.some((line) => line.includes('V1 issued')));
});

// ---------- Mail to the student (optional, never part of the issue) ----------

// A notifier like the real one, but it only remembers the calls. `answer` decides what it does.
function addNotifier(world, answer = async () => ({ status: 'sent' })) {
  world.mails = [];
  world.deps.notifyStudent = async (input) => {
    world.mails.push({
      studentId: input.student.studentId,
      email: input.student.email,
      version: input.result.version,
      newRecordIds: input.awards.filter((award) => award.versionId === null).map((award) => award.recordId),
    });
    return answer(input);
  };
}

function addKnownStudentSkill(world, skillId = 'SKL-009') {
  const oldRow = realRows.find((row) => row.studentId === 'BTU-T-0001');
  const newRow = makeRow({ ...pickStudent(oldRow), skillId, skillName: 'Data Ethics', passportId: oldRow.passportId, firstIssued: oldRow.firstIssued });
  world.sheetRows.push(newRow);
  return newRow;
}

await scenario('mail: one mail per issued version, to that student, for the NEW record only; a repeated sync sends none', async () => {
  const world = await bootstrapWorld();
  addNotifier(world);
  const newRow = addKnownStudentSkill(world);

  await runSync({}, world.deps);
  assert.equal(world.mails.length, 1);
  assert.deepEqual(world.mails[0], { studentId: 'BTU-T-0001', email: newRow.email, version: 2, newRecordIds: [newRow.recordId] });

  await runSync({}, world.deps);
  assert.equal(world.mails.length, 1, 'nothing new, so no new mail');
});

await scenario('mail: a mail that fails does not undo the issue: counts, Sheet and problems stay clean, the log gets one note', async () => {
  const world = await bootstrapWorld();
  addNotifier(world, async () => { throw new Error('Brevo answered 401: Key not found'); });
  const newRow = addKnownStudentSkill(world);

  const { summary, problems } = await runSync({}, world.deps);
  assert.deepEqual(summary, { rowsRead: 61, newAwards: 1, versionsIssued: 1, duplicates: 0, errors: 0 });
  assert.deepEqual(problems, []);
  assert.equal(sheetRowOf(world, newRow.recordId).syncStatus, 'SYNCED');
  assert.equal(sheetRowOf(world, newRow.recordId).syncedVersion, 'V2');
  assert.deepEqual(logMessages(world, 'error'), []);
  const notes = logMessages(world, 'info').filter((message) => message.includes('student mail'));
  assert.equal(notes.length, 1);
  assert.match(notes[0], /BTU-AI-\d{6} V2: student mail could not be sent: Brevo answered 401: Key not found/);
});

await scenario('mail: the first run (bootstrap) sends no mail to anyone', async () => {
  const world = createWorld({ rows: realRows });
  addNotifier(world);
  const { summary } = await runSync({ bootstrap: true }, world.deps);
  assert.equal(summary.versionsIssued, 18);
  assert.equal(world.mails.length, 0);
});

await scenario('mail: a student whose issue failed gets no mail, the other new student does', async () => {
  const world = await bootstrapWorld();
  addNotifier(world);
  world.failIssueFor.add('BTU-T-0200');
  world.sheetRows.push(
    makeRow({ studentId: 'BTU-T-0200', firstName: 'Nino', lastName: 'Beridze', email: 'nino@gmail.com' }),
    makeRow({ studentId: 'BTU-T-0201', firstName: 'Ana', lastName: 'Kapanadze', email: 'ana@gmail.com' }),
  );

  const { summary } = await runSync({}, world.deps);
  assert.equal(summary.versionsIssued, 1);
  assert.equal(summary.errors, 1);
  assert.deepEqual(world.mails.map((mail) => [mail.studentId, mail.version]), [['BTU-T-0201', 1]]);
});

await scenario('mail: "off" is silent and a "skipped" is only a progress line: nothing goes to the log', async () => {
  const world = await bootstrapWorld();
  addNotifier(world, async () => ({ status: 'off' }));
  addKnownStudentSkill(world, 'SKL-009');
  const lines = [];
  await runSync({ report: (text) => lines.push(text) }, world.deps);
  assert.equal(world.mails.length, 1);
  assert.ok(!lines.some((line) => line.includes('student mail')), 'off says nothing');

  const second = await bootstrapWorld();
  addNotifier(second, async () => ({ status: 'skipped', reason: 'BREVO_API_KEY is not set' }));
  addKnownStudentSkill(second, 'SKL-009');
  const secondLines = [];
  await runSync({ report: (text) => secondLines.push(text) }, second.deps);
  assert.ok(secondLines.some((line) => line.includes('student mail not sent (BREVO_API_KEY is not set)')));
  assert.deepEqual(logMessages(second, 'info').filter((message) => message.includes('student mail')), []);
});

function pickStudent(row) {
  return {
    studentId: row.studentId,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    program: row.program,
    educationLevel: row.educationLevel,
    studentStatus: row.studentStatus,
  };
}

console.log(failed ? '\nSome scenarios FAILED.' : `\nAll ${step} scenarios passed.`);
process.exitCode = failed ? 1 : 0;
