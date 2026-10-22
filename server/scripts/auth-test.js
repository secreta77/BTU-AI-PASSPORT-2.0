// Dev helper: tests the email-code login and the access rules with a FAKE database, mail and clock. Run: npm run auth-test
// It never touches the real database or sends a mail, so it is safe to run any time.
// The real SQL of the OTP table is tested by db-test.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { requireAdmin, requireStudent, signStudentToken } from '../auth/authMiddleware.js';
import { generateLoginCode, requestOtp, verifyOtp } from '../auth/otpService.js';
import { config } from '../config.js';
import { AppError } from '../middleware/appError.js';
import { OTP } from '../shared/constants.js';

const SECRET = 'test-secret-0123456789abcdef';
const ADMIN_KEY = 'test-admin-key-0123456789';
const STUDENT_EMAIL = 'giorgi@example.org';
const MINUTE = 60_000;

config.jwtSecret = SECRET;
config.adminApiKey = ADMIN_KEY;

// ---------- A fake world: database table, mailbox and clock in memory ----------

function createWorld() {
  const world = {
    now: new Date('2026-10-22T10:00:00Z'),
    otps: [], // rows of otp_codes
    mails: [], // what the mail sender received
    errors: [], // what was logged
    mailFails: false,
    nextCode: null, // a fixed code for a scenario that needs to know it
  };
  const students = [{ studentId: 'BTU-T-0001', firstName: 'Giorgi', lastName: 'Kapanadze', email: 'Giorgi@Example.org' }];
  let nextId = 1;

  world.deps = {
    db: {
      async findStudentByEmail(email) {
        return students.find((student) => student.email.toLowerCase() === email.toLowerCase()) ?? null;
      },
      async createOtp({ email, codeHash, expiresAt }) {
        world.otps.filter((otp) => otp.email === email && !otp.used).forEach((otp) => { otp.used = true; });
        world.otps.push({ id: nextId, email, codeHash, attempts: 0, expiresAt, used: false });
        return nextId++;
      },
      async findActiveOtp(email) {
        const otp = world.otps.filter((item) => item.email === email.toLowerCase() && !item.used).at(-1);
        return otp ? { id: otp.id, codeHash: otp.codeHash, attempts: otp.attempts, expiresAt: otp.expiresAt } : null;
      },
      async increaseOtpAttempts(id) {
        const otp = world.otps.find((item) => item.id === id);
        if (otp.attempts >= OTP.MAX_ATTEMPTS) return null;
        otp.attempts += 1;
        return otp.attempts;
      },
      async markOtpUsed(id) {
        const otp = world.otps.find((item) => item.id === id);
        if (otp.used) return false;
        otp.used = true;
        return true;
      },
    },
    async sendMail(mail) {
      if (world.mailFails) throw new Error('SMTP server is down');
      world.mails.push(mail);
    },
    generateCode: () => world.nextCode ?? generateLoginCode(),
    now: () => world.now,
    logError: (message) => world.errors.push(message),
  };
  return world;
}

// A student asks for a code and "reads" it from the mail
async function requestAndRead(world, email = STUDENT_EMAIL) {
  await requestOtp(email, world.deps);
  return world.mails.at(-1).code;
}

function wrongCodeFor(code) {
  return String((Number(code) + 1) % 1_000_000).padStart(6, '0');
}

async function assertAppError(promise, code) {
  await assert.rejects(promise, (error) => {
    assert(error instanceof AppError, `expected AppError ${code}, got ${error.name}: ${error.message}`);
    assert.equal(error.code, code);
    return true;
  });
}

const flush = () => new Promise((resolve) => setImmediate(resolve)); // lets the not-awaited mail promise finish

// ---------- Express stand-ins ----------

// Calls a middleware with a fake request. `received` is what next() got: undefined = "let it pass", else the error.
function callMiddleware(middleware, headers = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]));
  const req = { get: (name) => lower[name.toLowerCase()] };
  let received = 'next was not called';
  middleware(req, {}, (argument) => { received = argument; });
  return { req, received };
}

function assertUnauthorized(received) {
  assert(received instanceof AppError, `expected UNAUTHORIZED, got ${received}`);
  assert.equal(received.code, 'UNAUTHORIZED');
  assert.equal(received.status, 401);
}

const base64url = (object) => Buffer.from(JSON.stringify(object)).toString('base64url');

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

