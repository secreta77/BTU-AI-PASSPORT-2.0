// Creates the Google Sheets API client from the service account file.
// The reader and the writer (writer.js) share it, so the login lives in one place.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { missingCredentialsMessage, resolveCredentialsPath } from './credentialsPath.js';

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
export const SHEET_NAME = 'Passport Skill Records'; // the tab with the data, shared by the reader and the writer
const serverDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function getSheetsApi() {
  const { credentialsPath } = config.google;
  if (!credentialsPath) {
    throw new Error('GOOGLE_CREDENTIALS_PATH is empty. Fill it in server/.env (see server/.env.example).');
  }
  // The configured path first; on Render also /etc/secrets/<same file name>, where Render puts a Secret File
  const { path: keyFile, tried } = resolveCredentialsPath(credentialsPath, { serverDir });
  if (keyFile === null) {
    throw new Error(missingCredentialsMessage(tried));
  }

  // Loaded here and not at the top: googleapis is big, and scripts that only read the local xlsx stay fast
  const { google } = await import('googleapis');
  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: [SCOPE],
  });
  return google.sheets({ version: 'v4', auth });
}
