// Dev helper: runs the API queries against the real database with FAKE data and removes the fake data again.
// Run: npm run db-test
// Fake IDs: students BTU-T-9901/9902, skills SKL-991/992, passport BTU-AI-999901, codes BTU-V-TEST-000x.
// Real data never matches these IDs, so cleaning up only touches the fake rows.
import assert from 'node:assert/strict';
import { pool } from '../db/pool.js';
import {
  createPassport,
  findAwardsByStudent,
  findIssuedSkillsByStudent,
  findStudentByEmail,
  findStudentPassport,
  findVersionByCode,
  insertNewSkills,
  insertSkillAwards,
  insertStudent,
  saveIssuedVersion,
} from '../db/queries.js';

const STUDENT_IDS = ['BTU-T-9901', 'BTU-T-9902'];
const SKILL_IDS = ['SKL-991', 'SKL-992'];
const PASSPORT_ID = 'BTU-AI-999901';
const CODE_V1 = 'BTU-V-TEST-0001';
const CODE_V2 = 'BTU-V-TEST-0002';
const DOC_HASH = 'a'.repeat(64);
const TX_HASH = `0x${'b'.repeat(64)}`;

let failedCount = 0;

// Runs one check and prints the result. A failing check does not stop the others.
async function check(name, work) {
  try {
    await work();
    console.log(`  ok    ${name}`);
  } catch (error) {
    failedCount += 1;
    console.log(`  FAIL  ${name}\n        ${error.message.split('\n')[0]}`);
  }
}

// Deletes the fake rows in the right order (children first). Safe to run when nothing exists.
async function removeFakeData() {
  await pool.query('DELETE FROM skill_awards WHERE student_id = ANY($1)', [STUDENT_IDS]);
  await pool.query('DELETE FROM passport_versions WHERE passport_id = $1', [PASSPORT_ID]);
  await pool.query('DELETE FROM passports WHERE student_id = ANY($1)', [STUDENT_IDS]);
  await pool.query('DELETE FROM students WHERE student_id = ANY($1)', [STUDENT_IDS]);
  await pool.query('DELETE FROM skills WHERE skill_id = ANY($1)', [SKILL_IDS]);
}

// Two students (only the first one has a passport), two skills and two new awards for the first student.
async function createFakeData() {
  await insertStudent({
    studentId: STUDENT_IDS[0], firstName: 'Test', lastName: 'One', email: 'one@test.invalid',
    program: 'Computer Science', educationLevel: 'Bachelor', studentStatus: 'Active',
  });
  await insertStudent({
    studentId: STUDENT_IDS[1], firstName: 'Test', lastName: 'Two', email: 'two@test.invalid',
    program: 'Law', educationLevel: 'Master', studentStatus: 'Graduate',
  });
  await insertNewSkills([
    { skillId: SKILL_IDS[0], skillName: 'Test Skill A', skillCategory: 'AI Skill', skillDescription: 'Description A' },
    { skillId: SKILL_IDS[1], skillName: 'Test Skill B', skillCategory: 'AI Advanced Skill', skillDescription: 'Description B' },
  ]);
  await createPassport({ studentId: STUDENT_IDS[0], passportId: PASSPORT_ID, firstIssued: '2026-10-01' });
  await insertSkillAwards([
    { recordId: 'TEST-REC-1', studentId: STUDENT_IDS[0], skillId: SKILL_IDS[0], dateEarned: '2026-09-12' },
    { recordId: 'TEST-REC-2', studentId: STUDENT_IDS[0], skillId: SKILL_IDS[1], dateEarned: '2026-09-01' },
  ]);
}

// Issues one version that contains one award (the same call the issuance pipeline makes).
async function issueVersion(version, verificationCode, recordId) {
  const awards = await findAwardsByStudent(STUDENT_IDS[0]);
  const award = awards.find((item) => item.recordId === recordId);
  await saveIssuedVersion({
    passportId: PASSPORT_ID,
    version,
    verificationCode,
    docHash: DOC_HASH,
    txHash: TX_HASH,
    pdfPath: `test/v${version}.pdf`,
    awardIds: [award.awardId],
  });
}