// ----- Asking for a code -----

await scenario('a student asks for a code: one mail with 6 digits goes to the student', async () => {
  const world = createWorld();
  assert.deepEqual(await requestOtp(STUDENT_EMAIL, world.deps), { ok: true });
  assert.equal(world.mails.length, 1);
  assert.equal(world.mails[0].email, STUDENT_EMAIL);
  assert.equal(world.mails[0].firstName, 'Giorgi');
  assert.match(world.mails[0].code, /^\d{6}$/);
  assert.equal(world.otps.length, 1);
  assert.equal(world.otps[0].expiresAt.getTime(), world.now.getTime() + OTP.VALID_MINUTES * MINUTE);
});

await scenario('an unknown email gets the same answer, but no mail is sent and nothing is stored', async () => {
  const world = createWorld();
  assert.deepEqual(await requestOtp('nobody@example.org', world.deps), { ok: true });
  assert.equal(world.mails.length, 0);
  assert.equal(world.otps.length, 0);
});

await scenario('a malformed email is INVALID_REQUEST (400)', async () => {
  const world = createWorld();
  for (const bad of ['', '   ', 'no-at-sign', 'a b@example.org', null, undefined, 42, {}]) {
    await assertAppError(requestOtp(bad, world.deps), 'INVALID_REQUEST');
  }
  assert.equal(world.otps.length, 0);
});

await scenario('only a keyed hash of the code is stored, never the code', async () => {
  const world = createWorld();
  world.nextCode = '482913';
  await requestOtp(STUDENT_EMAIL, world.deps);
  const stored = JSON.stringify(world.otps[0]);
  assert(!stored.includes('482913'), 'the code itself is in the table');
  const plainHash = crypto.createHash('sha256').update('482913').digest('hex');
  assert(!stored.includes(plainHash), 'the table holds an unkeyed hash of the code');
});

await scenario('the hash depends on the server secret: another JWT_SECRET cannot verify the code', async () => {
  const world = createWorld();
  const code = await requestAndRead(world);
  config.jwtSecret = 'another-secret-0123456789abcdef';
  try {
    await assertAppError(verifyOtp(STUDENT_EMAIL, code, world.deps), 'INVALID_OTP');
  } finally {
    config.jwtSecret = SECRET;
  }
});

await scenario('a mail problem is logged and does not break the request', async () => {
  const world = createWorld();
  world.mailFails = true;
  assert.deepEqual(await requestOtp(STUDENT_EMAIL, world.deps), { ok: true });
  await flush();
  assert.equal(world.errors.length, 1);
  assert.match(world.errors[0], /SMTP server is down/);
});

await scenario('login codes are 6 digits, leading zeros are kept, and they are not all the same', () => {
  assert.equal(generateLoginCode(() => 7), '000007');
  assert.equal(generateLoginCode(() => 999_999), '999999');
  const codes = new Set(Array.from({ length: 200 }, () => generateLoginCode()));
  assert(codes.size > 100, 'codes repeat too often');
  assert([...codes].every((code) => /^\d{6}$/.test(code)));
});

// ----- Checking the code -----

await scenario('the correct code gives a token for 2 hours, and that token opens the student endpoints', async () => {
  const world = createWorld();
  const code = await requestAndRead(world);
  const { token, expiresIn } = await verifyOtp(STUDENT_EMAIL, code, world.deps);

  assert.equal(expiresIn, 7200);
  const payload = jwt.decode(token);
  assert.equal(payload.sub, 'BTU-T-0001');
  assert.equal(payload.exp - payload.iat, 7200);
  const { req, received } = callMiddleware(requireStudent, { Authorization: `Bearer ${token}` });
  assert.equal(received, undefined);
  assert.equal(req.studentId, 'BTU-T-0001');
});

await scenario('the email is not case sensitive and spaces around it do not matter', async () => {
  const world = createWorld();
  const code = await requestAndRead(world, '  GIORGI@Example.ORG ');
  const { token } = await verifyOtp('Giorgi@EXAMPLE.org', ` ${code} `, world.deps);
  assert(token);
});

await scenario('a wrong code is INVALID_OTP, and the right code still works afterwards', async () => {
  const world = createWorld();
  const code = await requestAndRead(world);
  await assertAppError(verifyOtp(STUDENT_EMAIL, wrongCodeFor(code), world.deps), 'INVALID_OTP');
  assert.equal(world.otps[0].attempts, 1);
  assert((await verifyOtp(STUDENT_EMAIL, code, world.deps)).token);
});

