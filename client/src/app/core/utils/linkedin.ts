import {
  LINKEDIN_ADD_CERT_URL,
  LINKEDIN_CERT_NAME,
  LINKEDIN_ORG_NAME,
  SITE_URL,
} from '../constants';
import type { Passport, PassportLatestVersion } from '../models/passport.model';

// Only the fields the link needs (the full passport fits too)
export type LinkedInPassport = Pick<Passport, 'passportId' | 'publicToken'> & {
  latest: Pick<PassportLatestVersion, 'verificationCode' | 'issuedAt'>;
};

// The permanent /p/:token link always shows the latest version. Without a token (server does not
// send it yet) the link points to the current version only (fallback).
function buildCertUrl(passport: LinkedInPassport): string {
  if (passport.publicToken) {
    return `${SITE_URL}/p/${encodeURIComponent(passport.publicToken)}`;
  }
  return `${SITE_URL}/verify/${encodeURIComponent(passport.latest.verificationCode)}`;
}

// Link to LinkedIn's "Add license or certification" form, already filled in.
// certUrl always uses the production SITE_URL (also on localhost), so LinkedIn never gets a local link.
export function buildLinkedInAddUrl(passport: LinkedInPassport): string {
  const params = new URLSearchParams({
    startTask: 'CERTIFICATION_NAME',
    name: LINKEDIN_CERT_NAME,
    organizationName: LINKEDIN_ORG_NAME,
  });

  // UTC, like the issue date shown on the page. Month is 1-12. Without a valid date LinkedIn gets no date.
  const issuedAt = new Date(passport.latest.issuedAt);
  if (!Number.isNaN(issuedAt.getTime())) {
    params.set('issueYear', String(issuedAt.getUTCFullYear()));
    params.set('issueMonth', String(issuedAt.getUTCMonth() + 1));
  }

  params.set('certUrl', buildCertUrl(passport));
  params.set('certId', passport.passportId);

  // URLSearchParams writes a space as "+", the form is safest with "%20".
  // A real "+" in a value is already "%2B", so this replace touches spaces only.
  return `${LINKEDIN_ADD_CERT_URL}?${params.toString().replace(/\+/g, '%20')}`;
}
