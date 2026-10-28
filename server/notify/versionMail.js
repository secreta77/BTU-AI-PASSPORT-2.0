// Tells a student by e-mail that a new passport version is ready (one mail per issued version).
// It runs AFTER the version is saved, so it can never stop or undo an issue: the sync catches everything this module
// throws and only writes it to the log. Off by default: NOTIFY_STUDENTS=true turns it on. Only Brevo (HTTPS) is
// used, because it also works on hosts that block SMTP ports (Render free).
import { config } from '../config.js';

const BREVO_SEND_URL = 'https://api.brevo.com/v3/smtp/email';
const BREVO_TIMEOUT_MS = 10_000;
const MAIL_SENDER_NAME = 'BTU AI Passport';
const MAX_SKILLS_IN_MAIL = 10;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Addresses that can never receive mail (RFC 2606 and 6761). The test data is full of them. A mail to them only
// bounces, and many bounces damage the sender's reputation at Brevo.
const RESERVED_DOMAINS = ['example.com', 'example.org', 'example.net', 'localhost'];
const RESERVED_SUFFIXES = ['.example', '.test', '.invalid', '.localhost'];

export function isReservedMailDomain(email) {
  const domain = email.slice(email.lastIndexOf('@') + 1).toLowerCase();
  return RESERVED_DOMAINS.some((reserved) => domain === reserved || domain.endsWith(`.${reserved}`))
    || RESERVED_SUFFIXES.some((suffix) => domain.endsWith(suffix));
}

// Skills that are in this version for the first time (awards without a version yet, before issuing)
export function newSkillNames(awards) {
  return awards.filter((award) => award.versionId === null).map((award) => String(award.skillName ?? '').replace(/\s+/g, ' ').trim()).filter((name) => name !== '');
}

// English first, then Georgian. Plain text, no attachment: the link goes to /my-passport (a student who is not signed in
// is sent to /login first), where the PDF and "Add to LinkedIn" are.
export function buildVersionMail({ firstName, passportId, version, skillNames, siteUrl }) {
  const isFirst = version === 1;
  const subject = isFirst
    ? 'Your BTU AI Skills Digital Passport is ready'
    : `Your BTU AI Skills Digital Passport has a new version (V${version})`;
  const shown = skillNames.slice(0, MAX_SKILLS_IN_MAIL);
  const hidden = skillNames.length - shown.length;
  const listEnglish = [...shown.map((name) => `- ${name}`), ...(hidden > 0 ? [`- and ${hidden} more`] : [])].join('\n');
  const listGeorgian = [...shown.map((name) => `- ${name}`), ...(hidden > 0 ? [`- და კიდევ ${hidden}`] : [])].join('\n');
  const headline = isFirst
    ? `Your BTU AI Skills Digital Passport ${passportId} has been issued (V${version}).`
    : `Your BTU AI Skills Digital Passport ${passportId} has a new version: V${version}.`;
  const headlineGeorgian = isFirst
    ? `თქვენი BTU AI Skills Digital Passport (${passportId}) გაიცა (V${version}).`
    : `თქვენი BTU AI Skills Digital Passport-ის (${passportId}) ახალი ვერსია მზადაა: V${version}.`;

  const text = [
    `Hello ${firstName},`,
    '',
    headline,
    ...(shown.length > 0 ? ['New skills:', listEnglish] : []),
    '',
    `Sign in to see it, download the PDF and add it to your LinkedIn profile: ${siteUrl}/my-passport`,
    `Anyone can check that a passport is genuine: ${siteUrl}/verify`,
    '',
    '---',
    `გამარჯობა, ${firstName}!`,
    '',
    headlineGeorgian,
    ...(shown.length > 0 ? ['ახალი უნარები:', listGeorgian] : []),
    '',
    `ნახვა, PDF-ის ჩამოტვირთვა და LinkedIn-ზე დამატება: ${siteUrl}/my-passport`,
    `ნებისმიერს შეუძლია პასპორტის ნამდვილობის შემოწმება: ${siteUrl}/verify`,
  ].join('\n');
  return { subject, text };
}

function defaultSettings() {
  return {
    enabled: config.notify.studentMail,
    apiKey: config.mail.brevoApiKey,
    from: config.mail.from,
    siteUrl: config.publicBaseUrl,
    fetchImpl: fetch,
  };
}

// student: { firstName, email, passportId }, awards: ALL awards of the student before issuing, result: what issuing returned.
// Returns { status: 'off' } | { status: 'skipped', reason } | { status: 'sent' }. Throws when Brevo does not take the mail.
export async function notifyStudentOfNewVersion({ student, awards, result }, overrides = {}) {
  const settings = { ...defaultSettings(), ...overrides };
  if (!settings.enabled) {
    return { status: 'off' };
  }
  if (settings.apiKey === '') {
    return { status: 'skipped', reason: 'BREVO_API_KEY is not set' };
  }
  const email = (student.email ?? '').trim();
  if (!EMAIL_PATTERN.test(email)) {
    return { status: 'skipped', reason: 'the student has no valid e-mail address' };
  }
  if (isReservedMailDomain(email)) {
    return { status: 'skipped', reason: 'the address is on a domain that cannot receive mail (example.org, .test, ...)' };
  }
  if (settings.from === '') {
    throw new Error('MAIL_FROM is empty: set the sender address that is confirmed in Brevo');
  }

  const { subject, text } = buildVersionMail({
    firstName: student.firstName,
    passportId: result.passportId,
    version: result.version,
    skillNames: newSkillNames(awards),
    siteUrl: settings.siteUrl,
  });
  await sendWithBrevo({ email, subject, text }, settings);
  return { status: 'sent' };
}

async function sendWithBrevo({ email, subject, text }, { apiKey, from, fetchImpl }) {
  let response;
  try {
    response = await fetchImpl(BREVO_SEND_URL, {
      method: 'POST',
      headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sender: { name: MAIL_SENDER_NAME, email: from }, to: [{ email }], subject, textContent: text }),
      signal: AbortSignal.timeout(BREVO_TIMEOUT_MS), // a stuck request must not hold the sync
    });
  } catch (error) {
    throw new Error(`Brevo could not be reached: ${error.message}`);
  }
  if (!response.ok) {
    throw new Error(`Brevo answered ${response.status}${await brevoProblem(response, apiKey)}`);
  }
}

// Brevo explains a problem as JSON { code, message }. The key is removed in case a message ever repeats it.
async function brevoProblem(response, apiKey) {
  try {
    const { message } = await response.json();
    if (typeof message !== 'string' || message === '') {
      return '';
    }
    return `: ${message.split(apiKey).join('***')}`;
  } catch {
    return '';
  }
}
