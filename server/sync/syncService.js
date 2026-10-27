// The sync: reads the Sheet, saves new students and awards, issues new passport versions, writes the results back.
//   1 read + validate   2 load what the database knows   3 plan (rowPlanner.js)
//   4 save the plan in ONE transaction   5 issue new versions, one student at a time   6 write the Sheet back
// Everything outside (database, Google, issuing) comes in as `deps`, so tests can replace it with fakes.
import { pathToFileURL } from 'node:url';
import * as queries from '../db/queries.js';
import { pool } from '../db/pool.js';
import { issuePassportVersion } from '../passport/issuePipeline.js';
import { readRowsFromGoogleSheet } from '../sheets/reader.js';
import { validateRows } from '../sheets/validator.js';
import { writeSheetUpdates } from '../sheets/writer.js';
import { SYNC_LOG_LEVEL } from '../shared/constants.js';
import { filterByVerificationStatus } from './statusFilter.js';
import { planRows, studentSkillKey } from './rowPlanner.js';
import { buildSheetUpdates } from './sheetUpdates.js';

const MAX_SHEET_MESSAGE_LENGTH = 500; // a long error text must not fill a Sheet cell
const PASSPORT_ID_PREFIX = 'BTU-AI-';

const defaultDeps = {
  db: queries,
  readRows: readRowsFromGoogleSheet,
  writeSheetUpdates,
  issueVersion: issuePassportVersion,
  now: () => new Date(),
};

// options.bootstrap: first run only (Decision 2). options.report(text): progress lines for a person watching.
// Returns { summary, problems }. summary has the numbers of docs/api.md; problems are all error/duplicate texts.
// Throws only when the run could not work at all (Sheet not readable, database down, bootstrap not allowed).
export async function runSync({ bootstrap = false, report = () => {} } = {}, deps = defaultDeps) {
  const rows = await deps.readRows(); // ONE Google call for the whole Sheet
  report(`Read ${rows.length} rows from the Sheet`);
  // Only CONFIRMED rows go on (column U). Skipped rows are logged and the Sheet is not written for them.
  const statusCheck = filterByVerificationStatus(rows);
  const validation = validateRows(statusCheck.rows);
  const valid = validation.valid;
  const validationErrors = [...statusCheck.errors, ...validation.errors];
  if (statusCheck.skipped.length > 0) {
    report(`Skipped ${statusCheck.skipped.length} rows that are not CONFIRMED`);
  }

  const known = await loadKnown(valid, deps.db);
  if (bootstrap && known.students.size > 0) {
    throw new Error(
      `Bootstrap is only for the first run: ${known.students.size} students of the Sheet are already in the database`,
    );
  }
  const plan = planRows(valid, known, { bootstrap });
  report(`Plan: ${plan.newStudents.length} new students, ${plan.newAwards.length} new awards, `
    + `${plan.duplicates.length} duplicates, ${plan.errors.length + validationErrors.length} errors`);

  await savePlan(plan, validationErrors, bootstrap, deps);
  const { versionsIssued, failures } = await issuePending(deps, report);

  const rowByRecordId = firstRowOfEachRecord(valid);
  const messageByRow = collectRowMessages([...validationErrors, ...plan.errors, ...plan.duplicates], failures, rowByRecordId);
  const sheetProblem = await writeBackToSheet(rows, statusCheck.untouchedRows, messageByRow, deps);

  const problems = [
    ...[...validationErrors, ...plan.errors, ...plan.duplicates].map((issue) => issue.message),
    ...failures.map(describeFailure),
    ...(sheetProblem ? [sheetProblem] : []),
  ];
  const summary = {
    rowsRead: rows.length,
    newAwards: plan.newAwards.length,
    versionsIssued,
    duplicates: plan.duplicates.length,
    errors: validationErrors.length + plan.errors.length + failures.length + (sheetProblem ? 1 : 0),
    // Only when there are some: the number of PENDING / REJECTED rows. No log line per row, because info lines are
    // not deduplicated and a PENDING row would add a new line on every sync.
    ...(statusCheck.skipped.length > 0 ? { skipped: statusCheck.skipped.length } : {}),
  };
  await logEnd(summary, failures, sheetProblem, deps);
  return { summary, problems };
}

// ---------- Step 2: what the database already knows ----------

