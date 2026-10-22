// Uploads and downloads issued PDFs in Supabase Storage (private bucket from SUPABASE_BUCKET).
// The database keeps only the path (passport_versions.pdf_path); the file itself lives here.
// An issued PDF is never regenerated and never overwritten (CLAUDE.md), so this module has no delete or replace.
import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';
import { ID_PATTERN } from '../shared/constants.js';

const PDF_CONTENT_TYPE = 'application/pdf';
const PDF_SIGNATURE = '%PDF-'; // every PDF file starts with these bytes
const HTTP_CONFLICT = 409;

let client = null; // created on the first call, so importing this module works with an empty .env

// Returns the handle of the configured bucket. Fails with a clear message when .env is not filled in.
export function getStorageBucket() {
  const { url, serviceKey, bucket } = config.supabase;
  if (!url || !serviceKey || !bucket) {
    throw new Error(
      'SUPABASE_URL, SUPABASE_SERVICE_KEY and SUPABASE_BUCKET must be filled in server/.env (see server/.env.example).',
    );
  }
  client ??= createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }, // server-side client, no user sessions
  });
  return client.storage.from(bucket);
}

// The path is built from the passport and the verification code, so two versions never share a path.
export function buildPdfPath(passportId, verificationCode) {
  if (!ID_PATTERN.PASSPORT_ID.test(passportId)) {
    throw new Error(`"${passportId}" is not a Passport ID like BTU-AI-000125`);
  }
  if (!ID_PATTERN.VERIFICATION_CODE.test(verificationCode)) {
    throw new Error(`"${verificationCode}" is not a verification code like BTU-V-7F3K-92QX`);
  }
  return `${passportId}/${verificationCode}.pdf`;
}

function isConflict(error) {
  return (
    error.status === HTTP_CONFLICT ||
    Number(error.statusCode) === HTTP_CONFLICT ||
    /already exists/i.test(error.message ?? '')
  );
}

// Uploads the PDF and returns its path; save that value as passport_versions.pdf_path.
// Safe to call again with the same bytes (retry after a failed chain call): the same file at the same path is a success.
// Different bytes at an existing path are an error, never an overwrite.
// `bucket` is the last argument and defaults to the real bucket (tests pass a fake one).
export async function uploadPdf(passportId, verificationCode, pdfBytes, bucket = getStorageBucket()) {
  const pdfPath = buildPdfPath(passportId, verificationCode);
  const body = Buffer.from(pdfBytes);
  if (body.subarray(0, PDF_SIGNATURE.length).toString('latin1') !== PDF_SIGNATURE) {
    throw new Error(`Refusing to upload ${pdfPath}: the data is not a PDF`);
  }

  const { error } = await bucket.upload(pdfPath, body, { contentType: PDF_CONTENT_TYPE, upsert: false });
  if (!error) {
    return pdfPath;
  }
  if (!isConflict(error)) {
    throw new Error(`Storage upload failed for ${pdfPath}: ${error.message}`);
  }

  const existing = await downloadPdf(pdfPath, bucket);
  if (!existing.equals(body)) {
    throw new Error(`A different PDF already exists at ${pdfPath}. An issued PDF is never overwritten.`);
  }
  return pdfPath;
}

// Returns the PDF bytes (a Buffer) for a pdf_path read from the database.
export async function downloadPdf(pdfPath, bucket = getStorageBucket()) {
  if (typeof pdfPath !== 'string' || pdfPath === '') {
    throw new Error('downloadPdf needs a pdf path like BTU-AI-000125/BTU-V-7F3K-92QX.pdf');
  }
  const { data, error } = await bucket.download(pdfPath);
  if (error) {
    throw new Error(`Storage download failed for ${pdfPath}: ${error.message}`);
  }
  return Buffer.from(await data.arrayBuffer());
}
