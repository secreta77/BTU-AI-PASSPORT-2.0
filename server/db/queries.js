// All parameterized SQL queries (no string-built SQL).
//
// Rules for every function in this file:
// - `db` is the LAST argument. It is the shared `pool` or the client of a running transaction.
// - Rows come back as camelCase objects. Names follow sheets/reader.js (`studentStatus`, `firstIssued`, ...),
//   so one field has one name from the Sheet to the DB to the PDF (see docs/api.md).
import { OTP, VERSION_STATUS } from '../shared/constants.js';
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

// ---------- Issuing a new passport version ----------

// Runs `work(client)` in one transaction: COMMIT if it finishes, ROLLBACK if it throws (nothing is saved).
export async function runInTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    // If the rollback itself fails (lost connection), the original error is still the one to report
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// Students who have awards without a version. They need a new passport version. Sorted, so the order is stable.
// Issue them one by one, so blockchain nonces do not collide.
export async function findPendingStudentIds(db = pool) {
  const { rows } = await db.query(
    'SELECT DISTINCT student_id FROM skill_awards WHERE version_id IS NULL ORDER BY student_id',
  );
  return rows.map((row) => row.student_id);
}

// ALL awards of one student with their skill data: the ones already issued (versionId is set) and the new ones
// (versionId is null). The PDF of the new version needs all of them: earlier skills are never removed.
// Field names are the ones renderPassportPdf reads (docs/api.md). awardId goes to saveIssuedVersion.
// createdAt tells the pipeline if a PDF left by a failed attempt already contains an award (issuePipeline.js).
export async function findAwardsByStudent(studentId, db = pool) {
  const { rows } = await db.query(
    `SELECT a.id AS award_id, a.record_id, a.student_id, a.skill_id,
            k.name AS skill_name, k.category AS skill_category, k.description AS skill_description,
            a.earned_through, a.date_earned, a.version_id, a.created_at
     FROM skill_awards a
     JOIN skills k ON k.skill_id = a.skill_id
     WHERE a.student_id = $1
     ORDER BY a.date_earned, a.record_id`,
    [studentId],
  );
  return rows.map(toCamelCase);
}

// 1 for a passport without versions, otherwise the highest version + 1
export async function findNextVersionNumber(passportId, db = pool) {
  const { rows } = await db.query(
    'SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM passport_versions WHERE passport_id = $1',
    [passportId],
  );
  return rows[0].next_version;
}

// Saves one issued version. Call it ONLY after the blockchain transaction is confirmed (pipeline step 5).
// One DB transaction: either the new version is `latest`, the old one is `superseded` and the new awards are
// linked to it, or nothing changes and the previous latest stays. It always opens its own transaction.
// issued: { passportId, version, verificationCode, docHash, txHash, pdfPath, awardIds }
//   awardIds = the awards that were new in this version (versionId was null). Returns { versionId, issuedAt }.
export async function saveIssuedVersion(issued) {
  return runInTransaction(async (client) => {
    // The old latest goes first: the unique index allows only one `latest` per passport at any moment
    await client.query(
      'UPDATE passport_versions SET status = $2 WHERE passport_id = $1 AND status = $3',
      [issued.passportId, VERSION_STATUS.SUPERSEDED, VERSION_STATUS.LATEST],
    );

    const { rows } = await client.query(
      `INSERT INTO passport_versions (passport_id, version, verification_code, status, doc_hash, tx_hash, pdf_path)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, issued_at`,
      [
        issued.passportId,
        issued.version,
        issued.verificationCode,
        VERSION_STATUS.LATEST,
        issued.docHash,
        issued.txHash,
        issued.pdfPath,
      ],
    );
    const versionId = rows[0].id;

    const linked = await client.query(
      'UPDATE skill_awards SET version_id = $1 WHERE id = ANY($2) AND version_id IS NULL',
      [versionId, issued.awardIds],
    );
    // An award that already belongs to a version must never move. If that happens, everything is rolled back.
    if (linked.rowCount !== issued.awardIds.length) {
      throw new Error(`Expected to link ${issued.awardIds.length} awards, but linked ${linked.rowCount}`);
    }

    return { versionId, issuedAt: rows[0].issued_at };
  });
}

