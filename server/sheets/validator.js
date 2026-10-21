// Validates sheet rows. Does not touch the DB. The only place for row validation rules.
import {
  DATE_PATTERN,
  ID_PATTERN,
  SKILL_CATEGORY,
  STUDENT_STATUS,
} from '../shared/constants.js';

// Required fields (stampCode is a formula in the Sheet; passportId and firstIssued are empty for new students)
const REQUIRED_FIELDS = [
  ['studentId', 'Student ID'],
  ['firstName', 'First Name'],
  ['lastName', 'Last Name'],
  ['email', 'Email'],
  ['program', 'Program'],
  ['educationLevel', 'Education Level'],
  ['studentStatus', 'Student Status'],
  ['recordId', 'Record ID'],
  ['skillId', 'Skill ID'],
  ['skillName', 'Skill Name'],
  ['skillCategory', 'Skill Category'],
  ['skillDescription', 'Skill Description'],
  ['dateEarned', 'Date Earned'],
];

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+$/;

export function validateRows(rows) {
  const valid = [];
  const errors = [];

  for (const row of rows) {
    const problem = findFirstProblem(row);
    if (problem) {
      errors.push({
        sheetRow: row.sheetRow,
        recordId: row.recordId,
        message: `Row ${row.sheetRow}: ${problem}`,
      });
    } else {
      valid.push(row);
    }
  }

  return { valid, errors };
}

// Returns a short problem text, or null when the row is fine
function findFirstProblem(row) {
  for (const [field, label] of REQUIRED_FIELDS) {
    if (row[field] === null) return `missing ${label}`;
  }

  if (!ID_PATTERN.STUDENT_ID.test(row.studentId)) return `invalid Student ID "${row.studentId}"`;
  if (!ID_PATTERN.RECORD_ID.test(row.recordId)) return `invalid Record ID "${row.recordId}"`;
  if (!ID_PATTERN.SKILL_ID.test(row.skillId)) return `invalid Skill ID "${row.skillId}"`;
  if (!EMAIL_PATTERN.test(row.email)) return `invalid Email "${row.email}"`;

  if (!Object.values(STUDENT_STATUS).includes(row.studentStatus)) {
    return `invalid Student Status "${row.studentStatus}"`;
  }
  if (!Object.values(SKILL_CATEGORY).includes(row.skillCategory)) {
    return `invalid Skill Category "${row.skillCategory}"`;
  }
  if (!isRealDate(row.dateEarned)) return `invalid Date Earned "${row.dateEarned}"`;

  // Optional for new students, but must be correct when filled in
  if (row.passportId !== null && !ID_PATTERN.PASSPORT_ID.test(row.passportId)) {
    return `invalid Passport ID "${row.passportId}"`;
  }
  if (row.firstIssued !== null && !isRealDate(row.firstIssued)) {
    return `invalid First Issued "${row.firstIssued}"`;
  }

  return null;
}

// Checks the YYYY-MM-DD format and that the date exists (2026-02-30 is rejected)
function isRealDate(text) {
  if (!DATE_PATTERN.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}
