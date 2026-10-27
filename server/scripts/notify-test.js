// Dev helper: tests the e-mail to a student about a new passport version, with a FAKE Brevo. Run: npm run notify-test
// It never sends a real mail. The sync side (the mail never stops an issue) is tested in sync-run-test.
import assert from 'node:assert/strict';
import { buildVersionMail, isReservedMailDomain, newSkillNames, notifyStudentOfNewVersion } from '../notify/versionMail.js';

let step = 0;
let failed = false;
async function scenario(name, work) {
  try {
    await work();
    step += 1;
    console.log(`ok ${step}  ${name}`);
  } catch (error) {
    failed = true;
    console.log(`FAIL  ${name}\n      ${error.message}`);
  }
}

const SETTINGS = { enabled: true, apiKey: 'xkeysib-secret-123', from: 'passport@btu.example', siteUrl: 'https://site.example' };
const STUDENT = { firstName: 'Davit', email: 'davit@gmail.com', passportId: 'BTU-AI-000128' };
const RESULT = { passportId: 'BTU-AI-000128', version: 2 };
const AWARDS = [
  { skillName: 'AI Literacy', versionId: 7 },
  { skillName: 'Prompt Engineering Fundamentals', versionId: null },
];

// A fake fetch that remembers its calls
function fakeFetch(answer = { ok: true, status: 201 }) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    if (answer instanceof Error) throw answer;
    return { ok: answer.ok, status: answer.status, json: async () => answer.json ?? {} };
  };
  return { fetchImpl, calls };
}

await scenario('only the NEW skills go into the mail (awards without a version yet)', () => {
  assert.deepEqual(newSkillNames(AWARDS), ['Prompt Engineering Fundamentals']);
  assert.deepEqual(newSkillNames([{ skillName: '  A \n B ', versionId: null }, { skillName: '', versionId: null }]), ['A B']);
});

await scenario('a new version (V2): subject, passport, version, skills, sign-in and verify links, English and Georgian', () => {
  const { subject, text } = buildVersionMail({ firstName: 'Davit', passportId: 'BTU-AI-000128', version: 2, skillNames: ['Prompt Engineering Fundamentals'], siteUrl: 'https://site.example' });
  assert.equal(subject, 'Your BTU AI Skills Digital Passport has a new version (V2)');
  for (const part of ['Hello Davit,', 'BTU-AI-000128 has a new version: V2', '- Prompt Engineering Fundamentals',
    'https://site.example/login', 'https://site.example/verify', 'გამარჯობა, Davit!', 'ახალი უნარები:']) {
    assert.ok(text.includes(part), `missing: ${part}`);
  }
  assert.ok(!text.includes('//login') && !text.includes('undefined'));
});

await scenario('the first version (V1) says "issued", not "new version"', () => {
  const { subject, text } = buildVersionMail({ firstName: 'Nino', passportId: 'BTU-AI-000143', version: 1, skillNames: ['AI Literacy'], siteUrl: 'https://site.example' });
  assert.equal(subject, 'Your BTU AI Skills Digital Passport is ready');
  assert.ok(text.includes('has been issued (V1)') && text.includes('გაიცა (V1)'));
});

await scenario('more than 10 new skills: 10 are listed, the rest is counted', () => {
  const names = Array.from({ length: 13 }, (_, index) => `Skill ${index + 1}`);
  const { text } = buildVersionMail({ firstName: 'Nino', passportId: 'BTU-AI-000143', version: 3, skillNames: names, siteUrl: 'https://site.example' });
  assert.ok(text.includes('- Skill 10') && !text.includes('- Skill 11'));
  assert.ok(text.includes('- and 3 more') && text.includes('- და კიდევ 3'));
});

await scenario('reserved addresses are recognised (example.*, .test, .invalid, localhost, sub-domains); real ones are not', () => {
  for (const email of ['a@example.org', 'a@example.com', 'A@EXAMPLE.NET', 'a@mail.example.org', 'a@x.test', 'a@x.invalid', 'a@localhost', 'a@box.localhost', 'a@x.example']) {
    assert.equal(isReservedMailDomain(email), true, email);
  }
  for (const email of ['a@gmail.com', 'a@btu.edu.ge', 'a@notexample.org', 'a@myexample.com']) {
    assert.equal(isReservedMailDomain(email), false, email);
  }
});

