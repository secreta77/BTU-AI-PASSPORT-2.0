// Dev helper: starts the REAL Express app on a free port with a FAKE database and sends real HTTP requests to it.
// It checks status codes, JSON shapes and the error format of docs/api.md. Run: npm run api-test
// The student login runs through the REAL login code and JWT check: only the database, the mail and Storage are fake.
// It never touches the real database, Storage or chain, so it is safe to run any time.
import assert from 'node:assert/strict';
import { createApp } from '../app.js';
import { requestOtp, verifyOtp } from '../auth/otpService.js';
import { config } from '../config.js';
import { sendPdf } from '../routes/sendPdf.js';
import { createSyncRunner } from '../sync/syncRunner.js';
import { createFakeLoginWorld } from './helpers/fakeLogin.js';

const SECRET_RPC_URL = 'https://rpc.example/v2/SECRET-API-KEY'; // the server-only list; it must never reach the browser
const PUBLIC_RPC_URLS = ['https://public-1.example', 'https://public-2.example'];
const SITE_ORIGIN = 'https://btu-passport.example';

config.publicBaseUrl = SITE_ORIGIN;
config.jwtSecret = 'test-secret-0123456789abcdef';
config.adminApiKey = 'test-admin-key-0123456789';
config.chain.chainId = 11155111;
config.chain.contractAddress = '0x7c90CbDcB0006819E5dfdfb8D36A74f0f3968509';
config.chain.publicRpcUrls = PUBLIC_RPC_URLS;
config.chain.rpcUrls = [SECRET_RPC_URL];

// ---------- A fake ledger and a real server ----------

const ISSUED_AT = new Date('2026-10-21T10:15:00.000Z');
const TX_HASH = `0x${'3f'.repeat(32)}`;
const ledger = new Map([
  ['BTU-V-7F3K-92QX', {
    verificationCode: 'BTU-V-7F3K-92QX', passportId: 'BTU-AI-000125', version: 1, status: 'superseded',
    latestVersion: 2, issuedAt: ISSUED_AT, txHash: TX_HASH,
    // fields that the route must NOT pass on (the database function may return more than the API shows)
    docHash: 'aa'.repeat(32), versionId: 7,
  }],
  ['BTU-V-AAAA-2222', {
    verificationCode: 'BTU-V-AAAA-2222', passportId: 'BTU-AI-000125', version: 2, status: 'latest',
    latestVersion: 2, issuedAt: ISSUED_AT, txHash: TX_HASH, docHash: 'bb'.repeat(32), versionId: 8,
  }],
]);

// Students: 1 has a passport with 2 versions, 2 has a passport but no version yet, 3 has no passport, 4 has another passport
const students = [
  { studentId: 'BTU-T-0001', firstName: 'Giorgi', lastName: 'Kapanadze', email: 'giorgi@example.org' },
  { studentId: 'BTU-T-0002', firstName: 'Nino', lastName: 'Beridze', email: 'nino@example.org' },
  { studentId: 'BTU-T-0003', firstName: 'Ana', lastName: 'Gelashvili', email: 'ana@example.org' },
  { studentId: 'BTU-T-0004', firstName: 'Luka', lastName: 'Noghaideli', email: 'luka@example.org' },
];
function makePassport(student, passportId, latest) {
  return {
    passportId, studentId: student.studentId, firstName: student.firstName, lastName: student.lastName,
    program: 'Computer Science', educationLevel: "Bachelor's", studentStatus: 'Active', firstIssued: '2026-10-01', latest,
  };
}
const passports = new Map([
  ['BTU-T-0001', makePassport(students[0], 'BTU-AI-000125', {
    versionId: 8, version: 2, verificationCode: 'BTU-V-AAAA-2222', issuedAt: ISSUED_AT, txHash: TX_HASH,
    pdfPath: 'BTU-AI-000125/v2-BTU-V-AAAA-2222.pdf',
  })],
  ['BTU-T-0002', makePassport(students[1], 'BTU-AI-000126', null)],
  ['BTU-T-0004', makePassport(students[3], 'BTU-AI-000130', {
    versionId: 11, version: 1, verificationCode: 'BTU-V-BBBB-3333', issuedAt: ISSUED_AT, txHash: TX_HASH,
    pdfPath: 'BTU-AI-000130/v1-BTU-V-BBBB-3333.pdf',
  })],
]);
const skillsByStudent = new Map([
  ['BTU-T-0001', [
    { skillId: 'SKL-001', skillName: 'AI Literacy', skillCategory: 'AI Skill', skillDescription: 'Fundamentals.', earnedThrough: null, dateEarned: '2026-09-12' },
    { skillId: 'SKL-004', skillName: 'Data Analysis', skillCategory: 'AI Applied Skill', skillDescription: 'Works with data.', earnedThrough: null, dateEarned: '2026-10-02' },
  ]],
]);
const PDF_BYTES = Buffer.from('%PDF-1.7\nfake passport of Giorgi\n%%EOF\n');

