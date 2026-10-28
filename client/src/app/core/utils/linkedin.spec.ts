import { LINKEDIN_CERT_NAME, LINKEDIN_ORG_NAME, SITE_URL } from '../constants';
import { LinkedInPassport, buildLinkedInAddUrl } from './linkedin';

function passportWith(overrides: {
  passportId?: string;
  verificationCode?: string;
  issuedAt?: string;
  publicToken?: string;
}): LinkedInPassport {
  return {
    passportId: overrides.passportId ?? 'BTU-AI-000125',
    publicToken: overrides.publicToken,
    latest: {
      verificationCode: overrides.verificationCode ?? 'BTU-V-AAAA-1111',
      issuedAt: overrides.issuedAt ?? '2026-10-21T10:15:00.000Z',
    },
  };
}

function paramsOf(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

describe('buildLinkedInAddUrl', () => {
  it('points to the LinkedIn add certification form', () => {
    const url = new URL(buildLinkedInAddUrl(passportWith({})));

    expect(url.origin + url.pathname).toBe('https://www.linkedin.com/profile/add');
  });

  it('fills every field', () => {
    const params = paramsOf(buildLinkedInAddUrl(passportWith({})));

    expect(params.get('startTask')).toBe('CERTIFICATION_NAME');
    expect(params.get('name')).toBe(LINKEDIN_CERT_NAME);
    expect(params.get('organizationName')).toBe(LINKEDIN_ORG_NAME);
    expect(params.get('issueYear')).toBe('2026');
    expect(params.get('issueMonth')).toBe('10');
    expect(params.get('certUrl')).toBe(`${SITE_URL}/verify/BTU-V-AAAA-1111`);
    expect(params.get('certId')).toBe('BTU-AI-000125');
  });

  it('uses the permanent /p/ link when the passport has a publicToken', () => {
    const params = paramsOf(buildLinkedInAddUrl(passportWith({ publicToken: 'demo-token-123' })));

    expect(params.get('certUrl')).toBe(`${SITE_URL}/p/demo-token-123`);
  });

  it('encodes the publicToken inside the /p/ link', () => {
    const params = paramsOf(buildLinkedInAddUrl(passportWith({ publicToken: 'a b/c' })));

    expect(params.get('certUrl')).toBe(`${SITE_URL}/p/a%20b%2Fc`);
  });

  it('falls back to /verify/<code> when there is no publicToken', () => {
    const params = paramsOf(buildLinkedInAddUrl(passportWith({})));

    expect(params.get('certUrl')).toBe(`${SITE_URL}/verify/BTU-V-AAAA-1111`);
  });

  it('uses the production site for certUrl, with one slash before verify', () => {
    const certUrl = paramsOf(buildLinkedInAddUrl(passportWith({}))).get('certUrl') ?? '';

    expect(certUrl.startsWith('https://btu-ai-passport.netlify.app/verify/')).toBe(true);
    expect(certUrl).not.toContain('//verify');
    expect(certUrl).not.toContain('localhost');
  });

  it('writes the month as 1-12 (January is 1, December is 12)', () => {
    const january = paramsOf(
      buildLinkedInAddUrl(passportWith({ issuedAt: '2026-01-05T08:00:00.000Z' })),
    );
    const december = paramsOf(
      buildLinkedInAddUrl(passportWith({ issuedAt: '2026-12-31T08:00:00.000Z' })),
    );

    expect(january.get('issueMonth')).toBe('1');
    expect(december.get('issueMonth')).toBe('12');
  });

  it('reads year and month in UTC, like the date on the page', () => {
    // 22:30 UTC is already 1 November in Tbilisi, but the page shows 31.10.2026
    const params = paramsOf(
      buildLinkedInAddUrl(passportWith({ issuedAt: '2026-10-31T22:30:00.000Z' })),
    );

    expect(params.get('issueYear')).toBe('2026');
    expect(params.get('issueMonth')).toBe('10');
  });

  it('keeps year and month together at the end of a year', () => {
    const params = paramsOf(
      buildLinkedInAddUrl(passportWith({ issuedAt: '2025-12-31T23:30:00.000Z' })),
    );

    expect(params.get('issueYear')).toBe('2025');
    expect(params.get('issueMonth')).toBe('12');
  });

  it('leaves the date out when issuedAt is not a valid date', () => {
    const params = paramsOf(buildLinkedInAddUrl(passportWith({ issuedAt: 'not-a-date' })));

    expect(params.has('issueYear')).toBe(false);
    expect(params.has('issueMonth')).toBe(false);
    expect(params.get('certId')).toBe('BTU-AI-000125');
  });

  it('encodes spaces as %20 and never as +', () => {
    const url = buildLinkedInAddUrl(passportWith({}));

    expect(url).toContain('name=BTU%20AI%20Skills%20Digital%20Passport');
    expect(url).not.toContain('+');
  });

  it('encodes & and + inside a value, so they cannot split or change the query', () => {
    const url = buildLinkedInAddUrl(passportWith({ passportId: 'A&B C+D' }));

    expect(url).toContain('certId=A%26B%20C%2BD');
    expect(paramsOf(url).get('certId')).toBe('A&B C+D');
    // 7 fields, so exactly 7 "=" signs: the & inside the id did not add one
    expect(url.split('?')[1].split('&')).toHaveLength(7);
  });

  it('encodes the verify link inside certUrl', () => {
    const url = buildLinkedInAddUrl(passportWith({}));

    expect(url).toContain(
      'certUrl=https%3A%2F%2Fbtu-ai-passport.netlify.app%2Fverify%2FBTU-V-AAAA-1111',
    );
  });
});
