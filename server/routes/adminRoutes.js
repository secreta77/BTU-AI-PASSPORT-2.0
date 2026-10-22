// Admin endpoints: passports, their versions, and the PDF of any version (docs/api.md).
// The admin key is checked in app.js, where this router is mounted: nothing under /api/admin is reachable without it.
import { Router } from 'express';
import { findPassportsByIds, findVersionPdfPath, findVersionsByPassport, listPassports } from '../db/queries.js';
import { AppError } from '../middleware/appError.js';
import { ERROR_CODE, ID_PATTERN } from '../shared/constants.js';
import { downloadPdf } from '../storage/storageService.js';
import { sendPdf } from './sendPdf.js';

const VERSION_NUMBER = /^[1-9]\d{0,5}$/; // 1, 2, 3 ... no sign, no decimals, no leading zeros

const defaultDeps = {
  listPassports,
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
