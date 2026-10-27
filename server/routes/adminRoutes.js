// Admin endpoints: passports, their versions, and the PDF of any version (docs/api.md).
// The admin key is checked in app.js, where this router is mounted: nothing under /api/admin is reachable without it.
import { Router } from 'express';
import {
  findPassportsByIds,
  findSkillById,
  findStudentsByIds,
  findVersionPdfPath,
  findVersionsByPassport,
  insertManualAward,
  listPassports,
  listSkills,
} from '../db/queries.js';
import { AppError } from '../middleware/appError.js';
import { isRealDate } from '../sheets/validator.js';
import { DATE_PATTERN, EARNED_THROUGH_MAX_LENGTH, ERROR_CODE, ID_PATTERN } from '../shared/constants.js';
import { downloadPdf } from '../storage/storageService.js';
import { syncRunner } from '../sync/syncRunner.js';
import { sendPdf } from './sendPdf.js';

const VERSION_NUMBER = /^[1-9]\d{0,5}$/; // 1, 2, 3 ... no sign, no decimals, no leading zeros

const defaultDeps = {
  listPassports,
  listSkills,
  findSkillById,
  findStudentsByIds,
  insertManualAward,
  syncRunner, // the same runner as POST /api/admin/sync: one sync at a time
  findPassportsByIds,
  findVersionsByPassport,
  findVersionPdfPath,
  downloadPdf,
};

// `deps` replaces only what it names (tests give fakes)
export function createAdminRouter(deps = {}) {
  const dependencies = { ...defaultDeps, ...deps };
  const router = Router();

  // GET /api/admin/passports
  router.get('/passports', async (req, res) => {
    const passports = await dependencies.listPassports();
    res.json({
      items: passports.map((passport) => ({
        passportId: passport.passportId,
        studentId: passport.studentId,
        firstName: passport.firstName,
        lastName: passport.lastName,
        email: passport.email,
        latestVersion: passport.latestVersion,
        skillCount: passport.skillCount,
        firstIssued: passport.firstIssued,
        lastIssuedAt: passport.lastIssuedAt,
      })),
    });
  });

  // GET /api/admin/skills   (for the dropdown of the "add skill" form, sorted by skillId)
  router.get('/skills', async (req, res) => {
    const skills = await dependencies.listSkills();
    res.json({
      skills: skills.map((skill) => ({
        skillId: skill.skillId,
        name: skill.name,
        category: skill.category,
        description: skill.description,
      })),
    });
  });

  // POST /api/admin/awards   (one skill added by hand; a sync starts at once and makes the next passport version)
  router.post('/awards', async (req, res) => {
    const award = readAwardBody(req.body);

    const [student] = await dependencies.findStudentsByIds([award.studentId]);
    if (student === undefined) {
      throw new AppError(ERROR_CODE.STUDENT_NOT_FOUND, `No student ${award.studentId}`);
    }
    if ((await dependencies.findSkillById(award.skillId)) === null) {
      throw new AppError(ERROR_CODE.SKILL_NOT_FOUND, `No skill ${award.skillId}`);
    }

    const recordId = await dependencies.insertManualAward(award);
    if (recordId === null) {
      throw new AppError(ERROR_CODE.AWARD_ALREADY_EXISTS, `${award.studentId} already has skill ${award.skillId}`);
    }

    // The skill is saved now. If a sync was already running, it may have read the data before: then the admin presses "Sync" again
    const syncStarted = dependencies.syncRunner.start() !== null;
    res.status(201).json({ recordId, ...award, source: 'manual', status: 'pending', syncStarted });
  });

  // GET /api/admin/passports/:passportId/versions   (newest first)
  router.get('/passports/:passportId/versions', async (req, res) => {
    const { passportId } = req.params;
    // An empty list could mean "no versions yet" or "no such passport": ask which one it is
    const exists = ID_PATTERN.PASSPORT_ID.test(passportId) && (await dependencies.findPassportsByIds([passportId])).length > 0;
    if (!exists) {
      throw new AppError(ERROR_CODE.PASSPORT_NOT_FOUND, `No passport ${passportId}`);
    }

    const versions = await dependencies.findVersionsByPassport(passportId);
    res.json({
      passportId,
      versions: versions.map((version) => ({
        version: version.version,
        verificationCode: version.verificationCode,
        status: version.status,
        issuedAt: version.issuedAt,
        txHash: version.txHash,
        docHash: version.docHash,
      })),
    });
  });

  // GET /api/admin/passports/:passportId/versions/:version/pdf   (any version, also old ones: demo scenario 12)
  router.get('/passports/:passportId/versions/:version/pdf', async (req, res) => {
    const { passportId, version } = req.params;
    const pdfPath = ID_PATTERN.PASSPORT_ID.test(passportId) && VERSION_NUMBER.test(version)
      ? await dependencies.findVersionPdfPath(passportId, Number(version))
      : null;
    if (pdfPath === null) {
      throw new AppError(ERROR_CODE.VERSION_NOT_FOUND, `No version ${version} of passport ${passportId}`);
    }

    sendPdf(res, await dependencies.downloadPdf(pdfPath), `${passportId}-v${version}.pdf`);
  });

  return router;
}

// The body of POST /api/admin/awards -> { studentId, skillId, dateEarned, earnedThrough } or 400 INVALID_REQUEST that names the field
function readAwardBody(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw invalidField('body', 'must be a JSON object');
  }

  const studentId = readRequiredText(body, 'studentId');
  if (!ID_PATTERN.STUDENT_ID.test(studentId)) {
    throw invalidField('studentId', 'must look like BTU-T-0007');
  }
  const skillId = readRequiredText(body, 'skillId');
  if (!ID_PATTERN.SKILL_ID.test(skillId)) {
    throw invalidField('skillId', 'must look like SKL-004');
  }
  const dateEarned = readRequiredText(body, 'dateEarned');
  if (!DATE_PATTERN.test(dateEarned) || !isRealDate(dateEarned)) {
    throw invalidField('dateEarned', 'must be a real date as YYYY-MM-DD');
  }
  return { studentId, skillId, dateEarned, earnedThrough: readEarnedThrough(body.earnedThrough) };
}

function readRequiredText(body, field) {
  const value = body[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw invalidField(field, 'is required and must be text');
  }
  return value.trim();
}

// Optional. Missing, null or empty -> null (the PDF shows "—")
function readEarnedThrough(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw invalidField('earnedThrough', 'must be text or null');
  }
  const text = value.trim();
  if (text.length > EARNED_THROUGH_MAX_LENGTH) {
    throw invalidField('earnedThrough', `must be at most ${EARNED_THROUGH_MAX_LENGTH} characters`);
  }
  return text === '' ? null : text;
}

function invalidField(field, problem) {
  return new AppError(ERROR_CODE.INVALID_REQUEST, `${field} ${problem}`);
}