await scenario('5 wrong attempts lock the code (the 5th already answers OTP_LOCKED, 429), even for the right code', async () => {
  const world = createWorld();
  const code = await requestAndRead(world);
  for (let attempt = 1; attempt < OTP.MAX_ATTEMPTS; attempt += 1) {
    await assertAppError(verifyOtp(STUDENT_EMAIL, wrongCodeFor(code), world.deps), 'INVALID_OTP');
  }
  await assert.rejects(verifyOtp(STUDENT_EMAIL, wrongCodeFor(code), world.deps), (error) => {
    assert.equal(error.code, 'OTP_LOCKED');
    assert.equal(error.status, 429);
    return true;
  });
  await assertAppError(verifyOtp(STUDENT_EMAIL, code, world.deps), 'OTP_LOCKED');
  assert.equal(world.otps[0].attempts, OTP.MAX_ATTEMPTS);
});

await scenario('after a lock, asking for a new code works', async () => {
  const world = createWorld();
  const first = await requestAndRead(world);
  for (let attempt = 0; attempt < OTP.MAX_ATTEMPTS; attempt += 1) {
    await verifyOtp(STUDENT_EMAIL, wrongCodeFor(first), world.deps).catch(() => {});
  }
  const second = await requestAndRead(world);
  assert((await verifyOtp(STUDENT_EMAIL, second, world.deps)).token);
});

await scenario('the code is valid for 10 minutes: at 9:59 it works, at 10:01 it is OTP_EXPIRED (401)', async () => {
  const world = createWorld();
  const code = await requestAndRead(world);
  world.now = new Date(world.now.getTime() + 10 * MINUTE - 1000);
  assert((await verifyOtp(STUDENT_EMAIL, code, world.deps)).token);

  const lateWorld = createWorld();
  const lateCode = await requestAndRead(lateWorld);
  lateWorld.now = new Date(lateWorld.now.getTime() + 10 * MINUTE + 1000);
  await assert.rejects(verifyOtp(STUDENT_EMAIL, lateCode, lateWorld.deps), (error) => {
    assert.equal(error.code, 'OTP_EXPIRED');
    assert.equal(error.status, 401);
    return true;
  });
});

await scenario('a code works only once', async () => {
  const world = createWorld();
  const code = await requestAndRead(world);
  await verifyOtp(STUDENT_EMAIL, code, world.deps);
  await assertAppError(verifyOtp(STUDENT_EMAIL, code, world.deps), 'INVALID_OTP');
});

