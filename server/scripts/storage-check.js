// Dev helper: checks the Supabase Storage bucket with a small fake PDF. Run: npm run storage-check
// Uses a test path that real passports never use, and removes the test file at the end.
import { config } from '../config.js';
import { buildPdfPath, downloadPdf, findStoredPdf, getStorageBucket, uploadPdf } from '../storage/storageService.js';

const TEST_PASSPORT_ID = 'BTU-AI-000000'; // not a real passport
const TEST_VERSION = 1;
const TEST_VERIFICATION_CODE = 'BTU-V-TEST-0001';
const TEST_PATH = buildPdfPath(TEST_PASSPORT_ID, TEST_VERSION, TEST_VERIFICATION_CODE);
const PDF_A = Buffer.from('%PDF-1.4\n% storage-check test file A\n');
const PDF_B = Buffer.from('%PDF-1.4\n% storage-check test file B\n');

let step = 0;
function ok(message) {
  step += 1;
  console.log(`ok ${step}  ${message}`);
}

let bucket;
try {
  bucket = getStorageBucket();
  console.log(`Bucket: "${config.supabase.bucket}"`);

  await bucket.remove([TEST_PATH]); // leftover from an earlier failed run, if any; errors are shown by the upload below

  const path = await uploadPdf(TEST_PASSPORT_ID, TEST_VERSION, TEST_VERIFICATION_CODE, PDF_A);
  if (path !== TEST_PATH) {
    throw new Error(`uploadPdf returned "${path}", expected "${TEST_PATH}"`);
  }
  ok(`upload works: ${path}`);

  const downloaded = await downloadPdf(path);
  if (!downloaded.equals(PDF_A)) {
    throw new Error('Downloaded bytes differ from the uploaded bytes');
  }
  ok('download returns exactly the same bytes');

  await uploadPdf(TEST_PASSPORT_ID, TEST_VERSION, TEST_VERIFICATION_CODE, PDF_A);
  ok('uploading the same file again is a success (retry safe)');

  let overwritten = true;
  try {
    await uploadPdf(TEST_PASSPORT_ID, TEST_VERSION, TEST_VERIFICATION_CODE, PDF_B);
  } catch {
    overwritten = false;
  }
  if (overwritten) {
    throw new Error('A different file was written over an existing PDF');
  }
  if (!(await downloadPdf(path)).equals(PDF_A)) {
    throw new Error('The stored PDF was changed by the rejected upload');
  }
  ok('a different file at the same path is refused, the original stays');

  const stored = await findStoredPdf(TEST_PASSPORT_ID, TEST_VERSION);
  const createdAtIsValid = stored !== null && !Number.isNaN(stored.createdAt.getTime());
  if (!stored || stored.verificationCode !== TEST_VERIFICATION_CODE || stored.pdfPath !== TEST_PATH || !createdAtIsValid) {
    throw new Error(`findStoredPdf returned ${JSON.stringify(stored)}`);
  }
  ok(`findStoredPdf finds the file and its code (${stored.verificationCode}), created ${stored.createdAt.toISOString()}`);

  if ((await findStoredPdf(TEST_PASSPORT_ID, TEST_VERSION + 1)) !== null) {
    throw new Error('findStoredPdf found a file for a version that was never uploaded');
  }
  ok('findStoredPdf returns null for a version without a file');

  // A private bucket does not serve files from the public URL
  const { data } = bucket.getPublicUrl(path);
  const response = await fetch(data.publicUrl);
  if (response.ok) {
    console.log(`WARNING: bucket "${config.supabase.bucket}" is PUBLIC. Make it private in Supabase -> Storage.`);
  } else {
    ok('bucket is private (public URL does not serve the file)');
  }
} catch (error) {
  console.error('Storage check failed:', error.message);
  if (/bucket not found/i.test(error.message)) {
    console.error(`Create a private bucket named "${config.supabase.bucket}": Supabase -> Storage -> New bucket (Public OFF).`);
  }
  process.exitCode = 1;
} finally {
  if (bucket) {
    const { error } = await bucket.remove([TEST_PATH]);
    if (error) {
      console.error(`Could not remove the test file ${TEST_PATH}:`, error.message);
    }
  }
}