// Admin data: two passports (the second has no version yet), versions of the first, a sync log
const adminPassports = [
  { passportId: 'BTU-AI-000125', studentId: 'BTU-T-0001', firstName: 'Giorgi', lastName: 'Kapanadze', email: 'giorgi@example.org',
    latestVersion: 2, skillCount: 2, firstIssued: '2026-10-01', lastIssuedAt: ISSUED_AT, internalNote: 'must not be shown' },
  { passportId: 'BTU-AI-000126', studentId: 'BTU-T-0002', firstName: 'Nino', lastName: 'Beridze', email: 'nino@example.org',
    latestVersion: null, skillCount: 0, firstIssued: '2026-10-02', lastIssuedAt: null },
];
const adminVersions = {
  'BTU-AI-000125': [
    { version: 2, verificationCode: 'BTU-V-AAAA-2222', status: 'latest', issuedAt: ISSUED_AT, txHash: TX_HASH, docHash: 'bb'.repeat(32), pdfPath: 'x' },
    { version: 1, verificationCode: 'BTU-V-7F3K-92QX', status: 'superseded', issuedAt: ISSUED_AT, txHash: TX_HASH, docHash: 'aa'.repeat(32), pdfPath: 'y' },
  ],
};
const adminPdfPaths = new Map([
  ['BTU-AI-000125|1', 'BTU-AI-000125/v1-BTU-V-7F3K-92QX.pdf'],
  ['BTU-AI-000125|2', 'BTU-AI-000125/v2-BTU-V-AAAA-2222.pdf'],
]);
const syncLogRows = [
  { id: 41, sheetRow: 14, recordId: null, studentId: 'BTU-T-9999', level: 'error', message: 'Row 14: unknown Student ID BTU-T-9999', createdAt: ISSUED_AT },
  { id: 40, sheetRow: null, recordId: null, studentId: null, level: 'info', message: 'Sync finished: 60 rows read', createdAt: ISSUED_AT },
];

const world = { lookups: [], logged: [], failLookup: null };
const adminWorld = { queries: [], downloads: [] };
// The sync is not real: it waits until the test lets it finish. The runner around it is the real one.
const syncWorld = { runs: [], resolve: null, reject: null, clock: new Date('2026-10-22T16:00:00.000Z'), logged: [] };
const syncRunner = createSyncRunner({
  run: (options) => {
    syncWorld.runs.push(options);
    return new Promise((resolve, reject) => { syncWorld.resolve = resolve; syncWorld.reject = reject; });
  },
  now: () => syncWorld.clock,
  logError: (...parts) => syncWorld.logged.push(parts.map(String).join(' ')),
});
const loginWorld = createFakeLoginWorld(students);
const studentWorld = { downloads: [], failDownload: false };
const app = createApp({
  admin: {
    async listPassports() { adminWorld.queries.push('listPassports'); return adminPassports; },
    async findPassportsByIds(ids) { adminWorld.queries.push('findPassportsByIds'); return adminPassports.filter((item) => ids.includes(item.passportId)); },
    async findVersionsByPassport(passportId) { adminWorld.queries.push('findVersionsByPassport'); return adminVersions[passportId] ?? []; },
    async findVersionPdfPath(passportId, version) {
      adminWorld.queries.push(`findVersionPdfPath ${passportId} ${version}`);
      return adminPdfPaths.get(`${passportId}|${version}`) ?? null;
    },
    async downloadPdf(pdfPath) { adminWorld.downloads.push(pdfPath); return PDF_BYTES; },
  },
  sync: {
    syncRunner,
    async findSyncLog(options) { adminWorld.queries.push(`findSyncLog ${JSON.stringify(options)}`); return syncLogRows; },
  },
  student: {
    requestOtp: (email) => requestOtp(email, loginWorld.deps),
    verifyOtp: (email, code) => verifyOtp(email, code, loginWorld.deps),
    findStudentPassport: async (studentId) => passports.get(studentId) ?? null,
    findIssuedSkillsByStudent: async (studentId) => skillsByStudent.get(studentId) ?? [],
    async downloadPdf(pdfPath) {
      studentWorld.downloads.push(pdfPath);
      if (studentWorld.failDownload) throw new Error(`Storage download failed for ${pdfPath}: bucket unreachable`);
      return PDF_BYTES;
    },
  },
  verify: {
    async findVersionByCode(code) {
      world.lookups.push(code);
      if (world.failLookup) throw world.failLookup;
      return ledger.get(code) ?? null;
    },
  },
  logError: (...parts) => world.logged.push(parts.map(String).join(' ')),
});

// The chain info is not faked: the real code reads it from config (set above)
const server = await new Promise((resolve) => { const started = app.listen(0, '127.0.0.1', () => resolve(started)); });
const baseUrl = `http://127.0.0.1:${server.address().port}`;

