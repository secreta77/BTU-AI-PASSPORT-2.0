// Small helpers for issuing a passport version: verification code, SHA-256 hashes and passportRef.
// No database, no chain, no Storage here, so they are easy to test.
import { createHash, randomInt } from 'node:crypto';
import { ethers } from 'ethers';
import { config } from '../config.js';
import { ID_PATTERN } from '../shared/constants.js';

// No 0, O, 1, I: people read the code from paper or a screen, and these characters look alike
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_GROUP_LENGTH = 4;

function randomGroup() {
  let group = '';
  for (let index = 0; index < CODE_GROUP_LENGTH; index++) {
    // randomInt is cryptographically secure, unlike Math.random: codes must not be guessable
    group += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return group;
}

// "BTU-V-7F3K-92QX". It is different from the Passport ID and is made again for every version.
export function generateVerificationCode() {
  return `BTU-V-${randomGroup()}-${randomGroup()}`;
}

// 64 lowercase hex characters, no 0x (docs/api.md hash rules).
// Text is hashed as UTF-8 (for codeHash), bytes as they are (for docHash).
export function sha256Hex(data) {
  return createHash('sha256').update(data).digest('hex');
}

// keccak256(passportId + secret salt), 64 hex characters, no 0x. The chain stores this, never the Passport ID.
export function buildPassportRef(passportId) {
  if (!ID_PATTERN.PASSPORT_ID.test(passportId)) {
    throw new Error(`"${passportId}" is not a Passport ID like BTU-AI-000125`);
  }
  if (!config.passportRefSalt) {
    throw new Error('PASSPORT_REF_SALT is empty. Fill it in server/.env (see server/.env.example).');
  }
  return ethers.id(passportId + config.passportRefSalt).slice(2);
}