async function loadKnown(valid, db) {
  const studentIds = unique(valid.map((row) => row.studentId));
  const passportIds = unique(valid.map((row) => row.passportId).filter((passportId) => passportId !== null));
  const recordIds = valid.map((row) => row.recordId);

  // Four queries for the whole Sheet, not one query per row
  const [students, passports, existingRecordIds, pairs] = await Promise.all([
    db.findStudentsByIds(studentIds),
    db.findPassportsByIds(passportIds),
    db.findExistingRecordIds(recordIds),
    db.findExistingStudentSkillPairs(studentIds),
  ]);
  return {
    students: new Map(students.map((student) => [student.studentId, student])),
    passportOwners: new Map(passports.map((passport) => [passport.passportId, passport.studentId])),
    recordIds: existingRecordIds,
    studentSkillPairs: new Set(pairs.map((pair) => studentSkillKey(pair.studentId, pair.skillId))),
  };
}

// ---------- Step 4: save the plan in ONE transaction (all or nothing) ----------

async function savePlan(plan, validationErrors, bootstrap, deps) {
  const { db } = deps;
  const today = deps.now().toISOString().slice(0, 10); // UTC date, so it does not depend on the server timezone
  const logEntries = [
    ...validationErrors.map((issue) => toLogEntry(issue, SYNC_LOG_LEVEL.ERROR)),
    ...plan.errors.map((issue) => toLogEntry(issue, SYNC_LOG_LEVEL.ERROR)),
    ...plan.duplicates.map((issue) => toLogEntry(issue, SYNC_LOG_LEVEL.DUPLICATE)),
  ];

  await db.runInTransaction(async (client) => {
    if (plan.skills.length > 0) {
      await db.insertNewSkills(plan.skills, client);
    }
    if (bootstrap) {
      // Before any new passport is made, so a new number can never collide with an imported one
      await db.setPassportNumberSequence(highestPassportNumber(plan.newStudents), client);
    }
    for (const student of plan.newStudents) {
      await db.insertStudent(student, client);
      await db.createPassport(
        { studentId: student.studentId, passportId: student.passportId, firstIssued: student.firstIssued ?? today },
        client,
      );
    }
    for (const update of plan.studentUpdates) {
      await db.updateStudentDetails(update, client); // writes only when something really changed
    }
    if (plan.newAwards.length > 0) {
      await db.insertSkillAwards(plan.newAwards, client);
    }
    if (logEntries.length > 0) {
      await db.insertSyncLog(logEntries, client);
    }
  });
}

function toLogEntry(issue, level) {
  return {
    sheetRow: issue.sheetRow,
    recordId: issue.recordId ?? null,
    studentId: issue.studentId ?? null,
    level,
    message: issue.message,
  };
}

// 142 for BTU-AI-000142. The sequence continues after it. Only imported IDs count (new students have none yet).
function highestPassportNumber(newStudents) {
  const numbers = newStudents
    .filter((student) => student.passportId !== null)
    .map((student) => Number(student.passportId.slice(PASSPORT_ID_PREFIX.length)));
  return Math.max(1, ...numbers); // setval() does not accept 0
}

// ---------- Step 5: issue, one student at a time (blockchain nonces must not collide) ----------

// Every student with awards that are not in a version yet, also those that failed in an earlier sync (retry).
async function issuePending(deps, report) {
  const studentIds = await deps.db.findPendingStudentIds();
  const failures = []; // [{ studentId, message, recordIds }]
  let versionsIssued = 0;

  for (const [index, studentId] of studentIds.entries()) {
    report(`Issuing ${studentId} (${index + 1}/${studentIds.length})`);
    const outcome = await issueForStudent(studentId, deps);
    if (outcome.failure) {
      failures.push(outcome.failure);
      report(`  FAILED: ${outcome.failure.message}`);
    } else {
      versionsIssued += 1;
      report(`  ${outcome.result.passportId} V${outcome.result.version} issued, txHash ${outcome.result.txHash}`);
    }
  }
  return { versionsIssued, failures };
}

// A failed student does not stop the others: their awards stay without a version and are tried again next sync.
async function issueForStudent(studentId, deps) {
  const [student] = await deps.db.findStudentsByIds([studentId]);
  const awards = await deps.db.findAwardsByStudent(studentId);
  try {
    return { result: await deps.issueVersion(student, awards) };
  } catch (error) {
    const recordIds = awards.filter((award) => award.versionId === null).map((award) => award.recordId);
    return { failure: { studentId, message: error.message, recordIds } };
  }
}

