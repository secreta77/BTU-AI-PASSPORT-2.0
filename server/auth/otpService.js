// Student login with a code from email (Decision 7): requestOtp sends a 6-digit code, verifyOtp checks it and gives a token.
// Rules: the code is valid 10 minutes, works once, and 5 wrong attempts lock it. Only a keyed hash of the code is stored.
// Everything outside (database, mail, clock, random numbers) comes in as `deps`, so tests can replace it.
import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import { config } from '../config.js';
import * as queries from '../db/queries.js';
import { AppError } from '../middleware/appError.js';
import { EMAIL_PATTERN, ERROR_CODE, OTP } from '../shared/constants.js';
import { getJwtSecret, signStudentToken, TOKEN_LIFETIME_SECONDS } from './authMiddleware.js';

const CODE_LENGTH = 6;
const CODE_PATTERN = new RegExp(`^\\d{${CODE_LENGTH}}$`);
const SMTP_PORT = 587; // STARTTLS, the usual port of mail providers

const defaultDeps = {
  db: queries,
  sendMail: sendLoginCodeMail,
  generateCode: generateLoginCode,
  now: () => new Date(),
  logError: (message) => console.error(message),
};

// 6 digits, leading zeros allowed ("004281"). crypto.randomInt is unpredictable; Math.random is not.
export function generateLoginCode(randomInt = crypto.randomInt) {
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');
}

// Sends a login code if the email belongs to a student. The answer is always the same ({ ok: true }), also for an unknown
// email, so nobody can find out who is a student (docs/api.md). Throws AppError INVALID_REQUEST for a malformed email.
export async function requestOtp(emailInput, deps = defaultDeps) {
  const email = normalizeEmail(emailInput);
  const student = await deps.db.findStudentByEmail(email);
  if (student === null) {
    return { ok: true };
  }

  const code = deps.generateCode();
  const expiresAt = new Date(deps.now().getTime() + OTP.VALID_MINUTES * 60_000);
  await deps.db.createOtp({ email, codeHash: hashCode(email, code), expiresAt });

  // Not awaited: waiting for the mail server would make a known email answer slower than an unknown one.
  // A mail problem is logged; the student asks for a new code.
  deps.sendMail({ email, code, firstName: student.firstName }).catch((error) => {
    deps.logError(`Could not send the login code mail: ${error.message}`);
  });
  return { ok: true };
}

// Checks the code. Returns { token, expiresIn } or throws AppError:
// INVALID_REQUEST (malformed input), INVALID_OTP (wrong, unknown email, no code requested, already used),
// OTP_EXPIRED (older than 10 minutes), OTP_LOCKED (5 wrong attempts).
export async function verifyOtp(emailInput, codeInput, deps = defaultDeps) {
  const email = normalizeEmail(emailInput);
  const code = typeof codeInput === 'string' ? codeInput.trim() : '';
  if (!CODE_PATTERN.test(code)) {
    throw new AppError(ERROR_CODE.INVALID_REQUEST, `code must be ${CODE_LENGTH} digits`);
  }

  const otp = await deps.db.findActiveOtp(email);
  if (otp === null) {
    throw new AppError(ERROR_CODE.INVALID_OTP, 'Wrong code');
  }
  if (otp.attempts >= OTP.MAX_ATTEMPTS) {
    throw lockedError();
  }
  if (deps.now() > otp.expiresAt) {
    throw new AppError(ERROR_CODE.OTP_EXPIRED, `The code is older than ${OTP.VALID_MINUTES} minutes. Ask for a new one`);
  }

  if (!sameHash(otp.codeHash, hashCode(email, code))) {
    const attempts = await deps.db.increaseOtpAttempts(otp.id);
    // The attempt that reaches the limit already answers "locked": the next try could not succeed anyway
    throw attempts === null || attempts >= OTP.MAX_ATTEMPTS
      ? lockedError()
      : new AppError(ERROR_CODE.INVALID_OTP, 'Wrong code');
  }

  // Two requests with the same correct code at the same moment: only one of them gets the token
  if (!(await deps.db.markOtpUsed(otp.id))) {
    throw new AppError(ERROR_CODE.INVALID_OTP, 'Wrong code');
  }
  const student = await deps.db.findStudentByEmail(email);
  if (student === null) {
    throw new AppError(ERROR_CODE.INVALID_OTP, 'Wrong code');
  }
  return { token: signStudentToken(student.studentId), expiresIn: TOKEN_LIFETIME_SECONDS };
}

function lockedError() {
  return new AppError(ERROR_CODE.OTP_LOCKED, 'Too many wrong attempts. Ask for a new code');
}

// Trimmed, lower case: the database compares emails without case too, and one spelling is stored
function normalizeEmail(emailInput) {
  const email = typeof emailInput === 'string' ? emailInput.trim().toLowerCase() : '';
  if (!EMAIL_PATTERN.test(email)) {
    throw new AppError(ERROR_CODE.INVALID_REQUEST, 'email is missing or not valid');
  }
  return email;
}

// HMAC with the server secret, not a plain hash: a 6-digit code has only a million possibilities, so a plain hash
// could be reversed in a moment if the database leaked. Without the secret the hashes are useless.
function hashCode(email, code) {
  return crypto.createHmac('sha256', getJwtSecret()).update(`${email}:${code}`).digest('hex');
}

function sameHash(storedHex, computedHex) {
  const stored = Buffer.from(storedHex, 'hex');
  const computed = Buffer.from(computedHex, 'hex');
  return stored.length === computed.length && crypto.timingSafeEqual(stored, computed);
}

// ---------- Mail ----------

let mailSetup = null; // created on the first mail and reused

// Real SMTP when SMTP_HOST is set. Otherwise an Ethereal test account (a fake inbox on the internet):
// the mail is not delivered anywhere, the console prints a link where the mail can be read (Decision 7).
async function createMailSetup() {
  const { host, user, pass } = config.smtp;
  if (host !== '') {
    return {
      transport: nodemailer.createTransport({ host, port: SMTP_PORT, auth: { user, pass } }),
      from: user,
      isTestAccount: false,
    };
  }
  const account = await nodemailer.createTestAccount();
  return {
    transport: nodemailer.createTransport({
      host: account.smtp.host,
      port: account.smtp.port,
      secure: account.smtp.secure,
      auth: { user: account.user, pass: account.pass },
    }),
    from: account.user,
    isTestAccount: true,
  };
}

async function sendLoginCodeMail({ email, code, firstName }) {
  try {
    mailSetup ??= await createMailSetup();
  } catch (error) {
    mailSetup = null; // try again with the next mail
    throw error;
  }
  const info = await mailSetup.transport.sendMail({
    from: `"BTU AI Passport" <${mailSetup.from}>`,
    to: email,
    subject: 'Your BTU AI Passport login code',
    text: `Hello ${firstName},\n\nYour login code is ${code}.\nIt is valid for ${OTP.VALID_MINUTES} minutes and works once.\n\n`
      + 'If you did not ask for it, ignore this message.',
  });
  if (mailSetup.isTestAccount) {
    console.log(`Login mail for ${email} (test inbox, open this link to read it): ${nodemailer.getTestMessageUrl(info)}`);
  }
}