// ---------- API reads: verify page and student ----------
// These queries only read. They return plain data; the route decides which fields go into the JSON answer.

// Facts about one verification code, or null if the code was never issued (404 CODE_NOT_FOUND).
// latestVersion = newest version of the SAME passport. The verify page needs it to tell "latest" from "outdated".
// Timestamps (issuedAt) come back as JS Date objects: JSON turns them into ISO 8601 text.
export async function findVersionByCode(verificationCode, db = pool) {
  const { rows } = await db.query(
    `SELECT v.id AS version_id, v.passport_id, v.version, v.verification_code, v.status,
            v.doc_hash, v.tx_hash, v.issued_at,
            (SELECT MAX(other.version) FROM passport_versions other WHERE other.passport_id = v.passport_id) AS latest_version
     FROM passport_versions v
     WHERE v.verification_code = $1`,
    [verificationCode],
  );
  return rows.length === 0 ? null : toCamelCase(rows[0]);
}

// The student who owns this email, or null. Upper and lower case do not matter (same rule as the unique index).
// Returns { studentId, firstName, lastName, email }.
export async function findStudentByEmail(email, db = pool) {
  const { rows } = await db.query(
    'SELECT student_id, first_name, last_name, email FROM students WHERE lower(email) = lower($1)',
    [email],
  );
  return rows.length === 0 ? null : toCamelCase(rows[0]);
}

// The passport of one student with the data of the student, or null if the student has no passport.
// `latest` is null while no version has been issued yet (the passport row exists, the PDF does not).
// latest = { versionId, version, verificationCode, issuedAt, txHash, pdfPath }
export async function findStudentPassport(studentId, db = pool) {
  const { rows } = await db.query(
    `SELECT p.passport_id, p.first_issued_at AS first_issued,
            s.student_id, s.first_name, s.last_name, s.program, s.education_level, s.status AS student_status,
            v.id AS version_id, v.version, v.verification_code, v.issued_at, v.tx_hash, v.pdf_path
     FROM passports p
     JOIN students s ON s.student_id = p.student_id
     LEFT JOIN passport_versions v ON v.passport_id = p.passport_id AND v.status = $2
     WHERE p.student_id = $1`,
    [studentId, VERSION_STATUS.LATEST],
  );
  if (rows.length === 0) {
    return null;
  }

  const row = toCamelCase(rows[0]);
  const latest = row.versionId === null
    ? null
    : {
        versionId: row.versionId,
        version: row.version,
        verificationCode: row.verificationCode,
        issuedAt: row.issuedAt,
        txHash: row.txHash,
        pdfPath: row.pdfPath,
      };
  return {
    passportId: row.passportId,
    studentId: row.studentId,
    firstName: row.firstName,
    lastName: row.lastName,
    program: row.program,
    educationLevel: row.educationLevel,
    studentStatus: row.studentStatus,
    firstIssued: row.firstIssued,
    latest,
  };
}

// Skills that are already in an issued passport (version_id is set), oldest dateEarned first.
// New awards of the next sync are not shown here: the student sees them after the new version is issued.
// stampCode is not in the database: the route adds it from STAMP_CODE_BY_CATEGORY (Decision 12).
export async function findIssuedSkillsByStudent(studentId, db = pool) {
  const { rows } = await db.query(
    `SELECT a.skill_id, k.name AS skill_name, k.category AS skill_category, k.description AS skill_description,
            a.earned_through, a.date_earned
     FROM skill_awards a
     JOIN skills k ON k.skill_id = a.skill_id
     WHERE a.student_id = $1 AND a.version_id IS NOT NULL
     ORDER BY a.date_earned, a.record_id`,
    [studentId],
  );
  return rows.map(toCamelCase);
}

// ---------- API reads: admin ----------

// All passports with the owner and the newest version, sorted by Passport ID. No paging (about 18 students).
// latestVersion and lastIssuedAt are null until the first version is issued.
// skillCount = skills that are already in an issued passport (the same skills the student sees).
export async function listPassports(db = pool) {
  const { rows } = await db.query(
    `SELECT p.passport_id, s.student_id, s.first_name, s.last_name, s.email,
            v.version AS latest_version, v.issued_at AS last_issued_at,
            p.first_issued_at AS first_issued,
            (SELECT COUNT(*)::int FROM skill_awards a
              WHERE a.student_id = s.student_id AND a.version_id IS NOT NULL) AS skill_count
     FROM passports p
     JOIN students s ON s.student_id = p.student_id
     LEFT JOIN passport_versions v ON v.passport_id = p.passport_id AND v.status = $1
     ORDER BY p.passport_id`,
    [VERSION_STATUS.LATEST],
  );
  return rows.map(toCamelCase);
}