function describeFailure(failure) {
  return `${failure.studentId}: issuing a new passport version failed: ${failure.message}`;
}

// ---------- Step 6: the Sheet shows what the database knows ----------

// sheetRow -> text for column T. A failed student's pending rows get the failure text.
function collectRowMessages(issues, failures, rowByRecordId) {
  const messages = new Map(issues.map((issue) => [issue.sheetRow, issue.message]));
  for (const failure of failures) {
    for (const recordId of failure.recordIds) {
      const sheetRow = rowByRecordId.get(recordId);
      if (sheetRow !== undefined && !messages.has(sheetRow)) {
        messages.set(sheetRow, `Row ${sheetRow}: ${failure.studentId} could not be issued: ${failure.message}`);
      }
    }
  }
  for (const [sheetRow, message] of messages) {
    messages.set(sheetRow, shorten(message));
  }
  return messages;
}

function shorten(text) {
  return text.length > MAX_SHEET_MESSAGE_LENGTH ? `${text.slice(0, MAX_SHEET_MESSAGE_LENGTH - 1)}…` : text;
}

function firstRowOfEachRecord(validRows) {
  const rowByRecordId = new Map();
  for (const row of validRows) {
    if (!rowByRecordId.has(row.recordId)) {
      rowByRecordId.set(row.recordId, row.sheetRow);
    }
  }
  return rowByRecordId;
}

// Returns null when the Sheet was updated, or a text when it was not. The data is safe in the database either way,
// and the next sync writes the Sheet again, so a failure here must not fail the whole run.
async function writeBackToSheet(allRows, untouchedRows, messageByRow, deps) {
  const rows = allRows.filter((row) => !untouchedRows.has(row.sheetRow)); // PENDING / REJECTED: write nothing
  try {
    const studentIds = unique(rows.map((row) => row.studentId).filter(Boolean));
    const recordIds = rows.map((row) => row.recordId).filter(Boolean);
    const [students, versions] = await Promise.all([
      deps.db.findStudentsByIds(studentIds),
      deps.db.findIssuedVersionsByRecordIds(recordIds),
    ]);
    const dbState = {
      versionByRecordId: new Map(versions.map((item) => [item.recordId, { version: item.version, issuedAt: item.issuedAt }])),
      passportByStudentId: new Map(
        students
          .filter((student) => student.passportId !== null)
          .map((student) => [student.studentId, { passportId: student.passportId, firstIssued: student.firstIssued }]),
      ),
    };
    await deps.writeSheetUpdates(buildSheetUpdates(rows, dbState, messageByRow));
    return null;
  } catch (error) {
    return `Writing the results back to the Sheet failed: ${error.message}`;
  }
}

// ---------- Step 7: log ----------

async function logEnd(summary, failures, sheetProblem, deps) {
  const entry = (message, level) => ({ sheetRow: null, recordId: null, studentId: null, level, message });
  await deps.db.insertSyncLog([
    ...failures.map((failure) => ({
      ...entry(describeFailure(failure), SYNC_LOG_LEVEL.ERROR),
      studentId: failure.studentId,
    })),
    ...(sheetProblem ? [entry(sheetProblem, SYNC_LOG_LEVEL.ERROR)] : []),
    entry(formatSummary(summary), SYNC_LOG_LEVEL.INFO),
  ]);
}

export function formatSummary(summary) {
  return `Sync finished: ${summary.rowsRead} rows read, ${summary.newAwards} new awards, `
    + `${summary.versionsIssued} versions issued, ${summary.duplicates} duplicates, ${summary.errors} errors`
    + (summary.skipped > 0 ? `, ${summary.skipped} skipped (not CONFIRMED)` : '');
}

function unique(values) {
  return [...new Set(values)];
}

// ---------- Command line: `npm run sync` ----------

// Also used by bootstrap.js
export function printRunResult({ summary, problems }) {
  console.log(`\n${formatSummary(summary)}`);
  for (const problem of problems) {
    console.log(`  - ${problem}`);
  }
}

async function runFromCommandLine() {
  try {
    printRunResult(await runSync({ report: console.log }));
  } catch (error) {
    console.error('Sync failed:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

// True only when this file is started directly (npm run sync), not when another file imports it
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runFromCommandLine();
}