async function call(path, { method = 'GET', headers = {}, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body });
  const bytes = Buffer.from(await response.arrayBuffer());
  const text = bytes.toString('utf8');
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: response.status, headers: response.headers, text, json, bytes };
}

function assertError(result, status, code) {
  assert.equal(result.status, status, `status ${result.status}: ${result.text}`);
  assert.match(result.headers.get('content-type'), /application\/json/);
  assert.deepEqual(Object.keys(result.json), ['error']);
  assert.deepEqual(Object.keys(result.json.error).sort(), ['code', 'message']);
  assert.equal(result.json.error.code, code);
  assert.equal(typeof result.json.error.message, 'string');
}

const jsonPost = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const bearer = (token) => ({ headers: { Authorization: `Bearer ${token}` } });

// A student logs in like in the browser: asks for a code, "reads" it from the mail, sends it back
async function login(email) {
  const requested = await call('/api/student/otp/request', jsonPost({ email }));
  assert.equal(requested.status, 200, requested.text);
  const code = loginWorld.mails.at(-1).code;
  const verified = await call('/api/student/otp/verify', jsonPost({ email, code }));
  assert.equal(verified.status, 200, verified.text);
  return verified.json.token;
}

// ---------- Scenarios ----------

let step = 0;
let failed = false;
async function scenario(name, work) {
  step += 1;
  try {
    await work();
    console.log(`ok ${step}  ${name}`);
  } catch (error) {
    failed = true;
    console.log(`FAILED ${step}  ${name}\n   ${error.message}`);
  }
}

await scenario('health check answers { ok: true }', async () => {
  const result = await call('/api/health');
  assert.equal(result.status, 200);
  assert.deepEqual(result.json, { ok: true });
});

await scenario('verify: an old version gives the facts of docs/api.md, with public chain data', async () => {
  const result = await call('/api/verify/BTU-V-7F3K-92QX');
  assert.equal(result.status, 200);
  assert.match(result.headers.get('content-type'), /application\/json/);
  assert.deepEqual(result.json, {
    verificationCode: 'BTU-V-7F3K-92QX',
    passportId: 'BTU-AI-000125',
    version: 1,
    status: 'superseded',
    latestVersion: 2,
    issuedAt: '2026-10-21T10:15:00.000Z',
    txHash: TX_HASH,
    chain: {
      chainId: 11155111,
      contractAddress: '0x7c90CbDcB0006819E5dfdfb8D36A74f0f3968509',
      rpcUrls: PUBLIC_RPC_URLS,
    },
  });
});

await scenario('verify: the latest version says latest', async () => {
  const result = await call('/api/verify/BTU-V-AAAA-2222');
  assert.equal(result.json.status, 'latest');
  assert.equal(result.json.version, result.json.latestVersion);
});

await scenario('verify: the server-only RPC list, hashes of documents and ids of rows never leave the server', async () => {
  const result = await call('/api/verify/BTU-V-7F3K-92QX');
  assert(!result.text.includes('SECRET-API-KEY'), 'the private RPC URL is in the answer');
  assert(!result.text.includes('aa'.repeat(32)), 'docHash is in the answer (the browser reads it from the contract)');
  assert(!('versionId' in result.json));
});

await scenario('verify: a lower case code with spaces is the same code', async () => {
  const result = await call('/api/verify/%20btu-v-7f3k-92qx%20');
  assert.equal(result.status, 200);
  assert.equal(result.json.verificationCode, 'BTU-V-7F3K-92QX');
  assert.equal(world.lookups.at(-1), 'BTU-V-7F3K-92QX');
});

await scenario('verify: a wrong format is 400 INVALID_CODE_FORMAT and the database is not asked', async () => {
  const before = world.lookups.length;
  for (const bad of ['abc', 'BTU-V-7F3K', 'BTU-V-7F3K-92QX-1', 'BTU-V-7F3K-92Q!', 'BTU-AI-000125', "'%3B%20DROP%20TABLE"]) {
    assertError(await call(`/api/verify/${bad}`), 400, 'INVALID_CODE_FORMAT');
  }
  assert.equal(world.lookups.length, before);
});

await scenario('verify: a well-formed code that was never issued is 404 CODE_NOT_FOUND', async () => {
  assertError(await call('/api/verify/BTU-V-ZZZZ-9999'), 404, 'CODE_NOT_FOUND');
});

await scenario('verify: a missing chain setup is a 500 with a generic text, and the cause is in the log', async () => {
  const saved = config.chain.publicRpcUrls;
  config.chain.publicRpcUrls = [];
  try {
    const result = await call('/api/verify/BTU-V-7F3K-92QX');
    assertError(result, 500, 'INTERNAL_ERROR');
    assert(!result.text.includes('PUBLIC_RPC_URLS'), 'the cause is shown to the caller');
    assert(world.logged.at(-1).includes('PUBLIC_RPC_URLS'), 'the cause is not logged');
  } finally {
    config.chain.publicRpcUrls = saved;
  }
});