// All versions of one passport, newest first. An empty list means "no versions yet" OR "no such passport":
// the route tells them apart with findPassportsByIds (404 PASSPORT_NOT_FOUND).
export async function findVersionsByPassport(passportId, db = pool) {
  const { rows } = await db.query(
    `SELECT version, verification_code, status, issued_at, tx_hash, doc_hash
     FROM passport_versions
     WHERE passport_id = $1
     ORDER BY version DESC`,
    [passportId],
  );
  return rows.map(toCamelCase);
}

// Where the PDF of one version is stored (Supabase Storage path), or null if there is no such version
// (404 VERSION_NOT_FOUND). Works for any version, also old ones (demo scenario 12).
export async function findVersionPdfPath(passportId, version, db = pool) {
  const { rows } = await db.query(
    'SELECT pdf_path FROM passport_versions WHERE passport_id = $1 AND version = $2',
    [passportId, version],
  );
  return rows.length === 0 ? null : rows[0].pdf_path;
}

// Sync log, newest first. level: 'info' | 'error' | 'duplicate', or null for all levels.
// The route checks level and limit (max 500) before calling this.
// id is cast to a normal number: PostgreSQL returns bigserial as text by default.
export async function findSyncLog({ level = null, limit = 100 } = {}, db = pool) {
  const { rows } = await db.query(
    `SELECT id::int AS id, sheet_row, record_id, student_id, level, message, created_at
     FROM sync_log
     WHERE ($1::text IS NULL OR level = $1)
     ORDER BY id DESC
     LIMIT $2`,
    [level, limit],
  );
  return rows.map(toCamelCase);
}

// ---------- Email login code (OTP) ----------
// The code itself is never stored, only its hash. The auth service creates the code, hashes it and decides
// what "expired" and "locked" mean; these queries only store, read and count.

// Stores a new code. Earlier unused codes of the same email stop working at the same moment:
// one statement, so there is never a time when two codes are valid. Returns the id of the new code.
export async function createOtp({ email, codeHash, expiresAt }, db = pool) {
  const { rows } = await db.query(
    `WITH retired AS (
       UPDATE otp_codes SET used_at = now()
       WHERE lower(email) = lower($1) AND used_at IS NULL
     )
     INSERT INTO otp_codes (email, code_hash, expires_at)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [email, codeHash, expiresAt],
  );
  return rows[0].id;
}

// The newest code of this email that is not used yet, or null (no code requested, or already used).
// It is returned even when it has expired: the auth service compares expiresAt and answers OTP_EXPIRED
// instead of INVALID_OTP. Returns { id, codeHash, attempts, expiresAt }.
export async function findActiveOtp(email, db = pool) {
  const { rows } = await db.query(
    `SELECT id, code_hash, attempts, expires_at
     FROM otp_codes
     WHERE lower(email) = lower($1) AND used_at IS NULL
     ORDER BY id DESC
     LIMIT 1`,
    [email],
  );
  return rows.length === 0 ? null : toCamelCase(rows[0]);
}

// Counts one wrong attempt and returns the new number. Returns null when the limit is already reached
// (the number never goes above OTP.MAX_ATTEMPTS, the database would reject it).
export async function increaseOtpAttempts(id, db = pool) {
  const { rows } = await db.query(
    'UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1 AND attempts < $2 RETURNING attempts',
    [id, OTP.MAX_ATTEMPTS],
  );
  return rows.length === 0 ? null : rows[0].attempts;
}

// A correct code works once. Returns true if this call used it, false if it was already used.
// Two requests with the same code at the same moment: only one of them gets true.
export async function markOtpUsed(id, db = pool) {
  const { rowCount } = await db.query(
    'UPDATE otp_codes SET used_at = now() WHERE id = $1 AND used_at IS NULL',
    [id],
  );
  return rowCount > 0;
}