await scenario('two requests with the same correct code at the same moment: only one gets a token', async () => {
  const world = createWorld();
  const code = await requestAndRead(world);
  const results = await Promise.allSettled([
    verifyOtp(STUDENT_EMAIL, code, world.deps),
    verifyOtp(STUDENT_EMAIL, code, world.deps),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
});

await scenario('a new request cancels the old code', async () => {
  const world = createWorld();
  const first = await requestAndRead(world);
  world.nextCode = wrongCodeFor(first);
  const second = await requestAndRead(world);
  assert.notEqual(first, second);
  await assertAppError(verifyOtp(STUDENT_EMAIL, first, world.deps), 'INVALID_OTP');
  assert((await verifyOtp(STUDENT_EMAIL, second, world.deps)).token);
});

await scenario('unknown email, or no code requested: INVALID_OTP (the same answer as a wrong code)', async () => {
  const world = createWorld();
  await assertAppError(verifyOtp(STUDENT_EMAIL, '123456', world.deps), 'INVALID_OTP');
  await assertAppError(verifyOtp('nobody@example.org', '123456', world.deps), 'INVALID_OTP');
});

await scenario('a malformed email or code is INVALID_REQUEST, and it does not count as an attempt', async () => {
  const world = createWorld();
  await requestAndRead(world);
  for (const bad of ['', '12345', '1234567', 'abcdef', '12 456', null, undefined, 123456]) {
    await assertAppError(verifyOtp(STUDENT_EMAIL, bad, world.deps), 'INVALID_REQUEST');
  }
  await assertAppError(verifyOtp('not-an-email', '123456', world.deps), 'INVALID_REQUEST');
  assert.equal(world.otps[0].attempts, 0);
});

await scenario('an empty or short JWT_SECRET is a clear setup error (not a wrong-code answer)', async () => {
  const world = createWorld();
  config.jwtSecret = 'short';
  try {
    await assert.rejects(requestOtp(STUDENT_EMAIL, world.deps), (error) => !(error instanceof AppError) && /JWT_SECRET/.test(error.message));
    assert.throws(() => signStudentToken('BTU-T-0001'), /JWT_SECRET/);
    const { received } = callMiddleware(requireStudent, { Authorization: 'Bearer anything' });
    assert(received instanceof Error && !(received instanceof AppError), 'a setup problem must not look like a wrong token');
  } finally {
    config.jwtSecret = SECRET;
  }
  assert.equal(world.otps.length, 0);
});

// ----- Student access -----

await scenario('student endpoints: no header, other scheme, garbage and empty token are UNAUTHORIZED (401)', () => {
  const good = signStudentToken('BTU-T-0001');
  const cases = [{}, { Authorization: '' }, { Authorization: `Basic ${good}` }, { Authorization: good }, { Authorization: 'Bearer ' }, { Authorization: 'Bearer garbage' }];
  for (const headers of cases) {
    assertUnauthorized(callMiddleware(requireStudent, headers).received);
  }
});

await scenario('student endpoints: a token with a wrong secret, wrong algorithm, expired, or without a student is refused', () => {
  const sub = 'BTU-T-0001';
  const tokens = {
    'other secret': jwt.sign({ sub }, 'another-secret-0123456789abcdef', { expiresIn: 7200 }),
    'HS512 with the right secret': jwt.sign({ sub }, SECRET, { algorithm: 'HS512', expiresIn: 7200 }),
    expired: jwt.sign({ sub, iat: Math.floor(Date.now() / 1000) - 8000 }, SECRET, { expiresIn: 7200 }),
    'no sub': jwt.sign({ name: 'x' }, SECRET, { expiresIn: 7200 }),
    'sub is not a student id': jwt.sign({ sub: 'admin' }, SECRET, { expiresIn: 7200 }),
    'alg none': `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({ sub })}.`,
    tampered: `${signStudentToken(sub).split('.').slice(0, 2).join('.')}.AAAA`,
  };
  for (const [name, token] of Object.entries(tokens)) {
    const { received } = callMiddleware(requireStudent, { Authorization: `Bearer ${token}` });
    assert(received instanceof AppError && received.code === 'UNAUTHORIZED', `token "${name}" was not refused`);
  }
});

// ----- Admin access -----

await scenario('admin: the right key passes; a wrong, missing, empty or longer key is UNAUTHORIZED', () => {
  assert.equal(callMiddleware(requireAdmin, { 'X-Admin-Key': ADMIN_KEY }).received, undefined);
  for (const headers of [{}, { 'X-Admin-Key': '' }, { 'X-Admin-Key': 'wrong' }, { 'X-Admin-Key': `${ADMIN_KEY}x` }, { 'X-Admin-Key': ADMIN_KEY.slice(0, -1) }]) {
    assertUnauthorized(callMiddleware(requireAdmin, headers).received);
  }
});

await scenario('admin: an empty ADMIN_API_KEY means NO access (an empty header must not match it)', () => {
  config.adminApiKey = '';
  try {
    assertUnauthorized(callMiddleware(requireAdmin, {}).received);
    assertUnauthorized(callMiddleware(requireAdmin, { 'X-Admin-Key': '' }).received);
  } finally {
    config.adminApiKey = ADMIN_KEY;
  }
});

await scenario('a student token does not open admin endpoints, and the admin key is not a student token', () => {
  const token = signStudentToken('BTU-T-0001');
  assertUnauthorized(callMiddleware(requireAdmin, { Authorization: `Bearer ${token}` }).received);
  assertUnauthorized(callMiddleware(requireAdmin, { 'X-Admin-Key': token }).received);
  assertUnauthorized(callMiddleware(requireStudent, { Authorization: `Bearer ${ADMIN_KEY}` }).received);
  assertUnauthorized(callMiddleware(requireStudent, { 'X-Admin-Key': ADMIN_KEY }).received);
});

console.log(failed ? '\nSome scenarios FAILED.' : `\nAll ${step} scenarios passed.`);
process.exitCode = failed ? 1 : 0;
