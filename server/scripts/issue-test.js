// Dev helper: runs issuePassportVersion with the REAL PDF renderer but a FAKE chain, Storage and database.
// Shows what happens on success, on a chain failure, on a retry and on mismatches. Run: npm run issue-test
// It never touches the real chain, Storage or database, so it is safe to run any time.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { issuePassportVersion } from '../passport/issuePipeline.js';
import { sha256Hex } from '../passport/passportService.js';
import { renderPassportPdf } from '../pdf/renderer.js';
import { readRowsFromXlsx } from '../sheets/reader.js';
import { validateRows } from '../sheets/validator.js';
import { buildPdfPath } from '../storage/storageService.js';

const TEST_STUDENT_ID = 'BTU-T-0001';
const FAKE_TIMEOUT_TX_HASH = `0x${'ab'.repeat(32)}`;

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const testDataPath = path.join(currentDir, '../../docs/test-data.xlsx');

// ---------- Test data: one real student from docs/test-data.xlsx ----------

const { valid } = validateRows(await readRowsFromXlsx(testDataPath));
const studentRows = valid.filter((row) => row.studentId === TEST_STUDENT_ID);
if (studentRows.length < 3) {
  throw new Error(`Need at least 3 valid rows for ${TEST_STUDENT_ID} in docs/test-data.xlsx`);
}
const student = {
  studentId: TEST_STUDENT_ID,
  firstName: studentRows[0].firstName,
  lastName: studentRows[0].lastName,
  passportId: studentRows[0].passportId,
  firstIssued: studentRows[0].firstIssued,
};

// Awards like the database gives them. createdAt is one minute ago: they existed before any file we make now.
function makeAwards(count, versionId = null) {
  return studentRows.slice(0, count).map((row, index) => ({
    awardId: index + 1,
    recordId: row.recordId,
    studentId: row.studentId,
    skillId: row.skillId,
    skillName: row.skillName,
    skillCategory: row.skillCategory,
    skillDescription: row.skillDescription,
    dateEarned: row.dateEarned,
    versionId,
    createdAt: new Date(Date.now() - 60_000),
  }));
}

// ---------- A fake world: database, Storage and chain in memory ----------

function createWorld({ nextVersion = 1, latestOnChain = 0 } = {}) {
  const world = {
    files: new Map(), // path -> { bytes, createdAt }
    chain: new Map(), // codeHash -> { docHash, passportRef, version }
    saved: [],
    renderCalls: 0,
    issueCalls: 0,
    renderedAwardCount: 0,
    nextVersion,
    latestOnChain,
    issueBehavior: null, // replaces the normal issue(); can fail
    failSave: false,
  };

  world.putOnChain = (codeHash, docHash, passportRef, version) => {
    world.chain.set(codeHash, { docHash, passportRef, version, exists: true });
    world.latestOnChain = version;
    return { txHash: `0x${sha256Hex(`tx${codeHash}`)}` };
  };

  world.deps = {
    findNextVersionNumber: async () => world.nextVersion,
    saveIssuedVersion: async (issued) => {
      if (world.failSave) {
        throw new Error('database is down');
      }
      world.saved.push(issued);
      return { versionId: world.saved.length, issuedAt: new Date() };
    },
    renderPdf: async (studentArg, awards, code) => {
      world.renderCalls += 1;
      world.renderedAwardCount = awards.length;
      return renderPassportPdf(studentArg, awards, code); // the real renderer
    },
    uploadPdf: async (passportId, version, code, bytes) => {
      const pdfPath = buildPdfPath(passportId, version, code);
      if (world.files.has(pdfPath)) {
        throw new Error(`${pdfPath} already exists`);
      }
      world.files.set(pdfPath, { bytes: Buffer.from(bytes), createdAt: new Date() });
      return pdfPath;
    },
    downloadPdf: async (pdfPath) => world.files.get(pdfPath).bytes,
    findStoredPdf: async (passportId, version) => {
      const prefix = `${passportId}/v${version}-`;
      const found = [...world.files.entries()].filter(([filePath]) => filePath.startsWith(prefix));
      if (found.length === 0) {
        return null;
      }
      const [pdfPath, file] = found.at(-1);
      return { verificationCode: pdfPath.slice(prefix.length, -'.pdf'.length), pdfPath, createdAt: file.createdAt };
    },
    getRecord: async (codeHash) => world.chain.get(codeHash) ?? null,
    latestVersion: async () => world.latestOnChain,
    issue: async (codeHash, docHash, passportRef, version) => {
      world.issueCalls += 1;
      if (world.issueBehavior) {
        return world.issueBehavior(codeHash, docHash, passportRef, version);
      }
      return world.putOnChain(codeHash, docHash, passportRef, version);
    },
  };
  return world;
}

