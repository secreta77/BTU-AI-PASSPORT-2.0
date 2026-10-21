// All parameterized SQL queries (no string-built SQL).
//
// Rules for every function in this file:
// - `db` is the LAST argument. It is the shared `pool` or the client of a running transaction.
// - Rows come back as camelCase objects. Names follow sheets/reader.js (`studentStatus`, `firstIssued`, ...),
//   so one field has one name from the Sheet to the DB to the PDF (see docs/api.md).
import { pool } from './pool.js';

// "first_name" -> "firstName"
function toCamelCase(row) {
  const result = {};
  for (const [column, value] of Object.entries(row)) {
    const field = column.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[field] = value;
  }
  return result;
}

// ---------- Sync: what is already in the database ----------

// Record IDs that were processed before. Idempotency: such a record is never processed twice.
// One query for all IDs, not one query per row.
export async function findExistingRecordIds(recordIds, db = pool) {
  const { rows } = await db.query(
    'SELECT record_id FROM skill_awards WHERE record_id = ANY($1)',
    [recordIds],
  );
  return new Set(rows.map((row) => row.record_id));
}

// Which (student, skill) pairs already exist. A student gets one award per skill (Decision 10).
// Returns [{ studentId, skillId }]
export async function findExistingStudentSkillPairs(studentIds, db = pool) {
  const { rows } = await db.query(
    'SELECT student_id, skill_id FROM skill_awards WHERE student_id = ANY($1)',
    [studentIds],
  );
  return rows.map(toCamelCase);
}

// Known students with their passport. passportId and firstIssued are null if the student has no passport yet.
// A student missing from the result is new (or has an unknown ID).
export async function findStudentsByIds(studentIds, db = pool) {
  const { rows } = await db.query(
    `SELECT s.student_id, s.first_name, s.last_name, s.email, s.program, s.education_level,
            s.status AS student_status,
            p.passport_id, p.first_issued_at AS first_issued
     FROM students s
     LEFT JOIN passports p ON p.student_id = s.student_id
     WHERE s.student_id = ANY($1)`,
    [studentIds],
  );
  return rows.map(toCamelCase);
}

// Passport IDs that exist, with their owner. Used to detect a Passport ID that is unknown
// or belongs to another student (Decision 1). Returns [{ passportId, studentId }]
export async function findPassportsByIds(passportIds, db = pool) {
  const { rows } = await db.query(
    'SELECT passport_id, student_id FROM passports WHERE passport_id = ANY($1)',
    [passportIds],
  );
  return rows.map(toCamelCase);
}

// ---------- Sync: writing ----------
// Callers pass the transaction client as `db` when several writes must succeed or fail together.

// [{ a: 1 }, { a: 2 }] with 'a' -> [1, 2]. We send one array per column to unnest() and insert many rows in ONE query.
function pluck(items, field) {
  return items.map((item) => item[field]);
}

// student: { studentId, firstName, lastName, email, program, educationLevel, studentStatus }
export async function insertStudent(student, db = pool) {
  await db.query(
    `INSERT INTO students (student_id, first_name, last_name, email, program, education_level, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      student.studentId,
      student.firstName,
      student.lastName,
      student.email,
      student.program,
      student.educationLevel,
      student.studentStatus,
    ],
  );
}

// Only program, education level and status can change (Decision 11). Name, surname and email never do.
// Returns true when something really changed. Same values = no write.
export async function updateStudentDetails(student, db = pool) {
  const { rowCount } = await db.query(
    `UPDATE students SET program = $2, education_level = $3, status = $4
     WHERE student_id = $1
       AND (program, education_level, status) IS DISTINCT FROM ($2::text, $3::text, $4::text)`,
    [student.studentId, student.program, student.educationLevel, student.studentStatus],
  );
  return rowCount > 0;
}

// Creates the one permanent passport of a student. Returns { passportId, firstIssued }.
// - New student: passportId is null, the number comes from passport_number_seq (BTU-AI-000NNN).
// - Bootstrap (Decision 2): passportId from the Sheet is stored as it is. COALESCE only evaluates nextval() when needed.
// firstIssued ('YYYY-MM-DD') is passed in, so the date does not depend on the database timezone.
export async function createPassport({ studentId, passportId = null, firstIssued }, db = pool) {
  const { rows } = await db.query(
    `INSERT INTO passports (passport_id, student_id, first_issued_at)
     VALUES (COALESCE($2::text, 'BTU-AI-' || lpad(nextval('passport_number_seq')::text, 6, '0')), $1, $3)
     RETURNING passport_id, first_issued_at AS first_issued`,
    [studentId, passportId, firstIssued],
  );
  return toCamelCase(rows[0]);
}

// Bootstrap only: after importing old passports the next new one gets maxNumber + 1.
// maxNumber must be 1 or more (PostgreSQL does not accept 0 here).
export async function setPassportNumberSequence(maxNumber, db = pool) {
  await db.query("SELECT setval('passport_number_seq', $1)", [maxNumber]);
}

// Adds skills that are not in the database yet. Existing skills stay as they are. Returns how many were added.
// skills: [{ skillId, skillName, skillCategory, skillDescription }] (the same skill may appear many times)
export async function insertNewSkills(skills, db = pool) {
  const { rowCount } = await db.query(
    `INSERT INTO skills (skill_id, name, category, description)
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[])
     ON CONFLICT (skill_id) DO NOTHING`,
    [
      pluck(skills, 'skillId'),
      pluck(skills, 'skillName'),
      pluck(skills, 'skillCategory'),
      pluck(skills, 'skillDescription'),
    ],
  );
  return rowCount;
}

// New awards have no version yet (version_id stays NULL until the passport version is issued).
// earned_through stays NULL: the Sheet has no such column (open question 1). Returns how many were added.
// Safe to repeat: a known record_id is skipped. A second award for the same student and skill is NOT skipped on
// purpose: sync filters those first (Decision 10), so a bug in the filter fails loudly instead of hiding.
// awards: [{ recordId, studentId, skillId, dateEarned }]
export async function insertSkillAwards(awards, db = pool) {
  const { rowCount } = await db.query(
    `INSERT INTO skill_awards (record_id, student_id, skill_id, date_earned)
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::date[])
     ON CONFLICT (record_id) DO NOTHING`,
    [
      pluck(awards, 'recordId'),
      pluck(awards, 'studentId'),
      pluck(awards, 'skillId'),
      pluck(awards, 'dateEarned'),
    ],
  );
  return rowCount;
}

// Writes log entries. An error or duplicate with the same record_id and message is stored only once
// (unique index sync_log_issue_once_idx, Decision 10). Returns how many were really added.
// entries: [{ sheetRow, recordId, studentId, level, message }] (sheetRow, recordId, studentId can be null)
export async function insertSyncLog(entries, db = pool) {
  const { rowCount } = await db.query(
    `INSERT INTO sync_log (sheet_row, record_id, student_id, level, message)
     SELECT * FROM unnest($1::int[], $2::text[], $3::text[], $4::text[], $5::text[])
     ON CONFLICT DO NOTHING`,
    [
      pluck(entries, 'sheetRow'),
      pluck(entries, 'recordId'),
      pluck(entries, 'studentId'),
      pluck(entries, 'level'),
      pluck(entries, 'message'),
    ],
  );
  return rowCount;
}
