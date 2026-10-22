// Decides what to do with each valid Sheet row. Pure: no database and no Google calls, so it is easy to test.
// Rules: CLAUDE.md Decisions 1 (new or invalid student), 2 (bootstrap), 10 (duplicates), 11 (student updates),
// 13 (every message starts with the Sheet row number).

const IDENTITY_FIELDS = [
  { field: 'firstName', label: 'First Name' },
  { field: 'lastName', label: 'Last Name' },
  { field: 'email', label: 'Email' },
];

// The key of a (student, skill) pair. A student gets one award per skill (Decision 10).
export function studentSkillKey(studentId, skillId) {
  return `${studentId}|${skillId}`;
}

// rows: valid rows from validator.js (reader field names, with sheetRow)
// known: what the database already has
//   students:          Map studentId -> { firstName, lastName, email, passportId, ... }
//   passportOwners:    Map passportId -> studentId (for the Passport IDs that appear in the Sheet)
//   recordIds:         Set of Record IDs that were processed before
//   studentSkillPairs: Set of studentSkillKey(...)
// options.bootstrap: first run only (Decision 2): Passport IDs from the Sheet are imported as they are
//
// Returns { newStudents, studentUpdates, skills, newAwards, duplicates, errors, alreadySyncedCount }.
// errors and duplicates are [{ sheetRow, recordId, studentId, message }]; a row in them is not processed further.
export function planRows(rows, known, { bootstrap = false } = {}) {
  const plan = {
    newStudents: [],
    studentUpdates: [],
    skills: [],
    newAwards: [],
    duplicates: [],
    errors: [],
    alreadySyncedCount: 0,
  };
  const context = {
    known,
    bootstrap,
    newStudents: new Map(), // studentId -> planned new student; later rows of the same student update it
    updates: new Map(), // studentId -> latest program / education level / status of a known student
    passportIdsInPlan: new Map(), // passportId -> studentId, so two new students cannot import the same ID
    recordIds: new Set(),
    pairs: new Set(),
    skills: new Map(),
  };

  const inSheetOrder = [...rows].sort((first, second) => first.sheetRow - second.sheetRow);
  for (const row of inSheetOrder) {
    planRow(row, plan, context);
  }

  plan.newStudents = [...context.newStudents.values()];
  plan.studentUpdates = [...context.updates.values()];
  plan.skills = [...context.skills.values()];
  return plan;
}

function planRow(row, plan, context) {
  // Idempotency: a record that was processed before is never processed again, and it is not an error
  if (context.known.recordIds.has(row.recordId)) {
    plan.alreadySyncedCount += 1;
    rememberChangedDetails(row, context);
    return;
  }

  const studentProblem = checkStudent(row, context);
  if (studentProblem !== null) {
    plan.errors.push(describeIssue(row, studentProblem));
    return;
  }

  const duplicateProblem = findDuplicate(row, context);
  if (duplicateProblem !== null) {
    plan.duplicates.push(describeIssue(row, duplicateProblem));
    return;
  }

  acceptAward(row, plan, context);
}

// Decision 11: a changed program, level or status is noticed even when the row itself is not new.
// Rows of the same student that do not match the database are ignored here (they are errors only for new records).
function rememberChangedDetails(row, context) {
  const student = context.known.students.get(row.studentId);
  if (student && findDifferingIdentity(row, student).length === 0) {
    context.updates.set(row.studentId, pickDetails(row));
  }
}

function describeIssue(row, text) {
  return {
    sheetRow: row.sheetRow,
    recordId: row.recordId,
    studentId: row.studentId,
    message: `Row ${row.sheetRow}: ${text}`,
  };
}

// ---------- Student rules (Decision 1) ----------

// Returns a problem text, or null when the row's student is fine. A fine row also records the student
// (new student, or the details of a known one) for the plan.
function checkStudent(row, context) {
  const knownStudent = context.known.students.get(row.studentId);
  if (knownStudent) {
    return checkKnownStudent(row, knownStudent, context);
  }
  return checkNewStudent(row, context);
}