await scenario('an unexpected error is 500 INTERNAL_ERROR: generic text for the caller, details only in the log', async () => {
  world.failLookup = new Error('connection to db.internal:5432 failed, password=hunter2');
  try {
    const result = await call('/api/verify/BTU-V-7F3K-92QX');
    assertError(result, 500, 'INTERNAL_ERROR');
    assert(!result.text.includes('hunter2') && !result.text.includes('db.internal'), 'details leaked to the caller');
    assert(world.logged.at(-1).includes('hunter2'), 'the error was not logged');
  } finally {
    world.failLookup = null;
  }
});

await scenario('an unknown path, an empty code and a wrong method are 404 NOT_FOUND in the same error shape', async () => {
  assertError(await call('/api/nothing-here'), 404, 'NOT_FOUND');
  assertError(await call('/api/verify/'), 404, 'NOT_FOUND');
  assertError(await call('/api/verify/BTU-V-7F3K-92QX', { method: 'POST' }), 404, 'NOT_FOUND');
  assertError(await call('/'), 404, 'NOT_FOUND');
});

await scenario('a body that is not valid JSON is 400 INVALID_REQUEST', async () => {
  const result = await call('/api/anything', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"email": ' });
  assertError(result, 400, 'INVALID_REQUEST');
});

await scenario('a body that is too large is 400 INVALID_REQUEST', async () => {
  const body = JSON.stringify({ filler: 'x'.repeat(20_000) });
  assertError(await call('/api/anything', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }), 400, 'INVALID_REQUEST');
});

await scenario('CORS: only our own site may call the API from a browser', async () => {
  const own = await call('/api/health', { headers: { Origin: SITE_ORIGIN } });
  assert.equal(own.headers.get('access-control-allow-origin'), SITE_ORIGIN);

  const foreign = await call('/api/health', { headers: { Origin: 'https://evil.example' } });
  assert.notEqual(foreign.headers.get('access-control-allow-origin'), 'https://evil.example');
  assert.notEqual(foreign.headers.get('access-control-allow-origin'), '*');

  const preflight = await call('/api/student/passport', {
    method: 'OPTIONS',
    headers: { Origin: SITE_ORIGIN, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization,x-admin-key' },
  });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('access-control-allow-headers'), /authorization/i);
  assert.match(preflight.headers.get('access-control-allow-headers'), /x-admin-key/i);
});

await scenario('the server does not say which framework it runs on', async () => {
  const result = await call('/api/health');
  assert.equal(result.headers.get('x-powered-by'), null);
});


// ----- Student -----

const EXPECTED_PASSPORT = {
  passportId: 'BTU-AI-000125',
  firstName: 'Giorgi',
  lastName: 'Kapanadze',
  program: 'Computer Science',
  educationLevel: "Bachelor's",
  studentStatus: 'Active',
  firstIssued: '2026-10-01',
  latest: { version: 2, verificationCode: 'BTU-V-AAAA-2222', issuedAt: '2026-10-21T10:15:00.000Z', txHash: TX_HASH },
  skills: [
    {
      skillId: 'SKL-001', skillName: 'AI Literacy', skillCategory: 'AI Skill', stampCode: 'BDG-AI-001',
      skillDescription: 'Fundamentals.', earnedThrough: null, dateEarned: '2026-09-12',
    },
    {
      skillId: 'SKL-004', skillName: 'Data Analysis', skillCategory: 'AI Applied Skill', stampCode: 'BDG-AI-002',
      skillDescription: 'Works with data.', earnedThrough: null, dateEarned: '2026-10-02',
    },
  ],
};

await scenario('student login: ask for a code, read it from the mail, send it back, get a token for 2 hours', async () => {
  const requested = await call('/api/student/otp/request', jsonPost({ email: 'giorgi@example.org' }));
  assert.equal(requested.status, 200);
  assert.deepEqual(requested.json, { ok: true });
  assert.equal(loginWorld.mails.at(-1).email, 'giorgi@example.org');

  const verified = await call('/api/student/otp/verify', jsonPost({ email: 'giorgi@example.org', code: loginWorld.mails.at(-1).code }));
  assert.equal(verified.status, 200);
  assert.deepEqual(Object.keys(verified.json).sort(), ['expiresIn', 'token']);
  assert.equal(verified.json.expiresIn, 7200);
  assert.equal(typeof verified.json.token, 'string');
});

await scenario('student passport: the exact JSON of docs/api.md with stamp codes, and no email, path or row ids', async () => {
  const token = await login('giorgi@example.org');
  const result = await call('/api/student/passport', bearer(token));
  assert.equal(result.status, 200);
  assert.deepEqual(result.json, EXPECTED_PASSPORT);
  for (const secret of ['giorgi@example.org', 'pdfPath', 'v2-BTU-V-AAAA-2222.pdf', 'versionId', 'BTU-T-0001']) {
    assert(!result.text.includes(secret), `${secret} is in the answer`);
  }
});

