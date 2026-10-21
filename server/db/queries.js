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