await scenario('off (the default): nothing is sent, the answer is "off"', async () => {
  const { fetchImpl, calls } = fakeFetch();
  const answer = await notifyStudentOfNewVersion({ student: STUDENT, awards: AWARDS, result: RESULT }, { ...SETTINGS, enabled: false, fetchImpl });
  assert.deepEqual(answer, { status: 'off' });
  assert.equal(calls.length, 0);
});

await scenario('skipped, with a reason and without a request: no Brevo key, no address, bad address, example.org', async () => {
  const cases = [
    [{ apiKey: '' }, STUDENT, /BREVO_API_KEY/],
    [{}, { ...STUDENT, email: '' }, /no valid e-mail/],
    [{}, { ...STUDENT, email: 'not-an-address' }, /no valid e-mail/],
    [{}, { ...STUDENT, email: 'btu-t-0006@example.org' }, /cannot receive mail/],
  ];
  for (const [settings, student, reason] of cases) {
    const { fetchImpl, calls } = fakeFetch();
    const answer = await notifyStudentOfNewVersion({ student, awards: AWARDS, result: RESULT }, { ...SETTINGS, ...settings, fetchImpl });
    assert.equal(answer.status, 'skipped');
    assert.match(answer.reason, reason);
    assert.equal(calls.length, 0);
  }
});

await scenario('sent: ONE request to Brevo with the key in the header, the sender, the student and the text', async () => {
  const { fetchImpl, calls } = fakeFetch();
  const answer = await notifyStudentOfNewVersion({ student: STUDENT, awards: AWARDS, result: RESULT }, { ...SETTINGS, fetchImpl });
  assert.deepEqual(answer, { status: 'sent' });
  assert.equal(calls.length, 1);
  const [{ url, options, body }] = calls;
  assert.equal(url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(options.method, 'POST');
  assert.equal(options.headers['api-key'], SETTINGS.apiKey);
  assert.deepEqual(body.sender, { name: 'BTU AI Passport', email: 'passport@btu.example' });
  assert.deepEqual(body.to, [{ email: 'davit@gmail.com' }]);
  assert.match(body.subject, /V2/);
  assert.ok(body.textContent.includes('Prompt Engineering Fundamentals') && !body.textContent.includes('AI Literacy'));
  assert.ok(!JSON.stringify(body).includes(SETTINGS.apiKey), 'the key must not be in the mail');
});

await scenario('Brevo refuses: the error names the status and the reason, and the key is hidden', async () => {
  const { fetchImpl } = fakeFetch({ ok: false, status: 401, json: { message: `Key ${SETTINGS.apiKey} not found` } });
  await assert.rejects(
    notifyStudentOfNewVersion({ student: STUDENT, awards: AWARDS, result: RESULT }, { ...SETTINGS, fetchImpl }),
    (error) => /Brevo answered 401: Key \*\*\* not found/.test(error.message) && !error.message.includes(SETTINGS.apiKey),
  );
});

await scenario('Brevo not reachable (network, timeout): a clear error', async () => {
  const { fetchImpl } = fakeFetch(new Error('The operation was aborted due to timeout'));
  await assert.rejects(
    notifyStudentOfNewVersion({ student: STUDENT, awards: AWARDS, result: RESULT }, { ...SETTINGS, fetchImpl }),
    /Brevo could not be reached: The operation was aborted due to timeout/,
  );
});

await scenario('MAIL_FROM empty: an error that says what to set, before any request', async () => {
  const { fetchImpl, calls } = fakeFetch();
  await assert.rejects(
    notifyStudentOfNewVersion({ student: STUDENT, awards: AWARDS, result: RESULT }, { ...SETTINGS, from: '', fetchImpl }),
    /MAIL_FROM is empty/,
  );
  assert.equal(calls.length, 0);
});

console.log(failed ? '\nSome scenarios FAILED.' : `\nAll ${step} scenarios passed.`);
process.exitCode = failed ? 1 : 0;