await scenario('student PDF: the latest version as a download, not cached, with a readable file name', async () => {
  const token = await login('giorgi@example.org');
  const result = await call('/api/student/passport/pdf', { headers: { ...bearer(token).headers, Origin: SITE_ORIGIN } });
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('content-type'), 'application/pdf');
  assert.equal(result.headers.get('content-disposition'), 'attachment; filename="BTU-AI-000125-v2.pdf"');
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.equal(result.headers.get('content-length'), String(PDF_BYTES.length));
  assert.match(result.headers.get('access-control-expose-headers'), /Content-Disposition/);
  assert.deepEqual(result.bytes, PDF_BYTES);
  assert.equal(studentWorld.downloads.at(-1), 'BTU-AI-000125/v2-BTU-V-AAAA-2222.pdf');
});

await scenario('student endpoints without a valid token are 401 UNAUTHORIZED', async () => {
  const wrongSecretToken = (await import('jsonwebtoken')).default.sign({ sub: 'BTU-T-0001' }, 'another-secret-0123456789abcdef');
  const attempts = [
    {},
    { headers: { Authorization: 'Bearer garbage' } },
    { headers: { Authorization: `Bearer ${wrongSecretToken}` } },
    { headers: { 'X-Admin-Key': config.adminApiKey } }, // the admin key is not a student login
  ];
  const downloadsBefore = studentWorld.downloads.length;
  for (const attempt of attempts) {
    assertError(await call('/api/student/passport', attempt), 401, 'UNAUTHORIZED');
    assertError(await call('/api/student/passport/pdf', attempt), 401, 'UNAUTHORIZED');
  }
  assert.equal(studentWorld.downloads.length, downloadsBefore, 'Storage was asked without a login');
});

await scenario('a student sees only their own passport, whatever the request says', async () => {
  const token = await login('luka@example.org');
  const trick = { headers: { ...bearer(token).headers, 'X-Student-Id': 'BTU-T-0001' } };
  const result = await call('/api/student/passport?studentId=BTU-T-0001&passportId=BTU-AI-000125', trick);
  assert.equal(result.json.passportId, 'BTU-AI-000130');
  assert.equal(result.json.firstName, 'Luka');
  assert.deepEqual(result.json.skills, []);

  await call('/api/student/passport/pdf?passportId=BTU-AI-000125', trick);
  assert.equal(studentWorld.downloads.at(-1), 'BTU-AI-000130/v1-BTU-V-BBBB-3333.pdf');
});

await scenario('no version issued yet, or no passport at all: 404 PASSPORT_NOT_FOUND on both endpoints', async () => {
  for (const email of ['nino@example.org', 'ana@example.org']) {
    const token = await login(email);
    const downloadsBefore = studentWorld.downloads.length;
    assertError(await call('/api/student/passport', bearer(token)), 404, 'PASSPORT_NOT_FOUND');
    assertError(await call('/api/student/passport/pdf', bearer(token)), 404, 'PASSPORT_NOT_FOUND');
    assert.equal(studentWorld.downloads.length, downloadsBefore);
  }
});

await scenario('login request: an unknown email gets the same answer and no mail; bad input is 400 INVALID_REQUEST', async () => {
  const mailsBefore = loginWorld.mails.length;
  const unknown = await call('/api/student/otp/request', jsonPost({ email: 'nobody@example.org' }));
  assert.equal(unknown.status, 200);
  assert.deepEqual(unknown.json, { ok: true });
  assert.equal(loginWorld.mails.length, mailsBefore);

  for (const bad of [{}, { email: 'not-an-email' }, { email: 42 }, [], 'text', null]) {
    assertError(await call('/api/student/otp/request', jsonPost(bad)), 400, 'INVALID_REQUEST');
  }
  assertError(await call('/api/student/otp/request', { method: 'POST' }), 400, 'INVALID_REQUEST'); // no body at all
  assertError(await call('/api/student/otp/request', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'giorgi@example.org' }), 400, 'INVALID_REQUEST');
  assert.equal(loginWorld.mails.length, mailsBefore);
});

await scenario('login check: a wrong code is 401 INVALID_OTP, 5 wrong codes lock it (429), an old code is 401 OTP_EXPIRED', async () => {
  const email = 'giorgi@example.org';
  await call('/api/student/otp/request', jsonPost({ email }));
  const code = loginWorld.mails.at(-1).code;
  const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, '0');

  for (let attempt = 1; attempt < 5; attempt += 1) {
    assertError(await call('/api/student/otp/verify', jsonPost({ email, code: wrong })), 401, 'INVALID_OTP');
  }
  assertError(await call('/api/student/otp/verify', jsonPost({ email, code: wrong })), 429, 'OTP_LOCKED');
  assertError(await call('/api/student/otp/verify', jsonPost({ email, code })), 429, 'OTP_LOCKED'); // also the right code now

  await call('/api/student/otp/request', jsonPost({ email })); // a new code
  const freshCode = loginWorld.mails.at(-1).code;
  const realNow = loginWorld.now;
  loginWorld.now = new Date(realNow.getTime() + 11 * 60_000);
  try {
    assertError(await call('/api/student/otp/verify', jsonPost({ email, code: freshCode })), 401, 'OTP_EXPIRED');
  } finally {
    loginWorld.now = realNow;
  }
});