const run = (world, awards) => issuePassportVersion(student, awards, world.deps);

// ---------- Scenarios ----------

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

await scenario('first version: PDF, hash, Storage, chain and database agree', async () => {
  const world = createWorld();
  const awards = makeAwards(3);
  const result = await run(world, awards);
  const saved = world.saved[0];

  assert.equal(result.version, 1);
  assert.equal(world.saved.length, 1);
  assert.match(result.verificationCode, /^BTU-V-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  assert.equal(saved.pdfPath, `${student.passportId}/v1-${result.verificationCode}.pdf`);
  assert.equal(saved.docHash, sha256Hex(world.files.get(saved.pdfPath).bytes), 'docHash must be the hash of the stored file');
  assert.equal(world.chain.get(sha256Hex(result.verificationCode)).docHash, saved.docHash, 'the chain holds the same hash');
  assert.match(saved.txHash, /^0x[0-9a-f]{64}$/);
  assert.deepEqual(saved.awardIds, [1, 2, 3]);
  assert.equal(world.renderCalls, 1);
});

await scenario('second version: the PDF has old and new skills, only the new ones are linked', async () => {
  const world = createWorld({ nextVersion: 2, latestOnChain: 1 });
  const awards = [...makeAwards(2, 1), ...makeAwards(3).slice(2)];
  const result = await run(world, awards);

  assert.equal(result.version, 2);
  assert.equal(world.renderedAwardCount, 3, 'the PDF must contain all 3 skills');
  assert.deepEqual(world.saved[0].awardIds, [3], 'only the new award is linked to the new version');
});

await scenario('chain fails: nothing is saved, the PDF stays in Storage', async () => {
  const world = createWorld();
  world.issueBehavior = async () => {
    throw new Error('insufficient funds');
  };
  await assert.rejects(run(world, makeAwards(3)), /insufficient funds.*stays in Storage/s);
  assert.equal(world.saved.length, 0);
  assert.equal(world.files.size, 1);
});

await scenario('retry after a chain failure: same code, same PDF, no new render', async () => {
  const world = createWorld();
  world.issueBehavior = async () => {
    throw new Error('RPC is down');
  };
  await assert.rejects(run(world, makeAwards(3)), /RPC is down/);
  const [firstPath, firstFile] = [...world.files.entries()][0];

  world.issueBehavior = null;
  const result = await run(world, makeAwards(3));
  assert.equal(world.renderCalls, 1, 'the PDF must not be rendered again');
  assert.equal(result.reusedStoredPdf, true);
  assert.equal(result.pdfPath, firstPath);
  assert.equal(result.docHash, sha256Hex(firstFile.bytes));
  assert.equal(world.files.size, 1);
  assert.equal(world.saved.length, 1);
});

await scenario('retry, but a new skill arrived meanwhile: new code and new PDF for all skills', async () => {
  const world = createWorld();
  world.issueBehavior = async () => {
    throw new Error('RPC is down');
  };
  await assert.rejects(run(world, makeAwards(2)), /RPC is down/);
  const oldCode = [...world.files.keys()][0];

  world.issueBehavior = null;
  const awards = makeAwards(3);
  awards[2].createdAt = new Date(Date.now() + 5_000); // created after the stored file
  const result = await run(world, awards);
  assert.equal(world.renderCalls, 2);
  assert.equal(result.reusedStoredPdf, false);
  assert.notEqual(result.pdfPath, oldCode);
  assert.equal(world.files.size, 2, 'the old file stays, unused');
  assert.deepEqual(world.saved[0].awardIds, [1, 2, 3]);
});

await scenario('timeout, but the transaction landed: found with getRecord, no second issue()', async () => {
  const world = createWorld();
  world.issueBehavior = async (codeHash, docHash, passportRef, version) => {
    world.putOnChain(codeHash, docHash, passportRef, version);
    throw new Error(`Transaction not confirmed within 120s, txHash: ${FAKE_TIMEOUT_TX_HASH}`);
  };
  const result = await run(world, makeAwards(3));
  assert.equal(result.txHash, FAKE_TIMEOUT_TX_HASH);
  assert.equal(world.issueCalls, 1);
  assert.equal(world.saved.length, 1);
});

await scenario('timeout, and the chain holds a DIFFERENT document hash: never counted as success', async () => {
  const world = createWorld();
  world.issueBehavior = async (codeHash, docHash, passportRef, version) => {
    world.putOnChain(codeHash, 'f'.repeat(64), passportRef, version);
    throw new Error(`Transaction not confirmed within 120s, txHash: ${FAKE_TIMEOUT_TX_HASH}`);
  };
  await assert.rejects(run(world, makeAwards(3)), /already on the chain/);
  assert.equal(world.saved.length, 0);
});

await scenario('timeout and the transaction did not land: error, nothing saved', async () => {
  const world = createWorld();
  world.issueBehavior = async () => {
    throw new Error(`Transaction not confirmed within 120s, txHash: ${FAKE_TIMEOUT_TX_HASH}`);
  };
  await assert.rejects(run(world, makeAwards(3)), /not confirmed within 120s/);
  assert.equal(world.saved.length, 0);
});

await scenario('the code is already on the chain from an earlier run: stop, do not send again', async () => {
  const world = createWorld();
  world.issueBehavior = async (codeHash, docHash, passportRef, version) => {
    world.putOnChain(codeHash, docHash, passportRef, version);
    throw new Error('RPC connection dropped'); // landed, but we got no transaction hash
  };
  await assert.rejects(run(world, makeAwards(3)), /already on the chain.*transaction hash is not known/s);

  world.issueBehavior = null;
  const callsBefore = world.issueCalls;
  await assert.rejects(run(world, makeAwards(3)), /already on the chain/);
  assert.equal(world.issueCalls, callsBefore, 'issue() must not be sent again');
  assert.equal(world.saved.length, 0);
});

await scenario('chain is ahead of the database: stop with a clear error', async () => {
  const world = createWorld({ nextVersion: 1, latestOnChain: 1 });
  await assert.rejects(run(world, makeAwards(3)), /disagree.*expects version 1.*latest version on the chain is 1/s);
  assert.equal(world.issueCalls, 0);
});

await scenario('database fails after the chain write: the error has code and txHash for a manual repair', async () => {
  const world = createWorld();
  world.failSave = true;
  await assert.rejects(run(world, makeAwards(3)), /is on the chain \(code BTU-V-.*txHash 0x[0-9a-f]{64}\).*database is down/s);
  assert.equal(world.files.size, 1);
});

await scenario('nothing to issue, or no Passport ID: clear errors', async () => {
  const world = createWorld();
  await assert.rejects(run(world, makeAwards(2, 1)), /no new skills/);
  await assert.rejects(issuePassportVersion({ ...student, passportId: null }, makeAwards(2), world.deps), /no Passport ID/);
  assert.equal(world.renderCalls, 0);
});

console.log(failed ? '\nSome scenarios FAILED.' : `\nAll ${step} scenarios passed.`);
process.exitCode = failed ? 1 : 0;
