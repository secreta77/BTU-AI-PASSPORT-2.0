// Issues ONE new passport version for ONE student (CLAUDE.md "Issuance pipeline").
// The caller (sync) goes student by student, so blockchain nonces do not collide.
// Database, Storage, chain and PDF renderer come in as `deps`, so tests can replace them with fakes.
import { getRecord, issue, latestVersion } from '../chain/chainService.js';
import { findNextVersionNumber, saveIssuedVersion } from '../db/queries.js';
import { renderPassportPdf } from '../pdf/renderer.js';
import { downloadPdf, findStoredPdf, uploadPdf } from '../storage/storageService.js';
import { buildPassportRef, generateVerificationCode, sha256Hex } from './passportService.js';

// chainService puts the transaction hash at the end of its timeout error: "..., txHash: 0x..."
const TX_HASH_IN_ERROR = /txHash: (0x[0-9a-fA-F]{64})/;

const defaultDeps = {
  findNextVersionNumber,
  saveIssuedVersion,
  renderPdf: renderPassportPdf,
  findStoredPdf,
  downloadPdf,
  uploadPdf,
  getRecord,
  latestVersion,
  issue,
};

// student: { studentId, firstName, lastName, passportId, firstIssued }
// awards: ALL awards of the student (already issued ones have versionId, new ones have versionId null)
// Returns { passportId, version, versionId, verificationCode, docHash, txHash, pdfPath, issuedAt, awardIds, reusedStoredPdf }.
// Throws when something fails. Then the previous latest version stays untouched.
export async function issuePassportVersion(student, awards, deps = defaultDeps) {
  const { passportId } = student;
  const pending = awards.filter((award) => award.versionId === null);
  if (pending.length === 0) {
    throw new Error(`${student.studentId} has no new skills to issue`);
  }
  if (!passportId) {
    throw new Error(`${student.studentId} has no Passport ID yet`);
  }

  const version = await deps.findNextVersionNumber(passportId);
  // Steps 1-4: code, PDF, hash, upload (or the same ones from an earlier failed attempt)
  const attempt = await prepareAttempt(student, awards, pending, version, deps);
  const hashes = {
    codeHash: sha256Hex(attempt.verificationCode),
    docHash: sha256Hex(attempt.pdfBytes),
    passportRef: buildPassportRef(passportId),
  };

  // Step 5: chain
  const txHash = await writeToChain(passportId, version, attempt, hashes, deps);

  // Step 6: only now, after the confirmation, the database switches to the new version
  const awardIds = pending.map((award) => award.awardId);
  const saved = await saveInDatabase(passportId, version, attempt, hashes.docHash, txHash, awardIds, deps);

  return {
    passportId,
    version,
    versionId: saved.versionId,
    verificationCode: attempt.verificationCode,
    docHash: hashes.docHash,
    txHash,
    pdfPath: attempt.pdfPath,
    issuedAt: saved.issuedAt,
    awardIds,
    reusedStoredPdf: attempt.reusedStoredPdf,
  };
}

// Steps 1-4. An earlier attempt for this version may have failed at the chain step and left its PDF in Storage.
// Then we use the same code and the same bytes: a new render would give a new hash.
async function prepareAttempt(student, awards, pending, version, deps) {
  const stored = await deps.findStoredPdf(student.passportId, version);
  if (stored !== null && storedPdfHasAllAwards(stored, pending)) {
    return {
      verificationCode: stored.verificationCode,
      pdfBytes: await deps.downloadPdf(stored.pdfPath),
      pdfPath: stored.pdfPath,
      reusedStoredPdf: true,
    };
  }

  const verificationCode = generateVerificationCode();
  const pdfBytes = await deps.renderPdf(student, awards, verificationCode);
  // Uploaded BEFORE the chain: a confirmed chain record must never be without its PDF
  const pdfPath = await deps.uploadPdf(student.passportId, version, verificationCode, pdfBytes);
  return { verificationCode, pdfBytes, pdfPath, reusedStoredPdf: false };
}

// A stored PDF contains every award that existed when the file was created. An award that was added later
// is missing in it, so the file cannot be used. If createdAt is unknown we do not reuse (the safe choice).
function storedPdfHasAllAwards(stored, pending) {
  return pending.every((award) => award.createdAt <= stored.createdAt);
}

// Step 5. Returns the transaction hash.
async function writeToChain(passportId, version, attempt, hashes, deps) {
  const { verificationCode, pdfPath } = attempt;
  const { codeHash, docHash, passportRef } = hashes;

  // This code may already be on the chain from an earlier attempt that we never saw confirmed.
  // We do not send it again (Decision 25), but without the transaction hash we cannot save it either.
  const existing = await deps.getRecord(codeHash);
  if (existing !== null) {
    throw new Error(describeRecordWithoutTx(verificationCode, existing));
  }

  // The contract accepts only latest + 1. If the chain is ahead of the database, something was issued that we
  // do not know about, and guessing a version number would make it worse.
  const chainLatest = await deps.latestVersion(passportRef);
  if (chainLatest !== version - 1) {
    throw new Error(
      `Chain and database disagree for ${passportId}: the database expects version ${version}, `
      + `but the latest version on the chain is ${chainLatest}.`,
    );
  }

  try {
    const { txHash } = await deps.issue(codeHash, docHash, passportRef, version);
    return txHash;
  } catch (error) {
    return recoverFromIssueError(error, attempt, hashes, deps);
  }
}

// Decision 25: issue() can fail (timeout) although the transaction lands later. Before giving up, ask the chain.
// If the record is there with our document hash and we know the transaction hash, it worked.
async function recoverFromIssueError(error, attempt, hashes, deps) {
  const { verificationCode, pdfPath } = attempt;
  const record = await deps.getRecord(hashes.codeHash);
  if (record === null) {
    throw new Error(
      `Chain step failed for ${verificationCode}: ${error.message}. `
      + `The PDF stays in Storage (${pdfPath}); the next attempt uses the same code and file.`,
    );
  }

  const txHash = TX_HASH_IN_ERROR.exec(error.message)?.[1];
  if (record.docHash === hashes.docHash && txHash) {
    return txHash.toLowerCase();
  }
  throw new Error(describeRecordWithoutTx(verificationCode, record));
}

function describeRecordWithoutTx(verificationCode, record) {
  return (
    `Code ${verificationCode} is already on the chain (version ${record.version}) but not in the database, `
    + 'and its transaction hash is not known here. Find the transaction on Etherscan (contract events, codeHash) '
    + 'and save the version by hand. The PDF is in Storage.'
  );
}

// Step 6. If this fails after the chain write, the message has everything needed to repair it by hand.
async function saveInDatabase(passportId, version, attempt, docHash, txHash, awardIds, deps) {
  try {
    return await deps.saveIssuedVersion({
      passportId,
      version,
      verificationCode: attempt.verificationCode,
      docHash,
      txHash,
      pdfPath: attempt.pdfPath,
      awardIds,
    });
  } catch (error) {
    throw new Error(
      `Version ${version} of ${passportId} is on the chain (code ${attempt.verificationCode}, txHash ${txHash}), `
      + `but saving it in the database failed: ${error.message}`,
    );
  }
}