await scenario('login check: a code sent as a number, or without an email, is 400 INVALID_REQUEST', async () => {
  assertError(await call('/api/student/otp/verify', jsonPost({ email: 'giorgi@example.org', code: 123456 })), 400, 'INVALID_REQUEST');
  assertError(await call('/api/student/otp/verify', jsonPost({ code: '123456' })), 400, 'INVALID_REQUEST');
  assertError(await call('/api/student/otp/verify', jsonPost({})), 400, 'INVALID_REQUEST');
});

await scenario('a Storage problem is a 500 with a generic text; the path is only in the log', async () => {
  const token = await login('giorgi@example.org');
  studentWorld.failDownload = true;
  try {
    const result = await call('/api/student/passport/pdf', bearer(token));
    assertError(result, 500, 'INTERNAL_ERROR');
    assert(!result.text.includes('BTU-AI-000125') && !result.text.includes('bucket'), 'details leaked to the caller');
    assert(world.logged.at(-1).includes('bucket unreachable'), 'the problem was not logged');
  } finally {
    studentWorld.failDownload = false;
  }
});

await scenario('student paths accept only their own methods', async () => {
  assertError(await call('/api/student/passport', { method: 'POST' }), 404, 'NOT_FOUND');
  assertError(await call('/api/student/otp/request'), 404, 'NOT_FOUND');
  assertError(await call('/api/student/otp/verify'), 404, 'NOT_FOUND');
});

// ----- Admin -----

const ADMIN = { headers: { 'X-Admin-Key': config.adminApiKey } };
const flush = () => new Promise((resolve) => setImmediate(resolve)); // lets the not-awaited sync promise finish

await scenario('admin: without the key, with a wrong key or with a student token EVERY admin path is 401 and nothing is read', async () => {
  const studentToken = await login('giorgi@example.org');
  const paths = [
    ['GET', '/api/admin/passports'],
    ['GET', '/api/admin/passports/BTU-AI-000125/versions'],
    ['GET', '/api/admin/passports/BTU-AI-000125/versions/1/pdf'],
    ['GET', '/api/admin/sync-log'],
    ['POST', '/api/admin/sync'],
    ['GET', '/api/admin/sync/status'],
    ['GET', '/api/admin/no-such-thing'],
  ];
  const queriesBefore = adminWorld.queries.length;
  const runsBefore = syncWorld.runs.length;
  for (const [method, path] of paths) {
    for (const headers of [{}, { 'X-Admin-Key': 'wrong' }, { 'X-Admin-Key': '' }, { Authorization: `Bearer ${studentToken}` }]) {
      assertError(await call(path, { method, headers }), 401, 'UNAUTHORIZED');
    }
  }
  assert.equal(adminWorld.queries.length, queriesBefore, 'the database was asked without the key');
  assert.equal(syncWorld.runs.length, runsBefore, 'a sync was started without the key');
  assert.equal(adminWorld.downloads.length, 0);
});

await scenario('admin: a path that does not exist is 404 NOT_FOUND once the key is right', async () => {
  assertError(await call('/api/admin/no-such-thing', ADMIN), 404, 'NOT_FOUND');
});

await scenario('admin passports: the list of docs/api.md, no fields beyond it', async () => {
  const result = await call('/api/admin/passports', ADMIN);
  assert.equal(result.status, 200);
  assert.deepEqual(result.json, {
    items: [
      { passportId: 'BTU-AI-000125', studentId: 'BTU-T-0001', firstName: 'Giorgi', lastName: 'Kapanadze', email: 'giorgi@example.org',
        latestVersion: 2, skillCount: 2, firstIssued: '2026-10-01', lastIssuedAt: '2026-10-21T10:15:00.000Z' },
      { passportId: 'BTU-AI-000126', studentId: 'BTU-T-0002', firstName: 'Nino', lastName: 'Beridze', email: 'nino@example.org',
        latestVersion: null, skillCount: 0, firstIssued: '2026-10-02', lastIssuedAt: null },
    ],
  });
});

await scenario('admin versions: newest first with the document hash; no versions yet is an empty list', async () => {
  const result = await call('/api/admin/passports/BTU-AI-000125/versions', ADMIN);
  assert.equal(result.status, 200);
  assert.deepEqual(result.json, {
    passportId: 'BTU-AI-000125',
    versions: [
      { version: 2, verificationCode: 'BTU-V-AAAA-2222', status: 'latest', issuedAt: '2026-10-21T10:15:00.000Z', txHash: TX_HASH, docHash: 'bb'.repeat(32) },
      { version: 1, verificationCode: 'BTU-V-7F3K-92QX', status: 'superseded', issuedAt: '2026-10-21T10:15:00.000Z', txHash: TX_HASH, docHash: 'aa'.repeat(32) },
    ],
  });
  const empty = await call('/api/admin/passports/BTU-AI-000126/versions', ADMIN);
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.json, { passportId: 'BTU-AI-000126', versions: [] });
});

