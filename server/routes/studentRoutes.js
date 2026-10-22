// Student endpoints: login with an email code, the student's own passport, and its PDF (docs/api.md).
// The student is always the one in the token (req.studentId). No endpoint takes a student id from the request,
// so nobody can ask for another student's passport.
import { Router } from 'express';
import { requireStudent } from '../auth/authMiddleware.js';
import { requestOtp, verifyOtp } from '../auth/otpService.js';
import { findIssuedSkillsByStudent, findStudentPassport } from '../db/queries.js';
import { AppError } from '../middleware/appError.js';
import { ERROR_CODE, STAMP_CODE_BY_CATEGORY } from '../shared/constants.js';
import { downloadPdf } from '../storage/storageService.js';
import { sendPdf } from './sendPdf.js';

const defaultDeps = {
  requestOtp,
  verifyOtp,
  findStudentPassport,
  findIssuedSkillsByStudent,
  downloadPdf,
};

// `deps` replaces only what it names (tests give fakes)
export function createStudentRouter(deps = {}) {
  const dependencies = { ...defaultDeps, ...deps };
  const router = Router();

  // POST /api/student/otp/request   { email }  ->  { ok: true }, also for an unknown email
  router.post('/otp/request', async (req, res) => {
    res.json(await dependencies.requestOtp(readField(req.body, 'email')));
  });

  // POST /api/student/otp/verify   { email, code }  ->  { token, expiresIn }
  router.post('/otp/verify', async (req, res) => {
    res.json(await dependencies.verifyOtp(readField(req.body, 'email'), readField(req.body, 'code')));
  });

  // GET /api/student/passport
  router.get('/passport', requireStudent, async (req, res) => {
    const passport = await loadIssuedPassport(req.studentId, dependencies);
    const skills = await dependencies.findIssuedSkillsByStudent(req.studentId);
    const { latest } = passport;

    res.json({
      passportId: passport.passportId,
      firstName: passport.firstName,
      lastName: passport.lastName,
      program: passport.program,
      educationLevel: passport.educationLevel,
      studentStatus: passport.studentStatus,
      firstIssued: passport.firstIssued,
      latest: {
        version: latest.version,
        verificationCode: latest.verificationCode,
        issuedAt: latest.issuedAt,
        txHash: latest.txHash,
      },
      skills: skills.map((skill) => ({
        skillId: skill.skillId,
        skillName: skill.skillName,
        skillCategory: skill.skillCategory,
        stampCode: STAMP_CODE_BY_CATEGORY[skill.skillCategory] ?? null, // Decision 12: only constants.js knows the mapping
        skillDescription: skill.skillDescription,
        earnedThrough: skill.earnedThrough ?? null,
        dateEarned: skill.dateEarned,
      })),
    });
  });

  // GET /api/student/passport/pdf   (the browser downloads it with HttpClient as a blob)
  router.get('/passport/pdf', requireStudent, async (req, res) => {
    const { passportId, latest } = await loadIssuedPassport(req.studentId, dependencies);
    const pdfBytes = await dependencies.downloadPdf(latest.pdfPath);
    sendPdf(res, pdfBytes, `${passportId}-v${latest.version}.pdf`);
  });

  return router;
}

// A body that is missing or not an object (for example [] or "text") has no fields
function readField(body, name) {
  return typeof body === 'object' && body !== null && !Array.isArray(body) ? body[name] : undefined;
}

// The passport with its newest issued version. A student who has no passport, or whose first version is not issued yet
// (for example the issuing failed and waits for the next sync), has nothing to show: 404.
async function loadIssuedPassport(studentId, dependencies) {
  const passport = await dependencies.findStudentPassport(studentId);
  if (passport === null || passport.latest === null) {
    throw new AppError(ERROR_CODE.PASSPORT_NOT_FOUND, 'No passport has been issued for you yet');
  }
  return passport;
}