try {
  await removeFakeData(); // leftovers of an earlier run that crashed
  await createFakeData();

  console.log('Student without a version yet');
  await check('findStudentPassport: passport exists, latest is null', async () => {
    const passport = await findStudentPassport(STUDENT_IDS[0]);
    assert.equal(passport.passportId, PASSPORT_ID);
    assert.equal(passport.firstName, 'Test');
    assert.equal(passport.studentStatus, 'Active');
    assert.equal(passport.firstIssued, '2026-10-01'); // plain text, not a Date
    assert.equal(passport.latest, null);
  });
  await check('findStudentPassport: student without passport -> null', async () => {
    assert.equal(await findStudentPassport(STUDENT_IDS[1]), null);
  });
  await check('findIssuedSkillsByStudent: nothing issued yet -> []', async () => {
    assert.deepEqual(await findIssuedSkillsByStudent(STUDENT_IDS[0]), []);
  });

  await issueVersion(1, CODE_V1, 'TEST-REC-1');

  console.log('After version 1');
  await check('findVersionByCode: v1 is latest', async () => {
    const found = await findVersionByCode(CODE_V1);
    assert.equal(found.passportId, PASSPORT_ID);
    assert.equal(found.version, 1);
    assert.equal(found.status, 'latest');
    assert.equal(found.latestVersion, 1);
    assert.equal(found.docHash, DOC_HASH);
    assert.equal(found.txHash, TX_HASH);
    assert.ok(found.issuedAt instanceof Date);
  });
  await check('findIssuedSkillsByStudent: only the issued skill', async () => {
    const skills = await findIssuedSkillsByStudent(STUDENT_IDS[0]);
    assert.equal(skills.length, 1);
    assert.equal(skills[0].skillId, SKILL_IDS[0]);
    assert.equal(skills[0].skillName, 'Test Skill A');
    assert.equal(skills[0].earnedThrough, null);
    assert.equal(skills[0].dateEarned, '2026-09-12');
  });

  await issueVersion(2, CODE_V2, 'TEST-REC-2');

  console.log('After version 2');
  await check('findVersionByCode: v1 is superseded, latestVersion is 2', async () => {
    const found = await findVersionByCode(CODE_V1);
    assert.equal(found.status, 'superseded');
    assert.equal(found.latestVersion, 2);
  });
  await check('findVersionByCode: v2 is latest', async () => {
    const found = await findVersionByCode(CODE_V2);
    assert.equal(found.version, 2);
    assert.equal(found.status, 'latest');
    assert.equal(found.latestVersion, 2);
  });
  await check('findVersionByCode: unknown code -> null', async () => {
    assert.equal(await findVersionByCode('BTU-V-ZZZZ-ZZZZ'), null);
  });
  await check('findStudentPassport: latest is version 2', async () => {
    const passport = await findStudentPassport(STUDENT_IDS[0]);
    assert.equal(passport.latest.version, 2);
    assert.equal(passport.latest.verificationCode, CODE_V2);
    assert.equal(passport.latest.pdfPath, 'test/v2.pdf');
    assert.equal(passport.latest.txHash, TX_HASH);
    assert.ok(passport.latest.issuedAt instanceof Date);
  });
  await check('findIssuedSkillsByStudent: both skills, oldest date first', async () => {
    const skills = await findIssuedSkillsByStudent(STUDENT_IDS[0]);
    assert.deepEqual(skills.map((skill) => skill.skillId), [SKILL_IDS[1], SKILL_IDS[0]]);
  });

  console.log('Student by email');
  await check('findStudentByEmail: found, upper case does not matter', async () => {
    const student = await findStudentByEmail('ONE@Test.Invalid');
    assert.equal(student.studentId, STUDENT_IDS[0]);
    assert.equal(student.lastName, 'One');
  });
  await check('findStudentByEmail: unknown email -> null', async () => {
    assert.equal(await findStudentByEmail('nobody@test.invalid'), null);
  });
} finally {
  await removeFakeData().catch((error) => console.error('Cleanup failed:', error.message));
  await pool.end();
}

console.log(failedCount === 0 ? '\nAll checks passed. Fake data removed.' : `\n${failedCount} check(s) FAILED. Fake data removed.`);
process.exitCode = failedCount === 0 ? 0 : 1;