await scenario('admin versions: an unknown or malformed passport is 404 PASSPORT_NOT_FOUND', async () => {
  assertError(await call('/api/admin/passports/BTU-AI-999999/versions', ADMIN), 404, 'PASSPORT_NOT_FOUND');
  assertError(await call('/api/admin/passports/nonsense/versions', ADMIN), 404, 'PASSPORT_NOT_FOUND');
});

await scenario('admin PDF: any version, also an old one (demo 12), as a download with the version in the name', async () => {
  const old = await call('/api/admin/passports/BTU-AI-000125/versions/1/pdf', ADMIN);
  assert.equal(old.status, 200);
  assert.equal(old.headers.get('content-type'), 'application/pdf');
  assert.equal(old.headers.get('content-disposition'), 'attachment; filename="BTU-AI-000125-v1.pdf"');
  assert.equal(old.headers.get('cache-control'), 'no-store');
  assert.deepEqual(old.bytes, PDF_BYTES);
  assert.equal(adminWorld.downloads.at(-1), 'BTU-AI-000125/v1-BTU-V-7F3K-92QX.pdf');

  const latest = await call('/api/admin/passports/BTU-AI-000125/versions/2/pdf', ADMIN);
  assert.equal(latest.headers.get('content-disposition'), 'attachment; filename="BTU-AI-000125-v2.pdf"');
  assert.equal(adminWorld.downloads.at(-1), 'BTU-AI-000125/v2-BTU-V-AAAA-2222.pdf');
});

await scenario('admin PDF: a version that does not exist, or is not a plain number, is 404 VERSION_NOT_FOUND', async () => {
  const downloadsBefore = adminWorld.downloads.length;
  for (const version of ['3', '0', '-1', '1.5', 'abc', '01', '1e3', '9999999']) {
    assertError(await call(`/api/admin/passports/BTU-AI-000125/versions/${version}/pdf`, ADMIN), 404, 'VERSION_NOT_FOUND');
  }
  assertError(await call('/api/admin/passports/BTU-AI-999999/versions/1/pdf', ADMIN), 404, 'VERSION_NOT_FOUND');
  assertError(await call('/api/admin/passports/nonsense/versions/1/pdf', ADMIN), 404, 'VERSION_NOT_FOUND');
  assert.equal(adminWorld.downloads.length, downloadsBefore);
});

await scenario('sync log: newest first in the shape of docs/api.md; default 100 entries, all levels', async () => {
  const result = await call('/api/admin/sync-log', ADMIN);
  assert.equal(result.status, 200);
  assert.deepEqual(result.json, {
    items: [
      { id: 41, sheetRow: 14, recordId: null, studentId: 'BTU-T-9999', level: 'error', message: 'Row 14: unknown Student ID BTU-T-9999', createdAt: '2026-10-21T10:15:00.000Z' },
      { id: 40, sheetRow: null, recordId: null, studentId: null, level: 'info', message: 'Sync finished: 60 rows read', createdAt: '2026-10-21T10:15:00.000Z' },
    ],
  });
  assert.equal(adminWorld.queries.at(-1), 'findSyncLog {"level":null,"limit":100}');
});

await scenario('sync log: level and limit are passed on; bad values are 400 INVALID_REQUEST and the database is not asked', async () => {
  await call('/api/admin/sync-log?level=error&limit=50', ADMIN);
  assert.equal(adminWorld.queries.at(-1), 'findSyncLog {"level":"error","limit":50}');
  await call('/api/admin/sync-log?level=duplicate&limit=500', ADMIN);
  assert.equal(adminWorld.queries.at(-1), 'findSyncLog {"level":"duplicate","limit":500}');
  await call('/api/admin/sync-log?level=info&limit=1', ADMIN);
  assert.equal(adminWorld.queries.at(-1), 'findSyncLog {"level":"info","limit":1}');

  const queriesBefore = adminWorld.queries.length;
  for (const bad of ['level=debug', 'level=ERROR', 'level=error&level=info', 'limit=0', 'limit=501', 'limit=-5', 'limit=abc', 'limit=', 'limit=1.5', 'limit=10&limit=20']) {
    assertError(await call(`/api/admin/sync-log?${bad}`, ADMIN), 400, 'INVALID_REQUEST');
  }
  assert.equal(adminWorld.queries.length, queriesBefore);
});

await scenario('sync status before the first run: not running, everything empty', async () => {
  const result = await call('/api/admin/sync/status', ADMIN);
  assert.equal(result.status, 200);
  assert.deepEqual(result.json, { running: false, startedAt: null, finishedAt: null, summary: null, error: null });
});

