// Who may call the API.
//   Student: JWT in `Authorization: Bearer <token>` (made after a correct email code, 2 hours).
//   Admin:   the key from ADMIN_API_KEY in the `X-Admin-Key` header. A separate header on purpose, so a browser that is
//            logged in as a student never sends the admin key and the two never mix (docs/api.md).
// A failure goes to next(AppError); the error middleware answers 401 UNAUTHORIZED with a generic text.
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { AppError } from '../middleware/appError.js';
import { ERROR_CODE, ID_PATTERN } from '../shared/constants.js';

export const TOKEN_LIFETIME_SECONDS = 2 * 60 * 60;
const MIN_SECRET_LENGTH = 16; // a short secret can be guessed; `openssl rand -hex 32` gives 64
const TOKEN_ALGORITHM = 'HS256';
const BEARER_PREFIX = 'Bearer ';

// The secret is read when it is needed, so an empty .env does not break importing this file.
// Plain Error (not AppError): this is a server setup problem, not the caller's fault.
export function getJwtSecret() {
  if (config.jwtSecret.length < MIN_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET in server/.env must have at least ${MIN_SECRET_LENGTH} characters. Make one with: openssl rand -hex 32`);
  }
  return config.jwtSecret;
}

export function signStudentToken(studentId) {
  return jwt.sign({ sub: studentId }, getJwtSecret(), { algorithm: TOKEN_ALGORITHM, expiresIn: TOKEN_LIFETIME_SECONDS });
}

// Returns the studentId inside a valid token, or null for anything else (wrong signature, expired, no student inside)
function readStudentToken(token) {
  try {
    // `algorithms` is fixed on purpose: a token that says "alg: none" must not pass
    const payload = jwt.verify(token, getJwtSecret(), { algorithms: [TOKEN_ALGORITHM] });
    return typeof payload.sub === 'string' && ID_PATTERN.STUDENT_ID.test(payload.sub) ? payload.sub : null;
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError || error instanceof jwt.NotBeforeError) {
      return null;
    }
    throw error; // a setup problem (empty JWT_SECRET) must not look like "wrong token"
  }
}

// Express middleware. On success: req.studentId is set.
export function requireStudent(req, res, next) {
  try {
    const header = req.get('Authorization') ?? '';
    const studentId = header.startsWith(BEARER_PREFIX) ? readStudentToken(header.slice(BEARER_PREFIX.length).trim()) : null;
    if (studentId === null) {
      return next(new AppError(ERROR_CODE.UNAUTHORIZED, 'Missing, invalid or expired token'));
    }
    req.studentId = studentId;
    return next();
  } catch (error) {
    return next(error);
  }
}

// Express middleware. An empty ADMIN_API_KEY means "no admin access at all", never "no check".
export function requireAdmin(req, res, next) {
  const sent = req.get('X-Admin-Key') ?? '';
  if (config.adminApiKey === '' || !sameSecret(sent, config.adminApiKey)) {
    return next(new AppError(ERROR_CODE.UNAUTHORIZED, 'Missing or invalid admin key'));
  }
  return next();
}

// Compares in constant time, so the response time does not tell how many first characters were right.
// Hashing first gives both sides the same length, which timingSafeEqual requires.
function sameSecret(first, second) {
  const hashOf = (text) => crypto.createHash('sha256').update(text).digest();
  return crypto.timingSafeEqual(hashOf(first), hashOf(second));
}