function checkKnownStudent(row, student, context) {
  const differing = findDifferingIdentity(row, student);
  if (differing.length > 0) {
    return `${row.studentId} does not match the database (${differing.join(', ')} differ)`;
  }
  if (row.passportId !== null && row.passportId !== student.passportId) {
    return `Passport ID ${row.passportId} does not belong to ${row.studentId}`;
  }
  // Decision 11: program, education level and status can change; the sync writes them (no change = no write)
  context.updates.set(row.studentId, pickDetails(row));
  return null;
}

function checkNewStudent(row, context) {
  const planned = context.newStudents.get(row.studentId);
  if (planned) {
    return checkLaterRowOfNewStudent(row, planned);
  }
  if (row.passportId === null) {
    // Scenario 1: new student, no Passport ID yet. The system creates one.
    addNewStudent(row, context, null, null);
    return null;
  }
  return checkImportedPassport(row, context);
}

// The Passport ID cell is filled for a student we do not know
function checkImportedPassport(row, context) {
  const owner = context.known.passportOwners.get(row.passportId) ?? context.passportIdsInPlan.get(row.passportId);
  if (owner !== undefined) {
    return `Passport ID ${row.passportId} belongs to another student (${owner})`;
  }
  if (!context.bootstrap) {
    return `unknown Student ID ${row.studentId}: its Passport ID ${row.passportId} is not in the database`;
  }
  if (row.firstIssued === null) {
    return `First Issued is empty, it is needed to import ${row.passportId}`;
  }
  addNewStudent(row, context, row.passportId, row.firstIssued);
  return null;
}

// A second row of a student that is new in this sync: the first row decides the identity
function checkLaterRowOfNewStudent(row, planned) {
  const differing = findDifferingIdentity(row, planned);
  if (differing.length > 0) {
    return `${row.studentId} has a different ${differing.join(', ')} than its first row`;
  }
  if (row.passportId !== null && row.passportId !== planned.passportId) {
    return `Passport ID ${row.passportId} differs from the other rows of ${row.studentId}`;
  }
  Object.assign(planned, pickDetails(row)); // the last row wins for program, level and status
  return null;
}

function addNewStudent(row, context, passportId, firstIssued) {
  context.newStudents.set(row.studentId, {
    studentId: row.studentId,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    ...pickDetails(row),
    passportId,
    firstIssued,
  });
  if (passportId !== null) {
    context.passportIdsInPlan.set(passportId, row.studentId);
  }
}

function pickDetails(row) {
  return {
    studentId: row.studentId,
    program: row.program,
    educationLevel: row.educationLevel,
    studentStatus: row.studentStatus,
  };
}

// Names are compared exactly; an email is the same whatever the letter case (the database index ignores case too)
function findDifferingIdentity(row, student) {
  return IDENTITY_FIELDS
    .filter(({ field }) => !sameValue(field, row[field], student[field]))
    .map(({ label }) => label);
}

function sameValue(field, first, second) {
  if (field === 'email') {
    return first.toLowerCase() === second.toLowerCase();
  }
  return first === second;
}

// ---------- Duplicates (Decision 10) ----------

function findDuplicate(row, context) {
  if (context.recordIds.has(row.recordId)) {
    return `Record ID ${row.recordId} appears more than once in the Sheet`;
  }
  const key = studentSkillKey(row.studentId, row.skillId);
  if (context.known.studentSkillPairs.has(key) || context.pairs.has(key)) {
    return `duplicate award: ${row.studentId} already has skill ${row.skillId} (Record ${row.recordId} is not added)`;
  }
  return null;
}

function acceptAward(row, plan, context) {
  plan.newAwards.push({
    recordId: row.recordId,
    studentId: row.studentId,
    skillId: row.skillId,
    dateEarned: row.dateEarned,
    sheetRow: row.sheetRow,
  });
  context.recordIds.add(row.recordId);
  context.pairs.add(studentSkillKey(row.studentId, row.skillId));

  if (!context.skills.has(row.skillId)) {
    context.skills.set(row.skillId, {
      skillId: row.skillId,
      skillName: row.skillName,
      skillCategory: row.skillCategory,
      skillDescription: row.skillDescription,
    });
  }
}