await scenario('sync start: 202 at once, status running, a second start is 409, the finished run shows its summary', async () => {
  const started = await call('/api/admin/sync', { method: 'POST', ...ADMIN });
  assert.equal(started.status, 202);
  assert.deepEqual(started.json, { status: 'started', startedAt: '2026-10-22T16:00:00.000Z' });
  assert.equal(syncWorld.runs.length, 1);
  assert.equal(syncWorld.runs[0].bootstrap, false, 'the admin button must never run a bootstrap');

  const running = await call('/api/admin/sync/status', ADMIN);
  assert.deepEqual(running.json, { running: true, startedAt: '2026-10-22T16:00:00.000Z', finishedAt: null, summary: null, error: null });

  assertError(await call('/api/admin/sync', { method: 'POST', ...ADMIN }), 409, 'SYNC_ALREADY_RUNNING');
  assert.equal(syncWorld.runs.length, 1, 'a second sync was started');

  syncWorld.clock = new Date('2026-10-22T16:01:40.000Z');
  const summary = { rowsRead: 60, newAwards: 3, versionsIssued: 2, duplicates: 1, errors: 1 };
  syncWorld.resolve({ summary, problems: ['Row 14: something'] });
  await flush();

  const done = await call('/api/admin/sync/status', ADMIN);
  assert.deepEqual(done.json, { running: false, startedAt: '2026-10-22T16:00:00.000Z', finishedAt: '2026-10-22T16:01:40.000Z', summary, error: null });
});

await scenario('sync start: two requests at the same moment start ONE sync (one 202, one 409)', async () => {
  syncWorld.clock = new Date('2026-10-22T17:00:00.000Z');
  const runsBefore = syncWorld.runs.length;
  const both = await Promise.all([
    call('/api/admin/sync', { method: 'POST', ...ADMIN }),
    call('/api/admin/sync', { method: 'POST', ...ADMIN }),
  ]);
  assert.deepEqual(both.map((result) => result.status).sort(), [202, 409]);
  assert.equal(syncWorld.runs.length, runsBefore + 1);
  syncWorld.resolve({ summary: { rowsRead: 0, newAwards: 0, versionsIssued: 0, duplicates: 0, errors: 0 }, problems: [] });
  await flush();
});

await scenario('a sync that crashes: the server stays up, the status holds a short error, the next sync can start', async () => {
  syncWorld.clock = new Date('2026-10-22T18:00:00.000Z');
  await call('/api/admin/sync', { method: 'POST', ...ADMIN });
  syncWorld.clock = new Date('2026-10-22T18:00:05.000Z');
  syncWorld.reject(new Error(`Google Sheet is not readable ${'x'.repeat(1000)}`));
  await flush();

  const status = await call('/api/admin/sync/status', ADMIN);
  assert.equal(status.status, 200);
  assert.equal(status.json.running, false);
  assert.equal(status.json.summary, null);
  assert.equal(status.json.finishedAt, '2026-10-22T18:00:05.000Z');
  assert.match(status.json.error, /^Google Sheet is not readable/);
  assert(status.json.error.length <= 300, 'the error text is not shortened');
  assert(syncWorld.logged.at(-1).includes('Google Sheet is not readable'), 'the crash was not logged');

  syncWorld.clock = new Date('2026-10-22T19:00:00.000Z');
  const again = await call('/api/admin/sync', { method: 'POST', ...ADMIN });
  assert.equal(again.status, 202);
  const whileRunning = await call('/api/admin/sync/status', ADMIN);
  assert.deepEqual(whileRunning.json, { running: true, startedAt: '2026-10-22T19:00:00.000Z', finishedAt: null, summary: null, error: null });
  syncWorld.resolve({ summary: { rowsRead: 1, newAwards: 0, versionsIssued: 0, duplicates: 0, errors: 0 }, problems: [] });
  await flush();
  assert.equal((await call('/api/admin/sync/status', ADMIN)).json.error, null, 'the old error stays after a good run');
});

await scenario('admin endpoints accept only their own methods', async () => {
  assertError(await call('/api/admin/passports', { method: 'POST', ...ADMIN }), 404, 'NOT_FOUND');
  assertError(await call('/api/admin/sync', ADMIN), 404, 'NOT_FOUND');
  assertError(await call('/api/admin/sync/status', { method: 'POST', ...ADMIN }), 404, 'NOT_FOUND');
});

await scenario('a PDF file name with a quote or a line break is refused before it reaches a header', () => {
  const fakeResponse = { set() { throw new Error('headers must not be set'); }, send() {} };
  for (const unsafe of ['a"b.pdf', 'a\r\nSet-Cookie: x=1.pdf', '../secret.pdf', 'with space.pdf', '']) {
    assert.throws(() => sendPdf(fakeResponse, PDF_BYTES, unsafe), /Unsafe PDF file name/);
  }
});

server.close();
console.log(failed ? '\nSome scenarios FAILED.' : `\nAll ${step} scenarios passed.`);
process.exitCode = failed ? 1 : 0;
